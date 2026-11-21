import { prisma } from '../../db/prisma.js';
import * as sis from '../sis/sisService.js';
import * as moodle from '../lms/moodleService.js';
import { AppError, forbidden, integrationNotConfigured } from '../../utils/errors.js';

/**
 * A faculty member's teaching, read from the systems that own it. EduNexusAI copies none of it.
 *
 *   CampusCore SIS              which sections they teach (instructor assignments) and who is registered
 *   sis_section_moodle_courses  whether an administrator mapped a section to the Moodle course that delivers it
 *
 * One announcement owner per section: a section mapped to a Moodle course has its announcements in that course's
 * Announcements forum; every other section has CampusCore class announcements. The mapping is used exactly as an
 * administrator recorded it, never guessed or corrected here.
 *
 * Publishing goes to the owner only: CampusCore-owned sections through CampusCore's integration API, as the faculty
 * member (announcements:write); Moodle-owned sections to the mapped Moodle course's Announcements forum, when Moodle
 * also lists the faculty member as a teacher there. A section is never published to the other system instead.
 */

export const OWNER = Object.freeze({ MOODLE: 'MOODLE', CAMPUSCORE: 'CAMPUSCORE' });
export const announcementOwner = (mapping) => (mapping?.moodleCourseId ? OWNER.MOODLE : OWNER.CAMPUSCORE);

/** Moodle announcements that cannot be read through this connection are said plainly, not shown as an empty list. */
export const MOODLE_ANNOUNCEMENTS = Object.freeze({
  state: 'NOT_CONNECTED',
  message: 'Announcements for sections delivered in Moodle live in each Moodle course’s Announcements forum, which EduNexusAI cannot read yet. Open the course in Moodle to see or post them.',
});

const today = () => new Date().toISOString().slice(0, 10);

/** Moodle course names for mapped sections; a Moodle outage only loses the names, never the SIS view. */
async function moodleCourseNames(tenantId, ids) {
  if (!ids.length) return new Map();
  try {
    return new Map((await moodle.remoteCourses(tenantId)).map((c) => [c.moodleCourseId, c]));
  } catch {
    return new Map();
  }
}

/**
 * The sections CampusCore says the signed-in faculty member teaches in terms that have not ended, each with its
 * announcement owner. state: OK | SIS_NOT_CONFIGURED | UNMAPPED | NOT_FACULTY | UNAVAILABLE (with a message).
 * With `withPublishing`, also whether each section can take a new announcement from EduNexusAI (`publish`).
 */
export async function teachingSections(auth, { withPublishing = false } = {}) {
  if (!sis.sisConfigured()) return { state: 'SIS_NOT_CONFIGURED', sections: [] };
  const teaching = await sis.facultyTeaching(auth);
  if (teaching.state !== 'OK') return { state: teaching.state, message: teaching.message ?? null, sections: [] };
  if (teaching.sections.state !== 'OK') return { state: 'UNAVAILABLE', message: teaching.sections.error?.message ?? null, sections: [] };

  let live;
  try {
    const terms = await sis.withCampusCore((adapter) => adapter.listTerms());
    live = new Set(terms.filter((t) => !t.endDate || String(t.endDate).slice(0, 10) >= today()).map((t) => t.code));
  } catch (error) {
    return { state: 'UNAVAILABLE', message: error.message, sections: [] };
  }
  const sections = teaching.sections.data.filter((s) => !s.termCode || live.has(s.termCode));

  const ids = sections.map((s) => s.source.id);
  const rows = ids.length ? await prisma.sisSectionMoodleCourse.findMany({ where: { tenantId: auth.tenantId, sisSectionId: { in: ids } } }) : [];
  const mapping = new Map(rows.map((r) => [r.sisSectionId, r]));
  const names = await moodleCourseNames(auth.tenantId, rows.map((r) => r.moodleCourseId));
  let publishing = null;
  let moodleCourses = new Map();
  if (withPublishing) {
    const moodlePublishing = await moodle.announcementPublishingFor(auth, [...new Set(rows.map((r) => r.moodleCourseId))]);
    moodleCourses = moodlePublishing.courses;
    const { support } = moodlePublishing;
    publishing = { campuscore: await sis.announcementPublishing(auth), moodle: { enabled: support.publish.available, reason: support.publish.reason, postsAs: support.postsAs } };
  }

  return {
    state: 'OK',
    identity: teaching.identity,
    ...(publishing ? { publishing } : {}),
    sections: sections.map((s) => {
      const row = mapping.get(s.source.id);
      const course = row ? names.get(row.moodleCourseId) : null;
      const owner = announcementOwner(row);
      const publish = !publishing ? null : owner === OWNER.MOODLE ? moodleCourses.get(row.moodleCourseId) ?? { allowed: false, reason: 'Moodle publishing could not be checked for this course.' } : { allowed: publishing.campuscore.enabled, reason: publishing.campuscore.reason };
      return {
        ...s,
        announcementOwner: owner,
        moodleCourse: row ? { moodleCourseId: row.moodleCourseId, shortName: course?.shortName ?? null, fullName: course?.fullName ?? null, url: course?.url ?? null } : null,
        ...(publish ? { publish } : {}),
      };
    }),
  };
}

const status = (a, now) => (new Date(a.publishedAt) > now ? 'SCHEDULED' : a.expiresAt && new Date(a.expiresAt) <= now ? 'EXPIRED' : 'PUBLISHED');

/** A CampusCore class announcement as the faculty views show it. */
function presentAnnouncement(a, owners, now = new Date()) {
  return {
    id: a.source.id,
    source: 'campuscore',
    title: a.title,
    content: a.body,
    author: a.author,
    pinned: a.pinned,
    publishedAt: a.publishedAt,
    expiresAt: a.expiresAt,
    status: status(a, now),
    section: { sisSectionId: a.section.source.id, label: a.section.label, courseCode: a.section.courseCode, courseTitle: a.section.courseTitle, termCode: a.section.termCode },
    // A section that is now delivered in Moodle can still have older CampusCore announcements; they stay visible.
    sectionOwner: owners.get(a.section.source.id) ?? null,
  };
}

/**
 * Class announcements on the signed-in faculty member's sections, from CampusCore, plus which of their sections have
 * their announcements in Moodle (not readable yet). Each source reports its own state, so an outage is never shown
 * as "no announcements".
 */
export async function myAnnouncements(auth, { teaching: known } = {}) {
  const teaching = known ?? (await teachingSections(auth));
  if (teaching.state !== 'OK') return { state: teaching.state, message: teaching.message ?? null, sections: [], items: [], sources: {} };

  const moodleSections = teaching.sections.filter((s) => s.announcementOwner === OWNER.MOODLE);
  const moodleSectionList = moodleSections.map((s) => ({ sisSectionId: s.source.id, label: `${s.courseCode}-${s.sectionCode}`, termCode: s.termCode, moodleCourse: s.moodleCourse }));
  const sources = { campuscore: { state: 'OK' }, moodle: { state: 'NO_SECTIONS' } };

  // Moodle-owned sections: their course's Announcements forum, when this connection can read it.
  let moodleItems = [];
  if (moodleSections.length) {
    try {
      const byCourse = new Map(moodleSections.map((s) => [s.moodleCourse.moodleCourseId, s]));
      const read = await moodle.courseAnnouncements(auth.tenantId, [...byCourse.values()].map((s) => ({ moodleCourseId: s.moodleCourse.moodleCourseId, shortName: s.moodleCourse.shortName, fullName: s.moodleCourse.fullName })));
      if (read.state === 'OK') {
        sources.moodle = { state: 'OK', sections: moodleSectionList, ...(read.warnings ? { warnings: read.warnings } : {}) };
        moodleItems = read.items.map((a) => {
          const s = byCourse.get(a.moodleCourse.moodleCourseId);
          return { ...a, status: status(a, new Date()), section: { sisSectionId: s.source.id, label: `${s.courseCode}-${s.sectionCode}`, courseCode: s.courseCode, courseTitle: s.courseTitle, termCode: s.termCode }, sectionOwner: OWNER.MOODLE };
        });
      } else {
        sources.moodle = { ...MOODLE_ANNOUNCEMENTS, reason: read.reason, sections: moodleSectionList };
      }
    } catch (error) {
      sources.moodle = { state: 'UNAVAILABLE', message: `Moodle announcements could not be loaded (${error.message}).`, sections: moodleSectionList };
    }
  }

  let items = [];
  try {
    const result = await sis.facultyAnnouncements(auth);
    if (result.state !== 'OK') sources.campuscore = { state: result.state };
    const owners = new Map(teaching.sections.map((s) => [s.source.id, s.announcementOwner]));
    const now = new Date();
    items = result.items.map((a) => presentAnnouncement(a, owners, now));
  } catch (error) {
    sources.campuscore = { state: 'UNAVAILABLE', message: error.message };
  }

  items = [...items, ...moodleItems].sort((a, b) => (b.pinned - a.pinned) || new Date(b.publishedAt) - new Date(a.publishedAt));
  return { state: 'OK', sections: teaching.sections, ...(teaching.publishing ? { publishing: teaching.publishing } : {}), items, sources };
}

/**
 * Publish a class announcement to one of the signed-in faculty member's sections, in the system that owns it.
 * Only a CampusCore-owned section in a current or upcoming term is accepted; the faculty member's CampusCore identity
 * comes from the verified link, and CampusCore re-checks the assignment and its own policy. Nothing is stored here.
 */
export async function publishAnnouncement(auth, sisSectionId, { title, body, pinned = false }, { idempotencyKey }) {
  const teaching = await teachingSections(auth);
  if (teaching.state === 'SIS_NOT_CONFIGURED') throw integrationNotConfigured('CampusCore SIS is not connected, so class announcements cannot be published from EduNexusAI.');
  if (teaching.state === 'UNAVAILABLE') throw new AppError(503, 'SIS_UNAVAILABLE', teaching.message ?? 'CampusCore SIS is unavailable right now. Please try again shortly.');
  if (teaching.state !== 'OK') throw forbidden('Your account is not linked to a CampusCore faculty record, so you cannot publish class announcements.');
  const section = teaching.sections.find((s) => s.source.id === sisSectionId);
  if (!section) throw forbidden('You can only post to sections CampusCore lists you as teaching in the current or upcoming terms.');
  const label = `${section.courseCode}-${section.sectionCode}`;
  if (section.announcementOwner === OWNER.MOODLE) {
    // The Moodle course is the one an administrator mapped, never inferred; failure here is never retried elsewhere.
    const author = await prisma.user.findUnique({ where: { id: auth.userId }, select: { firstName: true, lastName: true } });
    const published = await moodle.publishCourseAnnouncement(
      auth,
      section.moodleCourse.moodleCourseId,
      { title, body, pinned, authorName: `${author.firstName} ${author.lastName}`, sectionLabel: label },
      { idempotencyKey },
    );
    return { ...published, status: 'PUBLISHED', section: { sisSectionId: section.source.id, label, courseCode: section.courseCode, courseTitle: section.courseTitle, termCode: section.termCode }, sectionOwner: OWNER.MOODLE };
  }
  // Scoped to this user, so one person's key can never replay another person's post.
  const a = await sis.facultyPublishAnnouncement(auth, sisSectionId, { title, body, pinned }, { idempotencyKey: `ann:${auth.userId}:${idempotencyKey}` });
  return presentAnnouncement(a, new Map([[sisSectionId, section.announcementOwner]]));
}

/* ------------------------------------------------------------- dashboard shapes */

const dayOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** A CampusCore section in the shape the faculty dashboard widgets render. */
export function dashboardCourse(section) {
  const days = [...new Set(section.meetings.map((m) => m.day))].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  const times = [...new Set(section.meetings.map((m) => `${m.start}–${m.end}`))];
  const rooms = [...new Set(section.meetings.map((m) => m.location).filter(Boolean))];
  return {
    id: section.source.id,
    code: `${section.courseCode}-${section.sectionCode}`,
    name: section.courseTitle,
    term: section.termCode,
    credits: section.credits,
    enrolledCount: section.seats.enrolled ?? 0,
    days,
    time: times.join(', ') || null,
    room: rooms.join(', ') || null,
    officeHours: null,
    source: 'CAMPUSCORE',
    announcementOwner: section.announcementOwner,
    moodleCourse: section.moodleCourse,
    // The roster opens from My Courses (CampusCore checks the assignment); there is no local course page for it.
    href: '/faculty/courses',
  };
}
