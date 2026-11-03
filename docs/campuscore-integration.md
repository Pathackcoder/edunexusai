# CampusCore SIS integration (EduNexusAI side)

CampusCore SIS is Feddrick University's **system of record** for academic data. EduNexusAI reads it live over its OAuth 2.0 integration API (`/api/v1`) and writes back only where CampusCore allows it.

EduNexusAI never connects to CampusCore's database, never copies its records into local academic tables, and never shows local demo data in place of CampusCore data.

## Ownership

| Data | Owner | In EduNexusAI |
|---|---|---|
| Student identity and number, program, class level, standing | CampusCore | live via `/sis/*` |
| Terms, calendar, catalog, sections, meeting times, instructors | CampusCore | live |
| Registrations, schedules, waitlists | CampusCore | live (read) |
| Published grades, GPA, credits, academic history | CampusCore | live (drafts are never exposed by CampusCore) |
| Faculty teaching assignments and rosters | CampusCore | live, limited to the faculty member's own sections |
| Identity links (EduNexusAI account ↔ CampusCore record) | CampusCore (`ExternalIdentityLink`) | resolved per request; local mirror for admin views |
| Assignments, submissions, LMS grades and content | Moodle | unchanged (`/lms/*`) |
| Logins, roles, preferences, AI and engagement features | EduNexusAI | unchanged |
| Institutional ID shown in the portal (header, profile) | CampusCore | live via `/sis/me/profile`; `student_profiles.studentNumber` holds it only as an identifier for provisioned accounts |

## Architecture

```
React ──/api/v1/sis/*──▶ EduNexusAI backend ──▶ sisService ──▶ SisPortalService ──▶ CampusCoreAdapter ──▶ CampusCoreClient ──▶ CampusCore /api/v1
         (session auth)    (ADMIN / student / faculty checks)       (vendored connector, unmodified)
```

- **`backend/src/integrations/campuscore/connector/`** is an *unmodified* vendored copy of CampusCore's `connector/src` (see `VENDORED.md`). It provides:
  - token caching, with refresh 30 s before expiry and concurrent refreshes collapsed into one;
  - a single retry on `401`, which covers expired, revoked or rotated tokens;
  - backoff on `429/5xx`;
  - no blind retry of writes;
  - canonical mapping;
  - the reference `SisPortalService`.
- **`backend/src/modules/sis/sisService.js`** builds one adapter and portal service from server-side configuration and adds the EduNexusAI rules:
  - The institution is verified (`CAMPUSCORE_EXPECTED_INSTITUTION`) before any data call.
  - The session user is mapped to `{ id, roles, tenantKey }`, so the SIS identity always comes from the session.
  - `SisError` is translated into HTTP responses. `503 SIS_UNAVAILABLE` is used when the error is retryable, and there is never a local fallback.
  - The identity mirror is kept up to date.
  - Every admin write is audited locally, whether CampusCore accepts or rejects it.
- **`backend/src/modules/sis/sisRoutes.js`** mounts the routes at `/api/v1/sis`.
- **`backend/src/integrations/connectors/CampusCoreSisConnector.js`** lists CampusCore under Admin → Integrations. *Test connection* there checks health and the institution.

  CampusCore serves **no** sync domains: the generic sync refuses it (`LIVE_READ_PROVIDER`), and a database CHECK constraint forbids assigning it domains.

## Configuration (backend `.env` only)

| Variable | Example | Notes |
|---|---|---|
| `SIS_PROVIDER` | `campuscore` | |
| `CAMPUSCORE_BASE_URL` | `http://localhost:4000` | Must be `https://` in production |
| `CAMPUSCORE_CLIENT_ID` | `cc_…` | From CampusCore Admin → Developer & integrations |
| `CAMPUSCORE_CLIENT_SECRET` | `ccs_…` | **Secret.** Never in the frontend, logs, git or chat; rotate it if exposed |
| `CAMPUSCORE_EXPECTED_INSTITUTION` | `feddrick` | The connection is unhealthy if the credentials belong to another institution |
| `SIS_TENANT_KEY` | `demo-university` | EduNexusAI's own tenant slug that this connection serves |
| `CAMPUSCORE_TIMEOUT_MS` | `10000` | |

Use separate CampusCore clients, and separate values, for development, staging and production.

**After rotating the secret:** update `.env` and restart the API. A changed secret also builds a new client automatically.

## Identity

- **The key.** `externalUserId` is the EduNexusAI **user id** (stable). It is never the email or a local student number.
- **Per request.** `GET /identity/resolve` is called and cached for 60 s. `UNMAPPED` returns an explicit "not linked" state and no data.
- **Reconciliation** (Admin → Integrations → CampusCore SIS → Identity links):
  - EduNexusAI sends only **email** as evidence. Local student and employee numbers are EduNexusAI-generated and not institutional numbers. Names are sent for display only, and CampusCore never matches on them.
  - Results come back as LINKED, CANDIDATE, AMBIGUOUS or UNMATCHED.
  - The admin confirms every link. If the emails differ, a verification note is required (CampusCore returns `identity_evidence_mismatch` otherwise).
  - Duplicate links are refused by CampusCore (`409`). Links are revoked with a reason, and the history stays in CampusCore.
- **Local mirror.** `external_identities` rows with provider `CAMPUSCORE` (`internalId` = EduNexusAI user id, `externalId` = CampusCore record id). They are refreshed from CampusCore and never used on their own to authorise access.

## Existing EduNexusAI data and the migration decision

A read-only dry run on 2026-10-13 classified every EduNexusAI account against the live CampusCore `feddrick` roster (email evidence only):

| Accounts | LINKED | CANDIDATE | AMBIGUOUS | UNMATCHED |
|---|---|---|---|---|
| 16 students | 0 | 0 | 0 | 16 |
| 3 faculty | 0 | 0 | 0 | 3 |

No exact first + last name collisions exist either (checked for diagnosis only; names never link anything). The EduNexusAI demo people and CampusCore's 181 students and 23 faculty are **separate fictional datasets**.

**Decision: no import into CampusCore.** CampusCore's roster is the canonical roster. Importing the 16 demo students would create fictional duplicate student records, and their local GPAs, transcripts and enrolments are fabricated demo data that must never become official records. Instead:

- **Existing CampusCore people get portal logins** through *provisioning* (below).
- **Existing EduNexusAI accounts stay unmapped** (they see an explicit "not linked" state) until an administrator verifies an identity and links it, or decides they need a new CampusCore record (create it in CampusCore first, then link).
- No local rows were deleted or changed. Clean-up of the deprecated local academic data needs separate approval.

If a real cohort ever has to be loaded into CampusCore from EduNexusAI, it must be a separate, approved one-time job: a dry-run report, stable source IDs, `POST /students` with an `Idempotency-Key` per source ID, a crosswalk table, resumable runs and verification before any source row is retired.

## Account provisioning (CampusCore record → portal login)

Admin → Integrations → CampusCore SIS → **Students** or **Faculty** → *Create login* (`POST /sis/admin/accounts`).

1. Requires the EduNexusAI ADMIN role **and** CampusCore's effective `identity.link` capability (scope ∧ policy ∧ preference).
2. Reads the CampusCore record. Only `ACTIVE`, `ADMITTED` or `LEAVE_OF_ABSENCE` students and `ACTIVE` faculty are accepted.
3. Refuses if the record already has an active link (`409 record_already_linked`), or if an EduNexusAI account already uses the record's institutional email (`409 EMAIL_IN_USE`). In the second case the administrator verifies that existing account and links it under **Identity links**; nothing is matched automatically.
4. In one database transaction, creates the login (institutional email, chosen password, role) and a minimal profile holding only the institutional ID, then creates the CampusCore link with an `Idempotency-Key` (`provision-<userId>`). If the link fails, the login is rolled back; if the commit fails after linking, the link is revoked. A retried link is never duplicated.
5. No onboarding baseline is applied: there are no fabricated transcripts, GPA, enrolments or demo teaching sections. Every academic page reads CampusCore.
6. Both outcomes are audited locally (`SIS_ACCOUNT_PROVISIONED` / `SIS_ACCOUNT_PROVISION_REJECTED`) and in CampusCore (`X-Acting-User`).

The admin **Users** page still creates accounts with the old onboarding baseline, which writes local demo academics. Those rows are no longer shown on SIS-owned pages. Use provisioning for real students and faculty.

**SSO readiness.** A future OIDC/SAML login replaces the password step only: the EduNexusAI user id stays the `externalUserId` of the CampusCore link, so links survive the switch.

## Passwords (EduNexusAI logins)

- **Always bcrypt.** The development-only `PASSWORD_STORAGE=plaintext` setting is retired. A leftover value is ignored with a warning, so an old `.env` still boots.
- **No lockout.**
  - Rows written while plaintext was on still sign in, and are hashed on that login.
  - `npm run passwords:hash-plaintext` (dry run) and `-- --apply` hash any remaining rows in one transaction, keeping each password valid.
  - On 2026-10-13 the dev database had 4 such rows; all 4 were hashed after a backup.
- **Temporary passwords.** Every administrator-issued password, whether new, reset or provisioned, sets `users.passwordChangeRequired` (an additive migration, default `false`).
  - The API answers `403 PASSWORD_CHANGE_REQUIRED` to everything except `/auth/me`, `/auth/password` and logout until the person sets their own password.
  - `POST /auth/password` requires the current password, applies the shared password policy, refuses reuse, ends the account's other sessions and is audited.
  - Anyone can also change their password at *Profile → Change password*.
- No API returns a password or hash, and none is logged.

## Person onboarding (Users & Roles → Add user)

**One workflow, one owner per field.**

| Field | Owner | Collected where |
|---|---|---|
| Legal name, institutional email, student or employee number, program, status | CampusCore | Found by email or institutional ID. Typed only when CampusCore allows the portal to create the student. |
| Login email | EduNexusAI | Always the CampusCore institutional email. |
| Temporary password, role, tier | EduNexusAI | Add user form |
| Moodle username and ID number | Moodle | Derived from the CampusCore institutional ID |
| Moodle first password, course enrolments | Moodle | Credential choice and course picker |

**Flow:**

1. `POST /admin/people/lookup` (read-only in all three systems) reports:
   - the CampusCore record(s) and who they are linked to;
   - any existing EduNexusAI login with that email;
   - any existing Moodle account, matched by ID number, email or username (never by name).

   It then recommends one of: `PROVISION_FROM_SIS`, `LINK_EXISTING_LOGIN`, `ALREADY_ONBOARDED`, `CREATE_IN_SIS`, `AMBIGUOUS`, `BLOCKED` (with the reason) or `RETRY_LATER`.
2. `POST /admin/people` runs the steps and reports each as `DONE`, `ALREADY`, `SKIPPED`, `BLOCKED` or `FAILED`, with the actions still required:
   1. **CampusCore record.** Use the existing record, or create it with an Idempotency-Key, but only if `student.create` is effective. Faculty records cannot be created through the CampusCore API.
   2. **Login and link.** The login and its CampusCore link are created in one atomic step (`provisionAccount`). If a login already uses the email, it is linked after the administrator confirms identity, never duplicated.
   3. **Moodle account.** Linked if one exists; otherwise created with username and ID number set to the institutional ID.
   4. **Moodle enrolments.** Student role (5) for students, editing teacher (3) for faculty.
3. **Partial failures.**
   - Moodle preconditions are checked before anything is created.
   - If CampusCore refuses, nothing is created in any system.
   - If Moodle fails after the login exists, the login is kept, the outcome is `PARTIAL`, and the Moodle operation is retryable.
   - Submitting the same onboarding again resumes. A linked record reuses its login, a replayed Moodle operation is `ALREADY`, and courses already held are skipped.
4. **Administrators** are portal-only logins.
5. **The old local-only path is closed.** While CampusCore is configured, `POST /admin/users` refuses students and faculty (`409 USE_PERSON_ONBOARDING`). That path invented local student numbers and fabricated transcripts.
6. **Systems view.** `GET /admin/people/:userId/systems` reads CampusCore and Moodle live and flags inconsistencies, for example a Moodle ID number that differs from the CampusCore institutional ID.

**Current Feddrick policy (CampusCore Admin → Policies):**

- `api.allowStudentCreation=false`. *Create student* is therefore disabled with that reason; the registrar creates students in CampusCore first.
- `api.allowIdentityLinkWrites=true`, so links and provisioning work.

Enabling student creation is a CampusCore administrator's decision. EduNexusAI never works around it.

## Moodle sign-in for onboarded people

Moodle authenticates separately; the EduNexusAI password is never sent to Moodle. For a **new** Moodle account the administrator chooses:

| Choice | What happens | When to use it |
|---|---|---|
| **Moodle emails a password** (`createpassword`) | Moodle generates a password and emails it to the institutional address. A change is forced at first login. | Production, with real mailboxes. |
| **One-time password** | EduNexusAI sets a random password with Moodle's `auth_forcepasswordchange` preference. It is shown to the administrator once, in a `Cache-Control: no-store` response. | When email cannot reach the person, such as the fictional demo domains. |
| **No password now** | A random, unknown password. The person uses *Forgotten password*, or an administrator issues a one-time password later. | When the password will be set up separately. |

For the one-time option, the password is never written to the database, operation records, audit log, logs or browser storage. A retried operation never re-issues it.

- **Existing Moodle account.** It is linked and keeps its own password.
- **Resets.** *Users & Roles → Systems → Issue one-time Moodle password* uses `core_user_update_users` with a forced change and is audited (`MOODLE_PASSWORD_RESET`).
- **Shared demo password.** `MOODLE_DEMO_PASSWORD` is now used only by the development seed script, never by onboarding.
- **Long term,** SSO (OIDC or SAML through one identity provider) removes the separate Moodle password; see `moodle-integration.md`.

## Class registrations and Moodle courses

**Who owns what.**

| Fact | Owner | Where it is set |
|---|---|---|
| Program (degree requirements) | CampusCore | Student record. A program does **not** register anyone in classes. |
| Sections (a course offered in a term, with instructors, meetings and seats) | CampusCore | Admin → Sections |
| Registrations (student ↔ section) | CampusCore | Student self-service (Class Search), or the registrar from the student's record (Register, with audited overrides) |
| Which Moodle course delivers a section | EduNexusAI (integration configuration) | Admin → Moodle LMS → **CampusCore classes** (`sis_section_moodle_courses`) |
| Moodle course sites and participants | Moodle | Moodle |

**How the mapping works.** Many sections may share one Moodle course; a section has at most one. A section with no Moodle course is a valid state: not every class uses the LMS. A Moodle course whose ID number or short name equals `<course code>-<section>` (or the course code) is *suggested*, never applied automatically.

**Moodle enrolment is derived, on demand, never synchronised in bulk.**

| CampusCore says | Moodle should be | Status shown |
|---|---|---|
| Registered in a mapped section | Student in that Moodle course | `ENROLLED` / `TO_ENROL` |
| Registered in an unmapped section | Nothing | `NO_MOODLE_COURSE` |
| Waitlisted | Nothing yet | `WAITLISTED` |
| Teaching a mapped section | Editing teacher | `TEACHING` / `TO_ENROL` |
| Enrolled in a mapped Moodle course without a matching registration | Review by an administrator | Listed under `review`; never removed automatically |
| No portal login or no Moodle account yet | Onboard first | `NO_PORTAL_ACCOUNT` / `NEEDS_MOODLE_ACCOUNT` |

**Where it is applied.** Each of these uses the existing idempotent Moodle enrolment operations (retryable, audited):

- onboarding (*Enrol in the Moodle courses of their CampusCore registrations*, on by default);
- *Users & Roles → Systems* (per person);
- *Moodle LMS → CampusCore classes → Roster* (per section).

"Additional Moodle courses" in onboarding are only for Moodle courses that are not CampusCore classes, such as orientation.

**Who sees it.**

- Students: *Course Schedule* shows each registered class with its Moodle course and status (`GET /lms/me/sis-classes`, self only).
- Faculty: the CampusCore teaching panel shows the Moodle course of each section (`GET /lms/faculty/moodle/sis-classes`).

Only the stable ids are stored (CampusCore section and term ids, Moodle course id). Course codes, titles, rosters and enrolments are read live.

## Grades: three kinds, three owners

| Grade | Owner | Written by | Shown |
|---|---|---|---|
| Assignment and coursework grades, feedback | Moodle | Faculty in Moodle, or EduNexusAI → Teaching → Moodle Teaching (`mod_assign_save_grade`, read back to verify) | Students: Assignments, and Grades → Moodle course grades (released items only) |
| Final course grades, GPA, standing, transcript | CampusCore | Faculty in the CampusCore faculty portal; registrar approval and publication. The API `grades:write` path is off by policy (`api.allowGradeWrites=false`) and EduNexusAI does not write grades. | Grades & GPA, Transcript, Insights, Dashboard (published only) |
| Local demo coursework | EduNexusAI demo data | *Local gradebook (demo)* | Nowhere for students; labelled as demo |

Moodle grades never flow into CampusCore automatically, and CampusCore grades never flow into Moodle. An instructor decides the final grade in CampusCore's workflow.

## Endpoints

**EduNexusAI routes:**

| Route | Who | CampusCore calls |
|---|---|---|
| `GET /sis/me/profile` | student or faculty | `identity/resolve`, `students/{id}` + `/academic-record` + `programs`, or `faculty/{id}` |
| `GET /sis/me/overview` | student | `identity/resolve`, `students/{id}`, `/academic-record`, `/schedule`, `/grades`, `/registrations` |
| `GET /sis/calendar` | any tenant user | `calendar` |
| `GET /sis/sections` | any tenant user | `terms`, `sections` |
| `GET /sis/faculty/teaching` | faculty | `identity/resolve`, `faculty/{id}/schedule`, `faculty/{id}/sections` |
| `GET /sis/faculty/sections/:id/roster` | faculty | `faculty/{id}/sections` (authorisation), `sections/{id}/roster` |
| `GET /sis/admin/health` | admin | `oauth/token`, `me` |
| `GET /sis/admin/capabilities`, `PUT /sis/admin/write-preferences` | admin | `capabilities`, `integration/write-preferences` |
| `GET /sis/admin/faculty` | admin | `faculty` |
| `POST /sis/admin/accounts` | admin | `capabilities`, `students/{id}` or `faculty/{id}`, `identity/links` (check), `POST identity/links` (Idempotency-Key) |
| `GET /sis/admin/students[/:id[/audit]]` | admin | `students`, `students/{id}` (ETag), `identity/links`, `students/{id}/audit` |
| `POST /sis/admin/students` | admin | `capabilities`, `POST students` (Idempotency-Key from the form) |
| `PATCH /sis/admin/students/:id` | admin | `PATCH students/{id}` (If-Match) |
| `POST /sis/admin/students/:id/deactivate` | admin | `capabilities`, `POST students/{id}/deactivate` |
| `POST /sis/admin/identity/reconcile`, `GET/POST /sis/admin/identity/links`, `POST …/revoke` | admin | `identity/*` |

Every write sends `X-Acting-User: edunexusai:<user id>`.

## Write policy

```
effective = CampusCore scope ∧ CampusCore institutional policy ∧ EduNexusAI switch (client write preference)
```

The EduNexusAI switches are CampusCore's client write preferences. CampusCore stores and enforces them, and they can only **narrow** access.

EduNexusAI additionally requires the ADMIN role for every admin route. Before creating or deactivating a student, it checks that the operation is effective, so a write that is switched off never reaches CampusCore.

## Page migration inventory

| Page | Before | Now |
|---|---|---|
| Academic Overview | local GPA, credits, timetable | CampusCore GPA, standing, credits and today's classes; Moodle assignments; EduNexusAI announcements |
| Course Schedule | local timetable | CampusCore schedule (timetable + registered classes); Moodle course sites and deadlines |
| Class Search (new) | — | CampusCore sections |
| Grades & GPA | local GPA and course grades | CampusCore academic record + published grades by term; Moodle course grades |
| Transcripts (unofficial view) | local transcript | CampusCore published grades. The transcript *request* workflow stays in EduNexusAI. |
| Degree Progress | local degree audit | CampusCore program, credits and standing. The CampusCore API v1 has no degree-audit endpoint, so none is shown. |
| Academic Calendar | local events | CampusCore calendar |
| Dashboard "Today's schedule" | local timetable | CampusCore schedule (the backend panel no longer reads the local timetable) |
| Dashboard "Academic momentum" | local GPA, credits, standing | CampusCore academic record (`dashboard.progress` = `academicSnapshot`) |
| Dashboard "Degree progress" | local transcript + degree rules | CampusCore credits against the program's required credits |
| Dashboard "Academic calendar" | local `academic_events` | CampusCore calendar |
| Dashboard hero (term, program) | `currentTerm`, `degree` | CampusCore schedule term and program |
| Header ID, Profile, Personal Info | local student number, degree, standing, admit term | `/sis/me/profile` (student or faculty) with not-linked / unavailable states |
| Performance Insights | local transcript analytics | CampusCore published grades and academic record; Moodle assignment counts |
| Official transcript request (summary) | local student number | CampusCore institutional ID |
| AI assistant: GPA, schedule, credits | local tables | CampusCore; replies "not linked" or "unavailable" instead of local values |
| Faculty → My Courses | local sections | CampusCore teaching assignments + rosters on top; the local demo sections are labelled as such |
| Faculty → Teaching Schedule | local sections | CampusCore teaching schedule |
| Admin → Integrations → CampusCore SIS | — | health, capabilities, student **and faculty** directories, write-back, **portal login provisioning**, identity reconciliation |
| Assignments, LMS Courses, Moodle Teaching | Moodle | unchanged |

**Still local, by design or until a later decision:**

- Course Recommendations and Learning Path. These are EduNexusAI planning features over local catalogue and transcript data. The assistant's "recommend" answer uses them too.
- The assistant's "assignments" answer reads the local mock-provider assignments, not Moodle. This is a Moodle follow-up.
- Faculty Gradebook (local coursework).
- Transcript requests.

Local academic tables are untouched, so cleanup is a separate, approved step.

### Deprecated local models and fields (not dropped)

These are marked `DEPRECATED` in `prisma/schema.prisma` (comments only; the database is unchanged):

- `student_profiles`: degree, department, academicStanding, admitTerm, currentTerm, creditsCompleted, totalCreditsRequired, cumulativeGpa, majorGpa, semesterGpa, honors
- `transcript_terms`, `transcript_courses`, `academic_events`, `grade_components`
- `terms`, and `enrollments` as an academic record

`/auth/me` still returns the deprecated student-profile fields so the change can be rolled back. No migrated page reads them, and `frontend/tests/sisSources.test.mjs` fails if one starts to.

**Proposed clean-up (needs approval, not done):**

1. Remove the deprecated fields from `/auth/me`.
2. Stop the Users-page onboarding from writing local academics.
3. Move planning onto CampusCore grade history.
4. Back up the database, then drop the columns and tables listed above in one reviewed migration.

**Rollback:** every change is in application code. Restore the previous files (git, or the pre-change source snapshot) and restart. No data migration has to be reversed.

## Tests

`backend/tests/sis.test.js` also covers:

- `/sis/me/profile`;
- dashboard panels and assistant answers that come from CampusCore only, including unmapped and outage cases;
- provisioning: success, an already-linked record, an email already in use, an inactive record, non-admin users, policy off, rollback on link failure, and idempotent retry;
- faculty provisioning.

`backend/tests/passwords.test.js` covers:

- bcrypt-only storage;
- login with existing bcrypt rows and legacy plaintext rows, with re-hashing;
- temporary passwords and the change-password rules;
- the retired plaintext setting being ignored.

`backend/tests/people.test.js` runs onboarding end to end against both stubs:

- lookup;
- a one-time Moodle password that reaches Moodle but is never persisted;
- resuming without duplicates;
- linking an existing Moodle account or login;
- policy-blocked CampusCore creation that creates nothing;
- Moodle failure leading to `PARTIAL`, then completion on retry;
- faculty onboarding;
- admin-only access;
- the cross-system status view and its mismatch warning;
- one-time password reset;
- an immediate effect when a mapping is revoked.

The shared test bootstrap blanks the developer's CampusCore and Moodle settings (Prisma re-reads `.env`, so they are blanked rather than deleted). No test reaches a real SIS or Moodle.

`backend/tests/sis.test.js` runs against an in-process CampusCore stub (`tests/helpers/campuscoreStub.js`) and never touches the real SIS. It covers:

- token caching, refresh before expiry, and recovery from revocation;
- invalid credentials and the wrong institution;
- unmapped, mapped and isolated students (request parameters can't change the record);
- faculty limited to their own sections;
- outages, which produce an unavailable state;
- admin-only access;
- idempotent create, ETag edits, per-field refusals, and deactivation without deletion;
- write preferences and policy;
- reconcile, link (evidence and duplicates) and revoke;
- local academic tables unchanged, Moodle routes unaffected, and no secret in responses.
