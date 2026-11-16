import { z } from 'zod';
import { notFound } from '../../../utils/errors.js';
import { defineTool } from './registry.js';
import { DAY_CODES, DAY_NAMES, addDaysIso, formatWhen, localDate, localDayCode, localHour, moodleReason, requiresStudent, sisReason, unavailable } from './helpers.js';
import * as sis from '../../sis/sisService.js';
import * as moodle from '../../lms/moodleService.js';
import { getStudentFinance } from '../../finance/financeService.js';
import { bookAppointment, listAdvisors, listMyAppointments, listOpenSlots } from '../../success/advisingService.js';

/**
 * Student tools. Academic records come from CampusCore and coursework from Moodle, read for the signed-in student
 * only: the SIS identity is resolved from the session inside sisService, so no tool takes a student id at all.
 */

const STUDENT = ['STUDENT'];

defineTool({
  name: 'get_my_academic_summary',
  label: 'Reading your academic record',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description: 'The student\'s own academic summary from CampusCore: program, cumulative GPA, credits earned and in progress, credits required, standing, class level and term GPAs.',
  input: z.object({}),
  async run({ auth }) {
    const a = await sis.academicSnapshot(auth);
    if (a.state !== 'OK') return unavailable(sisReason(a.state, 'academic record'));
    return {
      data: {
        program: a.program?.name ?? null,
        cumulativeGpa: a.cumulativeGpa != null ? Number(a.cumulativeGpa) : null,
        creditsEarned: a.creditsEarned,
        creditsInProgress: a.creditsInProgress,
        creditsRequired: a.requiredCredits,
        creditsRemaining: a.requiredCredits != null && a.creditsEarned != null ? Math.max(0, a.requiredCredits - a.creditsEarned) : null,
        standing: a.standing,
        level: a.level,
        termGpas: a.terms,
        source: 'CampusCore SIS',
      },
    };
  },
});

defineTool({
  name: 'get_my_class_schedule',
  label: 'Reading your class schedule',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description: 'The student\'s own registered classes and meeting times from CampusCore, for today, tomorrow, a weekday or the whole week. Times are institution-local.',
  input: z.object({
    when: z.enum(['today', 'tomorrow', 'week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).default('week'),
  }),
  async run({ auth, tz, now }, { when }) {
    const overview = await sis.studentOverview(auth).catch(() => ({ state: 'UNAVAILABLE' }));
    if (overview.state !== 'OK') return unavailable(sisReason(overview.state, 'class schedule'));
    if (overview.schedule?.state !== 'OK') return unavailable(sisReason('UNAVAILABLE', 'class schedule'));
    const zone = overview.timezone || tz;
    const sections = overview.schedule.data.items ?? [];
    let day = null;
    if (when === 'today') day = localDayCode(now, zone);
    else if (when === 'tomorrow') day = localDayCode(new Date(now.getTime() + 86_400_000), zone);
    else if (when !== 'week') day = when.slice(0, 3).toUpperCase();
    const meetings = sections
      .flatMap((s) => (s.meetings ?? []).map((m) => ({ day: m.day, start: m.start, end: m.end, location: m.location, course: s.courseCode, title: s.courseTitle, section: s.sectionCode, instructors: s.instructors, enrollment: s.enrollment?.status ?? null })))
      .filter((m) => !day || m.day === day)
      .sort((a, b) => DAY_CODES.indexOf(a.day) - DAY_CODES.indexOf(b.day) || String(a.start).localeCompare(String(b.start)));
    return {
      data: {
        term: overview.schedule.data.term?.name ?? null,
        scope: day ? DAY_NAMES[day] : 'Whole week',
        timezone: zone,
        meetings,
        registeredSections: sections.map((s) => ({ course: s.courseCode, title: s.courseTitle, section: s.sectionCode, credits: s.credits })),
      },
    };
  },
});

defineTool({
  name: 'get_my_grades',
  label: 'Reading your grades',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description: 'The student\'s own course grades by term from CampusCore (graded and in progress) and cumulative GPA.',
  input: z.object({}),
  async run({ auth }) {
    const [courses, snapshot] = await Promise.all([sis.studentCourses(auth).catch(() => undefined), sis.academicSnapshot(auth)]);
    if (courses === undefined) return unavailable(sisReason('UNAVAILABLE', 'grades'));
    if (courses === null) return unavailable(sisReason(snapshot.state === 'OK' ? 'UNMAPPED' : snapshot.state, 'grades'));
    return {
      data: {
        cumulativeGpa: snapshot.state === 'OK' && snapshot.cumulativeGpa != null ? Number(snapshot.cumulativeGpa) : null,
        courses: courses.map((c) => ({ term: c.term, code: c.code, title: c.title, credits: c.credits, grade: c.grade ?? null, inProgress: Boolean(c.inProgress) })),
        source: 'CampusCore SIS',
      },
    };
  },
});

defineTool({
  name: 'get_my_assignments',
  label: 'Checking Moodle assignments',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description: 'The student\'s own Moodle assignments with due dates, submission state and released grades. Filter: pending (not yet submitted, due in the future), overdue, submitted, or all.',
  input: z.object({ filter: z.enum(['pending', 'overdue', 'submitted', 'all']).default('pending') }),
  async run({ auth, tz, now }, { filter }) {
    const work = await moodle.myAssignments(auth).catch(() => ({ status: 'UNAVAILABLE' }));
    if (work.status !== 'CONNECTED') return unavailable(moodleReason(work.status));
    if (work.unavailable) return unavailable('Moodle has not enabled assignment details for this portal.');
    const open = (a) => ['NOT_SUBMITTED', 'DRAFT', 'NEW'].includes(a.state);
    const due = (a) => (a.dueDate ? new Date(a.dueDate).getTime() : null);
    const rows = work.assignments.filter((a) => {
      if (filter === 'pending') return open(a) && (due(a) === null || due(a) >= now.getTime());
      if (filter === 'overdue') return open(a) && due(a) !== null && due(a) < now.getTime();
      if (filter === 'submitted') return !open(a);
      return true;
    });
    return {
      data: {
        filter,
        assignments: rows.slice(0, 30).map((a) => ({ course: a.course?.shortName ?? a.course?.fullName ?? null, name: a.name, due: formatWhen(a.dueDate, tz), state: a.state, grade: a.grade ?? a.releasedGrade ?? null })),
        totalInMoodle: work.assignments.length,
        source: 'Moodle',
      },
    };
  },
});

defineTool({
  name: 'get_my_class_announcements',
  label: 'Reading class announcements',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description: 'Announcements posted to the student\'s registered class sections (CampusCore).',
  input: z.object({}),
  async run({ auth, tz }) {
    const result = await sis.studentAnnouncements(auth).catch(() => ({ state: 'UNAVAILABLE' }));
    if (result.state !== 'OK') return unavailable(sisReason(result.state, 'class announcements'));
    return { data: { announcements: (result.items ?? []).slice(0, 12).map((a) => ({ course: a.section?.courseCode, title: a.title, body: String(a.body ?? '').slice(0, 600), author: a.author ?? null, posted: formatWhen(a.publishedAt, tz), pinned: Boolean(a.pinned) })) } };
  },
});

defineTool({
  name: 'get_my_account_balance',
  label: 'Reading your student account',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description: 'The student\'s own Tuition & Accounts summary from CampusCore: balance, due date and status. Payments are not made through Nexora.',
  input: z.object({}),
  async run({ auth }) {
    const finance = await getStudentFinance(auth).catch(() => null);
    if (!finance) return unavailable('Your student account cannot be read right now. Please try again shortly.');
    if (finance.hasAccount === false) return unavailable(finance.message ?? 'No student account is on file.');
    return { data: { balance: finance.formattedBalance, dueDate: finance.dueDate ?? null, status: finance.status ?? null, term: finance.term ?? null, page: '/finance/tuition' } };
  },
});

/* ------------------------------------------------------------------ advising */

defineTool({
  name: 'list_advisors',
  label: 'Finding advisors',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description:
    'Advisors the student can book (faculty who publish advising availability) with their open-slot counts. The portal has no formal advisor assignment; advisors the student has met before are flagged as previousAdvisor.',
  input: z.object({}),
  async run({ auth }) {
    const [advisors, mine] = await Promise.all([listAdvisors(auth), listMyAppointments(auth)]);
    const met = new Set([...mine.upcoming, ...mine.past].map((a) => a.advisor.id));
    return {
      data: {
        advisors: advisors
          .map((a) => ({ advisorRef: a.id, name: a.name, title: a.title ?? null, department: a.department ?? null, office: a.office ?? null, openSlots: a.openSlots, previousAdvisor: met.has(a.id) }))
          .sort((x, y) => Number(y.previousAdvisor) - Number(x.previousAdvisor) || y.openSlots - x.openSlots),
        note: 'No assigned-advisor record exists in the portal or CampusCore.',
      },
    };
  },
});

const PART_OF_DAY = { morning: [0, 12], afternoon: [12, 17], evening: [17, 24] };

defineTool({
  name: 'get_advisor_availability',
  label: 'Checking advisor availability',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description:
    'Real open advising slots for one advisor (advisorRef from list_advisors), optionally on a date and part of the day. The slots are shown to the user as selectable options; booking needs book_advising_appointment with the chosen slotRef.',
  input: z.object({
    advisorRef: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Institution-local date (YYYY-MM-DD).'),
    partOfDay: z.enum(['morning', 'afternoon', 'evening']).optional(),
  }),
  async run({ auth, tz }, { advisorRef, date, partOfDay }) {
    const advisor = (await listAdvisors(auth)).find((a) => a.id === advisorRef);
    if (!advisor) throw notFound('That advisor was not found at your institution.');
    const all = await listOpenSlots(auth, { advisorId: advisorRef });
    const slots = all.filter((slot) => {
      if (date && localDate(slot.startsAt, tz) !== date) return false;
      if (partOfDay) {
        const [from, to] = PART_OF_DAY[partOfDay];
        const hour = localHour(slot.startsAt, tz);
        if (hour < from || hour >= to) return false;
      }
      return true;
    }).slice(0, 12);
    const present = (s) => ({ slotRef: s.id, when: formatWhen(s.startsAt, tz), startsAt: s.startsAt, endsAt: s.endsAt, mode: s.mode, location: s.location });
    return {
      data: {
        advisor: advisor.name,
        filter: { date: date ?? null, partOfDay: partOfDay ?? null },
        slots: slots.map(present),
        otherOpenSlots: slots.length ? undefined : all.slice(0, 6).map(present),
      },
      display: slots.length ? { type: 'slots', title: `Open times with ${advisor.name}`, advisor: advisor.name, slots: slots.map(present), persist: true } : null,
    };
  },
});

defineTool({
  name: 'book_advising_appointment',
  label: 'Preparing a booking',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'action',
  description: 'Propose booking one open advising slot (slotRef from get_advisor_availability, or the slot the user selected). The person confirms; availability is checked again when they do.',
  input: z.object({
    slotRef: z.string().uuid(),
    topic: z.string().trim().min(3).max(200).describe('Short topic, e.g. "Course planning for spring".'),
    notes: z.string().trim().max(2000).optional(),
  }),
  async prepare({ auth, tz }, { slotRef, topic, notes }) {
    const slot = (await listOpenSlots(auth, {})).find((s) => s.id === slotRef);
    if (!slot) throw notFound('That time is no longer available. Ask for the advisor\'s current availability.');
    const advisor = (await listAdvisors(auth)).find((a) => a.id === slot.advisorId);
    return {
      payload: { slotRef, topic, notes: notes ?? null },
      preview: {
        kind: 'booking',
        title: 'Book advising appointment',
        fields: [
          { label: 'Advisor', value: advisor?.name ?? 'Advisor' },
          { label: 'When', value: formatWhen(slot.startsAt, tz) },
          { label: 'Format', value: slot.mode === 'VIRTUAL' ? 'Virtual (meeting link in Advising)' : slot.location ?? 'In person' },
          { label: 'Topic', value: topic },
        ],
        body: notes ?? null,
        confirmLabel: 'Book appointment',
      },
    };
  },
  async execute({ auth, tz }, { slotRef, topic, notes }) {
    // bookAppointment re-checks the slot inside its transaction (still open, in the future, not just booked).
    const appt = await bookAppointment(auth, { slotId: slotRef, topic, notes: notes ?? undefined });
    return {
      result: { appointmentRef: appt.id, when: formatWhen(appt.startsAt, tz), advisor: appt.advisor.name, meetingUrl: appt.meetingUrl ?? null, location: appt.location ?? null },
      summary: `Booked with ${appt.advisor.name} on ${formatWhen(appt.startsAt, tz)}.`,
    };
  },
});

defineTool({
  name: 'get_upcoming_exams',
  label: 'Looking up exam dates',
  roles: STUDENT,
  requires: requiresStudent,
  kind: 'read',
  description: 'Exam periods and exam dates from the institution\'s CampusCore academic calendar for the coming weeks. CampusCore does not publish per-section exam times.',
  input: z.object({ days: z.number().int().min(7).max(180).default(90) }),
  async run({ auth, tz, now }, { days }) {
    const from = localDate(now, tz);
    try {
      const items = await sis.calendar(auth, { from, to: addDaysIso(from, days), category: 'EXAM' });
      return { data: { from, days, exams: (Array.isArray(items) ? items : []).map((e) => ({ title: e.title, startDate: e.startDate, endDate: e.endDate ?? null, description: e.description ?? null })) } };
    } catch {
      return unavailable(sisReason('UNAVAILABLE', 'exam calendar'));
    }
  },
});
