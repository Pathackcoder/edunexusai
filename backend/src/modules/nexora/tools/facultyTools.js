import { z } from 'zod';
import { prisma } from '../../../db/prisma.js';
import { badRequest } from '../../../utils/errors.js';
import { defineTool } from './registry.js';
import { DAY_CODES, formatWhen, moodleReason, requiresFaculty, sisReason, unavailable } from './helpers.js';
import * as sis from '../../sis/sisService.js';
import * as moodle from '../../lms/moodleService.js';
import { notifyUsers } from '../../notifications/notificationService.js';
import { listMySlots } from '../../success/advisingService.js';
import { recordAudit } from '../../audit/auditService.js';

/**
 * Faculty tools. Teaching assignments are CampusCore's (a roster is returned only for a section CampusCore says this
 * person teaches) and Moodle courses are authorised live by the person's Moodle teaching role (moodleService).
 */

const FACULTY = ['FACULTY'];

const sectionLabel = (s) => `${s.courseCode}-${s.sectionCode} ${s.courseTitle}`;

defineTool({
  name: 'get_my_teaching_schedule',
  label: 'Reading your teaching schedule',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'read',
  description: 'The faculty member\'s own sections and weekly meeting times from CampusCore, with sectionRef values for rosters and class messages.',
  input: z.object({}),
  async run({ auth }) {
    const teaching = await sis.facultyTeaching(auth);
    if (teaching.state !== 'OK') return unavailable(sisReason(teaching.state, 'schedule'));
    const sections = teaching.sections?.state === 'OK' ? teaching.sections.data : teaching.schedule?.state === 'OK' ? teaching.schedule.data.items : null;
    if (!sections) return unavailable(sisReason('UNAVAILABLE', 'schedule'));
    const meetings = sections
      .flatMap((s) => (s.meetings ?? []).map((m) => ({ day: m.day, start: m.start, end: m.end, location: m.location, section: sectionLabel(s) })))
      .sort((a, b) => DAY_CODES.indexOf(a.day) - DAY_CODES.indexOf(b.day) || String(a.start).localeCompare(String(b.start)));
    return {
      data: {
        term: teaching.schedule?.state === 'OK' ? teaching.schedule.data.term?.name ?? null : null,
        sections: sections.map((s) => ({ sectionRef: s.source.id, course: s.courseCode, section: s.sectionCode, title: s.courseTitle, credits: s.credits, enrolled: s.seats?.enrolled ?? null, capacity: s.seats?.capacity ?? null, term: s.termCode })),
        meetings,
        source: 'CampusCore SIS',
      },
    };
  },
});

defineTool({
  name: 'get_section_roster',
  label: 'Reading a class roster',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'read',
  description: 'Students registered in one of the faculty member\'s own sections (sectionRef from get_my_teaching_schedule). CampusCore refuses sections the person does not teach.',
  input: z.object({ sectionRef: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/) }),
  async run({ auth }, { sectionRef }) {
    const roster = await sis.facultyRoster(auth, sectionRef);
    return {
      data: {
        students: roster.map((r) => ({ name: r.student.displayName, studentId: r.student.institutionalId, email: r.student.email, status: r.status })),
        count: roster.length,
      },
    };
  },
});

defineTool({
  name: 'list_my_moodle_courses',
  label: 'Reading your Moodle courses',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'read',
  description: 'Moodle courses where the faculty member holds a teaching role (live from Moodle), with moodleCourseRef values.',
  input: z.object({}),
  async run({ auth }) {
    const result = await moodle.myTeaching(auth);
    if (result.status !== 'CONNECTED') return unavailable(moodleReason(result.status));
    return { data: { courses: result.courses.map((c) => ({ moodleCourseRef: c.moodleCourseId, shortName: c.shortName, fullName: c.fullName, roles: c.roles })) } };
  },
});

defineTool({
  name: 'get_moodle_course_overview',
  label: 'Reading a Moodle course',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'read',
  description: 'One taught Moodle course: student count and every assignment (assignmentRef, due date, visibility).',
  input: z.object({ moodleCourseRef: z.number().int().min(1) }),
  async run({ auth, tz }, { moodleCourseRef }) {
    const course = await moodle.teachingCourse(auth, moodleCourseRef);
    return {
      data: {
        course: course.course.fullName ?? course.course.shortName,
        students: course.students.length,
        assignments: course.assignments.map((a) => ({ assignmentRef: a.assignmentId, name: a.name, due: formatWhen(a.dueDate, tz), visibleToStudents: a.visibleToStudents })),
      },
    };
  },
});

defineTool({
  name: 'get_assignment_submissions',
  label: 'Checking submissions',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'read',
  description: 'Submission status of every student for one assignment in a taught Moodle course. show=missing lists only students who have not submitted.',
  input: z.object({
    moodleCourseRef: z.number().int().min(1),
    assignmentRef: z.number().int().min(1),
    show: z.enum(['missing', 'all']).default('all'),
  }),
  async run({ auth, tz }, { moodleCourseRef, assignmentRef, show }) {
    const result = await moodle.assignmentSubmissions(auth, moodleCourseRef, assignmentRef);
    const submitted = (row) => row.submission?.status === 'submitted';
    const rows = result.students.filter((row) => show === 'all' || !submitted(row));
    return {
      data: {
        assignment: result.assignment.name,
        due: formatWhen(result.assignment.dueDate, tz),
        totals: { students: result.students.length, submitted: result.students.filter(submitted).length, missing: result.students.filter((r) => !submitted(r)).length },
        students: rows.map((row) => ({ name: row.fullName, submitted: submitted(row), submittedAt: formatWhen(row.submission?.submittedAt, tz), grade: row.grade ?? null })),
        submissionsReadable: result.capabilities?.submissions?.available !== false,
      },
    };
  },
});

defineTool({
  name: 'get_course_performance_report',
  label: 'Preparing a performance report',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'read',
  description: 'Performance report for one taught Moodle course: per assignment, submission rate, graded count and average grade, plus students with the most missing work. Based on Moodle data only.',
  input: z.object({ moodleCourseRef: z.number().int().min(1) }),
  async run({ auth, tz }, { moodleCourseRef }) {
    const course = await moodle.teachingCourse(auth, moodleCourseRef);
    const assignments = course.assignments.filter((a) => a.visibleToStudents).slice(0, 10);
    const missingByStudent = new Map();
    const rows = [];
    for (const a of assignments) {
      const sub = await moodle.assignmentSubmissions(auth, moodleCourseRef, a.assignmentId);
      const grades = sub.students.map((s) => (typeof s.grade === 'number' ? s.grade : Number.parseFloat(s.grade))).filter((g) => Number.isFinite(g));
      const submitted = sub.students.filter((s) => s.submission?.status === 'submitted').length;
      for (const s of sub.students) if (s.submission?.status !== 'submitted') missingByStudent.set(s.fullName, (missingByStudent.get(s.fullName) ?? 0) + 1);
      rows.push({
        assignment: a.name,
        due: formatWhen(a.dueDate, tz),
        submitted: `${submitted}/${sub.students.length}`,
        submissionRate: sub.students.length ? Math.round((submitted / sub.students.length) * 100) : null,
        graded: grades.length,
        averageGrade: grades.length ? Math.round((grades.reduce((x, y) => x + y, 0) / grades.length) * 10) / 10 : null,
      });
    }
    return {
      data: {
        course: course.course.fullName ?? course.course.shortName,
        students: course.students.length,
        assignments: rows,
        mostMissingWork: [...missingByStudent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, missing]) => ({ name, missing })),
        source: 'Moodle',
      },
    };
  },
});

/** The portal accounts of a section's registered students (by CampusCore student number), for this faculty member. */
async function sectionAudience(auth, sectionRef) {
  const [roster, teaching] = await Promise.all([sis.facultyRoster(auth, sectionRef), sis.facultyTeaching(auth)]);
  const sections = teaching.sections?.state === 'OK' ? teaching.sections.data : [];
  const section = sections.find((s) => s.source.id === sectionRef);
  // Registered students only: waitlisted, dropped and withdrawn registrations are not part of the class.
  const numbers = roster.filter((r) => r.status === 'enrolled').map((r) => r.student.institutionalId).filter(Boolean);
  const profiles = numbers.length
    ? await prisma.studentProfile.findMany({ where: { tenantId: auth.tenantId, studentNumber: { in: numbers }, user: { status: 'ACTIVE' } }, select: { userId: true } })
    : [];
  return { label: section ? sectionLabel(section) : sectionRef, rosterCount: numbers.length, userIds: profiles.map((p) => p.userId) };
}

defineTool({
  name: 'notify_section_students',
  label: 'Preparing a class message',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'action',
  description:
    'Propose a class message or announcement to the students registered in one of the faculty member\'s sections (sectionRef). Delivered as a portal notification, like "Send notification to class". The person confirms first.',
  input: z.object({
    sectionRef: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/),
    kind: z.enum(['message', 'announcement']).default('message'),
    title: z.string().trim().min(3).max(160),
    message: z.string().trim().min(3).max(2000),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  }),
  async prepare({ auth }, input) {
    const audience = await sectionAudience(auth, input.sectionRef);
    if (!audience.userIds.length) throw badRequest(`None of the ${audience.rosterCount} students registered in ${audience.label} has an active portal account to receive it.`);
    return {
      payload: input,
      preview: {
        kind: 'class_message',
        title: input.kind === 'announcement' ? 'Class announcement' : 'Message to your class',
        fields: [
          { label: 'Class', value: audience.label },
          { label: 'Recipients', value: `${audience.userIds.length} student${audience.userIds.length === 1 ? '' : 's'}${audience.rosterCount > audience.userIds.length ? ` (${audience.rosterCount - audience.userIds.length} without a portal account will not receive it)` : ''}` },
          { label: 'Priority', value: input.priority },
          { label: 'Subject', value: input.title },
        ],
        body: input.message,
        confirmLabel: input.kind === 'announcement' ? 'Post announcement' : 'Send to class',
      },
    };
  },
  async execute({ auth, actionId }, input) {
    // Resolved again at confirm time: the roster or the teaching assignment may have changed since the preview.
    const audience = await sectionAudience(auth, input.sectionRef);
    if (!audience.userIds.length) throw badRequest('No registered student with a portal account remains in this class.');
    const title = input.kind === 'announcement' ? `${audience.label.split(' ')[0]} announcement: ${input.title}` : input.title;
    const { created } = await notifyUsers({ tenantId: auth.tenantId, userIds: audience.userIds, title, message: input.message, category: 'academic', priority: input.priority, link: '/notifications', sourceType: 'FACULTY_MESSAGE', sourceRefId: actionId, createdByUserId: auth.userId });
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'CLASS_NOTIFICATION_SENT', entityType: 'SisSection', entityId: input.sectionRef, summary: `Class ${input.kind} sent to ${created} student(s) of ${audience.label} via Nexora`, metadata: { via: 'nexora' } });
    return { result: { delivered: created, section: audience.label }, summary: `Delivered to ${created} student${created === 1 ? '' : 's'} in ${audience.label}.` };
  },
});

defineTool({
  name: 'get_my_office_hours',
  label: 'Reading your office hours',
  roles: FACULTY,
  requires: requiresFaculty,
  kind: 'read',
  description: 'The faculty member\'s published advising/office-hour slots (upcoming), showing which are booked, plus the office hours on their People Search entry.',
  input: z.object({}),
  async run({ auth, tz }) {
    const [slots, entry] = await Promise.all([listMySlots(auth), prisma.directoryProfile.findFirst({ where: { tenantId: auth.tenantId, userId: auth.userId }, select: { officeHours: true, location: true } })]);
    return {
      data: {
        directoryOfficeHours: entry?.officeHours ?? null,
        office: entry?.location ?? null,
        slots: slots.slice(0, 20).map((s) => ({ when: formatWhen(s.startsAt, tz), mode: s.mode, location: s.location, bookedBy: s.bookedBy })),
      },
    };
  },
});
