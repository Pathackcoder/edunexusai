// Shared by the API and UI: every entry corresponds to a rendered dashboard section.
export const facultyWidgets = [
  ['summary', 'Teaching overview', 'Teaching'],
  ['courses', 'My courses', 'Teaching'],
  ['roster', 'My students & groups', 'Students'],
  ['announcements', 'Recent announcements', 'Communication'],
  ['coursework', 'Upcoming coursework', 'Teaching'],
  ['schedule', 'Teaching schedule & office hours', 'Schedule'],
  ['tasks', 'Tasks & student follow-ups', 'Productivity'],
  ['resources', 'Resource sharing', 'Teaching'],
  ['advising', 'Advising appointments', 'Students'],
  ['requests', 'My requests & help desk', 'Productivity'],
].map(([key, label, category], sortOrder) => ({id: `faculty.${key}`, key: `faculty.${key}`, label, category, sortOrder}));
