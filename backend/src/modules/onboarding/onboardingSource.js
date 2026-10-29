import { stableHash } from './baselines.js';

/**
 * Where a newly onboarded person's academic and teaching data comes from.
 *
 * A source answers two questions with plain records (no database writes):
 *   student(context) → academic profile, prior transcript, current enrolments, aid offer
 *   faculty(context) → faculty profile and the section they will teach this term
 *
 * The real flow is: Admin onboards a user → the portal matches their identity in the
 * SIS/LMS/IdP → those systems supply the records. Until those connectors exist,
 * `institutionalBaselineSource` derives a sensible, person-specific baseline from the
 * institution's own catalogue, term and degree requirements already in the portal.
 * Swapping in an SIS-backed source changes only this file's caller, not the service
 * that persists the records or the dashboards that read them.
 */

const DEFAULT_DEPARTMENT = 'Department of Computer Science & Engineering';
const DEFAULT_PROGRAM = 'M.S. in Computer Science';

const LETTERS = [
  [93, 'A', 4.0],
  [90, 'A-', 3.7],
  [87, 'B+', 3.3],
  [83, 'B', 3.0],
  [0, 'B-', 2.7],
];
const letterFor = (percentage) => LETTERS.find(([min]) => percentage >= min);

/** Degree requirements for a program, with the same level fallback as degree progress. */
function requirementsFor(rows, degree) {
  const exact = rows.filter((row) => row.program === degree);
  if (exact.length) return exact;
  const level = /ph\.?d/i.test(degree ?? '') ? 'DEFAULT_DOCTORAL' : /^b\.?s|bachelor/i.test(degree ?? '') ? 'DEFAULT_UNDERGRADUATE' : 'DEFAULT_GRADUATE';
  return rows.filter((row) => row.program === level);
}

/** "Fall Semester 2026" → "Fall 2026" (the label student profiles carry). */
const shortTerm = (name) => name.replace(/\s*Semester\s*/i, ' ').replace(/\s+/g, ' ').trim();

const PRIOR_TERMS = ['Spring 2026', 'Fall 2025'];
const WEEKDAY_SETS = [
  { days: ['Tuesday', 'Thursday'], codes: ['T', 'R'] },
  { days: ['Monday', 'Wednesday'], codes: ['M', 'W'] },
  { days: ['Wednesday', 'Friday'], codes: ['W', 'F'] },
];
const TIME_SLOTS = [
  { label: '9:00 AM - 10:30 AM', start: '09:00', end: '10:30' },
  { label: '1:00 PM - 2:30 PM', start: '13:00', end: '14:30' },
  { label: '3:30 PM - 5:00 PM', start: '15:30', end: '17:00' },
];
const ROOMS = ['Technology Hall 214', 'Science Building 118', 'Engineering 207', 'Technology Hall 402'];
const OFFICE_HOURS = ['Tue 1:00 PM - 3:00 PM', 'Mon 3:00 PM - 5:00 PM', 'Thu 10:00 AM - 12:00 PM'];
const PALETTES = [
  { color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
  { color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
  { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
];

export const institutionalBaselineSource = {
  name: 'INSTITUTIONAL_BASELINE',

  async student({ db, tenantId, user, profile, term }) {
    const h = stableHash(user.id);
    const department = profile.department ?? DEFAULT_DEPARTMENT;
    const degree = profile.degree ?? DEFAULT_PROGRAM;

    const [requirementRows, catalog, termCourses] = await Promise.all([
      db.degreeRequirement.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
      db.catalogCourse.findMany({ where: { tenantId }, orderBy: { code: 'asc' } }),
      db.course.findMany({ where: { tenantId, termId: term.id }, orderBy: { code: 'asc' } }),
    ]);
    const requirements = requirementsFor(requirementRows, degree);
    const totalCreditsRequired = requirements.reduce((sum, req) => sum + req.creditsRequired, 0) || 36;

    // Current term: three sections, rotated per person so cohorts are spread across courses.
    const count = Math.min(3, termCourses.length);
    const offset = termCourses.length ? h % termCourses.length : 0;
    const current = Array.from({ length: count }, (_, i) => termCourses[(offset + i) % termCourses.length]);
    const enrollments = current.map((course, i) => {
      const percentage = 82 + ((h >>> (i * 3)) % 16) + 0.5;
      const [, letterGrade, gradePoints] = letterFor(percentage);
      return { courseId: course.id, code: course.code, percentage, letterGrade, gradePoints };
    });

    // Prior terms: requirement courses from the catalogue not being taken now.
    const taking = new Set(current.map((course) => course.code));
    const byCode = new Map(catalog.map((course) => [course.code, course]));
    const eligible = requirements
      .flatMap((req) => req.courseCodes)
      .filter((code, index, all) => all.indexOf(code) === index && byCode.has(code) && !taking.has(code));
    const termCount = 1 + (h % 2); // one or two completed terms
    const prior = [];
    let cursor = h % Math.max(1, eligible.length);
    for (let t = 0; t < termCount && eligible.length; t += 1) {
      const courses = [];
      for (let c = 0; c < 3 && courses.length < eligible.length; c += 1) {
        const code = eligible[cursor % eligible.length];
        cursor += 1;
        if (prior.some((term) => term.courses.some((row) => row.code === code)) || courses.some((row) => row.code === code)) continue;
        const percentage = 84 + ((h >>> (t * 5 + c * 2)) % 14);
        const [, grade, points] = letterFor(percentage);
        const course = byCode.get(code);
        courses.push({ code, title: course.title, credits: course.credits, grade, points });
      }
      if (courses.length) prior.push({ termLabel: PRIOR_TERMS[t], courses });
    }

    return {
      department,
      degree,
      admitTerm: prior.length > 1 ? 'Fall 2025' : 'Spring 2026',
      currentTerm: shortTerm(term.name),
      totalCreditsRequired,
      prior,
      enrollments,
      aid: {
        awardYear: '2026-2027',
        scholarship: { name: 'Feddrick Graduate Merit Scholarship', amount: 2500 + (h % 5) * 500 },
        loan: h % 3 === 0 ? null : { name: 'Federal Direct Unsubsidized Loan', amount: 5500 },
      },
    };
  },

  async faculty({ db, tenantId, user, profile, term }) {
    const h = stableHash(user.id);
    const department = profile.department ?? DEFAULT_DEPARTMENT;
    const [catalog, offered] = await Promise.all([
      db.catalogCourse.findMany({ where: { tenantId }, orderBy: { code: 'asc' } }),
      db.course.findMany({ where: { tenantId, termId: term.id }, select: { code: true } }),
    ]);
    // A catalogue course that is not already offered this term becomes their section.
    const taken = new Set(offered.map((course) => course.code));
    const open = catalog.filter((course) => !taken.has(course.code));
    const course = open.length ? open[h % open.length] : null;
    const days = WEEKDAY_SETS[h % WEEKDAY_SETS.length];
    const time = TIME_SLOTS[(h >>> 3) % TIME_SLOTS.length];
    const room = ROOMS[(h >>> 5) % ROOMS.length];
    const officeHours = OFFICE_HOURS[(h >>> 7) % OFFICE_HOURS.length];

    return {
      department,
      title: profile.title ?? 'Assistant Professor',
      officeLocation: room,
      officeHours: `${officeHours}, ${room}`,
      section: course && {
        code: course.code,
        name: course.title,
        credits: course.credits ?? 3,
        description: course.description ?? null,
        room,
        meetingDays: days.days,
        dayCodes: days.codes,
        timeLabel: time.label,
        startTime: time.start,
        endTime: time.end,
        palette: PALETTES[h % PALETTES.length],
        rosterSize: 8 + (h % 5),
      },
    };
  },
};
