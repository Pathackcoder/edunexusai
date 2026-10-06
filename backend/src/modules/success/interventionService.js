import { prisma } from '../../db/prisma.js';
import { formatTimeAgo, toIsoDate } from '../../utils/format.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { notifyUsers } from '../notifications/notificationService.js';
import { recordAudit } from '../audit/auditService.js';
import { createRequest } from '../workflows/requestService.js';

/**
 * Proactive intervention (early-alert) flags.
 *
 * Two kinds of signal, kept visibly separate:
 *   flags       entered by faculty / advisors (or imported); a person decided to flag
 *   indicators  factual counts read from course data (e.g. past-due work with no
 *               submission). They are shown as counts, never combined into a score.
 */

export const INTERVENTION_TYPES = {
  TASK: 'Task',
  ATTENDANCE: 'Attendance concern',
  MISSING_WORK: 'Missing assignments',
  ACADEMIC_CONCERN: 'Academic concern',
  FOLLOW_UP: 'Follow-up required',
  ADVISING: 'Advising note',
  REFERRAL: 'Referral',
};

const include = {
  studentProfile: { select: { id: true, studentNumber: true, degree: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
  createdBy: { select: { firstName: true, lastName: true } },
};

function present(row, courses = new Map()) {
  const student = row.studentProfile;
  return {
    id: row.id,
    type: row.type,
    typeLabel: INTERVENTION_TYPES[row.type] ?? row.type,
    title: row.title,
    note: row.note,
    status: row.status,
    source: row.source,
    dueDate: toIsoDate(row.dueDate),
    studentNotified: row.studentNotified,
    student: student
      ? { profileId: student.id, userId: student.user.id, name: `${student.user.firstName} ${student.user.lastName}`, studentNumber: student.studentNumber, program: student.degree }
      : null,
    subject: student ? `${student.user.firstName} ${student.user.lastName}` : row.subjectLabel || 'Personal',
    course: row.courseId ? courses.get(row.courseId) ?? null : null,
    createdBy: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : 'Imported',
    createdAt: row.createdAt,
    timeAgo: formatTimeAgo(row.createdAt),
    resolvedAt: row.resolvedAt,
  };
}

async function courseMap(tenantId) {
  const courses = await prisma.course.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } });
  return new Map(courses.map((course) => [course.id, { id: course.id, code: course.code, name: course.name }]));
}

/** Students on the faculty member's rosters (admins see the whole tenant). */
async function visibleStudentIds(auth) {
  if (auth.roles.includes('ADMIN')) return null;
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId: auth.tenantId, course: { instructorUserId: auth.userId } },
    select: { studentProfileId: true },
  });
  return [...new Set(enrollments.map((row) => row.studentProfileId))];
}

/** Past-due assignments in the caller's courses with no completed submission, per student. */
async function missingWorkIndicators(auth) {
  const courseWhere = auth.roles.includes('ADMIN') ? { tenantId: auth.tenantId } : { tenantId: auth.tenantId, instructorUserId: auth.userId };
  const courses = await prisma.course.findMany({
    where: courseWhere,
    select: {
      id: true,
      code: true,
      enrollments: { select: { studentProfileId: true, studentProfile: { select: { studentNumber: true, user: { select: { firstName: true, lastName: true } } } } } },
      assignments: {
        where: { dueDate: { lt: new Date() } },
        select: { id: true, title: true, submissions: { select: { studentProfileId: true, status: true } } },
      },
    },
  });
  const indicators = [];
  for (const course of courses) {
    for (const enrollment of course.enrollments) {
      const missing = course.assignments.filter(
        (assignment) => !assignment.submissions.some((sub) => sub.studentProfileId === enrollment.studentProfileId && ['Completed', 'Submitted'].includes(sub.status)),
      );
      if (missing.length) {
        indicators.push({
          key: `${course.id}:${enrollment.studentProfileId}`,
          kind: 'MISSING_WORK',
          label: `${missing.length} past-due assignment${missing.length === 1 ? '' : 's'} without a submission`,
          detail: missing.map((assignment) => assignment.title).slice(0, 3).join(', '),
          courseId: course.id,
          courseCode: course.code,
          studentProfileId: enrollment.studentProfileId,
          studentName: `${enrollment.studentProfile.user.firstName} ${enrollment.studentProfile.user.lastName}`,
          studentNumber: enrollment.studentProfile.studentNumber,
          count: missing.length,
        });
      }
    }
  }
  return indicators;
}

export async function listInterventions(auth, { status } = {}) {
  const studentIds = await visibleStudentIds(auth);
  const where = { tenantId: auth.tenantId };
  if (studentIds) where.OR = [{ createdByUserId: auth.userId }, { studentProfileId: { in: studentIds } }];
  if (status && status !== 'ALL') where.status = status === 'OPEN' ? { not: 'RESOLVED' } : status;

  const [rows, courses, indicators] = await Promise.all([
    prisma.studentIntervention.findMany({ where, include, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
    courseMap(auth.tenantId),
    missingWorkIndicators(auth),
  ]);
  const flags = rows.map((row) => present(row, courses));
  const open = flags.filter((flag) => flag.status !== 'RESOLVED');
  return {
    interventions: flags,
    indicators,
    types: Object.entries(INTERVENTION_TYPES).map(([key, label]) => ({ key, label })),
    summary: {
      open: open.length,
      studentsFlagged: new Set(open.filter((flag) => flag.student).map((flag) => flag.student.profileId)).size,
      byType: Object.keys(INTERVENTION_TYPES).reduce((acc, key) => ({ ...acc, [key]: open.filter((flag) => flag.type === key).length }), {}),
      indicators: indicators.length,
    },
  };
}

/** Roster-scoped student list for the "flag a student" picker. */
export async function listFlaggableStudents(auth) {
  const studentIds = await visibleStudentIds(auth);
  const profiles = await prisma.studentProfile.findMany({
    where: { tenantId: auth.tenantId, ...(studentIds ? { id: { in: studentIds } } : {}) },
    select: { id: true, studentNumber: true, user: { select: { firstName: true, lastName: true } } },
    orderBy: { user: { lastName: 'asc' } },
  });
  return profiles.map((profile) => ({ id: profile.id, name: `${profile.user.firstName} ${profile.user.lastName}`, studentNumber: profile.studentNumber }));
}

export async function createIntervention(auth, payload) {
  if (!INTERVENTION_TYPES[payload.type]) throw badRequest('Unknown follow-up type.');
  if (payload.type !== 'TASK' && !payload.studentProfileId && !payload.subjectLabel?.trim()) {
    throw badRequest('Choose the student or group for this follow-up.', [{ field: 'studentProfileId', message: 'Select a student.' }]);
  }
  let student = null;
  if (payload.studentProfileId) {
    const allowed = await visibleStudentIds(auth);
    if (allowed && !allowed.includes(payload.studentProfileId)) throw forbidden('That student is not on your rosters.');
    student = await prisma.studentProfile.findFirst({ where: { id: payload.studentProfileId, tenantId: auth.tenantId }, include: { user: true } });
    if (!student) throw notFound('Student not found.');
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.studentIntervention.create({
      data: {
        tenantId: auth.tenantId,
        studentProfileId: student?.id ?? null,
        subjectLabel: student ? null : payload.subjectLabel?.trim() || null,
        courseId: payload.courseId || null,
        createdByUserId: auth.userId,
        type: payload.type,
        title: payload.title,
        note: payload.note ?? null,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        studentNotified: Boolean(payload.notifyStudent && student),
      },
    });
    if (payload.notifyStudent && student) {
      await notifyUsers(
        {
          tenantId: auth.tenantId,
          userIds: [student.userId],
          title: `Check-in from ${auth.firstName} ${auth.lastName}`,
          message: `${payload.title}. Reply to your instructor or book an advising appointment if you would like support.`,
          category: 'academic',
          priority: 'high',
          link: '/academics/advising',
          sourceType: 'INTERVENTION',
          sourceRefId: created.id,
          createdByUserId: auth.userId,
        },
        tx,
      );
    }
    if (payload.type === 'REFERRAL') {
      await createRequest(
        {
          tenantId: auth.tenantId,
          userId: auth.userId,
          roles: auth.roles.includes('FACULTY') ? ['FACULTY'] : auth.roles,
          type: 'STUDENT_REFERRAL',
          title: `Referral: ${student ? `${student.user.firstName} ${student.user.lastName}` : payload.subjectLabel} — ${payload.title}`,
          description: payload.note || payload.title,
          details: { referralTo: payload.referralTo ?? 'Student Success Office', studentNumber: student?.studentNumber ?? null },
          priority: 'HIGH',
          sourceType: 'INTERVENTION',
          sourceId: created.id,
        },
        tx,
      );
    }
    return created;
  });
  const courses = await courseMap(auth.tenantId);
  return present(await prisma.studentIntervention.findUnique({ where: { id: row.id }, include }), courses);
}

export async function updateIntervention(auth, id, { status, note }) {
  const row = await prisma.studentIntervention.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!row) throw notFound('Follow-up not found.');
  const allowed = await visibleStudentIds(auth);
  if (allowed && row.createdByUserId !== auth.userId && !allowed.includes(row.studentProfileId)) throw forbidden();
  const updated = await prisma.studentIntervention.update({
    where: { id },
    data: {
      ...(status ? { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } : {}),
      ...(note !== undefined ? { note } : {}),
    },
    include,
  });
  if (status === 'RESOLVED' && auth.roles.includes('ADMIN')) {
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'INTERVENTION_RESOLVED', entityType: 'StudentIntervention', entityId: id, summary: `Follow-up resolved: ${row.title}` });
  }
  return present(updated, await courseMap(auth.tenantId));
}
