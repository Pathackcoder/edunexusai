// Shared by the API and UI: widgets of the staff and alumni community contexts. They show only
// institution-wide information the person may already see (campus news for their audience, the
// academic calendar, resources addressed to them, their own requests). No academic records.
const define = (prefix, rows) => rows.map(([key, label, category], sortOrder) => ({ id: `${prefix}.${key}`, key: `${prefix}.${key}`, label, category, sortOrder }));

export const staffWidgets = define('staff', [
  ['announcements', 'Campus news for staff', 'Communication'],
  ['calendar', 'Academic calendar', 'Schedule'],
  ['resources', 'Resources for staff', 'Resources'],
  ['requests', 'My requests & help desk', 'Productivity'],
]);

export const alumniWidgets = define('alumni', [
  ['announcements', 'Alumni news', 'Communication'],
  ['community', 'Networking, mentoring & giving', 'Community'],
  ['calendar', 'Campus events & calendar', 'Events'],
  ['resources', 'Alumni resources', 'Resources'],
]);
