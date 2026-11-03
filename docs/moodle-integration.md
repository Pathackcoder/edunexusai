# Moodle LMS integration

EduNexusAI talks to Moodle through Moodle's REST web services, from the backend only.
Moodle is the **LMS**. It covers LMS accounts, course shells, enrolments, course content,
assignments and LMS grades. It is **not** the student information system. Official
student records, programmes, registration, tuition and holds stay in EduNexusAI today,
and will move to a separate SIS integration later.

## Boundaries

| Concern | Owner | Where it lives |
|---|---|---|
| Student, course and enrolment records of record | EduNexusAI database (later: SIS adapter) | `StudentProfile`, `Course`, `Enrollment`, … |
| Moodle accounts, course shells, enrolments, content, LMS grades | Moodle | read and written through `MoodleConnector` |
| Which local record matches which Moodle record | EduNexusAI | `external_identities` (provider `MOODLE`) |
| Changes made in Moodle from EduNexusAI | EduNexusAI | `integration_operations` |

Moodle is registered with **no** SIS sync domains, and `resolveIntegrationForDomain`
refuses LMS-only providers (`LMS_ONLY_PROVIDERS`). So even if someone misconfigures it,
Moodle data can never overwrite the academic tables. A future SIS connector goes beside
Moodle in `integrations/registry.js` (the `BANNER`/`ETHOS`/`WORKDAY` slots), without
changing anything in `modules/lms`.

If Moodle is down or not configured, only the Moodle parts of the LMS page and the Moodle
admin page are affected. Every other portal feature keeps working.

## Source of truth (enforced)

| Data | Owner | Shown where |
|---|---|---|
| Moodle courses, visibility, accounts, roles, enrolments, content, assignments, LMS grades | **Moodle**, read live | Academics → LMS Courses, Academics overview "Moodle LMS" card, Admin → Moodle LMS |
| Local accounts, roles, tenant settings, student/faculty records, verified Moodle links, operation history | EduNexusAI database | Admin pages; `external_identities`, `integration_operations` |
| Registered courses, timetable, credits, academic grades (official/SIS) | EduNexusAI database today (mock SIS sync); a real SIS connector later | Course Schedule ("Registered Courses (Academic Record)"), dashboard "Today's schedule · academic record", Grades |

Rules:

- LMS views never fall back to local course records. When Moodle is empty, unlinked or unavailable, they say so.
- The SIS sync can never run against Moodle:
  - Moodle may not be given SIS sync domains. The admin API rejects them with a 400, and a database CHECK constraint (`integrations_lms_only_no_sis_domains`) enforces it too.
  - Every SIS sync path refuses LMS-only providers with `OPERATION_NOT_SUPPORTED` (reason `LMS_ONLY_PROVIDER`), before any log row is written.
- The LMS counterpart is **Read rosters** (`POST /lms/admin/moodle/rosters/read`, operation `LMS.ROSTERS.READ`). It reads every course's participants into canonical enrolment DTOs: provider, Moodle course and user ids, local identity when linked, roles, and ACTIVE/INACTIVE status. It writes only a sync-log row.
  - An empty course is a valid empty result.
  - A capability error is `ACCESS_DENIED`.
  - A missing function is `FUNCTION_NOT_ENABLED`.
  - A connector method that doesn't exist is `OPERATION_NOT_SUPPORTED` (reason `NOT_IMPLEMENTED`), and it doesn't mark the connection as broken.

## Identity

- **The permanent link** is `external_identities`: local student or faculty profile id ↔ Moodle user id. After linking, every call uses the stored Moodle id.
- **Email** is only used to *find* a candidate. It's compared exactly, after trimming and lowercasing.
  - Two consistent matches → stop.
  - A match whose ID number belongs to someone else → stop.
  - Names are never used.
- **Explicit admin links** accept a matching ID number even when the email has since changed. Accounts with a different ID number are refused, as are the token's administrator account and MoodleCloud system accounts.
- **Case sensitivity:** Moodle compares emails exactly, so an account stored with different capitalisation won't be found by email. It is still found by ID number or username.

## Creating a student with Moodle courses

Admin → Users & Roles → Add user → role Student → **Moodle LMS**: create (or link) the account and tick Moodle courses. The list comes live from Moodle.

1. **Before anything is created**, the server checks:
   - writes are enabled;
   - the required functions are available;
   - the student role id is configured;
   - every selected id is a real Moodle course.

   Any failure returns 400/409 and creates nothing.
2. **The local user and student record** are created (existing rules: unique email, generated student number).
3. **One `STUDENT.MOODLE_ONBOARD` operation** runs, keyed by student and course set:
   - provision or verified-link (`USER.PROVISION`);
   - then one `ENROLMENT.ADD` per course, with the Student role.

   Its result is SUCCEEDED, **PARTIAL** (with an outcome for each course), FAILED, BLOCKED or NEEDS_RECONCILIATION. The local student is always kept.
4. **Retry** from Moodle LMS → Operations re-runs it. Provisioning replays or reconciles by ID number, and courses where the student already holds the Student role are skipped, so only missing steps are sent.

Accounts created this way never get the shared `MOODLE_DEMO_PASSWORD` (that is seed-only). Students and faculty are onboarded from Users & Roles → Add user, which chooses an explicit first-password method (Moodle email, a one-time password shown once with a forced change, or none); see `campuscore-integration.md` → *Moodle sign-in for onboarded people*. The same flow exists for existing students: Moodle LMS → Students → Provision, with course selection.

## Student and faculty LMS features

**Students** (all live from Moodle, scoped to the student's verified Moodle account):

| Page | Source | Notes |
|---|---|---|
| LMS Courses | `core_enrol_get_users_courses` | Visible courses only. |
| Assignments & Deadlines | `mod_assign_get_assignments` (with `includenotenrolledcourses=1`), `mod_assign_get_submission_status`, `gradereport_user_get_grade_items` | Hidden activities removed. Grades come only from the grade report (released). An ungraded item is shown as not graded, never as 0. Students submit **in Moodle** (see limits below). |
| Grades & GPA | `gradereport_user_get_grade_items` | Moodle course grades and feedback. GPA and standing stay in the separate "Academic Record (SIS)" section and are never derived from Moodle. |
| Course Schedule | Moodle courses + assignment due dates | Moodle has no class meeting times or rooms, and the SIS timetable is not integrated, so no timetable is shown. |
| Academic overview and dashboard | the same endpoints | No hardcoded credits or progress figures, and no local timetable. |

**Faculty** (Teaching → Moodle Teaching): authorised per course by their linked Moodle account holding `editingteacher` or `teacher` in that course, checked live on every request.

- Courses they teach, each with its students (Moodle student role) and all assignments; hidden ones are flagged.
- **Submissions and grading:**
  - `mod_assign_get_submissions` and `mod_assign_get_grades` show the submissions and stored grades.
  - `mod_assign_save_grade` saves a grade and feedback, which is then read back to verify it.
  - Grades are validated against the assignment's maximum. The student must hold the student role in the course. Feedback requires *Feedback comments* to be enabled on the assignment.
- **Grader of record:** Moodle records the service account as the grader. EduNexusAI's audit log records the faculty member.

**Not possible with a shared service token (by Moodle design):**

- **Student submissions.** `mod_assign_save_submission` saves only for the token's *own* user (it has no `userid`). Portal submission needs per-user Moodle tokens, which in turn need SSO or the student's Moodle credentials. Until then students submit in Moodle and the portal shows the resulting status.
- **Creating assignments.** Checked on the live Moodle 5.3 site on 2026-10-13.
  - `core_courseformat_create_module` exists but is not in this token's service.
  - `core_course_edit_module` only performs actions on existing modules (show, hide, duplicate, delete).
  - No enabled function creates an assignment with its instructions, due date and submission settings.

  Faculty use "Add assignment in Moodle" (`/course/modedit.php?add=assign&course=…`), and the assignment then appears in the portal. At the time of the check no Moodle course contained an assignment, so live grading could only be verified against the stub.

## Canonical course mapping

`external_identities` (entity `COURSE`) maps an EduNexusAI course to a Moodle course id. It never copies Moodle's title, availability, enrolment or grades. Every LMS view returns the Moodle course together with its `localCourse` and `mappingStatus`:

| Status | Meaning |
|---|---|
| `LINKED` | Mapped to an existing EduNexusAI course. |
| `UNLINKED` | No mapping. If the Moodle ID number equals a free local course code, that course is suggested. |
| `CONFLICTED` | The Moodle ID number names a local course already mapped to another Moodle course. |
| `MISSING_LOCAL` | Mapped to an EduNexusAI course that no longer exists. |

Mappings whose Moodle course no longer exists are listed separately as `MISSING_IN_MOODLE`, with an Unlink action.

**Link to…** only maps existing records; it never creates a course. **Create course** is the only path that creates one.

## Sync log outcomes

Every sync-log row has an `outcome`:

| Outcome | Meaning |
|---|---|
| `RECORDS` | Records were returned. |
| `EMPTY` | A valid empty result. |
| `NOT_IMPLEMENTED` | The connector lacks the method. |
| `NOT_SUPPORTED` | Refused by policy, e.g. SIS sync on Moodle. |
| `FUNCTION_NOT_ENABLED` | The Moodle function is not enabled for the service. |
| `PERMISSION_DENIED` | The token's user lacks a capability. |
| `AUTH_FAILED` | The token was rejected. |
| `NETWORK` | Timeout, unreachable, or service unavailable. |
| `NOT_CONFIGURED` | Configuration is missing. |
| `PARTIAL` | Only some of the work completed. |
| `ERROR` | Any other failure. |

Old "does not implement fetchEnrollments" rows are back-filled as `NOT_IMPLEMENTED`.

## Mathematics additions (`--scope=math`)

`MAT_001` is the ID number of the Moodle **category** "Mathematics" (id 4 on this site). It is resolved live and must match exactly one category.

```bash
npm run moodle:seed -- --scope=math            # dry run
npm run moodle:seed -- --scope=math --apply    # create what is missing, then verify
```

The scope:

- Creates `ENX-DEMO-MAT-201` (Linear Algebra) and `ENX-DEMO-MAT-202` (Probability and Statistics) in that category.
- Creates two EduNexusAI faculty identities, FAC-30101 Elena Rossi and FAC-30102 Marcus Webb.
  - These are identity only, created with `createUser(..., { baseline: false })`, so no fabricated local teaching section is added.
  - They log in to the portal with the faculty demo password.
- Provisions their Moodle accounts and enrols each as `editingteacher` in one course.

The scope honours the 20-demo-account cap and the site quota, and re-running it writes nothing.

## Code map

| Layer | File |
|---|---|
| REST client: form encoding, timeouts, retries for reads only, error classification, token redaction | `backend/src/integrations/moodle/moodleClient.js` |
| Function catalogue: purpose, group, capabilities, whether verified live | `backend/src/integrations/moodle/moodleFunctions.js` |
| Connector: checks a function is enabled before calling it; the write switch | `backend/src/integrations/connectors/MoodleConnector.js` |
| DTO mapping and student visibility filtering | `backend/src/integrations/mappers/moodleMapper.js` |
| Application service: identity links, authorization, operations, reconciliation | `backend/src/modules/lms/moodleService.js` |
| Routes (`/api/v1/lms/...`) | `backend/src/modules/lms/lmsRoutes.js` |
| Development seed | `backend/src/modules/lms/moodleSeed.js`, `backend/scripts/moodle-seed.mjs` |
| Read-only diagnostic | `backend/scripts/moodle-smoke.mjs` |
| Student UI | `frontend/src/components/lms/MoodleCoursesPanel.jsx` (on `/academics/lms`) |
| Admin UI | `frontend/src/pages/admin/AdminMoodlePage.jsx` (`/admin/integrations/moodle`) |
| Tests (stub Moodle; never the real site) | `backend/tests/moodle.test.js`, `backend/tests/helpers/moodleStub.js` |

## Configuration (backend `.env`)

| Variable | Required | Meaning |
|---|---|---|
| `MOODLE_BASE_URL` | yes | Site URL, e.g. `https://your-site.moodlecloud.com`. Must be https. |
| `MOODLE_TOKEN` | yes | Web-service token. **Secret.** It is backend-only and never logged or returned by the API. |
| `MOODLE_TIMEOUT_MS` | no (10000) | Per-request timeout, 1000–60000. |
| `MOODLE_MAX_RETRIES` | no (2) | Retries for read calls on timeouts and 502/503/504. Writes are never retried automatically. |
| `MOODLE_WRITES_ENABLED` | no (false) | Master switch for anything that changes Moodle. |
| `MOODLE_STUDENT_ROLE_ID` | for enrolment | Id of Moodle's Student role. Never guessed. |
| `MOODLE_TEACHER_ROLE_ID` | for instructor enrolment | Id of Moodle's Teacher (`editingteacher`) role. Never guessed. |
| `MOODLE_SITE_USER_QUOTA` | seed only | Your plan's user-account limit (MoodleCloud Starter trial: 50). The Moodle API cannot report it. |
| `MOODLE_DEMO_PASSWORD` | seed, optional | Demo-only password for seeded accounts. Never printed or stored by the app. |
| `MOODLE_DEFAULT_CATEGORY_ID` | for course creation (or pick one per course) | Moodle course category id. |
| `MOODLE_ALLOW_COURSE_DELETE` | no (false) | Allows permanent course deletion. Leave off. |
| `MOODLE_SEED_ENABLED` | seed only | `npm run moodle:seed` refuses to run without it. |

The token is only ever sent to `MOODLE_BASE_URL`. If the integration's base URL is
edited in the admin UI to something else, the connector refuses to call it.

**Finding the ids:**

- **Student and Teacher role ids:** Site administration → Users → Permissions → Define roles → Student / Teacher. The browser address shows `roleid=`. The seed preflight also checks the configured ids against roles Moodle reports on real enrolments. On this site: `student` = 5, `editingteacher` = 3.
- **Category id:** Site administration → Courses → Manage courses and categories → click the category. The address shows `categoryid=`.

## Moodle configuration checklist

The function list below is what this integration can use. **Admin → Integrations →
Moodle LMS → Overview** shows live which ones your token can call. So does
`npm run moodle:smoke`.

**Enabled today, and verified against the live site:**

- `core_webservice_get_site_info`
- `core_course_get_courses`
- `core_enrol_get_users_courses`
- `core_course_get_contents`
- `core_course_get_course_module_by_instance`

**Mandatory for the MVP (not yet enabled):**

| Function | Needed for | Capabilities for the service user |
|---|---|---|
| `core_user_get_users_by_field` | Verified account linking; duplicate checks before creating | `moodle/user:viewdetails`, `moodle/user:viewhiddendetails` |
| `core_user_create_users` | Provisioning a student's Moodle account | `moodle/user:create` |
| `core_user_update_users` | Suspending or reactivating an account | `moodle/user:update` |
| `core_course_get_categories` | Validating the category of a new course | `moodle/category:viewcourselist` |
| `core_course_create_courses` | Creating course shells | `moodle/course:create` |
| `core_course_update_courses` | Editing, hiding and showing courses | `moodle/course:update`, `moodle/course:visibility` |
| `enrol_manual_enrol_users` | Enrolling and suspending enrolments | `enrol/manual:enrol`, plus *Allow role assignments* to the Student role |
| `enrol_manual_unenrol_users` | Removing an enrolment (explicitly confirmed) | `enrol/manual:unenrol` |
| `core_enrol_get_enrolled_users` | Course participant list in the admin view | `moodle/course:viewparticipants`, `moodle/course:enrolreview` |
| `mod_assign_get_assignments` | Student assignments and due dates | `mod/assign:view` |
| `mod_assign_get_submission_status` | Student submission status | `mod/assign:view`, `mod/assign:viewgrades` |
| `gradereport_user_get_grade_items` | Released grades and feedback | `gradereport/user:view`, `moodle/grade:viewall` |

**Optional:**

- `core_completion_get_activities_completion_status`, for per-activity progress.
- `core_course_get_courses_by_field`, for faster lookups on large sites.

**Not recommended:**

- `core_course_delete_courses`: hard deletion. The code supports it only behind `MOODLE_ALLOW_COURSE_DELETE` and typed confirmation.
- `core_user_delete_users`: not used at all.
- `core_calendar_get_calendar_upcoming_view`: it returns the *token user's* events, not a student's, so deadlines come from assignment due dates instead.

Parameter and response shapes for the not-yet-enabled functions follow Moodle's
web-service API documentation (`/admin/webservice/documentation.php` on your site).
They have **not** been exercised against your site yet. Run the smoke test after
enabling them.

### Least-privilege setup (recommended)

The current token belongs to the **site administrator**, and the service short name
says *readonly*. Rather than widening that service:

1. **Create a dedicated user**, e.g. `edunexus_integration`, with a strong password that nobody uses interactively.
2. **Create a role** "EduNexus integration" (system context). Give it `webservice/rest:use` plus the capabilities in the table above. Under *Allow role assignments*, allow it to assign **Student**. Assign the role to the user at system level.
3. **Create the service.** Site administration → Server → Web services → External services → Add a new service "EduNexus LMS Integration (read/write)":
   - Tick *Enabled* and *Authorised users only*.
   - Add the functions above.
   - Authorise only the new user.
4. **Create a token.** Manage tokens → create one for that user and service. Put it in `MOODLE_TOKEN` and restart the API.
5. **Retire the old token.** Keep `edunexus_lms_readonly` for diagnostics, or delete its token once the new one works.

Nothing in EduNexusAI changes the Moodle service configuration automatically.

## Using it

**Administrators: Admin → Integrations → Moodle LMS → Manage Moodle LMS**

- **Overview:**
  - Connection health and *Test connection*.
  - Server configuration, with the secret shown only as "configured".
  - Warnings and the function checklist.
- **Courses:**
  - Moodle courses, with links to EduNexusAI courses. When a Moodle course's ID number equals a local course code, that course is suggested (e.g. Moodle 9 / `CS 501`).
  - Create, edit, hide/show, open in Moodle, and enrolments.
  - Permanent delete appears only when `MOODLE_ALLOW_COURSE_DELETE=true`, and requires typing the short name.
- **Students:**
  - **Find & link** connects an existing Moodle account, but only if its email or ID number matches the student. An admin cannot attach someone else's account.
  - **Provision:**
    - Looks Moodle up first; if a matching account exists, it links that one instead of creating another.
    - Otherwise it creates a manual account with username = the student number (lowercase) and ID number = the student number.
    - No password is stored or returned. Either Moodle emails a temporary password (only if you tick the box), or the student uses Moodle's *Forgotten password*.
  - **Suspend / Reactivate:** the account is suspended in Moodle, and enrolments, submissions and grades are kept.
  - **Unlink:** removes only the EduNexusAI link.
- **Operations:**
  - Every change made in Moodle, with its status: pending, succeeded, failed, blocked or needs reconciliation.
  - The error message and a reference id.
  - **Retry**: re-runs the same step, after checking Moodle first.

**Students: Academics → LMS Courses**

- **Course cards:** their own visible Moodle courses, with *Open in Moodle*. This is a normal link to `…/course/view.php?id=…`; students may need to sign in to Moodle.
- **Activities & grades:**
  - Visible content.
  - Assignments with due dates and submission status.
  - Released grades with feedback.
  - Each part says plainly when its Moodle function is not enabled.
- **Status messages:** students who are not linked, suspended, or hit Moodle downtime see a clear message, never placeholder data.

## How consistency is kept

Moodle and PostgreSQL share no transaction, so each change is an `IntegrationOperation`:

1. **Record:** the operation is saved as PENDING before Moodle is called. Only non-secret parameters are stored.
2. **Call once:** Moodle is called a single time.
   - On success: save the link, mark SUCCEEDED, write an audit entry.
   - On a Moodle refusal: FAILED, or BLOCKED when it's configuration (missing function, missing role id, no manual enrolment on the course).
   - On an **uncertain** outcome (timeout, dropped connection, garbled reply): NEEDS_RECONCILIATION. The change may have happened.
   - If Moodle succeeded but the local link could not be saved: NEEDS_RECONCILIATION, with the Moodle id recorded.
3. **Retry:** it always looks the object up in Moodle before creating it, so it links what exists instead of duplicating it. Creates are keyed per student (`USER.PROVISION:<id>`) and per course short name (`COURSE.CREATE:<shortname>`). A repeated request returns the first result.

Logs carry the function name, error kind and a correlation id, never the token, a
password, or grade or submission content.

## Development seed

Seeds a small, clearly labelled demo environment and maps it to **existing**
EduNexusAI identities. It never creates EduNexusAI records.

| Moodle item | Identifier | Mapped to (EduNexusAI) |
|---|---|---|
| Instructor account | `enx-demo-fac-20451`, ID number `ENX-DEMO-FAC-20451` | Faculty FAC-20451 (Sarah Mitchell) |
| 8 student accounts | `enx-demo-enx-<number>`, ID number `ENX-DEMO-ENX-<number>` | Students ENX-984210, 984507, 984303–984308 |
| Courses | `ENX-DEMO-WEB`, `ENX-DEMO-PROG`, `ENX-DEMO-CLOUD` (short name = ID number) | Recorded as `SEED_COURSE` links. These are not EduNexusAI (SIS) courses. |

Rules for demo accounts:

- Emails use `@example.org`, a reserved domain where nobody receives mail.
- Accounts are reused only when username, email and ID number all match.
- Matching is never by name.

The manifest is in `backend/src/modules/lms/moodleSeed.js`.

```bash
cd backend
npm run moodle:seed             # read-only preflight + exact plan
npm run moodle:seed -- --apply  # needs MOODLE_SEED_ENABLED=true and MOODLE_WRITES_ENABLED=true
npm run moodle:seed -- --verify # read-only check of accounts, roles, rosters and links
```

The preflight blocks before any write if any of these fail:

- a required function is missing;
- a role id doesn't match what Moodle reports;
- the category doesn't exist;
- `MOODLE_SITE_USER_QUOTA` is missing or would be exceeded;
- existing demo accounts plus new ones would exceed **20**;
- a local identity is missing;
- a person already has a non-demo Moodle account (that would create a duplicate identity);
- an existing course partly collides with a demo identifier.

**Usage counting:** all non-deleted accounts count toward usage, including guest, admin and suspended accounts. This is conservative, since MoodleCloud does not count suspended users. After applying, the protected courses and the administrator's roles are compared with a before-image.

**Course welcome messages.** Moodle's manual enrolment method sends a *course welcome
message* by default. On MoodleCloud the first student enrolment saved the enrolment and
then failed with "Message was not sent." Before enrolling students:

1. Turn the message off for each demo course: Course → Participants → Enrolment methods → Manual enrolments → edit → *Send course welcome message* = No.
2. Optionally, change the site default for new courses: Site administration → Plugins → Enrolments → Manual enrolments.

Enrolment code treats "Moodle saved it, then errored" as `ENROLLED_WITH_WARNING`, after
re-reading the roster. It never assumes success without checking.

**Re-running** creates nothing new. Every change is an `IntegrationOperation`, so a
failure between Moodle and the local link is reconciled on the next run.

**Signing in to Moodle as a demo user.** The username is `enx-demo-…`. The password is
`MOODLE_DEMO_PASSWORD` from your local `backend/.env`. It is a demo-only shared secret;
rotate it in Moodle when you're done. The demo emails don't receive mail, so *Forgotten
password* cannot work for them.

## Tests and diagnostics

```bash
cd backend
npm test               # the suite, including tests/moodle.test.js against a local stub Moodle
npm run moodle:smoke   # read-only check against the real site; add --course <id> or --user <id>
```

The automated suite never contacts the real Moodle site. In test mode the integration's
base URL is blank unless a test points it at the stub.

## SSO later

Links to Moodle work today without SSO. Students sign in to Moodle separately. Don't
automate Moodle's login form or store Moodle passwords. The safe path:

1. **Pick one identity provider** that both systems trust, such as Microsoft Entra ID, Google Workspace, or an OIDC provider fronting EduNexusAI's accounts.
2. **On MoodleCloud, check that your plan allows these, before building anything:**
   - Enabling the core *OAuth 2* authentication plugin (Site administration → Plugins → Authentication).
   - A custom OAuth 2 issuer (Site administration → Server → OAuth 2 services).
   - Whether email-based account matching and "prevent account creation" can be set the way you need.
   - SAML plugins usually need a plan that allows additional plugins.
3. **Match on a stable claim:** the user's email or the ID number EduNexusAI already writes to Moodle.
4. **Link into Moodle:** EduNexusAI then links to Moodle as now, and Moodle's own login sends the student through the shared provider. No tokens pass between the two apps.

## Known limitations

- **Linking is blocked** until `core_user_get_users_by_field` is enabled. Without it there is no way to verify that a Moodle user id belongs to a given student, and the API refuses rather than guessing. As a result, the live student view currently shows "not linked".
- **Student-detail functions** (assignments, submission status, grades) are not enabled yet, so those parts show "not available yet".
- **Content visibility:** Moodle evaluates per-student *access restrictions* inside Moodle. The service token's view cannot tell whether a student meets them, so the student UI only notes that an activity may have access conditions. Hidden sections, activities and grade items are always removed.
- **One Moodle site per institution:** the code supports one Moodle integration per tenant.
- **Not built:** faculty Moodle workflows. The role model and routes leave room to add them later.


## Assignment workflows: status (checked live on 2026-10-13, Moodle 5.3, MoodleCloud)

| Operation | Through EduNexusAI | How |
|---|---|---|
| List assignments, due dates, instructions | Yes, live-verified | `mod_assign_get_assignments` |
| Submission status per student | Yes, live-verified | `mod_assign_get_submission_status`, `mod_assign_get_submissions` |
| Grade and feedback by faculty | Yes, live-verified | `mod_assign_save_grade`, read back with `mod_assign_get_grades`; the student sees it through `gradereport_user_get_grade_items` |
| Create or edit an assignment (settings, due date, submission types) | No: deep links *Add assignment in Moodle* / *Edit in Moodle* | No enabled core web service creates an assignment with its settings |
| Student submission (upload, submit for grading) | No: *Submit in Moodle* deep link | `mod_assign_save_submission` and `mod_assign_submit_for_grading` act for the token's own user, so the shared service token cannot submit for a student |

**Live checks.**

- Sarah's assignment ("Cloud Deployment and Architecture Report", course 12, cmid 45) is read correctly in both portals.
- A grade (72/80) and feedback were saved through EduNexusAI as Sarah for the demo student `enx-demo-enx-984210`, verified in Moodle, and shown to that student with 90 % and *Pass*. Clear it in Moodle (Grader → that student) if it should not stay.
- **Fixed during that check:** the student grade text included Moodle's "Pass" icon HTML. Grades are now plain text, with `passed` as a separate field.

**Why `core_courseformat_create_module` is not in the function list.**

- The live site has the function: a call returns `accessexception`, not "function not found".
- It is not in this token's service. The *Add functions* list probably omits it because Moodle registers it for the course editor's AJAX use rather than for external services. This is an inference from the observed behaviour; I could not view the site's function registry.
- Even if it were available, it is the course editor's "quick create" call. In current Moodle it creates only module types that support quick creation (for example subsections). It does not take an assignment's instructions, dates or submission settings.
- Supported routes to create assignments from EduNexusAI are a custom Moodle plugin that exposes a create-assignment web service (MoodleCloud plans generally do not allow custom plugins), or a self-hosted Moodle.

**Per-user tokens for in-portal submission.**

- The site has mobile web services enabled: `login/token.php` with service `moodle_mobile_app` answers.
- Getting a student's token needs their Moodle password, which EduNexusAI would have to relay. MoodleCloud's front end also returns 403 to non-browser clients on that endpoint.
- This is not implemented, and it should not be worked around.
- The recommended path is SSO (see `sso-plan.md`): the *Submit in Moodle* deep link then opens without a second login.
