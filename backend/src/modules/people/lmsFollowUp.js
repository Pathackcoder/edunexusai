import { moodleConfig } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { recordAudit } from '../audit/auditService.js';
import * as moodle from '../lms/moodleService.js';
import * as alignment from '../lms/courseAlignmentService.js';

/**
 * After an account was created at its first institutional sign-in (JIT): the person's Moodle account and the
 * Moodle enrolments that follow from their CampusCore registrations / teaching sections, as onboarding does.
 * Only with MOODLE_JIT_PROVISIONING and Moodle writes on. One Moodle account per person: a second profile
 * (teaching and studying) reuses the first one's account. Never blocks the sign-in; failures are audited and the
 * operations stay retryable from Admin → Moodle LMS → Operations.
 */
export async function provisionLmsAfterSignIn({ tenantId, userId }) {
  const config = moodleConfig();
  if (!config.jitProvisioning || !config.valid || !config.writesEnabled) return { state: 'SKIPPED' };
  // The person is recorded as the actor of their own provisioning; nothing here needs an administrator's rights.
  const auth = { tenantId, userId, roles: [] };
  const credentials = config.accountAuth === 'oauth2' ? 'NONE' : 'EMAIL';
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { studentProfile: true, facultyProfile: true } });
  const steps = [];
  for (const [type, profile] of [['FACULTY', user?.facultyProfile], ['STUDENT', user?.studentProfile]]) {
    if (!profile) continue;
    try {
      const out = type === 'STUDENT' ? await moodle.provisionStudent(auth, profile.id, { credentials }) : await moodle.provisionFaculty(auth, profile.id, { credentials });
      const applied = type === 'STUDENT' ? await alignment.applyStudentPlan(auth, userId) : await alignment.applyFacultyPlan(auth, userId);
      steps.push(`${type.toLowerCase()}: ${out.result?.action ?? 'DONE'}, ${applied.results.filter((r) => r.status === 'DONE').length} enrolment(s)`);
    } catch (error) {
      steps.push(`${type.toLowerCase()}: failed (${error.code ?? 'error'})`);
      logger.warn('Moodle follow-up after first sign-in failed', { code: error.code ?? null, recordType: type });
    }
  }
  await recordAudit({ tenantId, actorUserId: userId, action: 'MOODLE_JIT_FOLLOW_UP', entityType: 'User', entityId: userId, summary: `Moodle after first sign-in: ${steps.join('; ') || 'no profiles'}` }).catch(() => {});
  return { state: 'DONE', steps };
}
