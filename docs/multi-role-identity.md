# Multi-role accounts, institutional sign-in (Keycloak / OIDC) and role mapping

One person, one EdunexusAI account, several verified relationships with the institution. A faculty
member who is also a postgraduate student signs in once (password, or the university's sign-in),
gets an **Overview**, a **Teaching** view and a **Studying** view, and every view reads that role's
own institutional record.

Status (2026-10-23): implemented, migrated on the local test and development databases, and verified
end to end against the local CampusCore SIS, a local Keycloak and the MoodleCloud site. Sections 10–13
cover the Overview, sign-in sessions and logout, Alumni and the public site. Section 9 lists what is not
done.

---

## 1. Concepts, kept apart

| Concept | Meaning | Where it lives |
|---|---|---|
| Account | The EdunexusAI login (one per person) | `users` |
| External identity | A university sign-in (issuer + subject) linked to the account | `federated_identities` |
| Provider configuration | Each institution's OpenID provider (no secrets) | `identity_providers` |
| Role-mapping rules | Institution-specific: external value → community role | `identity_role_mappings` |
| Record links | Verified student/faculty records; staff records | CampusCore `ExternalIdentityLink` (+ mirror `external_identities` provider CAMPUSCORE); `student_profiles`, `faculty_profiles`, `staff_profiles` |
| Community roles | Relationships: STUDENT, FACULTY, STAFF, ALUMNI | `user_roles` |
| Administrative roles | What the person may manage: ADMIN | `user_roles`; never from a sign-in |
| Role provenance | Why each role is held: EXISTING, MANUAL, SIS, IDP | `role_assignment_sources` |
| Entitlements | Widgets offered per context (student tier only in the student context) | tiers, role widget defaults |
| Data scope | Own records; instructor of record; CampusCore section ownership; Moodle teaching role | route guards and services |
| Tenant scope | The institution owning all of the above | `tenantId` from the session, checked on every request |

A role **context** is ACTIVE only with its record (Staff: staff record; Alumni: none). A role without
its record is UNLINKED: explained in the UI, no widgets, no data.

## 2. Sign-in to data, step by step

```
Browser ── "Sign in with Feddrick University ID" ──► GET /api/v1/auth/oidc/:tenant/:provider/start
   sealed transaction cookie (AES-256-GCM, 10 min, HttpOnly, SameSite=Lax): state, nonce, PKCE verifier
   302 ► Keycloak (authorization code + PKCE S256) ► user authenticates ► 302 back
GET /api/v1/auth/oidc/callback
   1. openid-client: code exchange; ID token verified (signature via the provider's JWKS, issuer,
      audience, expiry, nonce, state); code replay rejected by the provider
   2. account: federated_identities (issuer + subject); first sign-in: the account whose VERIFIED
      institutional numbers equal the ID token's student/employee numbers, with the verified email
      agreeing — never email alone; ambiguous, mismatched, unverified, disabled → refused (audited);
      nobody has those numbers and the provider's JIT switch is on → the account is created from the
      CampusCore person who holds them (section 15)
   3. records: Student/Faculty verified LIVE in CampusCore (link exists, number matches, record active);
      Staff: staff record, or the provider's staff policy (employee number establishes it)
   4. roles: this institution's mapping rules → community roles, granted only with their records; the
      provider adds or withdraws only its own grants; never ADMIN; unknown values grant nothing
   5. an sso_sessions row (provider session id, sealed ID token) and a single-use hand-off code
      (only its SHA-256 stored in sso_handoffs, 60 s, consumed by one conditional UPDATE)
   302 ► /auth/sso/complete#code=… ► POST /api/v1/auth/oidc/exchange ► the existing EdunexusAI session
      (same tokens as password sign-in; amr=oidc, idp=<key>, sid=<sso_sessions id>)
/dashboard ► Overview | Teaching | Studying (one account; ?view= switches, no new sign-in)
   Studying → /dashboard/student, /sis/me/overview (CampusCore STUDENT record), student Moodle view
   Teaching → /faculty/dashboard, /sis/faculty/teaching (CampusCore FACULTY record), teaching Moodle view
Logout ► refresh token revoked, sso_sessions row ended ► Keycloak end-session with id_token_hint
   (no confirmation page) ► /login
Keycloak logout elsewhere ► POST /api/v1/auth/oidc/backchannel-logout/:tenant/:provider (signed logout
   token) ► matching sso_sessions ended ► the access token stops on its next request, refresh fails
```

Password sign-in is unchanged. An SSO session is not blocked by a pending local password change
(the local password was never used); a password session still is.

## 3. What changed where

**EdunexusAI database** (applied to `edunexusai_test`, then `edunexusai` after a backup):
- `20261023100000_community_roles_staff_alumni`: `RoleKey` + STAFF, ALUMNI.
- `20261023100100_identity_providers_and_role_provenance`: role rows STAFF/ALUMNI; tables
  `identity_providers`, `identity_role_mappings` (CHECK: community roles only), `federated_identities`,
  `role_assignment_sources` (CHECK: known sources); every existing role backfilled as EXISTING.
- `20261023110000_sso_sessions_and_handoffs`: tables `sso_sessions`, `sso_handoffs` (additive).
- Additive only; no existing table or column changed. Rollback (before SSO use): drop the new tables
  and delete the two unused role rows (see the migration headers).

**CampusCore** (`campuscoresis/`):
- Migration `20261023090000_identity_link_per_record_type`: one ACTIVE link per external account
  AND record type (was: per account). Applied to `campuscore_test`, then `campuscore` after a backup.
- `identityService`: per-type duplicate check; a second relationship must be the same person (same
  CampusCore user account → `CAMPUSCORE_USER`; different accounts → refused; unknown → requires an
  administrator's verification note → `ADMIN_VERIFIED`); `resolve` per record type, `LINKED_MULTIPLE`
  without a type (fails closed for older callers).
- Admin student creation accepts `personOfFacultyId`: enrol an existing faculty member as a student
  on the same CampusCore person (no second login).
- Connector: `resolveIdentity(id, { recordType })`; student calls resolve STUDENT, faculty calls
  FACULTY; re-vendored into EdunexusAI (`backend/src/integrations/campuscore/connector`).

**EdunexusAI backend**: `modules/roles/roleAssignments.js` (provenance), `modules/admin/accessService.js`
(access view and rules), `modules/identity/` (`oidcClient`, `identityPolicy`, `providerService`,
`ssoService`, `ssoRoutes`, `identityAdminRoutes`, `ssoLogout`), `sisService` (per-type resolution and
mirror, `addRelationship`, `verifyRelationship`), `moodleService` (one Moodle account per person).

**EdunexusAI frontend**: multi-role dashboard and sidebar (Overview/Teaching/Studying/Working/Alumni,
Administration workspace), login button and `/auth/sso/complete`, Users & Roles (one row per account,
role status badges, Access drawer), Admin → Access Control → **Sign-in & role mapping**.

## 4. Role mapping (per institution)

Rules live per provider: `claim` (dotted path, e.g. `realm_access.roles`, `groups`) + `externalValue`
→ `targetRole` (STUDENT, FACULTY, STAFF or ALUMNI). Evidence rules: STUDENT/FACULTY need the verified
CampusCore record; STAFF needs a staff record or the provider's staff policy; ALUMNI is the
institution's assertion. Unknown values are recorded and grant nothing. ADMIN can never be a target
(API validation and a database CHECK). Every rule change and every role grant/removal is audited.
The last evaluation (granted, withheld with reasons, unknown values) is stored on the sign-in identity
and shown in the account's Access drawer. "Try it" on the admin page previews rules on sample claims.

Local Feddrick rules: `learner` → STUDENT, `faculty` → FACULTY, `employee` → STAFF, `alumni` → ALUMNI.

## 5. Admin: managing one person's roles

Users & Roles shows one row per account with every role and its record status. **Access** opens:
- community roles (record, CampusCore link, Moodle link, sources, student tier on the Student card);
- administrative roles;
- add a role: Student/Faculty only by **Link CampusCore record** (search, select, optional
  verification note; record + link + role in one step, rolled back if CampusCore refuses); Staff with
  the employee number (creates the staff record); Alumni; Administrator with explicit confirmation;
- remove a role (confirmed; only that role; records and links stay; a role the university sign-in
  still asserts returns at the next sign-in, which the UI says);
- institutional sign-in identities (last evaluation; unlink withdraws that provider's grants).
Guards: nobody removes their own ADMIN role or the institution's last administrator; everything is
tenant-scoped; every change is audited.

## 6. Secrets

A provider row stores only the NAME of the server variable holding its client secret, restricted to
`OIDC_CLIENT_SECRET_*` so a provider can never be pointed at another server secret. Locally the value
is in `edunexus/backend/.env` (git-ignored) as `OIDC_CLIENT_SECRET_FEDDRICK`. In a multi-tenant
deployment the same names are populated from the secret manager. No API returns a secret.

## 7. Local setup (as configured)

- Keycloak (existing container, `http://localhost:8080`): realm **`edunexusai-feddrick`** (added; the
  `master` realm untouched); confidential client `edunexusai`, standard flow only, PKCE S256 required,
  redirect URIs `http://localhost:5173|5181/api/v1/auth/oidc/callback`, post-logout `…/login`;
  mappers `student_number`, `employee_number`, realm roles → `realm_access.roles` in the ID token.
- EdunexusAI: provider `feddrick-sso` ("Feddrick University ID"), issuer
  `http://localhost:8080/realms/edunexusai-feddrick`, client `edunexusai`, secret variable
  `OIDC_CLIENT_SECRET_FEDDRICK`, claims `student_number` / `employee_number`, development (http)
  flag on (refused in production), enabled.
- Production: https issuer, `OIDC_REDIRECT_BASE_URL` = the portal origin, secret from the secret
  manager, the university's IdP brokered by Keycloak (or connected directly; any OpenID provider).

## 8. Demo accounts (synthetic, local development only)

`rahul.multirole@feddrick.edu`: one account with STUDENT (CampusCore S2600187, MS-CS, registered in
CS 650-01 and CS 310-01) and FACULTY (CampusCore F01024, teaching CS 101-D1), both CampusCore links
verified as the same person; Keycloak user `rahul.multirole` in realm `edunexusai-feddrick`. One
MoodleCloud account (user 31, username `f01024`), shared by both relationships (SAME_PERSON): student
in course 9 "Advanced Database Systems" (from CS 310-01), editing teacher in course 20 "Introduction
to Programming" (from CS 101-D1). Studying lists only course 9; Teaching lists only course 20.

Alumni (fictional): `demo.alumni.elena@feddrick.edu` (Keycloak `alumni.elena`) and
`demo.alumni.marcus@feddrick.edu` (Keycloak `alumni.marcus`). Created by the administrator with the
ALUMNI role (an authorized demo-role assignment), their Keycloak identity linked by the administrator
(ADMIN_VERIFIED, section 12); Keycloak asserts `alumni`, which the mapping rules turn into ALUMNI at
each sign-in. No CampusCore record, no student or faculty profile.

Credentials were handed over separately and are not stored in this repository.

Removing it later:
1. EdunexusAI (admin): Users & Roles → Rahul Multirole → Access → Unlink the Feddrick sign-in.
2. Admin → Integrations → CampusCore SIS → Identity links: revoke both links of
   rahul.multirole@feddrick.edu (reason "demo account removed").
3. Suspend the account (keeps the audit trail), or delete it in the development database:
   `DELETE FROM users WHERE email = 'rahul.multirole@feddrick.edu';` (profiles, roles, sources and
   sign-in links cascade).
4. CampusCore admin: drop the CS 650-01 registration, cancel section CS 101-D1, deactivate student
   S2600187 and faculty F01024.
5. Keycloak admin console → realm `edunexusai-feddrick` → Users → delete `rahul.multirole` (or delete
   the whole realm, which was created only for EdunexusAI).

## 9. Not done / limitations

- **Moodle SSO** (sign in to MoodleCloud with Keycloak): not configured. Moodle core's OAuth 2 service
  could in principle use a custom OpenID issuer without a plugin, but here it cannot work and was not
  attempted: the Keycloak issuer is `http://localhost:8080` (MoodleCloud's servers cannot reach it and
  OAuth 2 needs a public HTTPS issuer), no MoodleCloud site-administrator access is available to this
  setup (only a web-service token), and the MoodleCloud login page refuses automated inspection
  (HTTP 403). Moodle's own login is unchanged. To enable later: publish Keycloak on HTTPS, add a
  Keycloak client for Moodle, then in Moodle (site admin) Server → OAuth 2 services → Custom, and
  enable the OAuth 2 authentication plugin; rollback = disable that plugin. EdunexusAI SSO does not
  depend on it.
- **Administrative roles** other than ADMIN (CMS editor, department admin, registrar, …) are not
  added: each needs its own scope (which content, which department's people) enforced in every route
  it opens, and none of those scopes exists in the data model yet. Adding role names without that
  would be a broad bypass. ADMIN keeps its tenant-wide scope; external claims can never grant it.
- **Back-channel logout** reaches the backend from Keycloak's container at
  `http://host.docker.internal:5001` (local only). Production: the API's public HTTPS address.
- **Real university**: no institutional IdP, real SIS or attribute release has been tested.

## 10. Overview (multi-role accounts)

`/dashboard?view=overview` reads each context through its own endpoints, only when the account has
that context: Studying → `/sis/me/overview` (student record) and `/lms/me/moodle/assignments`;
Teaching → `/sis/faculty/teaching` (faculty record) and `/lms/faculty/moodle/courses`; shared →
`/sis/calendar`, CMS news for all the person's audiences, `/resources`. Panels: Today (class meetings
taken and taught, each labelled Studying/Teaching, with the weekly timetable and the next commitment),
Coming up (academic calendar + the student's Moodle due dates), one card per context (real figures
only; a missing GPA shows "No graded terms yet", never 0), campus news, resources, quick actions. Each
panel has its own loading, error and empty state. Pure logic: `frontend/src/pages/dashboard/overviewData.js`.

## 11. Sign-in sessions, hand-off and logout

- `sso_sessions`: one row per institutional sign-in; its id is `sid` in the access and refresh tokens.
  `requireAuth` and refresh accept an SSO token only while the row is not ended or expired, the
  provider is enabled and the sign-in identity is still linked; a suspended account is refused as
  before. Ended by: portal logout (`PORTAL_LOGOUT`), back-channel logout (`PROVIDER_LOGOUT`), unlinking
  the identity (`IDENTITY_UNLINKED`). Disabling the provider stops its sessions at once.
- `sso_handoffs`: the code in the redirect fragment is random (256 bits); only its SHA-256 is stored;
  `UPDATE … WHERE consumedAt IS NULL AND expiresAt > now()` consumes it, so concurrent exchanges get
  exactly one session; 60-second expiry; no tokens in the row. Works across backend instances.
- The ID token is kept (AES-256-GCM, key derived from the JWT secret) only as the logout
  `id_token_hint`, and erased when the session ends.
- Back-channel logout: the logout token is verified with the provider's JWKS (issuer, audience,
  `iat` within 5 minutes, the back-channel event, no nonce, `sub` or `sid`). Keycloak client
  `edunexusai`: back-channel logout URL set, "session required" on. Rollback: clear that URL in the
  Keycloak client (a copy of the client before the change is kept with the local backups).

## 12. Alumni

- Membership: the institution asserts it (Keycloak role `alumni` → ALUMNI by the mapping rules), or an
  administrator assigns it. No record is required and none is invented. ALUMNI opens no academic data:
  student, faculty, Moodle and admin APIs answer 403.
- Linking an alumnus's sign-in: alumni have no student or employee number on their account, so the
  automatic rule cannot match them (and email alone never does). An administrator links it
  explicitly: Users & Roles → Access → **Link a sign-in (administrator verified)**: provider, the
  person's user id at the provider, how it was verified (audited, `linkMethod = ADMIN_VERIFIED`).
  `POST /api/v1/admin/users/:id/sign-in-identities`. Linking grants no role.
- CMS: pages, news, help articles and forms have an **Alumni** audience (CMS columns
  `audience_alumni`, default false: content published before is not shown to alumni). The Alumni view
  shows alumni news and alumni pages only (`?audience=alumni`), campus events (no internal
  deadlines) and resources addressed to alumni (`audience = ALUMNI`, now selectable for resources).

## 13. Public site (prospective students and visitors)

- No account and no GUEST role: `/visit` (linked from the login page) and `/visit/pages/:slug`.
- Data only from `GET /api/v1/public/:tenant/home` and `/public/:tenant/pages/:slug` (rate limited, no
  token): CMS items published for the **Public** audience (pages, news, help articles; never forms),
  public academic dates (events, term dates, holidays, exam weeks; no internal deadlines), the
  institution's name and sign-in options. Unknown institution → 404; another audience's page → 404.
- Public pages never render blocks that read signed-in data (news feed, FAQ list, events, forms):
  they show "Sign in to see this section" instead.

## 14. CampusCore SIS through the same university sign-in

- EdunexusAI offers **University systems → CampusCore SIS** (sidebar, new tab) only to people with an
  active CampusCore student/faculty link behind a role they hold, and to administrators (registrar
  console). The server decides (`sessionService.universityApps`, `CAMPUSCORE_PORTAL_URL`); the entry is
  just CampusCore's own sign-in address. CampusCore authenticates through its own Keycloak client
  `campuscore` and applies its own account, role and permissions (`campuscoresis/docs/UNIVERSITY_SIGN_IN.md`).
- Keycloak's session is reused: after signing in to EdunexusAI, opening CampusCore needs no password
  while the Keycloak session lives (30 min idle / 10 h max in this realm).
- Sign-out (SSO sessions): **Sign out of EdunexusAI only** (`POST /auth/logout {everywhere:false}`; the
  university session and CampusCore stay) or **Sign out of all university apps** (default; Keycloak
  end-session, which back-channels CampusCore). CampusCore offers the same two choices.
- Moodle is separate: it keeps its own login; no Moodle SSO is configured.

## 15. SSO-first account creation (JIT) and the person registry

The identity architecture across CampusCore, Keycloak, EdunexusAI and Moodle is described in
`campuscoresis/docs/IDENTITY_ARCHITECTURE.md`. In EdunexusAI:

- **Switch:** "Create portal accounts at first sign-in" on a sign-in option (Admin → Sign-in & role mapping;
  `identity_providers.jitProvisioning`, off by default). It needs the CampusCore client to hold `people:read`.
- **When:** only when no account matches the token's verified numbers. `sisService.provisionFromSignIn`:
  1. reads the CampusCore person behind every claimed number (`GET /people`): exactly one person, and every
     claimed number must be theirs;
  2. checks that the token's verified email is one of the person's addresses;
  3. needs at least one current relationship;
  4. checks that nobody already holds the address or the records;
  5. creates one account with **every** current relationship (a person who teaches and studies gets both): no
     portal password, profiles, SIS-sourced roles and the CampusCore links, in one transaction. The links are
     withdrawn if anything fails.
- **The sign-in link** is `federated_identities.linkMethod = JIT_PROVISIONED`. Roles are then evaluated as for
  any sign-in.
- **Refusals** (shown on the sign-in page): `NO_ELIGIBLE_RECORD`, `EMAIL_IN_USE`, `RECORD_ALREADY_LINKED`,
  `JIT_NOT_PERMITTED`, `SIS_UNAVAILABLE`, plus the existing `AMBIGUOUS_RECORDS`, `EVIDENCE_MISMATCH` and
  `EMAIL_NOT_VERIFIED`.
- **No password:** an SSO-only account (`users.passwordHash` NULL, `hasPassword: false`) is not offered
  "Change password", and `POST /auth/password` answers 409.
- **Moodle:** `MOODLE_JIT_PROVISIONING=true` creates the person's Moodle account and CampusCore-derived
  enrolments in the background after JIT (`people/lmsFollowUp.js`), one Moodle account per person.
  `MOODLE_ACCOUNT_AUTH=oauth2` makes new Moodle accounts use the university sign-in (no Moodle password), once
  Moodle's OAuth 2 service is configured (see section 9).
- **Two CampusCore links:** a person with both records gets "CampusCore · Teaching" and "CampusCore · Student
  records", each opening that area (`returnTo`) of their one CampusCore account.
- **Migration** `20261101120000_sso_jit_provisioning` (additive).


## 16. One identity per person: People Search and the consistency check

- **People Search is derived, not a source of people** (`modules/people/directorySync.js`).
  - One entry per active portal account.
  - CampusCore's person registry supplies the name, primary email, faculty title and department, and student
    programme. `directory_profiles.roles` lists every role, so a person who teaches and studies is one entry,
    found under either filter.
  - No entry for: people CampusCore excludes from identity provisioning, accounts whose record can't be found,
    and rows without an account.
  - Refreshed after JIT, provisioning and new relationships. Full rebuild: `npm run directory:rebuild`.
  - Migration `20261102100000_directory_roles` (additive).
- **`npm run identity:consistency`** (read-only; exit code 0 = consistent, 2 = not). Checks, by immutable ids and
  the OIDC `sub`, that:
  - every human Keycloak user has exactly one portal account;
  - every portal account has exactly one Keycloak identity;
  - no Student/Faculty role lacks its CampusCore link;
  - People Search lists exactly the active accounts.

  It uses the read-only `KEYCLOAK_DIRECTORY_*` client. Run it after an identity sync or any manual account change.
