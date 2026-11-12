# Portal usage analytics (Admin → Analytics)

> The full engineering reference (tables, events, endpoints, formulas, call sites) is
> [`ANALYTICS_DOCUMENTATION.md`](ANALYTICS_DOCUMENTATION.md). This page is the short design and rollout summary.

Institution-level reporting on how a university's community uses EdunexusAI. Scope of this cycle: **Institution Admin
analytics only**. Collection is **off by default** and nothing in this document has been deployed.

Status (2026-11-11): implemented on branch `feature/admin-analytics`; migration applied to the local development and
test databases only; verified against the test database with synthetic data. Not merged, not released.

---

## 1. What it is, in one picture

```
Browser (signed-in shell only)                       frontend/src/analytics/
  page key (never a URL) · shared visit id · visible-time counter · queue
        │  POST /api/v1/analytics/events   bearer token, keepalive, never refreshes the sign-in
        ▼
API   address limit → requireAuth → account limit → collection gate → strict validation
      adds: tenant, user, roles held, workspace of the page, corrected time
        ▼
analytics_visits · analytics_page_views · analytics_events            RAW, ~90 days
        ▲ written by the API itself: sign-in, sign-out, completed features
        │  worker in the API process (every 15 min) · rebuild-by-replacement per local day
        ▼
analytics_user_daily (13 months)        analytics_rollups + analytics_rollup_runs (36 months)
        ▼
GET /api/v1/admin/analytics/*    ADMIN + named permission analytics.view · exact aggregate counts, no person
        ▼
/admin/analytics[/section]       eight sections, each its own page (sidebar: Administration → Analytics)
```

Two reports need no tracking at all and work before collection is switched on: **Communication** (in-app
notifications and their read state) and **Integrations** (the outcomes the integrations already log).

## 2. Switches

| Switch | Where | Default | Meaning |
|---|---|---|---|
| `ANALYTICS_ENABLED` | API environment | off | Master switch for the deployment and the kill switch. Off: nothing is stored, the worker does not start, the browser tracker never starts. |
| `tenants.analyticsEnabled` | Admin → Analytics → Data health (needs `analytics.view`) | off | The institution's own switch. Switching it on requires confirming that the privacy notice covers usage measurement; audited. |
| `ANALYTICS_ALLOW_USER_IDS` | API environment | empty | Account ids measured while their institution's switch is still off (a named test account during rollout). Needs the master switch. |
| `users.analyticsExcludedAt` | database | null | Accounts that are never measured (test/service accounts). |
| `ANALYTICS_RAW_RETENTION_DAYS` | API environment | 90 | Raw retention. |
| `ANALYTICS_ROLLUP_INTERVAL_SECONDS` | API environment | 900 | Aggregation interval. |

Collection for a person = master switch AND (institution switch OR allow list) AND not excluded. The session payload
(`GET /auth/me` → `analytics.collecting`) tells the browser; the ingestion route enforces it again.

These settings are read in `backend/src/modules/analytics/config.js` and listed (commented out) in `backend/.env.example`.
Add them to `deploy/env/edunexusai.env.example` too when the deploy repository is next updated.

## 3. What is recorded, and what never is

Everything is a key from `shared/analyticsCatalog.js`, an enum, an id or a number. There is no free-text and no JSON
column, so there is nowhere to put a URL, search text, a message, a form value, a grade or a payment.

| Event | Trigger | From the browser | Derived by the server |
|---|---|---|---|
| visit (row) | first activity after 30 idle minutes, shared by tabs | visit id, start time, device class | tenant, user, roles held, sign-in method |
| `page.view` | a tracked page is first seen (a background tab counts when first shown) | page-view id, page key, dashboard view | workspace (`contextRole`), roles held |
| `page.ping` / `page.exit` | every 60 s while visible and active / on leaving, hiding or closing | cumulative `visibleMs` | capped at elapsed time and 4 h; `GREATEST` on update |
| `nav.click` | sidebar, collapsed-sidebar menu, breadcrumb, profile menu, global-search result | target page key, source | — |
| `widget.impression` | widget ≥ 50 % visible for 1 s, once per page view | widget key | — |
| `widget.interact` | click on a link or control inside a widget | widget key, `LINK` or `CONTROL` | — |
| `feature.use` (browser) | UI-only features (opened chat, opened Moodle, chose a search result…) | feature key, listed action | — |
| `feature.use` (server) | after the action succeeded (message sent, request submitted…) | nothing | everything |
| `auth.sign_in` / `auth.sign_out` | a session is issued (never on refresh) / logout, provider logout | nothing | method / reason |

Never recorded: IP address, user agent, passwords or tokens, the address bar (path, record ids, slugs, query string),
search text, message or form contents, grades, financial data, click coordinates, typed keys. The device class is
derived in the browser from pointer type and the shorter screen side only. The ingestion route is excluded from the
API's request log (`app.js`), which would otherwise write the address and user agent.

**Before release, also add to the host nginx site for the API:** `location = /api/v1/analytics/events { access_log off; … }`
(the nginx access log carries `$remote_addr` and the user agent). Not done: production configuration was not touched.

Invalid events are rejected one by one (the rest of the batch is kept) and counted by reason; the rejected content
is never logged. Duplicates are harmless: visits and page views are upserts whose counters only grow, discrete events
are inserted by their own id.

## 4. Tables (migration `20261111100000_portal_analytics`, additive)

| Table | Kind | Key | Kept |
|---|---|---|---|
| `analytics_visits` | raw | browser uuid; updates must match user and tenant | 90 days |
| `analytics_page_views` | raw | browser uuid; `visibleMs` cumulative | 90 days |
| `analytics_events` | raw, append-only | event uuid | 90 days |
| `analytics_user_daily` | derived | (tenant, local date, user): counts only, never which pages | 13 months |
| `analytics_rollups` | aggregated, no person ids | (tenant, local date, fact, subject, role, device) | 36 months |
| `analytics_rollup_runs` | operational | (tenant, local date): PARTIAL / FINAL / FAILED | 36 months |
| `user_permissions` | access | (user, permission); CHECK: `analytics.view` | until revoked |

Plus `tenants.analyticsEnabled`, `tenants.analyticsStartedAt`, `users.analyticsExcludedAt`. Every table cascades from
its tenant and (where it has one) its user, so deleting an account deletes its raw and person-day rows.

`rolesHeld` is stored on every raw row at the time of the activity, so a later role change never rewrites history.

Rollup facts: `PAGE`, `CONTEXT`, `NAV`, `NAV_SOURCE`, `WIDGET_IMPRESSION`, `WIDGET_INTERACTION`, `FEATURE`, `AUTH`,
`HOUR`, `VISIT`, `VISIT_DURATION`. `role` is a role held or `ALL`; `device` a device class, `NONE` (server events) or
`ALL`. Role rows count everyone holding the role; the `ALL` row counts each person once.

Aggregation rebuilds one institution-local day by replacement in one transaction (advisory lock per tenant and day):
today and yesterday on every pass (PARTIAL), two days ago and older once more and then FINAL. Raw rows are deleted
after the retention window only when their day is FINAL, and in any case after a further 7 days.

Adding a report later: a report on existing facts is a new query with full history. A new fact needs a new rollup
source and can be backfilled for at most the raw window (90 days); older history of a brand-new breakdown cannot be
reconstructed. Page keys are permanent and never reused.

## 5. Metrics

Days and hours are the institution's (`tenants.timezone`; when that is empty or not a valid IANA name, UTC is used,
never a guessed zone). The interface shows dates and hours without naming the zone. "Active" = at least one page view, navigation click, widget
interaction or feature use that day; signing in, a widget merely being on screen and background polling do not count.

| Metric | Definition | Source |
|---|---|---|
| Active people | distinct users with an active day in the range | `analytics_user_daily` |
| Average daily active users | person-days ÷ measured days (days of the range on or after the day collection started) | `analytics_user_daily` |
| Weekly / monthly active | distinct users in the 7 / 30 days ending on the range's last day | `analytics_user_daily` |
| Stickiness | average daily active over 30 days ÷ monthly active | `analytics_user_daily` |
| Came back | users active on ≥ 2 days ÷ active users | `analytics_user_daily` |
| Page views | Σ `count`, fact `PAGE` | rollups |
| Unique page visitors | distinct users per page over the range (exact inside the raw window; beyond it, the busiest single day, flagged) | raw page views |
| Time on a page | Σ visible ms ÷ page views with ≥ 1 s visible (each capped at 4 h) | rollups |
| Visits | visits by the day they started | rollups `VISIT` |
| Visit length | mean of (last activity − start), capped at 12 h | rollups `VISIT` |
| Active time per visit | Σ visible ms ÷ visits (never above visit length) | rollups |
| Peak hours | per weekday and hour: Σ daily distinct users in that hour ÷ matching days in range | rollups `HOUR` |
| Navigation | clicks, distinct users, share of clicks, by destination and by source | rollups + raw |
| Widget reach / engagement | impressions (once per page view), viewers; people who interacted ÷ people who saw it | rollups + raw |
| Feature adoption | distinct users of the action ÷ active people in the range | rollups + raw |
| Devices | share of visits by device class (adds to 100 %) | rollups `VISIT` |
| Activity by role | active people holding the role (overlaps for multi-role people; never stacked) | `analytics_user_daily` |
| Where the portal is used | page views by workspace (each view has exactly one; adds up) | rollups `CONTEXT` |
| Read rate | notifications sent in range that are read ÷ sent | `notifications` |
| Sync success | successful runs ÷ runs logged in range (not uptime) | `integration_sync_logs` |

Known limits: a page view's time belongs to the day the view started; a closed tab loses at most the last 60 s (and
unsent events are retried on the person's next load within 24 h); a modified browser can falsify its own counts but
never its identity or institution; ad blockers and offline use lose events. Figures are measurements, not exact counts.

A browser visit is not a sign-in session: one `sso_sessions` row or refresh-token chain covers many visits, and
password sign-ins have no session row. Analytics never extends a session (the tracker does not refresh tokens).

## 6. Access and privacy rules

- Reports: `requireAuth` → `requireRole('ADMIN')` → `requirePermission('analytics.view')`. The permission is a named
  grant in `user_permissions`; any administrator may grant or withdraw it for **another** administrator, never for
  themselves. First grant at an institution: `node scripts/analytics-access.mjs grant --tenant <slug> --email <admin> --apply`.
- Grants, withdrawals and collection changes are written to `audit_logs` (`ANALYTICS_*`).
- No route accepts a tenant id; no report returns a person. Individual-level analytics is not built.
- Reports return **exact aggregate counts**, small ones included (1 active person, 2 page views): there is no
  minimum group size (decision of 2026-11-12; the earlier five-person withholding was removed). Aggregates never carry
  a name, email or account id, and individual-level analytics (one person's own activity) is not built: adding it would
  need its own privacy and authorisation decision. With very few people, an administrator can still work out who did
  something from small counts; that is accepted for institution administrators holding `analytics.view`.
- No legal review has been done. Usage measurement is processing of personal data: the institution's privacy notice
  and whatever review it requires (FERPA, GDPR, DPDP as applicable) come before switching collection on.

## 7. Rollout (requires separate approval; none of this has been done)

1. Legal/privacy review and the user-facing notice.
2. Release the API with `ANALYTICS_ENABLED` unset (dark): backup → `prisma migrate deploy` (additive) → switch the API →
   merge the frontend. Nothing is collected; Communication and Integrations already work for administrators with access.
3. Add `access_log off` for the ingestion location in the API's nginx site.
4. Grant one administrator: `scripts/analytics-access.mjs grant … --apply`.
5. Pilot with one account: set `ANALYTICS_ENABLED=true` and `ANALYTICS_ALLOW_USER_IDS=<that account's id>`; sign in,
   browse, then check (read-only):
   `SELECT "pageKey", "contextRole", "visibleMs" FROM analytics_page_views ORDER BY "startedAt" DESC LIMIT 20;`
   — page keys only, no time while the tab was hidden, one `auth.sign_in` per sign-in and none per refresh, no change
   in `/auth/refresh` volume or sign-out errors.
6. An administrator switches the institution on under Data health; watch Data health for a week.

Rollback: unset `ANALYTICS_ENABLED` (immediate stop, data kept) → institution switch off → previous API tag (old code
ignores the new tables) → only if required, the DROP statements in the migration header.

## 8. Local development

```bash
cd backend
npm test                                             # includes tests/analytics.test.js
# Look at the screens with synthetic data (LOCAL test database only; refuses anything else):
DATABASE_URL="$TEST_DATABASE_URL" node scripts/analytics-dev-seed.mjs seed --tenant demo-university
DATABASE_URL="$TEST_DATABASE_URL" node scripts/analytics-access.mjs grant --tenant demo-university --email admin@edunexus.ai --apply
DATABASE_URL="$TEST_DATABASE_URL" ANALYTICS_ENABLED=true PORT=5055 CORS_ORIGINS=http://localhost:5183 node src/server.js
cd ../frontend && VITE_API_PROXY_TARGET=http://localhost:5055 npx vite --port 5183
DATABASE_URL="$TEST_DATABASE_URL" node scripts/analytics-dev-seed.mjs clear --tenant demo-university   # afterwards
```

In development React StrictMode mounts the tracker twice, so each page load records one extra sub-second page view;
production builds do not.

## 9. Where things are

- Catalogue (pages, navigation, widgets, features): `shared/analyticsCatalog.js`. A new signed-in route must be added
  there; `frontend/tests/analyticsCatalog.test.mjs` fails otherwise.
- Backend: `backend/src/modules/analytics/` (`config`, `ingestService`, `analyticsRoutes`, `serverEvents`,
  `rollupService`, `reportService`, `operationalReports`, `accessService`, `adminAnalyticsRoutes`).
- Browser tracker: `frontend/src/analytics/` (`core.js` is pure and unit-tested; `AnalyticsProvider`, `WidgetBeacon`).
- UI: `frontend/src/pages/admin/AdminAnalyticsPage.jsx` (routes `/admin/analytics` and `/admin/analytics/:section`;
  the section list is `pages/admin/analytics/sections.js`, shared with the sidebar and breadcrumbs), `pages/admin/analytics/*`,
  `components/analytics/*`. Old `?tab=` links redirect to the section's page.

## 10. Built for later, not built now

The raw tables, catalogue and permission table are role-neutral, so Faculty, Student and platform (Superadmin)
analytics can be added as new reports and new permissions. None of them exists, and no cross-tenant access exists:
every query in this module starts from the signed-in administrator's own institution.
