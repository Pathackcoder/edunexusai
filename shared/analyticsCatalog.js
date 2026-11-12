// Shared by the API and UI: the fixed catalogue of everything portal analytics may record.
//
// Nothing outside these lists is ever stored. A page is recorded by its key (never its URL, so
// record ids, slugs and query strings cannot reach the database); navigation targets, widgets and
// features are recorded by the keys below. The API validates every event against this module and
// the browser uses the same module to decide what to send.

export const ANALYTICS_SCHEMA_VERSION = 1;

export const DEVICE_CLASSES = ['MOBILE', 'TABLET', 'DESKTOP'];
export const ROLE_KEYS = ['STUDENT', 'FACULTY', 'STAFF', 'ALUMNI', 'ADMIN'];
/** Which workspace a page view belongs to: one role, or SHARED (a page every role shares). */
export const CONTEXT_KEYS = [...ROLE_KEYS, 'SHARED'];
export const ROLE_LABELS = { STUDENT: 'Students', FACULTY: 'Faculty', STAFF: 'Staff', ALUMNI: 'Alumni', ADMIN: 'Administrators', SHARED: 'Shared pages' };
export const DEVICE_LABELS = { MOBILE: 'Mobile', TABLET: 'Tablet', DESKTOP: 'Desktop' };

/** Dashboard view (the `?view=` tab of a multi-role account) → the role it belongs to. */
export const DASHBOARD_VIEW_ROLES = { student: 'STUDENT', faculty: 'FACULTY', staff: 'STAFF', alumni: 'ALUMNI', admin: 'ADMIN', overview: 'SHARED' };

const page = (key, path, label, section, roles = null) => ({ key, path, label, section, roles });
const S = ['STUDENT'];
const FA = ['FACULTY', 'ADMIN'];
const F = ['FACULTY'];
const A = ['ADMIN'];
const SF = ['STUDENT', 'FACULTY'];

/**
 * Every signed-in page. `path` is the route pattern (":x" matches one segment). `roles` are the
 * roles the route is for (the route's own guard in App.jsx); null means every signed-in person.
 * Keys are permanent: rename a label freely, never reuse a key for a different page.
 */
export const PAGES = [
  page('dashboard', '/dashboard', 'Dashboard', 'Dashboard'),

  page('academics.overview', '/academics', 'Academic Overview', 'Academics', S),
  page('academics.schedule', '/academics/schedule', 'Course Schedule', 'Academics', S),
  page('academics.assignments', '/academics/assignments', 'Assignments & Deadlines', 'Academics', S),
  page('academics.grades', '/academics/grades', 'Grades & GPA', 'Academics', S),
  page('academics.announcements', '/academics/announcements', 'Announcements', 'Academics', S),
  page('academics.calendar', '/academics/calendar', 'Academic Calendar', 'Academics'),
  page('academics.transcripts', '/academics/transcripts', 'Transcripts', 'Academics', S),
  page('academics.class_search', '/academics/class-search', 'Class Search', 'Academics', S),
  page('academics.lms', '/academics/lms', 'LMS Courses', 'Academics', S),
  page('academics.degree_progress', '/academics/degree-progress', 'Degree Progress', 'Academics', S),
  page('academics.recommendations', '/academics/recommendations', 'Course Recommendations', 'Academics', S),
  page('academics.learning_path', '/academics/learning-path', 'Learning Path', 'Academics', S),
  page('academics.insights', '/academics/insights', 'Performance Insights', 'Academics', S),
  page('academics.advising', '/academics/advising', 'Advising', 'Academics', S),

  page('career.opportunities', '/career/opportunities', 'Jobs & Internships', 'Career & Community', S),
  page('career.portfolio', '/career/portfolio', 'Skills Portfolio', 'Career & Community', S),
  page('career.groups', '/career/groups', 'Groups & Clubs', 'Career & Community', S),
  page('career.achievements', '/career/achievements', 'Achievements', 'Career & Community', S),

  page('finance.tuition', '/finance', 'Tuition & Payments', 'Finance', S),
  page('finance.tuition', '/finance/tuition', 'Tuition & Payments', 'Finance', S),
  page('finance.financial_aid', '/finance/financial-aid', 'Financial Aid', 'Finance', S),

  page('campus.overview', '/campus', 'Campus Overview', 'Campus'),
  page('campus.people', '/campus/people', 'People Search', 'Campus'),
  page('campus.directory', '/campus/directory', 'Campus Directory', 'Campus'),
  page('campus.library', '/campus/library', 'Library', 'Campus', S),
  page('campus.security', '/campus/security', 'Campus Security', 'Campus'),
  page('campus.map', '/campus/map', 'Campus Map', 'Campus'),
  page('campus.classrooms', '/campus/classrooms', 'Classroom Availability', 'Campus'),
  page('campus.news', '/campus/news', 'News & Notices', 'Campus'),
  page('cms.page', '/pages/:slug', 'Campus pages (all)', 'Campus'),

  page('profile.hub', '/profile', 'Profile Hub', 'Profile'),
  page('profile.personal', '/profile/personal', 'Personal Information', 'Profile'),
  page('profile.password', '/profile/password', 'Change Password', 'Profile'),
  page('profile.emergency', '/profile/emergency', 'Emergency Contact', 'Profile', S),
  page('profile.privacy', '/profile/privacy', 'Privacy & Preferences', 'Profile', S),
  page('profile.preferences', '/profile/preferences', 'Communication Preferences', 'Profile'),
  page('profile.requests', '/profile/requests', 'Requests & Changes', 'Profile'),

  page('faculty.dashboard', '/faculty', 'Teaching Dashboard', 'Teaching', FA),
  page('faculty.courses', '/faculty/courses', 'My Courses', 'Teaching', FA),
  page('faculty.course_detail', '/faculty/courses/:courseId', 'Course Detail', 'Teaching', FA),
  page('faculty.moodle', '/faculty/moodle', 'Moodle Teaching', 'Teaching', F),
  page('faculty.gradebook', '/faculty/gradebook', 'Local Gradebook', 'Teaching', F),
  page('faculty.announcements', '/faculty/announcements', 'Teaching Announcements', 'Teaching', FA),
  page('faculty.schedule', '/faculty/schedule', 'Teaching Schedule', 'Teaching', FA),
  page('faculty.advising', '/faculty/advising', 'Faculty Advising', 'Teaching', F),
  page('faculty.interventions', '/faculty/interventions', 'Student Follow-ups', 'Teaching', FA),

  page('admin.dashboard', '/admin', 'Administration Dashboard', 'Administration', A),
  page('admin.users', '/admin/users', 'Users', 'Administration', A),
  page('admin.roles', '/admin/roles', 'Roles & Permissions', 'Administration', A),
  page('admin.entitlements', '/admin/entitlements', 'Widget Entitlements', 'Administration', A),
  page('admin.sign_in', '/admin/sign-in', 'Sign-in & Role Mapping', 'Administration', A),
  page('admin.integrations', '/admin/integrations', 'Integrations', 'Administration', A),
  page('admin.integration_campuscore', '/admin/integrations/campuscore', 'CampusCore Integration', 'Administration', A),
  page('admin.integration_moodle', '/admin/integrations/moodle', 'Moodle Integration', 'Administration', A),
  page('admin.integration_detail', '/admin/integrations/:integrationId', 'Integration Detail', 'Administration', A),
  page('admin.appearance', '/admin/appearance', 'Portal Appearance', 'Administration', A),
  page('admin.analytics', '/admin/analytics', 'Analytics: Overview', 'Administration', A),
  page('admin.analytics_people', '/admin/analytics/people', 'Analytics: People & activity', 'Administration', A),
  page('admin.analytics_pages', '/admin/analytics/pages', 'Analytics: Pages & navigation', 'Administration', A),
  page('admin.analytics_features', '/admin/analytics/features', 'Analytics: Features & widgets', 'Administration', A),
  page('admin.analytics_devices', '/admin/analytics/devices', 'Analytics: Devices & visits', 'Administration', A),
  page('admin.analytics_communication', '/admin/analytics/communication', 'Analytics: Communication', 'Administration', A),
  page('admin.analytics_integrations', '/admin/analytics/integrations', 'Analytics: Integrations', 'Administration', A),
  page('admin.analytics_health', '/admin/analytics/health', 'Analytics: Data health', 'Administration', A),
  // Any other address under /admin/analytics redirects to the Overview; counted with it.
  page('admin.analytics', '/admin/analytics/:section', 'Analytics', 'Administration', A),

  page('help.faqs', '/help', 'Help & FAQs', 'Help & Support'),
  page('help.faqs', '/help/faqs', 'Help & FAQs', 'Help & Support'),
  page('help.requests', '/help/requests', 'My Requests', 'Help & Support', SF),
  page('help.tickets', '/help/tickets', 'Help Desk', 'Help & Support', SF),
  page('help.forms', '/help/forms', 'Forms', 'Help & Support', SF),
  page('help.resources', '/help/resources', 'Resources', 'Help & Support'),
  page('notifications', '/notifications', 'Notifications', 'Notifications'),

  page('studio.start', '/studio/start', 'Studio: Start', 'Studio', A),
  page('studio.overview', '/studio/overview', 'Studio: Overview', 'Studio', A),
  page('studio.pages', '/studio/pages', 'Studio: Pages', 'Studio', A),
  page('studio.page_editor', '/studio/pages/:id/edit', 'Studio: Page Editor', 'Studio', A),
  page('studio.page_preview', '/studio/preview/pages/:id', 'Studio: Page Preview', 'Studio', A),
  page('studio.dashboards', '/studio/dashboards', 'Studio: Dashboards', 'Studio', A),
  page('studio.dashboard_editor', '/studio/dashboards/:persona/edit', 'Studio: Dashboard Editor', 'Studio', A),
  page('studio.news', '/studio/news', 'Studio: News', 'Studio', A),
  page('studio.faqs', '/studio/faqs', 'Studio: Help Articles', 'Studio', A),
  page('studio.media', '/studio/media', 'Studio: Media', 'Studio', A),
  page('studio.forms', '/studio/forms', 'Studio: Forms', 'Studio', A),
  page('studio.form_editor', '/studio/forms/:id', 'Studio: Form Editor', 'Studio', A),
  page('studio.settings', '/studio/settings', 'Studio: Settings', 'Studio', A),
];

/** Routes that only redirect (never a page of their own), so they are deliberately not tracked. */
export const REDIRECT_PATHS = ['/', '/career', '/financial-aid', '/studio'];

const PAGE_BY_KEY = new Map();
for (const entry of PAGES) if (!PAGE_BY_KEY.has(entry.key)) PAGE_BY_KEY.set(entry.key, entry);
export const pageByKey = (key) => PAGE_BY_KEY.get(key) ?? null;
export const PAGE_KEYS = [...PAGE_BY_KEY.keys()];

const segmentsOf = (path) => String(path).split('/').filter(Boolean);
const COMPILED = PAGES.map((entry) => ({ entry, parts: segmentsOf(entry.path) }))
  // Literal patterns before wildcard ones, so /admin/integrations/moodle is never ":integrationId".
  .sort((a, b) => a.parts.filter((p) => p.startsWith(':')).length - b.parts.filter((p) => p.startsWith(':')).length);

/** The page key for a pathname (no query string is ever passed in), or null when it is not tracked. */
export function pageKeyForPath(pathname) {
  const parts = segmentsOf(String(pathname).split('?')[0].split('#')[0]);
  for (const { entry, parts: pattern } of COMPILED) {
    if (pattern.length !== parts.length) continue;
    if (pattern.every((part, index) => part.startsWith(':') || part === parts[index])) return entry.key;
  }
  return null;
}

/** Where a navigation click came from. */
export const NAV_SOURCES = ['SIDEBAR', 'SIDEBAR_FLYOUT', 'BREADCRUMB', 'HEADER_MENU', 'SEARCH'];
export const NAV_SOURCE_LABELS = { SIDEBAR: 'Sidebar', SIDEBAR_FLYOUT: 'Collapsed sidebar menu', BREADCRUMB: 'Breadcrumbs', HEADER_MENU: 'Profile menu', SEARCH: 'Global search results' };

/** Navigation targets that are not portal pages (other university systems opened from the sidebar). */
export const NAV_EXTERNAL_TARGETS = {
  'app.campuscore': 'CampusCore SIS',
  'app.campuscore-faculty': 'CampusCore · Teaching',
  'app.campuscore-student': 'CampusCore · Student records',
};
export const isNavTarget = (key) => PAGE_BY_KEY.has(key) || Object.hasOwn(NAV_EXTERNAL_TARGETS, key);
export const navTargetLabel = (key) => PAGE_BY_KEY.get(key)?.label ?? NAV_EXTERNAL_TARGETS[key] ?? key;

const widgets = (dashboard, role, rows) => rows.map(([key, label]) => ({ key, label, dashboard, role }));

/** Dashboard widgets whose visibility and use are measured. Keys match the dashboards' own widget keys. */
export const WIDGETS = [
  ...widgets('Student dashboard', 'STUDENT', [
    ['dashboard.schedule', "Today's schedule"],
    ['dashboard.progress', 'Academic momentum'],
    ['dashboard.tuition', 'Tuition & accounts'],
    ['dashboard.assignments', 'Upcoming assignments'],
    ['dashboard.financial_aid', 'Financial aid'],
    ['dashboard.announcements', 'From your courses'],
    ['dashboard.notifications', 'Campus pulse'],
    ['dashboard.library', 'Library account'],
    ['dashboard.calendar', 'Academic calendar'],
  ]),
  ...widgets('Faculty dashboard', 'FACULTY', [
    ['faculty.courses', 'My courses'],
    ['faculty.announcements', 'Recent announcements'],
    ['faculty.coursework', 'Upcoming coursework'],
    ['faculty.roster', 'My students & groups'],
    ['faculty.schedule', 'Teaching schedule'],
    ['faculty.tasks', 'Tasks & follow-ups'],
    ['faculty.advising', 'Advising appointments'],
    ['faculty.resources', 'Teaching resources'],
    ['faculty.requests', 'My requests'],
  ]),
  ...widgets('Administration dashboard', 'ADMIN', [
    ['admin.hero', 'Operations control center'],
    ['admin.communications', 'Communication analytics & emergency broadcast'],
    ['admin.tiers', 'Student tiers'],
    ['admin.integrations', 'Integration health'],
    ['admin.operations', 'Operations workspace'],
    ['admin.audit', 'Audit activity'],
    ['admin.sync', 'Recent integration activity'],
  ]),
  ...widgets('Staff dashboard', 'STAFF', [
    ['staff.announcements', 'Campus news for staff'],
    ['staff.calendar', 'Academic calendar'],
    ['staff.resources', 'Resources for staff'],
    ['staff.requests', 'My requests & help desk'],
  ]),
  ...widgets('Alumni dashboard', 'ALUMNI', [
    ['alumni.announcements', 'Alumni news'],
    ['alumni.community', 'Networking, mentoring & giving'],
    ['alumni.calendar', 'Campus events & calendar'],
    ['alumni.resources', 'Alumni resources'],
  ]),
];
const WIDGET_BY_KEY = new Map(WIDGETS.map((widget) => [widget.key, widget]));
export const widgetByKey = (key) => WIDGET_BY_KEY.get(key) ?? null;
export const WIDGET_ACTIONS = ['LINK', 'CONTROL'];

/**
 * Named features. `origin` says who may record the event: BROWSER events describe opening or
 * choosing something in the UI; SERVER events are written by the API only after the action
 * succeeded, so the browser can never claim them. `stage`: OPEN (the feature was opened) or
 * COMPLETE (it was actually used); a feature's adoption is judged on its COMPLETE events
 * when it has one. `actions` is the closed list of sub-types, when the feature has any.
 */
const feature = (key, label, group, origin, stage, actions = null) => ({ key, label, group, origin, stage, actions });
export const FEATURES = [
  feature('chat.opened', 'Opened messages', 'Chat', 'BROWSER', 'OPEN', ['INBOX', 'CONVERSATION']),
  feature('chat.message_sent', 'Sent a message', 'Chat', 'SERVER', 'COMPLETE'),
  feature('assistant.opened', 'Opened the assistant', 'AI assistant', 'BROWSER', 'OPEN'),
  feature('assistant.question_asked', 'Asked a question', 'AI assistant', 'SERVER', 'COMPLETE'),
  feature('notifications.opened', 'Opened the notification bell', 'Notifications', 'BROWSER', 'OPEN'),
  feature('notifications.read', 'Marked a notification read', 'Notifications', 'SERVER', 'COMPLETE'),
  feature('search.result_selected', 'Chose a global search result', 'Global search', 'BROWSER', 'COMPLETE', ['PERSON', 'COURSE', 'QUICK_NAV', 'SEE_ALL']),
  feature('directory.searched', 'Searched the directory', 'Directory', 'BROWSER', 'COMPLETE', ['PEOPLE', 'CAMPUS']),
  feature('moodle.opened', 'Opened Moodle from the portal', 'Moodle', 'BROWSER', 'COMPLETE', ['COURSE', 'ASSIGNMENT', 'ACTIVITY', 'LOGIN', 'GRADER']),
  feature('campuscore.opened', 'Opened CampusCore from the portal', 'CampusCore', 'BROWSER', 'COMPLETE'),
  feature('requests.submitted', 'Submitted a request', 'Requests', 'SERVER', 'COMPLETE'),
  feature('tickets.created', 'Opened a help desk ticket', 'Help desk', 'SERVER', 'COMPLETE'),
  feature('forms.submitted', 'Submitted a form', 'Forms', 'SERVER', 'COMPLETE'),
  feature('advising.booked', 'Booked an advising appointment', 'Advising', 'SERVER', 'COMPLETE'),
  feature('transcripts.requested', 'Requested an official transcript', 'Transcripts', 'SERVER', 'COMPLETE'),
  feature('calendar.connected', 'Connected an external calendar', 'Calendar sync', 'SERVER', 'COMPLETE'),
  feature('dashboard.reordered', 'Rearranged dashboard widgets', 'Dashboard', 'BROWSER', 'COMPLETE'),
  feature('pwa.install_prompted', 'Chose "Install app"', 'Mobile app (PWA)', 'BROWSER', 'COMPLETE'),
  feature('language.changed', 'Changed the portal language', 'Language', 'BROWSER', 'COMPLETE'),
];
const FEATURE_BY_KEY = new Map(FEATURES.map((entry) => [entry.key, entry]));
export const featureByKey = (key) => FEATURE_BY_KEY.get(key) ?? null;

/** Event names the browser may send. Sign-in, sign-out and SERVER features are written by the API only. */
export const BROWSER_EVENT_NAMES = ['page.view', 'page.ping', 'page.exit', 'nav.click', 'widget.impression', 'widget.interact', 'feature.use'];

/**
 * The role a page view is attributed to. `rolesHeld` and `activeContexts` come from the server's
 * own record of the account, never from the browser; `view` is the browser's dashboard tab and is
 * accepted only when the account really has that view. Returns null when the account cannot open
 * the page at all (the event is then dropped).
 */
export function resolveContextRole(pageKey, { rolesHeld = [], view = null } = {}) {
  const entry = PAGE_BY_KEY.get(pageKey);
  if (!entry) return null;
  if (entry.roles) return entry.roles.find((role) => rolesHeld.includes(role)) ?? null;
  if (!rolesHeld.length) return null;
  if (rolesHeld.length === 1) return rolesHeld[0];
  if (pageKey === 'dashboard' && view) {
    const role = DASHBOARD_VIEW_ROLES[view];
    if (role === 'SHARED' || rolesHeld.includes(role)) return role;
  }
  return 'SHARED';
}
