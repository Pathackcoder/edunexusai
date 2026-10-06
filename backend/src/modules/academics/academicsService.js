import { createRequest } from '../workflows/requestService.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { notFound } from '../../utils/errors.js';
import { buildReference, toIsoDate, toNumber } from '../../utils/format.js';
import { fetchAcademicHistory, fetchScheduleThrough } from '../../integrations/syncService.js';
import { prisma as db } from '../../db/prisma.js';
import {
  presentAcademicEvent,
  presentAnnouncement,
  presentAssignment,
  presentCourse,
  presentGradedCourse,
  presentTranscriptRequest,
  presentTranscriptTerm,
} from './presenters.js';
import { logger } from '../../utils/logger.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Map an external SIS student id for a student profile, for read-through calls. */
async function externalStudentId(tenantId, studentProfileId, provider = 'MOCK_UNIVERSITY') {
  const row = await prisma.externalIdentity.findFirst({
    where: { tenantId, provider, entityType: 'STUDENT', internalId: studentProfileId },
  });
  return row?.externalId ?? null;
}

/**
 * COURSES / SCHEDULE.
 *
 * Default read mode is `synced`: the canonical rows in PostgreSQL, written by the
 * integration layer. Set ACADEMIC_READ_MODE=passthrough to call the connector on every
 * request instead, which demonstrates the pure read-through pattern (no DB involvement).
 */
export async function listCourses(tenantId, studentProfileId) {
  if (env.integrations.academicReadMode === 'passthrough') {
    const sisId = await externalStudentId(tenantId, studentProfileId);
    if (sisId) {
      try {
        const { records } = await fetchScheduleThrough(tenantId, sisId);
        return {
          courses: records.map((course) =>
            presentCourse(
              {
                id: course.externalId,
                code: course.code,
                name: course.name,
                credits: course.credits,
                description: course.description,
                room: course.room,
                meetingDays: course.meetingDays,
                dayCodes: course.dayCodes,
                timeLabel: course.timeLabel,
                startTime: course.startTime,
                endTime: course.endTime,
                colorHex: course.colorHex,
                bgColorHex: course.bgColorHex,
                borderColorHex: course.borderColorHex,
                syllabusUrl: course.syllabusUrl,
                instructorName: course.instructorName,
                instructorEmail: course.instructorEmail,
                officeHours: course.officeHours,
                sourceSystem: course.sourceSystem,
                externalId: course.externalId,
                lastSyncedAt: new Date(),
              },
              null,
            ),
          ),
          readMode: 'passthrough',
        };
      } catch (error) {
        logger.warn('Passthrough schedule read failed; falling back to synced rows.', {
          message: error.message,
        });
      }
    }
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, studentProfileId },
    include: { course: true },
    orderBy: { course: { code: 'asc' } },
  });

  return {
    courses: enrollments.map((enrollment) => presentCourse(enrollment.course, enrollment)),
    readMode: 'synced',
  };
}

export async function getCourse(tenantId, studentProfileId, courseId) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { tenantId, studentProfileId, courseId },
    include: { course: true, gradeComponents: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!enrollment) throw notFound('Course not found for this student.');
  return {
    ...presentCourse(enrollment.course, enrollment),
    gradeBreakdown: enrollment.gradeComponents.map((component) => ({
      key: component.displayKey,
      label: component.label,
      score: component.scoreLabel,
    })),
  };
}

/** Courses meeting on a given day; drives the dashboard "Today's schedule" widget. */
export async function getScheduleForDay(tenantId, studentProfileId, { date = new Date() } = {}) {
  const { courses } = await listCourses(tenantId, studentProfileId);
  const dayName = DAY_NAMES[date.getDay()];
  const todays = courses.filter((course) => (course.days ?? []).includes(dayName));
  return {
    dayName,
    date: toIsoDate(date),
    courses: todays,
    allCourses: courses,
  };
}

/** ASSIGNMENTS — provider-owned definitions joined to the student's own submissions. */
export async function listAssignments(tenantId, studentProfileId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, studentProfileId },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((enrollment) => enrollment.courseId);
  if (courseIds.length === 0) return [];

  const assignments = await prisma.assignment.findMany({
    where: { tenantId, courseId: { in: courseIds } },
    include: {
      course: true,
      submissions: { where: { studentProfileId } },
    },
    orderBy: { dueDate: 'asc' },
  });

  const now = new Date();
  return assignments.map((assignment) =>
    presentAssignment(assignment, assignment.submissions[0] ?? null, now),
  );
}

export async function submitAssignment(tenantId, studentProfileId, assignmentId, { note, submissionRef }) {
  const assignment = await prisma.assignment.findFirst({
    where: { tenantId, id: assignmentId },
    include: { course: true },
  });
  if (!assignment) throw notFound('Assignment not found.');

  const enrolled = await prisma.enrollment.findFirst({
    where: { tenantId, studentProfileId, courseId: assignment.courseId },
  });
  if (!enrolled) throw notFound('You are not enrolled in the course for this assignment.');

  const submission = await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentProfileId: { assignmentId, studentProfileId } },
    create: {
      tenantId,
      assignmentId,
      studentProfileId,
      status: 'Completed',
      submittedAt: new Date(),
      submissionNote: note ?? null,
      submissionRef: submissionRef ?? buildReference('SUB'),
    },
    update: {
      status: 'Completed',
      submittedAt: new Date(),
      submissionNote: note ?? null,
    },
  });

  return presentAssignment(assignment, submission);
}

/** GRADES — current-term grades from enrollments, history read through the provider. */
export async function getGrades(tenantId, studentProfileId) {
  const [profile, enrollments] = await Promise.all([
    prisma.studentProfile.findFirst({ where: { tenantId, id: studentProfileId } }),
    prisma.enrollment.findMany({
      where: { tenantId, studentProfileId },
      include: { course: true, gradeComponents: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { course: { code: 'asc' } },
    }),
  ]);
  if (!profile) throw notFound('Student profile not found.');

  // Prior-term GPA history is academic-record data owned by the SIS. Read it through the
  // connector; if the provider is unavailable, fall back to the stored transcript terms
  // so the page still renders.
  let pastTerms = [];
  let historySource = 'INTEGRATION';
  const sisId = await externalStudentId(tenantId, studentProfileId);
  if (sisId) {
    try {
      const { record } = await fetchAcademicHistory(tenantId, sisId);
      pastTerms = record?.pastTerms ?? [];
    } catch (error) {
      historySource = 'DATABASE_FALLBACK';
      logger.warn('GPA history read-through failed; using stored transcript terms.', {
        message: error.message,
      });
    }
  } else {
    historySource = 'DATABASE_FALLBACK';
  }

  if (pastTerms.length === 0) {
    const terms = await prisma.transcriptTerm.findMany({
      where: { tenantId, studentProfileId, isInProgress: false },
      orderBy: { sortOrder: 'desc' },
      take: 3,
    });
    pastTerms = terms.map((term) => ({
      term: term.termLabel,
      gpa: toNumber(term.termGpa),
      credits: term.creditsAttempted,
    }));
  }

  return {
    cumulativeGpa: toNumber(profile.cumulativeGpa),
    majorGpa: toNumber(profile.majorGpa),
    semesterGpa: toNumber(profile.semesterGpa),
    creditsCompleted: profile.creditsCompleted,
    creditsRequired: profile.totalCreditsRequired,
    academicStanding: profile.academicStanding,
    honors: profile.honors,
    currentCourses: enrollments.map(presentGradedCourse),
    pastTerms,
    meta: { historySource },
  };
}

/** ANNOUNCEMENTS — Edunexus-owned; read state is per user. */
export async function listAnnouncements(tenantId, { userId, studentProfileId }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, studentProfileId },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((enrollment) => enrollment.courseId);

  const announcements = await prisma.announcement.findMany({
    where: {
      tenantId,
      OR: [{ courseId: { in: courseIds } }, { audience: 'INSTITUTION' }],
    },
    include: { course: true, reads: { where: { userId } } },
    orderBy: { postedAt: 'desc' },
  });

  return announcements.map((announcement) =>
    presentAnnouncement(announcement, { isRead: announcement.reads.length > 0 }),
  );
}

export async function markAnnouncementRead(tenantId, userId, announcementId) {
  const announcement = await prisma.announcement.findFirst({ where: { tenantId, id: announcementId } });
  if (!announcement) throw notFound('Announcement not found.');
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId },
    update: {},
  });
  return { id: announcementId, isRead: true };
}

/** ACADEMIC CALENDAR. */
export async function listAcademicEvents(tenantId, { category } = {}) {
  const events = await prisma.academicEvent.findMany({
    where: { tenantId, ...(category && category !== 'all' ? { category } : {}) },
    orderBy: { eventDate: 'asc' },
  });
  return events.map(presentAcademicEvent);
}

/** TRANSCRIPTS. */
export async function getTranscript(tenantId, studentProfileId) {
  const profile = await prisma.studentProfile.findFirst({
    where: { tenantId, id: studentProfileId },
    include: { user: true, tenant: true },
  });
  if (!profile) throw notFound('Student profile not found.');

  const terms = await prisma.transcriptTerm.findMany({
    where: { tenantId, studentProfileId },
    include: { courses: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });

  const inProgressCredits = terms
    .filter((term) => term.isInProgress)
    .reduce((sum, term) => sum + term.creditsAttempted, 0);

  return {
    summary: {
      studentName: `${profile.user.firstName} ${profile.user.lastName}`,
      studentId: profile.studentNumber,
      institution: profile.tenant.name,
      degree: profile.degree,
      program: profile.department,
      admitTerm: terms[0]?.termLabel ?? profile.admitTerm,
      cumulativeGpa: toNumber(profile.cumulativeGpa),
      majorGpa: toNumber(profile.majorGpa),
      creditsAttempted: profile.creditsCompleted,
      creditsEarned: profile.creditsCompleted,
      creditsInProgress: inProgressCredits,
      totalDegreeRequirement: profile.totalCreditsRequired,
      academicStanding: profile.honors
        ? `${profile.academicStanding} (Dean's Honor List)`
        : profile.academicStanding,
      conferralDate: 'Expected May 2027',
    },
    terms: terms.map(presentTranscriptTerm),
  };
}

export async function listTranscriptRequests(tenantId, studentProfileId) {
  const requests = await prisma.transcriptRequest.findMany({
    where: { tenantId, studentProfileId },
    orderBy: { requestDate: 'desc' },
  });
  return requests.map(presentTranscriptRequest);
}

export async function createTranscriptRequest(tenantId, studentProfileId, payload) {
  // Official transcripts are released by the registrar, so the request also enters the
  // administrator's queue; the decision there updates this row's status.
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.transcriptRequest.create({
      data: {
        tenantId,
        studentProfileId,
        reference: buildReference('TR'),
        deliveryType: payload.deliveryType,
        recipient: payload.recipient,
        recipientEmail: payload.recipientEmail ?? null,
        recipientAddress: payload.recipientAddress ?? null,
        copies: payload.copies ?? 1,
        notes: payload.notes ?? null,
        status: 'Submitted',
        feeLabel: '$0.00 (Student Waiver)',
      },
      include: { studentProfile: { select: { userId: true } } },
    });
    await createRequest(
      {
        tenantId,
        userId: created.studentProfile.userId,
        roles: ['STUDENT'],
        type: 'TRANSCRIPT',
        title: `Official transcript ${created.reference}`,
        description: `${created.copies} ${created.deliveryType} cop${created.copies === 1 ? 'y' : 'ies'} to ${created.recipient}.${created.notes ? ` Notes: ${created.notes}` : ''}`,
        details: {
          transcriptReference: created.reference,
          deliveryType: created.deliveryType,
          recipient: created.recipient,
          recipientEmail: created.recipientEmail,
          recipientAddress: created.recipientAddress,
          copies: created.copies,
        },
        sourceType: 'TRANSCRIPT',
        sourceId: created.id,
        notifyRequester: true,
      },
      tx,
    );
    return created;
  });
  return presentTranscriptRequest(request);
}

/** LMS launch cards. */
export async function listLmsCourses(tenantId, studentProfileId) {
  const { courses } = await listCourses(tenantId, studentProfileId);
  const canvas = await db.integration.findFirst({
    where: { tenantId, provider: 'CANVAS' },
    select: { displayName: true, mode: true, status: true, enabled: true, baseUrl: true },
  });
  return {
    courses,
    lms: canvas
      ? {
          provider: 'Canvas',
          displayName: canvas.displayName,
          mode: canvas.mode,
          status: canvas.status,
          enabled: canvas.enabled,
          configured: Boolean(canvas.baseUrl),
        }
      : null,
  };
}
