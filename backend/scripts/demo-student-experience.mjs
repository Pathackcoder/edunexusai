/**
 * Illustrative portal experience for ONE existing student and ONE existing faculty member, through the normal
 * services (advising, learning paths). No account, person or SIS record is created; CampusCore data (timetable,
 * account, class announcements) comes from CampusCore's own demo seed.
 *
 *   node scripts/demo-student-experience.mjs                (dry run)
 *   node scripts/demo-student-experience.mjs --apply        (writes; safe to re-run)
 *   node scripts/demo-student-experience.mjs --cleanup      (removes only what this seed created)
 *   --student S2400017 --advisor F01002 (defaults)
 *
 *   1. Advising: the advisor publishes three virtual slots (Thu 19 Nov 2026, 10:00 New York time) and the student
 *      books the first one: an upcoming appointment, with both notified as the service always does.
 *   2. Learning path: a "Programming Foundations" path whose course steps are CampusCore catalogue courses; it is
 *      activated for the student. Progress is never set here: course steps track the student's CampusCore record.
 * Everything created is recorded as an audit-log row "DEMO_SEED_*", which is how --cleanup finds it.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { student: { type: 'string', default: 'S2400017' }, advisor: { type: 'string', default: 'F01002' }, apply: { type: 'boolean', default: false }, cleanup: { type: 'boolean', default: false } } });
const { prisma } = await import('../src/db/prisma.js');
const advising = await import('../src/modules/success/advisingService.js');
const planning = await import('../src/modules/planning/planningService.js');
const { recordAudit } = await import('../src/modules/audit/auditService.js');

const SLOT_START = '2026-11-19T15:00:00Z'; // Thursday 19 November 2026, 10:00 America/New_York
const PATH = {
  key: 'programming-foundations',
  title: 'Programming Foundations',
  careerGoal: 'Health Informatics',
  description: 'From first program to a working application: programming, data structures and algorithms, databases and software engineering, ending in a project. Course steps follow your CampusCore record.',
  steps: [
    { stage: 'Foundations', kind: 'COURSE', courseCode: 'CS 101', title: 'Introduction to Programming', estimatedHours: 120 },
    { stage: 'Foundations', kind: 'COURSE', courseCode: 'CS 120', title: 'Discrete Structures', estimatedHours: 110 },
    { stage: 'Core', kind: 'COURSE', courseCode: 'CS 201', title: 'Data Structures', estimatedHours: 120 },
    { stage: 'Core', kind: 'COURSE', courseCode: 'CS 301', title: 'Design & Analysis of Algorithms', estimatedHours: 120 },
    { stage: 'Core', kind: 'COURSE', courseCode: 'CS 310', title: 'Database Systems', estimatedHours: 120 },
    { stage: 'Building', kind: 'SKILL', title: 'Web development fundamentals', description: 'HTML, CSS and a first JavaScript front end that talks to an API.', estimatedHours: 40 },
    { stage: 'Building', kind: 'COURSE', courseCode: 'CS 350', title: 'Software Engineering', estimatedHours: 120 },
    { stage: 'Career', kind: 'MILESTONE', title: 'Project: a patient-intake web application', description: 'Design a small database, build the web front end and present it: a portfolio piece that combines nursing and computing.', estimatedHours: 60 },
  ],
};
const say = (m) => console.log(m);
const mode = a.cleanup ? 'cleanup' : a.apply ? 'apply' : 'dry-run';

try {
  const student = await prisma.studentProfile.findFirst({ where: { studentNumber: a.student }, include: { user: { include: { userRoles: { include: { role: true } } } } } });
  const advisor = await prisma.facultyProfile.findFirst({ where: { employeeNumber: a.advisor }, include: { user: { include: { tenant: true } } } });
  if (!student || !advisor) throw new Error(`Missing: ${!student ? `student ${a.student} ` : ''}${!advisor ? `faculty ${a.advisor}` : ''}`);
  if (student.tenantId !== advisor.tenantId) throw new Error('The student and the advisor belong to different tenants.');
  const tenantId = student.tenantId;
  const authOf = (u, extra) => ({ tenantId, tenantSlug: advisor.user.tenant.slug, userId: u.id, firstName: u.firstName, lastName: u.lastName, roles: [], ...extra });
  const studentAuth = authOf(student.user, { roles: student.user.userRoles.map((r) => r.role.key), studentProfileId: student.id });
  const advisorAuth = authOf(advisor.user, { roles: ['FACULTY'], facultyProfileId: advisor.id });
  const mark = (action, entityType, entityId, summary) => recordAudit({ tenantId, actorUserId: null, action, entityType, entityId, summary });
  const created = async (action) => (await prisma.auditLog.findMany({ where: { tenantId, action }, select: { entityId: true } })).map((r) => r.entityId);
  say(`${mode} · student ${student.studentNumber} (${student.user.firstName} ${student.user.lastName}) · advisor ${advisor.employeeNumber} (${advisor.user.firstName} ${advisor.user.lastName})`);

  if (a.cleanup) {
    for (const id of await created('DEMO_SEED_APPOINTMENT')) {
      if (await prisma.advisingAppointment.findUnique({ where: { id } })) { await prisma.advisingAppointment.delete({ where: { id } }); say(`  appointment ${id}: removed`); }
    }
    for (const id of await created('DEMO_SEED_SLOT')) {
      const slot = await prisma.advisingSlot.findUnique({ where: { id }, include: { appointments: true } });
      if (slot && !slot.appointments.length) { await prisma.advisingSlot.delete({ where: { id } }); say(`  slot ${id}: removed`); }
    }
    for (const id of await created('DEMO_SEED_LEARNING_PATH')) {
      const path = await prisma.learningPath.findUnique({ where: { id }, include: { enrollments: true } });
      if (!path) continue;
      await prisma.userLearningPath.deleteMany({ where: { pathId: id, userId: student.user.id } });
      if (path.enrollments.some((e) => e.userId !== student.user.id)) { say(`  path ${path.key}: others use it; kept (the student's activation removed)`); continue; }
      await prisma.learningPath.delete({ where: { id } });
      say(`  path ${path.key}: removed`);
    }
  } else {
    // 1. Advising
    const booked = await prisma.advisingAppointment.findFirst({ where: { tenantId, studentUserId: student.user.id, advisorUserId: advisor.user.id, status: 'BOOKED', slot: { startsAt: { gt: new Date() } } }, include: { slot: true } });
    if (booked) say(`  advising: already booked for ${booked.slot.startsAt.toISOString()}`);
    else if (!a.apply) say(`  advising: would publish 3 slots from ${SLOT_START} and book the first`);
    else {
      const before = new Set((await prisma.advisingSlot.findMany({ where: { advisorUserId: advisor.user.id }, select: { id: true } })).map((s) => s.id));
      await advising.createSlots(advisorAuth, { startsAt: SLOT_START, durationMinutes: 30, count: 3, mode: 'VIRTUAL' });
      const slots = await prisma.advisingSlot.findMany({ where: { advisorUserId: advisor.user.id, startsAt: { gte: new Date(SLOT_START) } }, orderBy: { startsAt: 'asc' } });
      for (const s of slots.filter((x) => !before.has(x.id))) await mark('DEMO_SEED_SLOT', 'AdvisingSlot', s.id, `Demo seed advising slot ${s.startsAt.toISOString()}`);
      const appt = await advising.bookAppointment(studentAuth, { slotId: slots[0].id, topic: 'Spring 2027 course planning', notes: 'Discuss continuing with computing courses (CS 201) alongside the nursing programme.' });
      await mark('DEMO_SEED_APPOINTMENT', 'AdvisingAppointment', appt.id, `Demo seed advising appointment ${appt.startsAt}`);
      say(`  advising: booked ${new Date(appt.startsAt).toISOString()} with ${appt.advisor.name} (${appt.mode}${appt.meetingUrl ? `, ${appt.meetingUrl}` : ''})`);
    }

    // 2. Learning path
    let path = await prisma.learningPath.findUnique({ where: { tenantId_key: { tenantId, key: PATH.key } } });
    if (path) say(`  learning path ${PATH.key}: exists`);
    else if (a.apply) {
      path = await prisma.learningPath.create({ data: { tenantId, key: PATH.key, title: PATH.title, careerGoal: PATH.careerGoal, description: PATH.description, steps: { create: PATH.steps.map((s, i) => ({ ...s, sortOrder: i + 1 })) } } });
      await mark('DEMO_SEED_LEARNING_PATH', 'LearningPath', path.id, `Demo seed learning path ${PATH.key}`);
      say(`  learning path ${PATH.key}: created with ${PATH.steps.length} steps`);
    } else say(`  learning path ${PATH.key}: would create with ${PATH.steps.length} steps`);
    if (path && a.apply) {
      const result = await planning.activateLearningPath(tenantId, student.id, path.id, studentAuth);
      const p = result.paths.find((x) => x.id === path.id);
      say(`  learning path: active for the student · ${p.completedSteps}/${p.totalSteps} complete · ${p.steps.filter((s) => s.status === 'IN_PROGRESS').map((s) => s.courseCode ?? s.title).join(', ') || 'nothing'} in progress (from CampusCore)`);
    }
  }
  if (mode === 'dry-run') say('\nDry run: nothing was written. Re-run with --apply.');
} finally {
  await prisma.$disconnect();
}
