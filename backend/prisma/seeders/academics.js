import { CURRENT_TERM_CODE, loadFixture, parseTimestamp, utcDate } from './shared.js';
import { syncAcademicDomains } from '../../src/integrations/syncService.js';
import { mockUniversityMapper } from '../../src/integrations/mappers/mockUniversityMapper.js';
import { rememberExternalId } from '../../src/integrations/syncService.js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MOCK_DATA_DIR = resolve(here, '..', '..', '..', 'mock-external-service', 'data');

/**
 * Academic data is INTEGRATION-OWNED. The seed does not invent courses; it asks the
 * integration layer to pull them, exactly as the admin "Sync now" button does.
 *
 * If the mock external service is not running, the seed falls back to reading the same
 * payloads the service would have served and pushes them through the SAME canonical
 * mapper, so the resulting rows are identical and still correctly attributed. The
 * fallback is reported loudly so nobody mistakes it for a live pull.
 */
export async function seedAcademicsViaIntegration(prisma, tenant, { adminUserId }) {
  try {
    const result = await syncAcademicDomains(tenant.id, {
      userId: adminUserId,
      integrationKey: 'mock-university',
    });
    return { mode: 'connector', ...result };
  } catch (error) {
    console.warn(
      `\n  ! Live pull from the mock external service failed: ${error.message}` +
        `\n    Falling back to the offline fixtures through the same canonical mapper.` +
        `\n    Start it with "npm start" in mock-external-service/ and re-run the seed` +
        `\n    to exercise the real HTTP integration path.\n`,
    );
    const result = await offlineCanonicalImport(prisma, tenant);
    return { mode: 'offline-fallback', ...result };
  }
}

/** Same mapper, same provenance, no network. */
async function offlineCanonicalImport(prisma, tenant) {
  const read = async (file) => JSON.parse(await readFile(resolve(MOCK_DATA_DIR, file), 'utf8'));
  const [sisCourses, sisEnrollments, sisAssignments] = await Promise.all([
    read('courses.json'),
    read('enrollments.json'),
    read('assignments.json'),
  ]);

  const term = await prisma.term.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: CURRENT_TERM_CODE } },
    create: { tenantId: tenant.id, code: CURRENT_TERM_CODE, name: 'Fall Semester 2026', isCurrent: true },
    update: {},
  });

  let courses = 0;
  for (const raw of sisCourses) {
    const course = mockUniversityMapper.mapCourse(raw);
    const saved = await prisma.course.upsert({
      where: { tenantId_termId_code: { tenantId: tenant.id, termId: term.id, code: course.code } },
      create: {
        tenantId: tenant.id,
        termId: term.id,
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
      update: { lastSyncedAt: new Date(), sourceSystem: course.sourceSystem, externalId: course.externalId },
    });
    await rememberExternalId(tenant.id, 'MOCK_UNIVERSITY', 'COURSE', course.externalId, saved.id);
    courses += 1;
  }

  const identities = await prisma.externalIdentity.findMany({
    where: { tenantId: tenant.id, provider: 'MOCK_UNIVERSITY' },
  });
  const byType = (type) =>
    new Map(identities.filter((i) => i.entityType === type).map((i) => [i.externalId, i.internalId]));
  const students = byType('STUDENT');
  const courseMap = byType('COURSE');

  let enrollments = 0;
  for (const raw of sisEnrollments) {
    const enrollment = mockUniversityMapper.mapEnrollment(raw);
    const studentProfileId = students.get(enrollment.externalStudentId);
    const courseId = courseMap.get(enrollment.externalCourseId);
    if (!studentProfileId || !courseId) continue;
    const saved = await prisma.enrollment.upsert({
      where: { courseId_studentProfileId: { courseId, studentProfileId } },
      create: {
        tenantId: tenant.id,
        courseId,
        studentProfileId,
        status: enrollment.status,
        letterGrade: enrollment.letterGrade,
        percentage: enrollment.percentage,
        gradePoints: enrollment.gradePoints,
        sourceSystem: enrollment.sourceSystem,
        externalId: enrollment.externalId,
        lastSyncedAt: new Date(),
      },
      update: { lastSyncedAt: new Date() },
    });
    if (enrollment.gradeComponents.length) {
      await prisma.gradeComponent.deleteMany({ where: { enrollmentId: saved.id } });
      await prisma.gradeComponent.createMany({
        data: enrollment.gradeComponents.map((c) => ({
          enrollmentId: saved.id,
          label: c.label,
          displayKey: c.displayKey,
          scoreLabel: String(c.scoreLabel),
          sortOrder: c.sortOrder,
        })),
      });
    }
    enrollments += 1;
  }

  let assignments = 0;
  for (const raw of sisAssignments) {
    const assignment = mockUniversityMapper.mapAssignment(raw);
    const courseId = courseMap.get(assignment.externalCourseId);
    if (!courseId || !assignment.dueDate) continue;
    const existing = await prisma.assignment.findFirst({
      where: { tenantId: tenant.id, courseId, title: assignment.title },
    });
    const data = {
      tenantId: tenant.id,
      courseId,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate,
      dueTimeLabel: assignment.dueTimeLabel,
      points: assignment.points,
      submissionType: assignment.submissionType,
      weightLabel: assignment.weightLabel,
      sourceSystem: assignment.sourceSystem,
      externalId: assignment.externalId,
      lastSyncedAt: new Date(),
    };
    const saved = existing
      ? await prisma.assignment.update({ where: { id: existing.id }, data })
      : await prisma.assignment.create({ data });

    const provider = assignment.providerSubmission;
    if (provider?.isGraded && provider.externalStudentId) {
      const studentProfileId = students.get(provider.externalStudentId);
      if (studentProfileId) {
        await prisma.assignmentSubmission.upsert({
          where: { assignmentId_studentProfileId: { assignmentId: saved.id, studentProfileId } },
          create: {
            tenantId: tenant.id,
            assignmentId: saved.id,
            studentProfileId,
            status: 'Completed',
            submittedAt: assignment.dueDate,
            score: provider.score,
          },
          update: {},
        });
      }
    }
    assignments += 1;
  }

  return { courses, enrollments, assignments, totalRecords: courses + enrollments + assignments };
}

/** Link synced courses to the faculty user who teaches them. */
export async function linkFacultyToCourses(prisma, tenant, facultyUser) {
  const courses = await prisma.course.findMany({ where: { tenantId: tenant.id } });
  const facultyFullName = `Dr. ${facultyUser.firstName} ${facultyUser.lastName}`;
  let linked = 0;
  for (const course of courses) {
    // The instructor of record arrives as a display name from the SIS; match it to the
    // Edunexus user account so faculty routes can scope by user id, not by name.
    if (course.instructorName === facultyFullName) {
      await prisma.course.update({
        where: { id: course.id },
        data: { instructorUserId: facultyUser.id },
      });
      linked += 1;
    }
  }
  return linked;
}

/** Announcements are Edunexus-owned: faculty author them inside the portal. */
export async function seedAnnouncements(prisma, tenant, facultyUser) {
  const { initialAnnouncementsData } = await loadFixture('announcements');
  const courses = await prisma.course.findMany({ where: { tenantId: tenant.id } });
  const byCode = new Map(courses.map((c) => [c.code.replace(/\s+/g, ''), c]));

  let created = 0;
  for (const item of initialAnnouncementsData) {
    const course = byCode.get(item.courseCode.replace(/\s+/g, ''));
    const existing = await prisma.announcement.findFirst({
      where: { tenantId: tenant.id, title: item.title, courseId: course?.id ?? null },
    });
    if (existing) continue;

    const announcement = await prisma.announcement.create({
      data: {
        tenantId: tenant.id,
        courseId: course?.id ?? null,
        // Only Dr. Mitchell exists as a user account; other instructors are name-only.
        authorUserId: item.author === 'Dr. Sarah Mitchell' ? facultyUser.id : null,
        authorName: item.author,
        title: item.title,
        content: item.content,
        tags: item.tags ?? [],
        audience: 'COURSE',
        postedAt: parseTimestamp(item.date) ?? new Date(),
      },
    });

    // The fixture carries a per-student read flag; model it as a read receipt.
    if (item.isRead) {
      const enrolled = await prisma.enrollment.findMany({
        where: { tenantId: tenant.id, courseId: course?.id ?? undefined },
        include: { studentProfile: true },
      });
      for (const enrollment of enrolled) {
        await prisma.announcementRead.upsert({
          where: {
            announcementId_userId: {
              announcementId: announcement.id,
              userId: enrollment.studentProfile.userId,
            },
          },
          create: { announcementId: announcement.id, userId: enrollment.studentProfile.userId },
          update: {},
        });
      }
    }
    created += 1;
  }
  return created;
}

/** Academic calendar is Edunexus-owned institutional content. */
export async function seedAcademicCalendar(prisma, tenant) {
  const { academicCalendarEvents } = await loadFixture('calendar');
  let created = 0;
  for (const event of academicCalendarEvents) {
    await prisma.academicEvent.upsert({
      where: { tenantId_externalKey: { tenantId: tenant.id, externalKey: event.id } },
      create: {
        tenantId: tenant.id,
        externalKey: event.id,
        title: event.title,
        eventDate: utcDate(event.date),
        startTime: event.startTime,
        endTime: event.endTime,
        category: event.category,
        location: event.location,
        description: event.description,
        isImportant: Boolean(event.isImportant),
      },
      update: { title: event.title, description: event.description },
    });
    created += 1;
  }
  return created;
}

/** Transcript history is registrar-owned academic record data. */
export async function seedTranscripts(prisma, tenant, studentProfile) {
  const { transcriptTerms, initialTranscriptRequests } = await loadFixture('transcript');

  let terms = 0;
  for (const [index, term] of transcriptTerms.entries()) {
    const isNumericGpa = typeof term.termGpa === 'number';
    const earnedNumeric = typeof term.creditsEarned === 'number';
    const row = await prisma.transcriptTerm.upsert({
      where: { studentProfileId_termLabel: { studentProfileId: studentProfile.id, termLabel: term.term } },
      create: {
        tenantId: tenant.id,
        studentProfileId: studentProfile.id,
        termLabel: term.term,
        level: term.level,
        termGpa: isNumericGpa ? term.termGpa : null,
        termGpaLabel: isNumericGpa ? null : String(term.termGpa),
        cumulativeGpa: term.cumulativeGpa,
        creditsAttempted: term.creditsAttempted,
        creditsEarned: earnedNumeric ? term.creditsEarned : null,
        creditsEarnedLabel: earnedNumeric ? null : String(term.creditsEarned),
        academicStanding: term.academicStanding,
        isInProgress: Boolean(term.isInProgress),
        sortOrder: index,
      },
      update: {},
    });

    await prisma.transcriptCourse.deleteMany({ where: { transcriptTermId: row.id } });
    await prisma.transcriptCourse.createMany({
      data: term.courses.map((course, courseIndex) => ({
        transcriptTermId: row.id,
        code: course.code,
        title: course.title,
        credits: course.credits,
        grade: course.grade,
        points: typeof course.points === 'number' ? course.points : null,
        pointsLabel: typeof course.points === 'number' ? null : String(course.points),
        sortOrder: courseIndex,
      })),
    });
    terms += 1;
  }

  let requests = 0;
  for (const request of initialTranscriptRequests) {
    await prisma.transcriptRequest.upsert({
      where: { tenantId_reference: { tenantId: tenant.id, reference: request.id } },
      create: {
        tenantId: tenant.id,
        studentProfileId: studentProfile.id,
        reference: request.id,
        requestDate: utcDate(request.requestDate),
        deliveryType: request.deliveryType,
        recipient: request.recipient,
        recipientEmail: request.recipientEmail,
        copies: request.copies,
        status: request.status,
        feeLabel: request.fee,
      },
      update: {},
    });
    requests += 1;
  }

  return { terms, requests };
}
