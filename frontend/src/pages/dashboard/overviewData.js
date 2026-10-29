/**
 * Pure helpers for the multi-role Overview. Every value comes from a response of the person's own
 * context (the student record's /sis/me/overview, the faculty record's /sis/faculty/teaching, the
 * Moodle views of each role); every item keeps the context it came from, so the Overview can show
 * commitments side by side without mixing them. Nothing here invents a number: a value the source
 * does not provide stays null and the UI says so.
 */

export const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_NAMES = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

export const CONTEXT_TAG = {
  student: 'Studying',
  faculty: 'Teaching',
};

/** Local calendar date as YYYY-MM-DD (not UTC: "today" is the person's today). */
export function isoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const okData = (section) => (section?.state === 'OK' ? section.data : null);

/** Weekly meetings of one context: [{ context, day, start, end, location, title, code }]. */
export function meetingsOf(context, items = []) {
  return (items ?? []).flatMap((item) =>
    (item.meetings ?? [])
      .filter((m) => DAY_CODES.includes(m.day) && m.start)
      .map((m) => ({
        context,
        day: m.day,
        start: m.start,
        end: m.end ?? null,
        location: m.location ?? null,
        code: [item.courseCode, item.sectionCode].filter(Boolean).join('-'),
        title: item.courseTitle ?? null,
      })),
  );
}

/** Meetings from the student record's schedule and the faculty record's sections, each tagged. */
export function weeklyMeetings({ studentOverview = null, teaching = null } = {}) {
  return [
    ...meetingsOf('student', okData(studentOverview?.schedule)?.items),
    ...meetingsOf('faculty', okData(teaching?.schedule)?.items ?? okData(teaching?.sections)),
  ];
}

/** Today's meetings, in time order. */
export function todayCommitments(meetings, now = new Date()) {
  const today = DAY_CODES[now.getDay()];
  return meetings.filter((m) => m.day === today).sort((a, b) => a.start.localeCompare(b.start));
}

/** The weekly timetable, Monday first, each meeting still labelled with its context. */
export function weekTimetable(meetings) {
  const order = (day) => (DAY_CODES.indexOf(day) + 6) % 7;
  return [...meetings].sort((a, b) => order(a.day) - order(b.day) || a.start.localeCompare(b.start)).map((m) => ({ ...m, dayName: DAY_NAMES[m.day] }));
}

/** The next meeting after now within the coming week (for "nothing today"), or null. */
export function nextCommitment(meetings, now = new Date()) {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
  let best = null;
  for (const m of meetings) {
    let offset = (DAY_CODES.indexOf(m.day) - now.getDay() + 7) % 7;
    if (offset === 0 && toMinutes(m.start) <= minutesNow) offset = 7;
    const key = offset * 1440 + toMinutes(m.start);
    if (!best || key < best.key) best = { key, offset, meeting: m };
  }
  return best ? { ...best.meeting, dayName: best.offset === 1 ? 'Tomorrow' : DAY_NAMES[best.meeting.day], inDays: best.offset } : null;
}

/**
 * Dated items for "Coming up": the institution's academic calendar plus each context's own due
 * dates (Moodle assignments of the courses studied). Sorted by date; past items dropped.
 */
export function upcomingItems({ calendar = [], studentAssignments = [], today = isoDate(), limit = 8 } = {}) {
  const items = [
    ...(Array.isArray(calendar) ? calendar : []).map((e) => ({
      id: `cal-${e.id}`, date: e.startDate ?? e.date, endDate: e.endDate ?? null, title: e.title, kind: e.category ?? 'EVENT', source: 'Academic calendar', context: null, important: e.category === 'DEADLINE' || e.isImportant === true,
    })),
    ...(Array.isArray(studentAssignments) ? studentAssignments : []).filter((a) => a.dueDate || a.dueAt).map((a) => ({
      id: `moodle-${a.assignmentId ?? a.id}`, date: isoDate(new Date(a.dueDate ?? a.dueAt)), endDate: null, title: a.name ?? a.title, kind: 'ASSIGNMENT', source: a.course?.shortName ? `Moodle · ${a.course.shortName}` : 'Moodle', context: 'student', important: true, url: a.url ?? null,
    })),
  ];
  return items.filter((i) => i.date && i.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

/** The Studying snapshot from the student record (null values stay null). */
export function studyingSnapshot(studentOverview, moodle) {
  if (!studentOverview) return null;
  if (studentOverview.state && studentOverview.state !== 'OK') return { state: studentOverview.state, message: studentOverview.message ?? null };
  const profile = okData(studentOverview.profile);
  const academic = okData(studentOverview.academic);
  const schedule = okData(studentOverview.schedule);
  const registrations = okData(studentOverview.registrations) ?? [];
  return {
    state: 'OK',
    studentNumber: studentOverview.identity?.institutionalId ?? profile?.institutionalId ?? null,
    program: profile?.program ? [profile.program.credential, profile.program.name].filter(Boolean).join(' ') : null,
    standing: academic?.standing ?? profile?.standing ?? null,
    gpa: academic?.gpa ?? null,
    creditsEarned: academic?.creditsEarned ?? null,
    creditsInProgress: academic?.creditsInProgress ?? null,
    termName: schedule?.term?.name ?? null,
    classesThisTerm: schedule?.items?.length ?? null,
    registrations: registrations.filter((r) => r.status === 'enrolled').map((r) => ({ code: [r.section?.courseCode, r.section?.sectionNumber].filter(Boolean).join('-'), term: r.section?.termCode ?? null, title: r.section?.courseTitle ?? null })),
    moodleCourses: moodle?.status === 'CONNECTED' ? (moodle.courses ?? []).length : null,
  };
}

/** The Teaching snapshot from the faculty record and the Moodle courses taught. */
export function teachingSnapshot(teaching, moodle) {
  if (!teaching) return null;
  if (teaching.state && teaching.state !== 'OK') return { state: teaching.state, message: teaching.message ?? null };
  const sections = okData(teaching.sections) ?? [];
  const enrolled = sections.reduce((sum, s) => sum + (Number.isFinite(s.seats?.enrolled) ? s.seats.enrolled : 0), 0);
  const capacity = sections.reduce((sum, s) => sum + (Number.isFinite(s.seats?.capacity) ? s.seats.capacity : 0), 0);
  return {
    state: 'OK',
    employeeNumber: teaching.identity?.institutionalId ?? null,
    termName: okData(teaching.schedule)?.term?.name ?? null,
    sections: sections.map((s) => ({ code: [s.courseCode, s.sectionCode].filter(Boolean).join('-'), title: s.courseTitle ?? null, enrolled: s.seats?.enrolled ?? null, capacity: s.seats?.capacity ?? null })),
    enrolled: sections.length ? enrolled : null,
    capacity: sections.length && capacity ? capacity : null,
    moodleCourses: moodle?.status === 'CONNECTED' ? (moodle.courses ?? []).map((c) => ({ name: c.fullName, students: c.enrolledUserCount ?? null, url: c.courseUrl ?? null })) : null,
  };
}
