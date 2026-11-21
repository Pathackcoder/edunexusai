/**
 * Shared wording for the faculty teaching views (My Courses, My Announcements, the dashboard). Plain JavaScript so
 * the rules can be tested on their own.
 *
 * Teaching assignments come from CampusCore. Each section has one announcement owner: Moodle when an administrator
 * mapped the section to a Moodle course, CampusCore otherwise (GET /faculty/sections).
 */

/** Why there are no sections to show, or null when the list is real. Never "you teach nothing" for an outage. */
export function teachingNotice(state, message) {
  switch (state) {
    case 'OK':
      return null;
    case 'SIS_NOT_CONFIGURED':
      return { severity: 'info', text: 'CampusCore SIS is not connected, so official teaching assignments are not available here.' };
    case 'UNMAPPED':
      return { severity: 'info', text: message ?? 'Your portal account is not linked to a CampusCore faculty record yet. Contact the registrar.' };
    case 'NOT_FACULTY':
      return { severity: 'info', text: 'Your CampusCore record is not a faculty record, so there are no teaching assignments to show.' };
    default:
      return { severity: 'warning', text: message ?? 'CampusCore SIS is unavailable right now, so your teaching assignments could not be loaded.' };
  }
}

export const OWNER_LABEL = { MOODLE: 'Moodle', CAMPUSCORE: 'CampusCore' };

/** Where a section's announcements are published, in words. */
export function ownerText(section) {
  if (section.announcementOwner !== 'MOODLE') return 'Announcements: CampusCore';
  const name = section.moodleCourse?.shortName ?? (section.moodleCourse ? `course ${section.moodleCourse.moodleCourseId}` : null);
  return `Announcements: Moodle${name ? ` (${name})` : ''}`;
}

/** "CS 101-01" */
export const sectionLabel = (section) => `${section.courseCode}-${section.sectionCode}`;

const STATUS_BADGE = { SCHEDULED: 'Scheduled', EXPIRED: 'Expired' };

/** One row of My Announcements, from a CampusCore or Moodle item or (without CampusCore) a local one. */
export function announcementView(item) {
  if (item.source === 'moodle') {
    return {
      id: item.id,
      label: item.section.label,
      term: item.section.termCode,
      date: item.publishedAt,
      title: item.title,
      content: item.content,
      // Moodle's author field: the integration account for posts made from EduNexusAI (the text names the faculty member).
      author: item.author,
      badges: [item.pinned && 'Pinned', STATUS_BADGE[item.status]].filter(Boolean),
      sourceLabel: 'Moodle',
      url: item.url ?? null,
      movedToMoodle: false,
    };
  }
  if (item.source === 'campuscore') {
    return {
      id: item.id,
      label: item.section.label,
      term: item.section.termCode,
      date: item.publishedAt,
      title: item.title,
      content: item.content,
      author: item.author,
      badges: [item.pinned && 'Pinned', STATUS_BADGE[item.status]].filter(Boolean),
      sourceLabel: 'CampusCore',
      movedToMoodle: item.sectionOwner === 'MOODLE',
    };
  }
  return {
    id: item.id,
    label: item.courseCode ?? 'Institution',
    term: null,
    date: item.postedAt,
    title: item.title,
    content: item.content,
    author: null,
    badges: item.tags ?? [],
    sourceLabel: 'Local demo course',
    movedToMoodle: false,
  };
}

/**
 * Sections a new announcement can go to (CampusCore-owned, publishing enabled) and the others with the reason, from
 * GET /faculty/sections or /faculty/announcements. The server decides `publish`; this only presents it.
 */
export function composerSections(data) {
  const sections = data?.state === 'OK' ? data.sections ?? [] : [];
  return {
    postable: sections.filter((s) => s.publish?.allowed),
    blocked: sections.filter((s) => !s.publish?.allowed).map((s) => ({ section: s, reason: s.publish?.reason ?? 'Publishing is not available for this section.' })),
  };
}

export const ANNOUNCEMENT_LIMITS = { title: 150, body: 5000 };
