import { prisma } from '../db/prisma.js';
import {
  SyncDomain,
  getIntegrationByKey,
  resolveIntegrationForDomain,
  runIntegrationOperation,
} from './integrationService.js';
import { logger } from '../utils/logger.js';

/**
 * Sync orchestration.
 *
 * Pulls from an external system through a connector, maps every record into the canonical
 * model, then upserts it into PostgreSQL stamped with `sourceSystem`, `externalId` and
 * `lastSyncedAt`. After a sync the provenance of a row such as "CS 501" is a fact in the
 * database, not a comment in the code:
 *
 *   select code, source_system, external_id, last_synced_at from courses;
 *
 * Why sync into PostgreSQL rather than proxy every read:
 *   - integration-owned rows become joinable with Edunexus-owned rows (a faculty roster
 *     needs enrollments joined to users; a dashboard needs courses joined to submissions)
 *   - the portal still renders when the external system is down
 *   - response times stay flat and the provider is not hit once per page view
 * `ACADEMIC_READ_MODE=passthrough` exists for the opposite demonstration: read straight
 * through the connector on every request, with no database involvement.
 */

/** Resolve externalStudentId -> internal studentProfileId via the canonical id map. */
async function studentIdMap(tenantId, provider) {
  const rows = await prisma.externalIdentity.findMany({
    where: { tenantId, provider, entityType: 'STUDENT' },
  });
  return new Map(rows.map((row) => [row.externalId, row.internalId]));
}

async function rememberExternalId(tenantId, provider, entityType, externalId, internalId) {
  if (!externalId) return;
  await prisma.externalIdentity.upsert({
    where: { tenantId_provider_entityType_externalId: { tenantId, provider, entityType, externalId } },
    create: { tenantId, provider, entityType, externalId, internalId },
    update: { internalId },
  });
}

async function ensureTerm(tenantId, { code, name }) {
  const termCode = code ?? 'UNKNOWN';
  return prisma.term.upsert({
    where: { tenantId_code: { tenantId, code: termCode } },
    create: { tenantId, code: termCode, name: name ?? termCode, isCurrent: true },
    update: { name: name ?? termCode },
  });
}

/**
 * COURSES. Canonical upsert keyed on (tenant, term, code) so re-running a sync updates
 * rather than duplicates, and so the same course arriving from a second provider merges.
 */
export async function syncCourses(tenantId, { userId, integrationKey, termCode } = {}) {
  const integration = integrationKey
    ? await getIntegrationByKey(tenantId, integrationKey)
    : await resolveIntegrationForDomain(tenantId, SyncDomain.COURSES);

  return runIntegrationOperation({
    integration,
    operation: 'COURSES.SYNC',
    userId,
    countOf: (r) => r.written ?? 0,
    run: async (connector, mapper) => {
      const { records, durationMs } = await connector.fetchCourses({ termCode });
      const canonical = records.map((record) => mapper.mapCourse(record));

      let written = 0;
      for (const course of canonical) {
        if (!course.code) continue;
        const term = await ensureTerm(tenantId, {
          code: course.termCode ?? termCode ?? 'FALL2026',
          name: course.termName,
        });

        // A secondary provider (Canvas) must not blank out registrar-owned fields.
        const defined = Object.fromEntries(
          Object.entries({
            name: course.name,
            credits: course.credits,
            description: course.description,
            room: course.room,
            meetingDays: course.meetingDays?.length ? course.meetingDays : undefined,
            dayCodes: course.dayCodes?.length ? course.dayCodes : undefined,
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
            lmsUrl: course.lmsUrl,
          }).filter(([, value]) => value !== null && value !== undefined),
        );

        const saved = await prisma.course.upsert({
          where: { tenantId_termId_code: { tenantId, termId: term.id, code: course.code } },
          create: {
            tenantId,
            termId: term.id,
            code: course.code,
            name: course.name ?? course.code,
            sourceSystem: course.sourceSystem,
            externalId: course.externalId,
            lastSyncedAt: new Date(),
            ...defined,
          },
          update: {
            sourceSystem: course.sourceSystem,
            externalId: course.externalId,
            lastSyncedAt: new Date(),
            ...defined,
          },
        });

        await rememberExternalId(tenantId, integration.provider, 'COURSE', course.externalId, saved.id);
        written += 1;
      }

      logger.info(`Course sync complete`, { tenantId, provider: integration.provider, written });
      return { durationMs, written, records: canonical };
    },
  });
}

/** ENROLLMENTS (+ the per-course grade breakdown that rides along with them). */
export async function syncEnrollments(tenantId, { userId, integrationKey, termCode } = {}) {
  const integration = integrationKey
    ? await getIntegrationByKey(tenantId, integrationKey)
    : await resolveIntegrationForDomain(tenantId, SyncDomain.ENROLLMENTS);

  return runIntegrationOperation({
    integration,
    operation: 'ENROLLMENTS.SYNC',
    userId,
    countOf: (r) => r.written ?? 0,
    run: async (connector, mapper) => {
      const { records, durationMs } = await connector.fetchEnrollments({ termCode });
      const canonical = records.map((record) => mapper.mapEnrollment(record));

      const students = await studentIdMap(tenantId, integration.provider);
      const courseIdentities = await prisma.externalIdentity.findMany({
        where: { tenantId, provider: integration.provider, entityType: 'COURSE' },
      });
      const courses = new Map(courseIdentities.map((row) => [row.externalId, row.internalId]));

      let written = 0;
      let skipped = 0;
      for (const enrollment of canonical) {
        const studentProfileId = students.get(enrollment.externalStudentId);
        const courseId = courses.get(enrollment.externalCourseId);
        if (!studentProfileId || !courseId) {
          skipped += 1;
          continue; // unknown on our side: a student or course we do not carry
        }

        const saved = await prisma.enrollment.upsert({
          where: { courseId_studentProfileId: { courseId, studentProfileId } },
          create: {
            tenantId,
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
          update: {
            status: enrollment.status,
            letterGrade: enrollment.letterGrade,
            percentage: enrollment.percentage,
            gradePoints: enrollment.gradePoints,
            sourceSystem: enrollment.sourceSystem,
            externalId: enrollment.externalId,
            lastSyncedAt: new Date(),
          },
        });

        if (enrollment.gradeComponents?.length) {
          await prisma.gradeComponent.deleteMany({ where: { enrollmentId: saved.id } });
          await prisma.gradeComponent.createMany({
            data: enrollment.gradeComponents.map((component) => ({
              enrollmentId: saved.id,
              label: component.label,
              displayKey: component.displayKey,
              scoreLabel: String(component.scoreLabel),
              sortOrder: component.sortOrder,
            })),
          });
        }

        await rememberExternalId(
          tenantId,
          integration.provider,
          'ENROLLMENT',
          enrollment.externalId,
          saved.id,
        );
        written += 1;
      }

      logger.info('Enrollment sync complete', { tenantId, written, skipped });
      return { durationMs, written, skipped, records: canonical };
    },
  });
}

/** ASSIGNMENTS. */
export async function syncAssignments(tenantId, { userId, integrationKey } = {}) {
  const integration = integrationKey
    ? await getIntegrationByKey(tenantId, integrationKey)
    : await resolveIntegrationForDomain(tenantId, SyncDomain.ASSIGNMENTS);

  return runIntegrationOperation({
    integration,
    operation: 'ASSIGNMENTS.SYNC',
    userId,
    countOf: (r) => r.written ?? 0,
    run: async (connector, mapper) => {
      const { records, durationMs } = await connector.fetchAssignments({});
      const canonical = records.map((record) => mapper.mapAssignment(record));

      const courseIdentities = await prisma.externalIdentity.findMany({
        where: { tenantId, provider: integration.provider, entityType: 'COURSE' },
      });
      const courses = new Map(courseIdentities.map((row) => [row.externalId, row.internalId]));
      const students = await studentIdMap(tenantId, integration.provider);

      let written = 0;
      let skipped = 0;
      for (const assignment of canonical) {
        const courseId = courses.get(assignment.externalCourseId);
        if (!courseId || !assignment.dueDate) {
          skipped += 1;
          continue;
        }

        const existing = await prisma.assignment.findFirst({
          where: { tenantId, courseId, title: assignment.title },
        });

        const payload = {
          tenantId,
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
          ? await prisma.assignment.update({ where: { id: existing.id }, data: payload })
          : await prisma.assignment.create({ data: payload });

        // Provider-side grader state seeds the Edunexus submission overlay, but never
        // overwrites a submission the student made through the portal.
        const provider = assignment.providerSubmission;
        if (provider?.isGraded && provider.externalStudentId) {
          const studentProfileId = students.get(provider.externalStudentId);
          if (studentProfileId) {
            await prisma.assignmentSubmission.upsert({
              where: { assignmentId_studentProfileId: { assignmentId: saved.id, studentProfileId } },
              create: {
                tenantId,
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

        await rememberExternalId(
          tenantId,
          integration.provider,
          'ASSIGNMENT',
          assignment.externalId,
          saved.id,
        );
        written += 1;
      }

      logger.info('Assignment sync complete', { tenantId, written, skipped });
      return { durationMs, written, skipped, records: canonical };
    },
  });
}

/** Read-through: academic history (GPA, prior terms) straight from the provider. */
export async function fetchAcademicHistory(tenantId, externalStudentId, { userId } = {}) {
  const integration = await resolveIntegrationForDomain(tenantId, SyncDomain.GRADES);
  return runIntegrationOperation({
    integration,
    operation: 'GRADES.READ',
    userId,
    countOf: () => 1,
    run: async (connector, mapper) => {
      const { record, durationMs } = await connector.fetchGrades({ externalStudentId });
      return { durationMs, record: mapper.mapAcademicHistory(record) };
    },
  });
}

/** Read-through: financial aid straight from the provider. */
export async function fetchFinancialAid(tenantId, externalStudentId, { userId } = {}) {
  const integration = await resolveIntegrationForDomain(tenantId, SyncDomain.FINANCIAL_AID);
  return runIntegrationOperation({
    integration,
    operation: 'FINANCIAL_AID.READ',
    userId,
    countOf: () => 1,
    run: async (connector, mapper) => {
      const { record, durationMs } = await connector.fetchFinancialAid({ externalStudentId });
      return { durationMs, record: mapper.mapFinancialAid(record) };
    },
  });
}

/** Read-through: a student's published timetable, used by ACADEMIC_READ_MODE=passthrough. */
export async function fetchScheduleThrough(tenantId, externalStudentId, { userId } = {}) {
  const integration = await resolveIntegrationForDomain(tenantId, SyncDomain.SCHEDULE);
  return runIntegrationOperation({
    integration,
    operation: 'SCHEDULE.READ',
    userId,
    run: async (connector, mapper) => {
      const { records, durationMs } = await connector.fetchSchedule({ externalStudentId });
      return { durationMs, records: records.map((record) => mapper.mapCourse(record)) };
    },
  });
}

/** Admin "Sync now": courses, then enrollments, then assignments (order matters). */
export async function syncAcademicDomains(tenantId, { userId, integrationKey } = {}) {
  const results = {};
  results.courses = await syncCourses(tenantId, { userId, integrationKey });
  results.enrollments = await syncEnrollments(tenantId, { userId, integrationKey });
  results.assignments = await syncAssignments(tenantId, { userId, integrationKey });
  return {
    courses: results.courses.written,
    enrollments: results.enrollments.written,
    assignments: results.assignments.written,
    totalRecords:
      results.courses.written + results.enrollments.written + results.assignments.written,
  };
}

export { rememberExternalId };
