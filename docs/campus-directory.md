# Campus Directory (Keycloak, read-only)

**Campus → Campus Directory** (`/campus/directory`) is a people search over the institution's Keycloak realm. It is separate from **People Search** (`/campus/people`, the portal's own `directory_profiles` table) and from **Administration → Users & Roles** (account management). Both of those are unchanged.

## Request flow

```
Browser ──GET /api/v1/campus/directory?search=&page=&pageSize=──► EdunexusAI backend
  requireAuth (portal session) → per-account rate limit (60/min) → audience check
  → campusDirectoryService ──client credentials──► Keycloak token endpoint (service-account token, cached)
                           ──Bearer token, GET only──► /admin/realms/{realm}/users, /users/count,
                                                       /users/{id}/role-mappings/realm/composite
  ◄── { people: [{ key, firstName, lastName, displayName, email, affiliations }], page, pageSize, total, hasMore }
```

The browser never calls Keycloak and never sees a Keycloak token, secret or user id (`key` is an opaque hash).

**Who can open it:** the same people as People Search:
- faculty, staff, alumni and administrators;
- students whose tier includes `feature.directory`.

The backend enforces this rule in `assertDirectoryAccess`, and the sidebar shows the link to the same people.

## Keycloak configuration (manual, per realm)

Create a dedicated client. Never use `admin-cli` or an administrator's password; the backend refuses `admin-cli`.

1. **Clients → Create client.**
   - Type: OpenID Connect.
   - Client ID: `edunexusai-directory`.
2. **Capability config:**
   - **Client authentication: On**.
   - **Service accounts roles: On**.
   - Standard flow, Direct access grants, Implicit flow, OAuth 2.0 Device and CIBA: **Off**.
   - No redirect URIs and no web origins.
3. **Service accounts roles → Assign role → Filter by clients → `realm-management`:**
   - assign **`view-users`** (it includes `query-users` and `query-groups`);
   - also assign **`query-users`** explicitly;
   - remove `default-roles-<realm>`, which is not needed.
   - Do **not** assign `manage-users`, `view-clients`, `view-realm`, `realm-admin` or anything else.
4. **Credentials:** copy the client secret into the backend environment (below).

Verified on the local realm `edunexusai-feddrick` (Keycloak 26.8):
- With `query-users` alone, the user list comes back **empty**. Keycloak hides users the client may not view, so `view-users` is required.
- With these roles, listing and counting users and reading their role mappings work.
- Editing or creating users, listing clients and reading role member lists (`/roles/{name}/users`) return **403**.

## Backend environment

| Variable | Meaning |
|---|---|
| `KEYCLOAK_DIRECTORY_BASE_URL` | Keycloak as the **backend** reaches it. Locally: `http://localhost:8080`. If the backend runs in Docker, use the Keycloak service name (e.g. `http://keycloak:8080`) or `http://host.docker.internal:8080`, not `localhost`. Must be https in production. |
| `KEYCLOAK_DIRECTORY_REALM` | e.g. `edunexusai-feddrick` |
| `KEYCLOAK_DIRECTORY_CLIENT_ID` | e.g. `edunexusai-directory` |
| `KEYCLOAK_DIRECTORY_CLIENT_SECRET` | The client secret (server only; never logged or returned). |
| `KEYCLOAK_DIRECTORY_TENANT` | The tenant slug whose members are in this realm; other institutions see "not connected". |
| `KEYCLOAK_DIRECTORY_PROVIDER_KEY` | Optional. The sign-in option whose rules label people (see below). |
| `KEYCLOAK_DIRECTORY_TIMEOUT_MS` | Optional, default 8000. |

If any required value is missing, the page says the directory is not connected (409 `INTEGRATION_NOT_CONFIGURED`). Administrators also see which settings are missing.

## Field ownership

| Field | Owner | Notes |
|---|---|---|
| First name, last name, email | Keycloak | Shown as Keycloak holds them; missing values are shown as "Name not listed" / "No email listed". |
| Student / Faculty / Staff / Alumni label | Keycloak realm roles, read through the institution's **Sign-in & role mapping** rules for `realm_access.roles` | The same rules sign-in uses (e.g. `learner → Student`). A label is what the identity provider asserts; it does **not** mean an SIS record was verified. Unmapped roles (e.g. `it-admins`) and people without roles get no label. If a person's roles cannot be read, they get no label rather than a guess. |
| Account enabled | Keycloak | Only enabled accounts are listed; the status itself is not shown. |
| Department, programme, phone, academic data | Not shown | Owned by the SIS (CampusCore) or HR; not read from Keycloak. |

Classifications in this realm are realm roles, with no groups and no user federation.
- Client roles and group membership are not used for labels.
- Role inheritance through groups or composite roles *is* followed (effective realm roles).
- Nothing is inferred from email domains, usernames or names.

## What the directory does not do

- It creates, links, merges or changes nothing: no portal accounts, federated identities, SIS records, role assignments or tiers. A test checks the counts before and after a search.
- It does not show people who exist only in the portal database or only in CampusCore. A person appears only when they have an enabled Keycloak account in the configured realm. For an institution that brokers sign-in through its own IdP, that can mean only people who have signed in at least once.
- Service-account users (Keycloak's reserved `service-account-` username prefix, with no email and no name) are hidden.
- Search uses Keycloak's `search` (infix). Keycloak also matches usernames, so a username can match too.
- Pages are at most 50 people, and paging stops at 10,000 results, after which the user is asked to narrow the search.
- Answers are cached on the server for 30 s per search and page, and role lookups for 60 s, so Keycloak changes appear within about a minute.

## Errors

The browser receives a short message and a `reason`, never Keycloak's response body:

| Reason | Status | Cause |
|---|---|---|
| `DIRECTORY_UNAVAILABLE` | 503 | Network failure, timeout, or 502/503/504 after one retry. |
| `DIRECTORY_CREDENTIALS_REJECTED` | 502 | Wrong secret, or client credentials not enabled. |
| `DIRECTORY_PERMISSION_MISSING` | 502 | `view-users` not assigned. |
| `DIRECTORY_UPSTREAM_ERROR` | 502 | Unexpected or malformed answer. |

An expired or revoked token is replaced once, transparently.

## Known issue: `NO_INSTITUTIONAL_ID` at institutional sign-in

This issue is not changed by this feature. Sign-in refuses a first-time Keycloak identity that carries no `student_number` or `employee_number` (`decideAccountLink` in `backend/src/modules/identity/identityPolicy.js`), because accounts are never matched on email alone.

The Keycloak user `admin.feddrick` (`admin@edunexus.ai`) has **no such attribute**: it has only the `it-admins` role. So its first sign-in is refused with `NO_INSTITUTIONAL_ID`.

Where to look:
1. The user's attributes in Keycloak.
2. The `edunexusai` client's mappers `student_number` / `employee_number`.
3. The provider's `studentIdClaim` / `employeeIdClaim` in Admin → Sign-in & role mapping.
4. Whether the portal account `admin@edunexus.ai` has a staff or faculty record with a matching employee number.

Two fixes are possible, and both are decisions for the team:
- give the person an employee number in Keycloak that matches a portal staff record;
- or keep administrators on password sign-in.

`it-admins` never grants ADMIN by design.
