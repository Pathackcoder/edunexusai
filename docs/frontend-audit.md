# Phase 1 — Existing Frontend Audit

Audit date: 2026-10-04
Scope: `frontend/` (React 18 + Vite 5, JavaScript, no TypeScript)

## 1. Stack as found

| Concern | What exists |
| --- | --- |
| Framework | React 18.3 + Vite 5.4, plain JavaScript (`.jsx`) |
| Routing | `react-router-dom` 6.26, `BrowserRouter`, nested routes under one `AppLayout` |
| State | 4 React contexts (`Auth`, `Finance`, `Notification`, `PWA`). No Redux, no React Query |
| Data fetching | None. All data is imported from `src/data/*.js` at module load |
| Persistence | `localStorage` used as the write store for auth, profile, finance, assignments, notifications |
| Styling | One hand-written `src/index.css` (1175 lines) with CSS custom properties |
| Icons | `lucide-react` |
| Extras | PWA service worker, install prompt, `canvas-confetti` |
| Size | ~15,400 lines across 113 source files |

## 2. Route map (as found)

All routes below are preserved unchanged by this phase.

```
/login                              LoginPage                 (public)
/                                   AppLayout                 (protected shell)
  /dashboard                        DashboardPage
  /academics                        AcademicsPage
  /academics/schedule               CourseSchedulePage
  /academics/assignments            AssignmentsPage
  /academics/grades                 GradesGpaPage
  /academics/announcements          AnnouncementsPage
  /academics/calendar               CalendarPage
  /academics/transcripts            TranscriptsPage
  /academics/lms                    LmsPage
  /finance, /finance/tuition        TuitionPaymentsPage
  /finance/financial-aid           FinancialAidPage
  /financial-aid                    -> redirect to /finance/financial-aid
  /campus                           CampusPage
  /campus/people                    PeopleSearchPage
  /campus/library                   LibraryPage
  /campus/security                  CampusSecurityPage
  /profile                          ProfilePage
  /profile/personal                 PersonalInfoPage
  /profile/emergency                EmergencyContactPage
  /profile/privacy                  PrivacyPreferencesPage
  /profile/preferences              CommunicationPreferencesPage
  /profile/requests                 RequestsHistoryPage
  /help, /help/faqs                 HelpSupportPage
  /notifications                    NotificationsPage
*                                   -> redirect to /dashboard
```

## 3. Authentication as found

`src/services/authService.js`:

- Credentials hardcoded in the browser bundle: `admin` / `admin`, plus `student@edunexus.ai` / `Edunexus@123`.
- "Session" is `localStorage.edunexus_auth = { isAuthenticated: true, ... }`. Anyone can set that key by hand.
- No token, no server, no expiry, no roles. One implicit persona (student Amit Pathak).
- `AuthContext` reads `profileService.getProfile()` which falls back to `data/studentData.js`.

This is the single biggest architectural gap and is replaced in Phase 4.

## 4. Dummy data files found (17 files, 1,593 lines)

| File | Exports | Consumed directly by |
| --- | --- | --- |
| `data/studentData.js` | `defaultStudentData` | authService, profileService |
| `data/courses.js` | `coursesData` | DashboardPage, AcademicsPage, CourseSchedulePage, GradesGpaPage, LmsPage, Topbar, courseService |
| `data/assignments.js` | `assignmentsData` | DashboardPage, AcademicsPage, AssignmentsPage, assignmentService |
| `data/grades.js` | `gradesSummaryData` | DashboardPage, AcademicsPage, GradesGpaPage |
| `data/announcements.js` | `initialAnnouncementsData` | DashboardPage, AcademicsPage, AnnouncementsPage |
| `data/calendar.js` | `academicCalendarEvents`, `calendarCategories` | AcademicsPage, CalendarPage, CalendarGrid |
| `data/transcript.js` | `transcriptSummary`, `transcriptTerms`, `initialTranscriptRequests` | TranscriptsPage, UnofficialTranscriptView |
| `data/finance.js` | `initialFinanceData` | financeService |
| `data/financialAid.js` | `financialAidData` | FinancialAidPage, financialAidService |
| `data/notifications.js` | `initialNotificationsData` | notificationService |
| `data/directory.js` | `directoryData`, `directoryDepartments` | PeopleSearchPage, Topbar |
| `data/library.js` | `libraryAccountSummary`, `initialCheckedOutBooks`, `sampleLibraryCatalog` | LibraryPage, CampusPage |
| `data/security.js` | `campusSecurityContacts`, `emergencyProcedures`, `safeWalkInfo` | CampusSecurityPage, SafeWalkModal |
| `data/faqs.js` | `faqCategories`, `faqData`, `supportContacts` | HelpSupportPage |
| `data/profileRequests.js` | `defaultAddressChangeHistory`, `defaultNameChangeHistory` | ProfilePage, PersonalInfoPage, RequestsHistoryPage |
| `data/communicationPreferences.js` | `defaultCommunicationPreferences` | CommunicationPreferencesPage, CommunicationPreferencesSection |

25 component/page files import business data directly. That is the dependency this phase removes.

## 5. Existing "services" as found

`src/services/` contains 7 files, but none of them is a client of anything. They are
synchronous wrappers over the dummy modules plus `localStorage`, some with a
`setTimeout` to imitate latency. They are replaced by a real HTTP service layer in Phase 7.

## 6. Feature inventory (all preserved)

Authentication, dashboard widgets, course schedule + timetable grid, assignments +
submission modal, grades/GPA, course announcements, academic calendar, transcripts
(unofficial view + official request workflow + request history), Canvas LMS launch cards,
tuition balance + payment modal + transaction history, financial aid awards +
disbursement timeline + requirements, people/directory search, library account + loans +
catalog, campus security contacts + emergency procedures + SafeWalk, profile hub,
personal info, name/address change requests, emergency contact, pronouns/privacy,
communication preferences, request history, FAQ/help centre, notification centre +
dropdown, PWA install.

## 7. Gaps against the target architecture

1. No backend, no database, no API. 
2. Browser-side credential check; `localStorage` is the source of truth for business data.
3. Single persona. No faculty, no admin, no roles, no tiers, no entitlements.
4. No tenancy concept anywhere.
5. No integration boundary. "CS 501" is a literal in a JavaScript file in the bundle.
6. No loading/error/empty states, because nothing is ever asynchronous.
7. No validation, no tests, no API documentation.

## 8. Migration strategy chosen

The lowest-risk way to make 25 components data-driven without redesigning them is to
**preserve each component's local identifier** and only change where that identifier is
bound. For example in `DashboardPage`:

```diff
-import { coursesData } from '../data/courses';
+const { data: coursesData } = useCourses();
```

The JSX below is untouched. To make that safe, the API response shapes are derived from
the existing dummy modules rather than invented: `scripts/extract-frontend-data.mjs`
imports the real `src/data/*.js` modules and snapshots them to JSON, and the backend seed
and the mock external service are both built from those snapshots. The contract therefore
matches the UI by construction.
