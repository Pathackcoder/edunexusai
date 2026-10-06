# Database, cross-persona workflows and advanced features

## 1. Database setup (DBngin + PostgreSQL 18.4)

| Setting | Value |
| --- | --- |
| DBngin server | **EdunexusAI** (PostgreSQL 18.4) |
| Host / port | `127.0.0.1:5432` |
| User | `postgres` (DBngin default, no password) |
| App database | **`edunexusai`** |
| Test database | **`edunexusai_test`** (used by `npm test`, rebuilt each run) |
| ORM | Prisma 6 (`backend/prisma/schema.prisma`) |

`backend/.env` (copy from `backend/.env.example`; never commit it):

```
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/edunexusai?schema=public"
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:5432/edunexusai_test?schema=public"
```

If you set a password in DBngin, use `postgresql://postgres:<password>@127.0.0.1:5432/...`.

### Commands (run in `backend/`)

| Command | What it does |
| --- | --- |
| `createdb -h 127.0.0.1 -p 5432 -U postgres edunexusai` | Create the database (once). DBngin's binaries are in `/Users/Shared/DBngin/postgresql/18.4_arm/bin/`; TablePlus can create it too. |
| `npm run db:setup` | Apply all migrations, then seed the demo data. **Use this on a fresh database.** |
| `npm run prisma:deploy` | Apply pending migrations only |
| `npm run db:seed` | (Re)seed. Idempotent — every row is keyed, so re-running never duplicates data or overwrites records users created in the app |
| `npm run db:status` | Show migration status |
| `npm run db:reset` | **Destructive:** drop everything, re-migrate, re-seed |
| `npm run prisma:studio` | Browse data in Prisma Studio |
| `npm test` | Migrates + seeds `edunexusai_test`, then runs the API test suite |

### Moving from the previous server

Before this change, the app pointed at a DBngin instance on port **5433**. Its `edunexusai` database was copied
to the new 5432 server with `pg_dump`/`pg_restore` before the new migration ran, so every user-created record
(including address petitions and transcript orders filed through the UI) was kept. The 5433 server was not
modified.

### Inspecting in TablePlus

New connection → PostgreSQL → host `127.0.0.1`, port `5432`, user `postgres`, database `edunexusai`. Useful starting
points: `service_requests` (+ `service_request_events`), `support_tickets`, `portal_forms` / `form_submissions`,
`portal_resources`, `communication_broadcasts`, `notifications` (filter on `sourceType`), `audit_logs`,
`dashboard_layouts`.

## 2. What lives where (JSON classification)

| Data | Category | Where it lives now |
| --- | --- | --- |
| Users, roles, tiers, widget catalogue & entitlements, students, faculty, courses, enrollments, grades, transcripts, finance, aid, library, directory, notifications, FAQs, preferences, profile petitions | Persistent domain data | PostgreSQL (already, seeded from `prisma/seed-data/*.json` snapshots of the original frontend data) |
| Approvals queue, help-desk tickets, forms & surveys, resources, broadcasts, admin activity — previously **hard-coded arrays in the admin React components, kept in session memory** | Persistent workflow data | PostgreSQL: `service_requests`, `support_tickets`, `portal_forms`, `form_submissions`, `portal_resources`, `communication_broadcasts`, `audit_logs`. Original values migrated via `prisma/seed-data/operations.json`, now attached to real users |
| Faculty tasks / follow-ups (session memory) | Persistent | `student_interventions` |
| Dashboard widget order | Persistent per user | `dashboard_layouts` |
| Course catalogue, degree requirements, learning paths, student groups, campus buildings/rooms | Institution reference data | PostgreSQL, seeded from `prisma/seed-data/planning.json`, `community.json`, `campus-map.json` |
| Career-services postings | Mock external integration | `src/integrations/fixtures/career-opportunities.json` → `careerServicesAdapter` → upserted into `career_opportunities` (`sourceSystem = CAREER_SERVICES_MOCK`) |
| Non-course room reservations | Mock external integration | `src/integrations/fixtures/room-schedule.json` via `roomSchedulingAdapter` (read-through; course meetings come from PostgreSQL) |
| SIS / Canvas payloads | Mock external integration | `mock-external-service/data/*.json` (unchanged) |
| Calendar categories, chart colours, translations | UI constants | Frontend |

## 3. One request architecture

```
Student / Faculty ──POST /requests (or a domain screen)──▶ service_requests ──▶ Admin › Operations › Requests
Admin ──PATCH /admin/requests/:id/decision──▶ status + service_request_events row
                                            ├─▶ domain record updated (address/name of record, transcript status, referral)
                                            ├─▶ notification to the requester
                                            └─▶ audit_logs row
```

* Generic request types (enrollment letters, fee waivers, overrides, room bookings, equipment, syllabus revisions,
  leave, announcements, …) are catalogued in `backend/src/modules/workflows/requestTypes.js` with their form fields and
  which persona may file them.
* Domain screens keep their own records and link them: an address/name petition (`profile_change_requests`), an
  official transcript order (`transcript_requests`) or a faculty referral (`student_interventions`) creates its
  `service_requests` twin in the same transaction (`sourceType` / `sourceId`). Approving an address petition updates
  the student's address of record.
* Statuses: `PENDING → IN_REVIEW → NEEDS_INFO ⇄ (requester responds) → APPROVED | REJECTED`, or `CANCELLED` by the
  requester. Notes are required for *needs information* and *reject*.
* Supporting documents: up to 3 files × 1 MB, stored in `attachments`, downloadable only by the requester and admins.

The same pattern drives **help-desk tickets** (threaded replies, status changes, notifications both ways), **forms**
(admin builds & publishes → audience notified → submissions → optional staff review → submitter notified),
**resources** (admin or faculty publish → audience notified → views counted) and **broadcasts** (audience resolved
against real users → in-app notifications → read rate measured).

## 4. Advanced features → where they are

| Feature | Student UI | API | Notes |
| --- | --- | --- | --- |
| Personalised course recommendations | Academics › Course Recommendations | `/planning/recommendations` | Rule-based ranker in `recommendationProvider.js`; each result lists its reasons. Swap for an AI provider behind the same function. |
| Degree progress tracker | Academics › Degree Progress | `/planning/degree-progress` | Transcript + enrollments allocated against `degree_requirements` |
| AI chatbot | Floating assistant (students & faculty) | `/assistant/messages` | Answers from the user's portal records + FAQ table; history persisted; falls back to "open a ticket" |
| Proactive intervention | Faculty › Student Follow-ups; Admin › Operations › Interventions | `/interventions` | Flags are entered by people; indicators are factual counts (past-due work without a submission). No risk scores. |
| Learning paths | Academics › Learning Path | `/planning/learning-paths` | Course steps auto-complete from the transcript |
| Calendar sync | Academic Calendar page | `/calendar-sync` | Google / Outlook connection state persisted; OAuth simulated by `calendarProviderAdapter` |
| Virtual advising | Academics › Advising; Faculty › Advising | `/advising/*` | Book, reschedule, cancel, complete; both sides notified |
| Internship / job board | Career & Community › Jobs & Internships | `/career/opportunities` | Career-services adapter; matched against portfolio skills |
| Skills portfolio | Career & Community › Skills Portfolio | `/career/portfolio` | |
| Groups & clubs | Career & Community › Groups & Clubs | `/career/groups/*` | Join/leave, approval for closed groups, officers post events |
| Campus map | Campus › Campus Map | `/campus/map` | Stylised map from `campus_buildings`; your classes highlighted |
| Classroom availability | Campus › Classroom Availability | `/campus/classrooms` | Course meetings + room-scheduling feed |
| Gamification | Career & Community › Achievements | `/career/achievements` | Badges derived from real activity; nothing stored |
| Advanced visualisation | Academics › Performance Insights | `/planning/insights` | GPA trend, grade distribution, course performance, credits per term; table view toggle |
| Multi-language | Language menu in the header | `PATCH /profile {locale}` | gettext-style `t()` with es / fr / hi dictionaries for navigation and shared chrome |

Visibility is entitlement-driven: each feature has a `feature.*` widget definition and each new dashboard card a
`dashboard.*` one, toggleable per tier in Admin › Widget Entitlements. By default both tiers get every advanced page;
the Advanced tier additionally gets the learning-path, achievements and opportunities dashboard cards.

## 5. Dashboards

Student and faculty dashboards are drag-and-drop (`frontend/src/components/dashboard/SortableDashboard.jsx`):
grab a card anywhere that is not a control (or by the grip that appears on hover; arrow keys on the grip also
reorder), other cards glide out of the way, the card settles on drop, and the order is saved to
`dashboard_layouts` (`PUT /dashboard/layout/:student|faculty`). "Reset layout" restores the default.

## 6. Demo walkthrough

1. Sign in as **student@edunexus.ai** → Help & Support › My Requests → *New request* (e.g. Enrollment verification).
2. Sign in as **admin@edunexus.ai** → Dashboard › Operations workspace › Requests → open it → *Request info* with a note.
3. Back as the student: the bell shows the update; My Requests shows *Needs information* → reply.
4. Admin approves → student is notified, timeline shows every step, `audit_logs` records it.
5. Repeat with a help-desk ticket, a form (admin › Forms › New form › Publish) and a broadcast (Communication Center).
