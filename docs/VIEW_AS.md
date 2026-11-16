# View-As (read-only administrator impersonation)

An authorised administrator opens a student's or faculty member's portal **exactly as that person sees it**, in a
separate browser tab, **read-only**. The administrator is viewing someone's experience, not becoming them: their own
sign-in is the only one used, the person's account is never touched, and nothing can be done on the person's behalf.

Entry point: **Administration → Access Control → Users → Impersonate** (next to Access / Systems / Suspend).

## Identities

| Name | What it is | Where it lives |
|---|---|---|
| Actor | The administrator, authenticated by their own access token on every request | `req.actor` |
| Subject | The person whose portal is shown | `req.auth` (effective portal context) |
| Persona | `STUDENT` or `FACULTY`, the one portal shown | `req.viewAs.persona`; `req.auth.roles = [persona]` |
| Mode | Always `READ_ONLY` | `req.viewAs.mode`, DB check constraint |
| Institution | The actor's tenant; the subject must be in it | `req.viewAs.tenantId` |

`req.auth` is the subject's context because every portal service already scopes its data by it; that is what
makes the view genuine with no per-service changes. It is safe because a View-As request cannot write (below), the
subject's context holds only the chosen persona's role and record, and named permissions are looked up for
`req.auth.userId` (the subject), so administrator permissions never apply inside View-As.

## Who can use it, on whom

- Actor: `ADMIN` role **and** the named permission `users.view_as` (not granted to every administrator). Both are
  re-checked on **every** request; withdrawing either stops open sessions immediately (`REVOKED / ACCESS_REVOKED`).
- Subject: an `ACTIVE` account in the actor's institution, holding `STUDENT` and/or `FACULTY` **with its record**.
  Refused: administrator accounts (any account holding `ADMIN`), oneself, suspended/invited accounts, accounts with no
  linked record, other institutions (reported as not found), unknown ids. A subject suspended mid-session ends it.
- A person with both roles: the persona must be chosen explicitly (`400 PERSONA_REQUIRED` otherwise). Viewing as
  Student exposes no teaching data and vice versa (the other profile id is nulled in the context).
- A reason is required (5–500 chars) and stored in the session and audit trail.

Grant / revoke (audited, dry run without `--apply`):

```sh
cd backend
node scripts/view-as-access.mjs list   --tenant demo-university
node scripts/view-as-access.mjs grant  --tenant demo-university --email admin@edunexus.ai --apply
node scripts/view-as-access.mjs revoke --tenant demo-university --email admin@edunexus.ai --apply
```

## Session

Table `view_as_sessions` (migrations `20261113120000_view_as_sessions`, `20261113120100_view_as_permission`; both
additive). Secret: 256 random bits (base64url, 43 chars), returned **once** with `Cache-Control: no-store`; only its
SHA-256 is stored. Policy (`viewAsService.VIEW_AS_POLICY`): 30 min absolute, 15 min idle, at most 5 live sessions per
administrator. Status `ACTIVE → ENDED | EXPIRED | REVOKED`; every close is a conditional update, so it happens and is
audited once. A request is served as the subject only with **both** the actor's valid token and the secret of a live
session that actor started in their own institution. Another administrator presenting it gets `VIEW_AS_SESSION_INVALID`
(and a `VIEW_AS_SESSION_MISUSE` audit row); the secret alone authenticates nobody (`401`).

View-As failures are always `403` with codes `VIEW_AS_SESSION_ENDED` / `VIEW_AS_SESSION_INVALID` /
`VIEW_AS_READ_ONLY` / `VIEW_AS_NOT_ALLOWED`, never `401`, so the client never mistakes them for the administrator's
own sign-in ending.

## API

| Method & path | Where | Purpose |
|---|---|---|
| `GET /admin/view-as/targets/:userId` | admin tab | Eligibility and personas |
| `POST /admin/view-as/sessions` `{ userId, persona?, reason }` | admin tab | Start; returns `{ token, session }` |
| `GET /admin/view-as/sessions` | admin tab | The administrator's own live sessions |
| `POST /admin/view-as/sessions/:id/end` | admin tab | End one of one's own sessions |
| `GET /view-as/current` | View-As tab | The tab's session (does not count as activity) |
| `DELETE /view-as/current` | View-As tab | End Impersonation (idempotent) |

The `/admin/view-as/*` routes need `ADMIN` + `users.view_as` and are unreachable from a View-As tab.

## Read-only enforcement (server)

Three independent layers; each would stop a write on its own.

1. **HTTP gate** (`viewAsGate.js`, mounted app-wide before every route). A request with the `X-View-As-Session`
   header may use `GET`/`HEAD` and `DELETE /api/v1/view-as/current`; everything else is `403 VIEW_AS_READ_ONLY`
   before any handler runs (method-based, so path case, slashes or encoding cannot route around it). No POST-based
   query is allowlisted (none is needed to render a portal). Some reads stay closed: `/chat` (private messages),
   `/nexora/conversations` (private AI conversations), `/auth/oidc`, `/admin`, `/studio`. Blocked attempts are
   audited (`VIEW_AS_ACTION_BLOCKED`, route template only) and counted on the session.
2. **Prisma write guard** (`db/prisma.js`, client extension). Inside a View-As request (AsyncLocalStorage context
   set by `requireAuth`) every create/update/upsert/delete, `$executeRaw*`, and any writing `$queryRaw*` throws
   `VIEW_AS_READ_ONLY`, including inside transactions and in work the request schedules. This is what makes "a GET
   that marks something read" impossible. The View-As module's own bookkeeping runs via `outsideViewAs()`.
   Outside View-As it costs one context lookup per write. (Tested: every parameterless GET route in the app was
   called as a student and a faculty View-As subject; none tried to write.)
3. **Integration clients**: CampusCore (guarded `fetchImpl` injected into the vendored connector; only `GET`/`HEAD`
   and the integration's own OAuth token request), Moodle (`moodleClient.call`: only idempotent `*_get_*` functions;
   `mod_*_view_*` is refused because it logs a view in Moodle), `BaseConnector.request` and `cmsRequest` (non-GET
   refused). Keycloak's admin client is GET-only already.

Background workers and scripts never run in the View-As context, so they are unaffected.

## Browser: tab isolation and hand-off

- The administrator's tokens stay where they always are (localStorage, shared by tabs). The View-As secret is kept
  in **sessionStorage**, so it belongs to the one tab; the original tab never sends it. It never appears in a URL.
- Impersonate → dialog → "Open in new tab" calls `window.open('/view-as/start')` synchronously from the click (pop-up
  blockers allow it), then creates the session, then hands the secret to that tab by `postMessage` (same origin,
  checked `event.source` both ways; the new tab re-announces readiness until it receives it). The new tab checks it
  with `GET /view-as/current`, drops `window.opener`, and reloads into `/dashboard` so every provider starts in View-As
  mode. If the browser blocks the tab, no session is created.
- `apiClient` adds the header to every request from the tab and **refuses state-changing requests in the browser too**
  (`VIEW_AS_READ_ONLY`, with a toast). Raw `fetch` callers were changed to use `authHeaders()` (attachments) or to
  refuse (Nexora streaming), because a bare token would otherwise act as the administrator. The chat socket does not
  connect in a View-As tab (it would carry the administrator's realtime traffic).
- Refresh keeps the session while it is live on the server. Several View-As tabs are independent. Closing one never
  touches the admin tab. A duplicated tab copies sessionStorage, so it shares that (same administrator's) session.
- "Sign out" in a View-As tab ends the View-As session only; it never clears the administrator's tokens.

## UI

- Full-width amber band, fixed above sidebar, header and content on every shell route; it publishes its height as
  `--enx-top-offset`, which the sticky sidebar, header and mobile drawer use (0px outside View-As, so the normal
  layout is unchanged). Shows "Viewing as {name} · {persona}", READ-ONLY MODE, the administrator's name, the end time,
  and **End Impersonation**. The tab title is prefixed `View-As: {name} ·`.
- End Impersonation (or expiry, idle timeout, revocation) lands on `/view-as/ended` with the reason and a link back.
- Action controls are disabled with an explanation (`Button mutates`, `<ReadOnlyGate>`), pages stay visible:
  advising book/cancel/reschedule, payments and demo reset, profile/emergency/privacy/communication edits, name and
  address changes, transcript orders, assignment submission, requests/tickets/forms, notifications mark-read, career
  portfolio/groups/opportunities, learning-path status, recommendations, library renewals, dashboard rearranging,
  faculty gradebook save/publish/settings, course announcements/notifications, Moodle grading, advising slots,
  follow-ups. The urgent-announcement popup still appears, but OK only closes it locally. Nexora shows a notice.
  The assistant launcher, install prompt, change password, Studio and sign-out are hidden.

## Audit and analytics

`audit_logs` rows, actor = administrator, entity = subject (`entityType User`), metadata `{ sessionId, actor, subject,
persona, mode, ... }`, never the secret: `VIEW_AS_STARTED` (with reason, expiry), `VIEW_AS_ENDED`, `VIEW_AS_EXPIRED`
(absolute/idle), `VIEW_AS_REVOKED`, `VIEW_AS_START_REJECTED`, `VIEW_AS_ACTION_BLOCKED`, `VIEW_AS_SESSION_MISUSE`,
`VIEW_AS_ACCESS_GRANTED/REVOKED` (script). Pages read are in `view_as_access_events` (method, route template with ids
replaced by `:id`, area, status; no bodies, no query strings).

The subject's analytics never see View-As: `/auth/me` reports `analytics.collecting: false`, the tracker and presence
heartbeat do not run, `/analytics/*` writes are refused, no sign-in is recorded for the subject, and polling that
would keep an unattended session alive (notifications, urgent popup) is off in the View-As tab.

## Tests

- `backend/tests/view-as.test.js` (20 tests, real HTTP): personas incl. multi-role, every refusal case, lifecycle
  (refresh, end, absolute/idle expiry, replay, another admin's secret, several tabs, admin-tab end, limit, revocation,
  subject untouched), every prohibited write category for student and faculty, gate bypass attempts, closed reads,
  the all-GET-routes sweep, access log, Prisma and integration guards.
- `frontend/tests/viewAs.test.mjs` (9 tests): hand-off protocol (ordering, origin/source checks, timeout), Users-table
  offer rules, reason text, client-side refusal and header scoping.

## Known limits

- Score cells in the faculty gradebook can still be typed into locally in View-As; Save/Publish are disabled and the
  server refuses any write.
- Idle timeout counts API reads; an administrator who keeps navigating keeps the session alive up to the 30-minute cap.
- No step-up re-authentication or MFA before starting (the platform has no such capability yet).
- Not in OpenAPI yet.
