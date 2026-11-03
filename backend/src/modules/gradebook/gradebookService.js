import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { toNumber } from '../../utils/format.js';
import { recordAudit } from '../audit/auditService.js';
import { notifyUsers } from '../notifications/notificationService.js';
import { average, courseResult } from './gradeMath.js';

/**
 * Faculty gradebook.
 *
 * Scores live on AssignmentSubmission. `score` is the PUBLISHED value, the only one any
 * student-facing route reads. Faculty edits are drafts (`draftScore` + `hasDraft`, where
 * a draft may also clear a score) until the instructor publishes them, which copies the
 * draft into `score` in one transaction and notifies the affected students.
 *
 * Only the instructor of record may read or change a course's gradebook, and only for
 * students enrolled in that course. Every rule is enforced here, not in the UI.
 */

async function assertInstructor(tenantId, userId, courseId) {
  const course = await prisma.course.findFirst({ where: { tenantId, id: courseId }, include: { term: true } });
  if (!course) throw notFound('Course not found.');
  if (course.instructorUserId !== userId) throw forbidden('Only the instructor of record can manage this gradebook.');
  return course;
}

const num = (value) => (value == null ? null : toNumber(value));
const cellKey = (studentProfileId, assignmentId) => `${studentProfileId}:${assignmentId}`;

/** Courses this faculty member can grade. */
export async function listGradebookCourses(auth) {
  const courses = await prisma.course.findMany({
    where: { tenantId: auth.tenantId, instructorUserId: auth.userId },
    include: { term: true, _count: { select: { enrollments: true, assignments: true } } },
    orderBy: { code: 'asc' },
  });
  return courses.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name,
    term: course.term?.name ?? null,
    enrolledCount: course._count.enrollments,
    assignmentCount: course._count.assignments,
  }));
}

export async function getGradebook(auth, courseId, { now = new Date() } = {}) {
  const course = await assertInstructor(auth.tenantId, auth.userId, courseId);
  const [assignments, enrollments] = await Promise.all([
    prisma.assignment.findMany({ where: { tenantId: auth.tenantId, courseId }, orderBy: [{ dueDate: 'asc' }, { title: 'asc' }] }),
    prisma.enrollment.findMany({
      where: { tenantId: auth.tenantId, courseId },
      include: { studentProfile: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
      orderBy: { studentProfile: { studentNumber: 'asc' } },
    }),
  ]);
  const submissions = await prisma.assignmentSubmission.findMany({
    where: { tenantId: auth.tenantId, assignmentId: { in: assignments.map((a) => a.id) }, studentProfileId: { in: enrollments.map((e) => e.studentProfileId) } },
  });
  const byCell = new Map(submissions.map((row) => [cellKey(row.studentProfileId, row.assignmentId), row]));

  const items = assignments.map((a) => ({
    id: a.id,
    title: a.title,
    maxPoints: a.points,
    weight: num(a.weight),
    dueDate: a.dueDate,
    dueTimeLabel: a.dueTimeLabel,
  }));
  const config = { method: course.gradingMethod, missingPolicy: course.missingWorkPolicy, threshold: course.atRiskThreshold, now };

  const students = enrollments.map((enrollment) => {
    const profile = enrollment.studentProfile;
    const cells = {};
    for (const a of items) {
      const row = byCell.get(cellKey(profile.id, a.id));
      const published = num(row?.score);
      const draft = row?.hasDraft ? num(row.draftScore) : undefined;
      cells[a.id] = {
        published,
        hasDraft: Boolean(row?.hasDraft),
        draft: draft === undefined ? null : draft,
        value: row?.hasDraft ? draft : published, // what the instructor is working with
        submitted: row?.status === 'Completed',
        publishedAt: row?.publishedAt ?? null,
      };
    }
    const working = courseResult({ assignments: items, scoreOf: (id) => cells[id].value, ...config });
    const visible = courseResult({ assignments: items, scoreOf: (id) => cells[id].published, ...config });
    return {
      studentProfileId: profile.id,
      studentNumber: profile.studentNumber,
      name: `${profile.user.firstName} ${profile.user.lastName}`,
      email: profile.user.email,
      cells,
      result: working, // includes unpublished drafts
      publishedResult: visible, // what the student currently sees
      draftCount: Object.values(cells).filter((cell) => cell.hasDraft).length,
    };
  });

  const assignmentStats = items.map((a) => {
    const values = students.map((s) => s.cells[a.id].value).filter((v) => v != null);
    return {
      assignmentId: a.id,
      average: values.length ? average(values.map((v) => (a.maxPoints > 0 ? (v / a.maxPoints) * 100 : null))) : null,
      gradedCount: values.length,
      draftCount: students.filter((s) => s.cells[a.id].hasDraft).length,
    };
  });
  const weightTotal = items.reduce((sum, a) => sum + (a.weight ?? 0), 0);

  return {
    course: {
      id: course.id,
      code: course.code,
      name: course.name,
      term: course.term?.name ?? null,
      gradingMethod: course.gradingMethod,
      missingWorkPolicy: course.missingWorkPolicy,
      atRiskThreshold: course.atRiskThreshold,
      weightTotal: Math.round(weightTotal * 100) / 100,
    },
    assignments: items,
    assignmentStats,
    students,
    summary: {
      enrolled: students.length,
      classAverage: average(students.map((s) => s.result.percentage)),
      publishedClassAverage: average(students.map((s) => s.publishedResult.percentage)),
      pendingDrafts: students.reduce((sum, s) => sum + s.draftCount, 0),
      missingGrades: students.reduce((sum, s) => sum + items.filter((a) => s.cells[a.id].value == null).length, 0),
      atRisk: students.filter((s) => s.result.risk === 'AT_RISK').length,
      insufficientData: students.filter((s) => s.result.risk === 'INSUFFICIENT_DATA').length,
    },
  };
}

/**
 * Save draft scores. Every entry is validated (assignment in this course, student enrolled,
 * 0 ≤ score ≤ max points, at most two decimals) before anything is written; one invalid
 * entry rejects the batch. `score: null` drafts the removal of a score.
 */
export async function saveScores(auth, courseId, entries) {
  await assertInstructor(auth.tenantId, auth.userId, courseId);
  const [assignments, enrollments] = await Promise.all([
    prisma.assignment.findMany({ where: { tenantId: auth.tenantId, courseId }, select: { id: true, title: true, points: true } }),
    prisma.enrollment.findMany({ where: { tenantId: auth.tenantId, courseId }, select: { studentProfileId: true } }),
  ]);
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const enrolled = new Set(enrollments.map((e) => e.studentProfileId));

  const errors = [];
  entries.forEach((entry, index) => {
    const assignment = assignmentById.get(entry.assignmentId);
    if (!assignment) errors.push({ index, field: 'assignmentId', message: 'This assignment is not part of the course.' });
    if (!enrolled.has(entry.studentProfileId)) errors.push({ index, field: 'studentProfileId', message: 'This student is not enrolled in the course.' });
    if (assignment && entry.score != null && entry.score > assignment.points) {
      errors.push({ index, field: 'score', message: `Score cannot exceed ${assignment.points} points for "${assignment.title}".` });
    }
  });
  if (errors.length) throw badRequest('Some scores could not be saved. Nothing was changed.', { errors });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const draftScore = entry.score == null ? null : new Prisma.Decimal(entry.score);
      await tx.assignmentSubmission.upsert({
        where: { assignmentId_studentProfileId: { assignmentId: entry.assignmentId, studentProfileId: entry.studentProfileId } },
        create: { tenantId: auth.tenantId, assignmentId: entry.assignmentId, studentProfileId: entry.studentProfileId, draftScore, hasDraft: true, gradedAt: now, gradedByUserId: auth.userId },
        update: { draftScore, hasDraft: true, gradedAt: now, gradedByUserId: auth.userId },
      });
    }
    // A draft equal to the published value is not a pending change.
    await tx.$executeRaw`
      UPDATE "assignment_submissions" SET "hasDraft" = false, "draftScore" = NULL
      WHERE "tenantId" = ${auth.tenantId} AND "hasDraft" = true
        AND "assignmentId" IN (SELECT "id" FROM "assignments" WHERE "courseId" = ${courseId})
        AND "draftScore" IS NOT DISTINCT FROM "score"`;
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'GRADES_DRAFTED', entityType: 'Course', entityId: courseId, summary: `${entries.length} score(s) saved as drafts`, metadata: { count: entries.length } }, tx);
  });
  return getGradebook(auth, courseId);
}

/** Publish pending drafts for the whole course or one assignment, then notify those students. */
export async function publishGrades(auth, courseId, { assignmentId } = {}) {
  const course = await assertInstructor(auth.tenantId, auth.userId, courseId);
  if (assignmentId) {
    const owns = await prisma.assignment.count({ where: { tenantId: auth.tenantId, courseId, id: assignmentId } });
    if (!owns) throw badRequest('This assignment is not part of the course.');
  }
  const now = new Date();
  const published = await prisma.$transaction(async (tx) => {
    const rows = await tx.assignmentSubmission.findMany({
      where: { tenantId: auth.tenantId, hasDraft: true, assignment: { courseId, ...(assignmentId ? { id: assignmentId } : {}) }, studentProfile: { enrollments: { some: { courseId } } } },
      select: { id: true, studentProfileId: true, assignment: { select: { title: true } }, studentProfile: { select: { userId: true } } },
    });
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    await tx.$executeRaw`
      UPDATE "assignment_submissions"
      SET "score" = "draftScore", "draftScore" = NULL, "hasDraft" = false, "publishedAt" = ${now}, "publishedByUserId" = ${auth.userId}, "updatedAt" = ${now}
      WHERE "id" IN (${Prisma.join(ids)})`;
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'GRADES_PUBLISHED', entityType: 'Course', entityId: courseId, summary: `${rows.length} grade(s) published in ${course.code}`, metadata: { count: rows.length, assignmentId: assignmentId ?? null } }, tx);
    // Each affected student is told which work has new grades.
    const byStudent = new Map();
    for (const row of rows) {
      const entry = byStudent.get(row.studentProfile.userId) ?? new Set();
      entry.add(row.assignment.title);
      byStudent.set(row.studentProfile.userId, entry);
    }
    for (const [userId, titles] of byStudent) {
      await notifyUsers({ tenantId: auth.tenantId, userIds: [userId], title: `New grades posted in ${course.code}`, message: `Grades are available for: ${[...titles].join(', ')}.`, category: 'academic', link: '/academics/assignments', sourceType: 'GRADES', sourceRefId: courseId, createdByUserId: auth.userId }, tx);
    }
    return rows;
  });
  return { published: published.length, students: new Set(published.map((row) => row.studentProfileId)).size, gradebook: await getGradebook(auth, courseId) };
}

/** Grading method, missing-work policy, at-risk threshold and assignment weights. */
export async function updateSettings(auth, courseId, { gradingMethod, missingWorkPolicy, atRiskThreshold, weights = [] }) {
  await assertInstructor(auth.tenantId, auth.userId, courseId);
  const assignmentIds = new Set((await prisma.assignment.findMany({ where: { tenantId: auth.tenantId, courseId }, select: { id: true } })).map((a) => a.id));
  const foreign = weights.filter((w) => !assignmentIds.has(w.assignmentId));
  if (foreign.length) throw badRequest('Weights can only be set on this course’s assignments.');
  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id: courseId }, data: { gradingMethod, missingWorkPolicy, atRiskThreshold } });
    for (const w of weights) {
      await tx.assignment.update({ where: { id: w.assignmentId }, data: { weight: w.weight == null ? null : new Prisma.Decimal(w.weight) } });
    }
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'GRADING_SETTINGS_UPDATED', entityType: 'Course', entityId: courseId, summary: `Grading set to ${gradingMethod}, missing work ${missingWorkPolicy}, at-risk below ${atRiskThreshold}%`, metadata: { gradingMethod, missingWorkPolicy, atRiskThreshold, weights } }, tx);
  });
  return getGradebook(auth, courseId);
}

/**
 * Published coursework totals for a student's course (student-facing): computed from
 * published scores only, with the course's own grading rules.
 */
export async function publishedCourseworkFor(tenantId, studentProfileId, courseIds, { now = new Date() } = {}) {
  if (!courseIds.length) return new Map();
  const [courses, assignments, submissions] = await Promise.all([
    prisma.course.findMany({ where: { tenantId, id: { in: courseIds } }, select: { id: true, gradingMethod: true, missingWorkPolicy: true, atRiskThreshold: true } }),
    prisma.assignment.findMany({ where: { tenantId, courseId: { in: courseIds } }, select: { id: true, courseId: true, points: true, weight: true, dueDate: true } }),
    prisma.assignmentSubmission.findMany({ where: { tenantId, studentProfileId, assignment: { courseId: { in: courseIds } } }, select: { assignmentId: true, score: true } }),
  ]);
  const scoreOf = new Map(submissions.map((row) => [row.assignmentId, num(row.score)]));
  const result = new Map();
  for (const course of courses) {
    const items = assignments.filter((a) => a.courseId === course.id).map((a) => ({ id: a.id, maxPoints: a.points, weight: num(a.weight), dueDate: a.dueDate }));
    const r = courseResult({ assignments: items, scoreOf: (id) => scoreOf.get(id) ?? null, method: course.gradingMethod, missingPolicy: course.missingWorkPolicy, threshold: course.atRiskThreshold, now });
    result.set(course.id, { method: course.gradingMethod, percentage: r.percentage, letter: r.letter, earned: r.earned, possible: r.possible, graded: r.graded, total: items.length });
  }
  return result;
}
