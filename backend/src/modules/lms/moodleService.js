import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createConnector } from '../../integrations/registry.js';
import { presentIntegration, runIntegrationOperation } from '../../integrations/integrationService.js';
import { env, moodleConfig } from '../../config/env.js';
import { AMBIGUOUS_KINDS, isMoodleError, moodleError, MoodleErrorKind } from '../../integrations/moodle/moodleClient.js';
import { capabilityChecklist } from '../../integrations/moodle/moodleFunctions.js';
import {
  courseUrl,
  isSiteCourse,
  mapEnrollment,
  mapAssignment,
  mapCategory,
  mapContents,
  mapCourse,
  mapGradeItems,
  mapSubmissionStatus,
  parseAssignGrade,
  studentAssignmentState,
  mapUser,
} from '../../integrations/mappers/moodleMapper.js';
import { recordAudit } from '../audit/auditService.js';
import { AppError, ErrorCode, badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Moodle LMS application service.
 *
 * Business rules around the Moodle connector:
 *   - identity: EduNexusAI student <-> Moodle user and EduNexusAI course <-> Moodle course
 *     are explicit one-to-one rows in ExternalIdentity. Moodle ids are never taken from
 *     the browser for a student's own data; they are resolved from the signed-in user.
 *   - every change in Moodle is an IntegrationOperation: recorded before the call,
 *     finished after it, and retryable. Creates always look the object up first, so a
 *     retry after an uncertain outcome links the existing object instead of duplicating it.
 *   - Moodle is optional: student reads degrade to a status payload when it is down.
 *
 * Nothing here reads or writes the SIS-owned academic tables (enrollments, grades,
 * transcripts). A future SIS adapter plugs in beside this module, not inside it.
 */

const PROVIDER = 'MOODLE';
const STUDENT = 'STUDENT';
const FACULTY = 'FACULTY';
const COURSE = 'COURSE';
/** Moodle course shells created by the development seed, keyed by their ENX-DEMO ID number. */
const SEED_COURSE = 'SEED_COURSE';
const IN_PROGRESS_WINDOW_MS = 2 * 60 * 1000;
const SUBMISSION_LOOKUP_LIMIT = 25;

/* ------------------------------------------------------------------ plumbing */

async function moodleIntegration(tenantId) {
  return prisma.integration.findFirst({ where: { tenantId, provider: PROVIDER }, orderBy: { createdAt: 'asc' } });
}

async function connect(tenantId) {
  const integration = await moodleIntegration(tenantId);
  if (!integration) throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Moodle is not registered for this institution.');
  return { integration, connector: createConnector(integration) };
}

const errorSummary = (error) => ({
  kind: error.details?.kind ?? error.code ?? 'ERROR',
  message: error.message,
  wsfunction: error.details?.wsfunction ?? null,
});

/** A write whose outcome is unknown (timeout, dropped connection) must be reconciled, not repeated. */
async function writeOnce(fn) {
  try {
    return await fn();
  } catch (error) {
    if (AMBIGUOUS_KINDS.has(error.details?.kind)) {
      error.details.reconcile = true;
      error.message = `${error.message} Moodle may still have applied the change; retrying will check before writing again.`;
    }
    throw error;
  }
}

const RETRYABLE = ['FAILED', 'PARTIAL', 'NEEDS_RECONCILIATION', 'BLOCKED'];

const BLOCKING_KINDS = new Set([MoodleErrorKind.FUNCTION_NOT_ENABLED, MoodleErrorKind.NOT_CONFIGURED, MoodleErrorKind.NO_MANUAL_ENROLMENT]);

function presentOperation(op) {
  if (!op) return null;
  return {
    id: op.id,
    operation: op.operation,
    status: op.status,
    entityType: op.entityType,
    internalId: op.internalId,
    externalId: op.externalId,
    request: op.request,
    result: op.result,
    errorKind: op.errorKind,
    errorMessage: op.errorMessage,
    attempts: op.attempts,
    correlationId: op.correlationId,
    retryable: RETRYABLE.includes(op.status) && Boolean(HANDLERS[op.operation]),
    createdAt: op.createdAt,
    updatedAt: op.updatedAt,
    completedAt: op.completedAt,
  };
}

/**
 * Record an operation, run it, and record the outcome. A SUCCEEDED operation with the
 * same idempotency key is returned as-is instead of running again, unless `stillValid`
 * says its result no longer holds (e.g. the link it made was removed since).
 */
async function runOperation({ auth, integration, operation, idempotencyKey, entityType, internalId = null, request, handler, stillValid }) {
  const tenantId = auth.tenantId;
  const correlationId = randomUUID();
  const existing = await prisma.integrationOperation.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } });
  if (existing?.status === 'SUCCEEDED' && (!stillValid || (await stillValid(existing)))) {
    return { operation: presentOperation(existing), result: existing.result, replayed: true };
  }
  if (existing?.status === 'PENDING' && Date.now() - existing.updatedAt.getTime() < IN_PROGRESS_WINDOW_MS) {
    throw conflict('This Moodle operation is already in progress. Wait a moment and refresh.');
  }

  let op = existing
    ? await prisma.integrationOperation.update({
        where: { id: existing.id },
        data: { status: 'PENDING', attempts: { increment: 1 }, correlationId, errorKind: null, errorMessage: null, completedAt: null },
      })
    : await prisma.integrationOperation.create({
        data: { tenantId, integrationId: integration.id, operation, idempotencyKey, status: 'PENDING', entityType, internalId, request, attempts: 1, correlationId, triggeredByUserId: auth.userId ?? null },
      });

  try {
    const outcome = await handler({ op, correlationId, isRetry: op.attempts > 1 });
    // A multi-step handler reports `partial` when some steps failed: recorded as PARTIAL
    // (retryable), never as SUCCEEDED.
    op = await prisma.integrationOperation.update({
      where: { id: op.id },
      data: {
        status: outcome.partial ? 'PARTIAL' : 'SUCCEEDED',
        externalId: outcome.externalId != null ? String(outcome.externalId) : op.externalId,
        result: outcome.result ?? null,
        errorKind: outcome.partial ? 'PARTIAL' : null,
        errorMessage: outcome.partial ? String(outcome.errorMessage ?? 'Some steps did not complete.').slice(0, 500) : null,
        completedAt: new Date(),
      },
    });
    logger.info('Moodle operation succeeded', { operation, operationId: op.id, correlationId });
    return { operation: presentOperation(op), result: outcome.result ?? null, replayed: false, partial: Boolean(outcome.partial) };
  } catch (error) {
    const kind = error.details?.kind ?? error.code ?? 'ERROR';
    // A nested operation (e.g. provisioning inside onboarding) passes its own uncertain
    // outcome up through details.operationStatus.
    const uncertain = error.details?.reconcile || error.details?.operationStatus === 'NEEDS_RECONCILIATION';
    const status = uncertain ? 'NEEDS_RECONCILIATION' : BLOCKING_KINDS.has(kind) ? 'BLOCKED' : 'FAILED';
    op = await prisma.integrationOperation.update({
      where: { id: op.id },
      data: {
        status,
        errorKind: String(kind).slice(0, 60),
        errorMessage: String(error.message).slice(0, 500),
        externalId: error.details?.externalId != null ? String(error.details.externalId) : op.externalId,
        completedAt: new Date(),
      },
    });
    logger.warn('Moodle operation did not complete', { operation, operationId: op.id, correlationId, status, kind });
    if (error instanceof AppError) {
      error.details = { ...(error.details ?? {}), operationId: op.id, operationStatus: status, correlationId };
      delete error.details.reconcile;
    }
    throw error;
  }
}

/* --------------------------------------------------------------- identities */

async function identityLink(tenantId, entityType, internalId) {
  return prisma.externalIdentity.findUnique({
    where: { tenantId_provider_entityType_exclusiveInternalId: { tenantId, provider: PROVIDER, entityType, exclusiveInternalId: internalId } },
  });
}

const studentLink = (tenantId, studentProfileId) => identityLink(tenantId, STUDENT, studentProfileId);

/**
 * One person, one Moodle account. When the same EduNexusAI user holds a student AND a faculty
 * profile (a faculty member who is also a student), the Moodle account already linked to one
 * profile is the person's account for the other too. Returns that other profile's Moodle link,
 * or null. Both profiles belong to the same verified EduNexusAI account, so no email or ID
 * matching is involved, and no second Moodle account is ever created for the person.
 */
async function samePersonLink(tenantId, userId, entityType) {
  if (!userId) return null;
  const other = entityType === STUDENT
    ? await prisma.facultyProfile.findFirst({ where: { tenantId, userId }, select: { id: true } })
    : await prisma.studentProfile.findFirst({ where: { tenantId, userId }, select: { id: true } });
  if (!other) return null;
  return identityLink(tenantId, entityType === STUDENT ? FACULTY : STUDENT, other.id);
}

/** Is this person's student Moodle account also their teaching account? */
export async function isSharedWithFaculty(tenantId, userId, moodleUserId) {
  const faculty = await prisma.facultyProfile.findFirst({ where: { tenantId, userId }, select: { id: true } });
  if (!faculty) return false;
  const link = await identityLink(tenantId, FACULTY, faculty.id);
  return Boolean(link && Number(link.externalId) === Number(moodleUserId));
}

/**
 * A student view of a Moodle account that the same person also uses to teach must not list the
 * courses they teach. Only applies when the two profiles share one Moodle account; otherwise the
 * course list is returned unchanged.
 */
async function withoutTaughtCourses(auth, connector, link, remote) {
  if (!auth.facultyProfileId) return remote;
  const facultyLink = await identityLink(auth.tenantId, FACULTY, auth.facultyProfileId);
  if (!facultyLink || facultyLink.externalId !== link.externalId) return remote;
  const kept = [];
  for (const course of remote) {
    const me = (await connector.getEnrolledUsers(course.id)).find((u) => Number(u.id) === Number(link.externalId));
    const roles = (me?.roles ?? []).map((r) => r.shortname);
    if (!roles.some((r) => TEACHING_ROLES.has(r)) || roles.includes('student')) kept.push(course);
  }
  return kept;
}

async function loadFaculty(tenantId, facultyProfileId) {
  const faculty = await prisma.facultyProfile.findFirst({
    where: { id: facultyProfileId, tenantId },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } } },
  });
  if (!faculty) throw notFound('Faculty member not found.');
  return faculty;
}

async function courseLinks(tenantId) {
  return prisma.externalIdentity.findMany({ where: { tenantId, provider: PROVIDER, entityType: COURSE } });
}

async function loadStudent(tenantId, studentProfileId) {
  const student = await prisma.studentProfile.findFirst({
    where: { id: studentProfileId, tenantId },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } } },
  });
  if (!student) throw notFound('Student not found.');
  return student;
}

async function loadLocalCourse(tenantId, courseId) {
  const course = await prisma.course.findFirst({ where: { id: courseId, tenantId }, select: { id: true, code: true, name: true } });
  if (!course) throw notFound('Course not found.');
  return course;
}

/** Persist a one-to-one link; database uniqueness turns races into a clear conflict. */
async function saveLink(client, { tenantId, entityType, internalId, externalId, linkMethod, actorUserId, status = 'ACTIVE' }) {
  try {
    return await client.externalIdentity.create({
      data: {
        tenantId,
        provider: PROVIDER,
        entityType,
        internalId,
        exclusiveInternalId: internalId,
        externalId: String(externalId),
        linkMethod,
        linkedByUserId: actorUserId ?? null,
        verifiedAt: new Date(),
        status,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw conflict(
        entityType === COURSE || entityType === SEED_COURSE
          ? 'That Moodle course or this EduNexusAI course is already linked to a different record. Unlink it first.'
          : 'That Moodle account or this person is already linked to a different record. Unlink it first.',
      );
    }
    throw error;
  }
}

const sameEmail = (a, b) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** Moodle usernames are lowercase; letters, digits and . _ - @ are always allowed. */
export const moodleUsernameFor = (student) => String(student.studentNumber).trim().toLowerCase().replace(/[^a-z0-9._@-]/g, '-');

/** Unrecoverable password satisfying Moodle's default policy. Never stored, logged or returned. */
const throwawayPassword = () => `${randomBytes(18).toString('base64url')}aA1!`;

/**
 * Find the Moodle account for an identity { username, email, idnumber }, if one exists.
 * Returns { user, method }, null when nothing matches, or throws a conflict when the
 * evidence disagrees (e.g. the username is taken by someone with another email).
 * Matching is never by name.
 */
export async function findMoodleAccount(connector, { username, email, idnumber }) {
  const byIdNumber = await connector.getUsersByField('idnumber', [idnumber]);
  const byEmail = await connector.getUsersByField('email', [email]);
  const byUsername = await connector.getUsersByField('username', [username]);

  const candidates = new Map();
  for (const user of [...byIdNumber, ...byEmail, ...byUsername]) candidates.set(Number(user.id), user);
  const consistent = [...candidates.values()].filter((user) => sameEmail(user.email, email) && (!user.idnumber || user.idnumber === idnumber));

  if (consistent.length === 1) {
    const user = consistent[0];
    return { user, method: user.idnumber === idnumber ? 'IDNUMBER_MATCH' : 'VERIFIED_EMAIL' };
  }
  if (consistent.length > 1) {
    throw conflict('More than one Moodle account matches this email. Resolve the duplicate in Moodle, then link the correct account.');
  }
  if (candidates.size) {
    throw conflict('A Moodle account already uses this ID number, email or username but belongs to someone else. Nothing was created; review the account in Moodle.');
  }
  return null;
}

const studentIdentity = (student) => ({
  username: moodleUsernameFor(student),
  email: student.user.email,
  idnumber: student.studentNumber,
  firstname: student.preferredName || student.user.firstName,
  lastname: student.user.lastName,
});

const findMoodleAccountFor = (connector, student) => findMoodleAccount(connector, studentIdentity(student));

/**
 * Check one specific Moodle account against a local identity (explicit admin link).
 * The ID number is the stable identifier: a match there is accepted even if the email
 * has since changed; an ID number set to something else is a conflict; with no ID
 * number in Moodle, the email must match exactly (case and whitespace normalised).
 */
export function verifyCandidate(user, { email, idnumber }) {
  if (user.idnumber && user.idnumber !== idnumber) return { ok: false, reason: 'ID_NUMBER_CONFLICT' };
  if (user.idnumber && user.idnumber === idnumber) return { ok: true, method: 'IDNUMBER_MATCH', emailDiffers: !sameEmail(user.email, email) };
  if (sameEmail(user.email, email)) return { ok: true, method: 'VERIFIED_EMAIL', emailDiffers: false };
  return { ok: false, reason: 'NO_MATCHING_IDENTIFIER' };
}

/** Moodle's default password policy (used by the development seed's demo password check). */
export const meetsPasswordPolicy = (p) => typeof p === 'string' && p.length >= 8 && /\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[^A-Za-z0-9]/.test(p);

/**
 * Read-only: is there already a Moodle account for this person, and is it linked locally?
 * Used by the onboarding preview; never writes. States: FOUND, NOT_FOUND, CONFLICT,
 * NOT_CONFIGURED, FUNCTION_NOT_ENABLED, UNAVAILABLE.
 */
export async function lookupMoodleAccount(tenantId, { username, email, idnumber }) {
  const config = moodleConfig();
  if (!config.valid) return { state: 'NOT_CONFIGURED', writesEnabled: false, message: config.problems.join(' ') };
  try {
    const { connector } = await connect(tenantId);
    if (!(await connector.has('core_user_get_users_by_field'))) return { state: 'FUNCTION_NOT_ENABLED', writesEnabled: config.writesEnabled, message: 'core_user_get_users_by_field is not enabled for the Moodle web service.' };
    const found = await findMoodleAccount(connector, { username, email, idnumber });
    if (!found) return { state: 'NOT_FOUND', writesEnabled: config.writesEnabled, proposed: { username, idnumber }, loginUrl: moodleLoginUrl() };
    const link = await prisma.externalIdentity.findFirst({ where: { tenantId, provider: PROVIDER, entityType: { in: [STUDENT, FACULTY] }, externalId: String(found.user.id) } });
    return {
      state: 'FOUND',
      writesEnabled: config.writesEnabled,
      account: { moodleUserId: Number(found.user.id), username: found.user.username, idnumber: found.user.idnumber || null, email: found.user.email, suspended: Boolean(Number(found.user.suspended)), auth: found.user.auth ?? null, matchedBy: found.method },
      linkedTo: link ? { entityType: link.entityType, profileId: link.internalId } : null,
      loginUrl: moodleLoginUrl(),
    };
  } catch (error) {
    if (error.code === 'CONFLICT') return { state: 'CONFLICT', writesEnabled: config.writesEnabled, message: error.message };
    return { state: 'UNAVAILABLE', writesEnabled: config.writesEnabled, message: error.message };
  }
}

/** Read-only: one Moodle account by id (username, ID number, email, suspended), or null. */
export async function moodleAccountById(tenantId, moodleUserId) {
  const { connector } = await connect(tenantId);
  const [user] = await connector.getUsersByField('id', [moodleUserId]);
  return user ? { moodleUserId: Number(user.id), username: user.username, idnumber: user.idnumber || null, email: user.email ?? null, suspended: Boolean(Number(user.suspended)), auth: user.auth ?? null } : null;
}

/** Read-only: Moodle's courses as { moodleCourseId, shortName, fullName, idNumber, visible, url }. */
export async function remoteCourses(tenantId) {
  const { connector } = await connect(tenantId);
  return (await connector.listCourses()).filter((c) => !isSiteCourse(c)).map((c) => mapCourse(c, connector.baseUrl));
}

/** Read-only: ids of the Moodle courses where this Moodle user holds an active enrolment. */
export async function activeCourseIdsOf(tenantId, moodleUserId) {
  const { connector } = await connect(tenantId);
  return new Set((await connector.getUserCourses(moodleUserId)).map((c) => Number(c.id)));
}

/** Read-only: the role short names a Moodle user holds in one course ([] when not a participant). */
export async function courseRolesOf(tenantId, moodleCourseId, moodleUserId) {
  const { connector } = await connect(tenantId);
  if (!(await connector.has('core_enrol_get_enrolled_users'))) return null;
  const participant = (await connector.getEnrolledUsers(moodleCourseId)).find((u) => Number(u.id) === Number(moodleUserId));
  return (participant?.roles ?? []).map((r) => r.shortname);
}

/** Throws 404 when Moodle has no such course. */
export async function assertMoodleCourse(tenantId, moodleCourseId) {
  const { connector } = await connect(tenantId);
  return mapCourse(await requireRemoteCourse(connector, moodleCourseId), connector.baseUrl);
}

/** The Moodle link of one local profile, or null. */
export const moodleLinkOf = (tenantId, entityType, profileId) => identityLink(tenantId, entityType, profileId);

/* ------------------------------------------------------------------- status */

export async function getStatus(tenantId) {
  const config = moodleConfig();
  const integration = await moodleIntegration(tenantId);
  let site = null;
  let error = null;
  if (integration) {
    try {
      const { connector } = await connect(tenantId);
      site = await connector.siteInfo();
    } catch (caught) {
      error = errorSummary(caught);
    }
  }
  const [linkedStudents, linkedCourses, operations] = await Promise.all([
    prisma.externalIdentity.count({ where: { tenantId, provider: PROVIDER, entityType: STUDENT } }),
    prisma.externalIdentity.count({ where: { tenantId, provider: PROVIDER, entityType: COURSE } }),
    prisma.integrationOperation.groupBy({ by: ['status'], where: { tenantId, integration: { provider: PROVIDER } }, _count: true }),
  ]);
  const warnings = [];
  if (site?.tokenUserIsSiteAdmin) warnings.push('The Moodle token belongs to a site administrator. Least privilege: issue it to a dedicated integration user.');
  if (!config.writesEnabled) warnings.push('Changes to Moodle are switched off (MOODLE_WRITES_ENABLED=false). Read-only features still work.');
  if (!config.studentRoleId) warnings.push('MOODLE_STUDENT_ROLE_ID is not set, so enrolment is unavailable.');

  return {
    integration: integration ? presentIntegration(integration) : null,
    configuration: {
      baseUrl: config.baseUrl || null,
      tokenConfigured: config.tokenConfigured,
      writesEnabled: config.writesEnabled,
      allowCourseDelete: config.allowCourseDelete,
      studentRoleId: config.studentRoleId,
      teacherRoleId: config.teacherRoleId,
      siteUserQuota: config.siteUserQuota,
      defaultCategoryId: config.defaultCategoryId,
      problems: config.problems,
    },
    site: site
      ? { siteName: site.siteName, release: site.release, tokenUsername: site.tokenUsername, tokenUserIsSiteAdmin: site.tokenUserIsSiteAdmin, enabledFunctions: [...site.functions].sort() }
      : null,
    error,
    checklist: capabilityChecklist(site?.functions ?? []),
    warnings,
    counts: {
      linkedStudents,
      linkedCourses,
      operations: Object.fromEntries(operations.map((row) => [row.status, row._count])),
    },
  };
}

/* ------------------------------------------------------------- admin: users */

export async function listStudents(tenantId, { search } = {}) {
  const q = search?.trim();
  const students = await prisma.studentProfile.findMany({
    where: {
      tenantId,
      ...(q
        ? { OR: [{ studentNumber: { contains: q, mode: 'insensitive' } }, { user: { email: { contains: q, mode: 'insensitive' } } }, { user: { lastName: { contains: q, mode: 'insensitive' } } }, { user: { firstName: { contains: q, mode: 'insensitive' } } }] }
        : {}),
    },
    include: { user: { select: { email: true, firstName: true, lastName: true, status: true } } },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    take: 200,
  });
  const ids = students.map((s) => s.id);
  const [links, ops] = await Promise.all([
    prisma.externalIdentity.findMany({ where: { tenantId, provider: PROVIDER, entityType: STUDENT, internalId: { in: ids } } }),
    prisma.integrationOperation.findMany({ where: { tenantId, entityType: STUDENT, internalId: { in: ids } }, orderBy: { updatedAt: 'desc' } }),
  ]);
  const linkOf = new Map(links.map((l) => [l.internalId, l]));
  const lastOp = new Map();
  for (const op of ops) if (!lastOp.has(op.internalId)) lastOp.set(op.internalId, op);
  return students.map((s) => {
    const link = linkOf.get(s.id);
    return {
      studentProfileId: s.id,
      studentNumber: s.studentNumber,
      name: `${s.user.firstName} ${s.user.lastName}`,
      email: s.user.email,
      accountStatus: s.user.status,
      moodle: link ? { moodleUserId: Number(link.externalId), status: link.status, linkMethod: link.linkMethod, linkedAt: link.createdAt } : null,
      lastOperation: presentOperation(lastOp.get(s.id)),
    };
  });
}

/** Link an existing Moodle account after verifying it belongs to this student. */
export async function linkStudent(auth, studentProfileId, { moodleUserId } = {}) {
  const student = await loadStudent(auth.tenantId, studentProfileId);
  if (await studentLink(auth.tenantId, student.id)) throw conflict('This student is already linked to a Moodle account. Unlink it first.');
  const { connector } = await connect(auth.tenantId);

  // A person who teaches already has their Moodle account; the student profile uses the same one.
  const shared = await samePersonLink(auth.tenantId, student.user.id, STUDENT);
  if (shared && moodleUserId && Number(moodleUserId) !== Number(shared.externalId)) {
    throw conflict(`This person already uses Moodle account ${shared.externalId} through their faculty profile. Link the student profile to that account; one person never gets two Moodle accounts.`);
  }
  if (shared) moodleUserId = shared.externalId;

  let match;
  if (shared) {
    const [user] = await connector.getUsersByField('id', [shared.externalId]);
    if (!user) throw notFound(`Moodle has no user with id ${shared.externalId}.`);
    match = { user, method: 'SAME_PERSON' };
  } else if (moodleUserId) {
    const [user] = await connector.getUsersByField('id', [moodleUserId]);
    if (!user) throw notFound(`Moodle has no user with id ${moodleUserId}.`);
    if (Number(user.id) === Number((await connector.siteInfo()).tokenUserId) || user.auth === 'moodlecloud') throw conflict('That is a site administration account and cannot be linked to a student.');
    const verdict = verifyCandidate(user, { email: student.user.email, idnumber: student.studentNumber });
    if (!verdict.ok) {
      throw conflict(
        verdict.reason === 'ID_NUMBER_CONFLICT'
          ? 'That Moodle account carries a different ID number, so it belongs to someone else. It was not linked.'
          : 'That Moodle account does not match this student’s email or ID number, so it was not linked.',
      );
    }
    match = { user, method: verdict.method };
  } else {
    match = await findMoodleAccountFor(connector, student);
    if (!match) throw notFound('No Moodle account matches this student’s email or ID number. Provision one instead.');
  }
  await assertNotOtherPerson(auth.tenantId, match.user.id, student.user.id);

  const link = await saveLink(prisma, {
    tenantId: auth.tenantId,
    entityType: STUDENT,
    internalId: student.id,
    externalId: match.user.id,
    linkMethod: match.method,
    actorUserId: auth.userId,
    status: Number(match.user.suspended) ? 'SUSPENDED' : 'ACTIVE',
  });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_ACCOUNT_LINKED', entityType: 'StudentProfile', entityId: student.id, summary: `Linked ${student.studentNumber} to Moodle user ${match.user.id}` });
  return { moodleUserId: Number(link.externalId), linkMethod: link.linkMethod, status: link.status, account: mapUser(match.user) };
}

/** Removes only the EduNexusAI link. The Moodle account and its history are untouched. */
/**
 * One Moodle account belongs to one person. A Moodle user already linked to ANOTHER EduNexusAI account (as student
 * or faculty) is refused; the same person's other profile (SAME_PERSON) is fine.
 */
async function assertNotOtherPerson(tenantId, moodleUserId, userId) {
  const links = await prisma.externalIdentity.findMany({ where: { tenantId, provider: PROVIDER, entityType: { in: [STUDENT, FACULTY] }, externalId: String(moodleUserId) } });
  for (const link of links) {
    const owner = link.entityType === STUDENT
      ? await prisma.studentProfile.findUnique({ where: { id: link.internalId }, select: { userId: true, user: { select: { email: true } } } })
      : await prisma.facultyProfile.findUnique({ where: { id: link.internalId }, select: { userId: true, user: { select: { email: true } } } });
    if (owner && owner.userId !== userId) throw conflict(`Moodle account ${moodleUserId} is already linked to ${owner.user?.email ?? 'another person'}. One Moodle account belongs to one person; unlink it there first if it was linked by mistake.`);
  }
}

const facultyIdentity = (faculty) => ({
  username: String(faculty.employeeNumber).toLowerCase().replace(/[^a-z0-9._@-]/g, '-'),
  email: faculty.user.email,
  idnumber: faculty.employeeNumber,
  firstname: faculty.user.firstName,
  lastname: faculty.user.lastName,
});

/**
 * Link an existing Moodle account to a faculty profile (explicit administrator action), with the same evidence
 * rules as linkStudent: the person's other profile's account (SAME_PERSON), an explicit account checked against
 * the employee number / email (verifyCandidate), or the one account matching ID number + email (findMoodleAccount).
 */
export async function linkFaculty(auth, facultyProfileId, { moodleUserId } = {}) {
  const faculty = await loadFaculty(auth.tenantId, facultyProfileId);
  if (await identityLink(auth.tenantId, FACULTY, faculty.id)) throw conflict('This faculty member is already linked to a Moodle account. Unlink it first.');
  const { connector } = await connect(auth.tenantId);
  const shared = await samePersonLink(auth.tenantId, faculty.user.id, FACULTY);
  if (shared && moodleUserId && Number(moodleUserId) !== Number(shared.externalId)) {
    throw conflict(`This person already uses Moodle account ${shared.externalId} through their student profile. Link the faculty profile to that account; one person never gets two Moodle accounts.`);
  }
  let match;
  if (shared) {
    const [user] = await connector.getUsersByField('id', [shared.externalId]);
    if (!user) throw notFound(`Moodle has no user with id ${shared.externalId}.`);
    match = { user, method: 'SAME_PERSON' };
  } else if (moodleUserId) {
    const [user] = await connector.getUsersByField('id', [moodleUserId]);
    if (!user) throw notFound(`Moodle has no user with id ${moodleUserId}.`);
    if (Number(user.id) === Number((await connector.siteInfo()).tokenUserId) || user.auth === 'moodlecloud') throw conflict('That is a site administration account and cannot be linked to a person.');
    const verdict = verifyCandidate(user, { email: faculty.user.email, idnumber: faculty.employeeNumber });
    if (!verdict.ok) {
      throw conflict(verdict.reason === 'ID_NUMBER_CONFLICT'
        ? 'That Moodle account carries a different ID number, so it belongs to someone else. It was not linked.'
        : 'That Moodle account does not match this faculty member’s email or employee number, so it was not linked.');
    }
    match = { user, method: verdict.method };
  } else {
    match = await findMoodleAccount(connector, facultyIdentity(faculty));
    if (!match) throw notFound('No Moodle account matches this faculty member’s email or employee number. Create one instead.');
  }
  await assertNotOtherPerson(auth.tenantId, match.user.id, faculty.user.id);
  const link = await saveLink(prisma, { tenantId: auth.tenantId, entityType: FACULTY, internalId: faculty.id, externalId: match.user.id, linkMethod: match.method, actorUserId: auth.userId, status: Number(match.user.suspended) ? 'SUSPENDED' : 'ACTIVE' });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_ACCOUNT_LINKED', entityType: 'FacultyProfile', entityId: faculty.id, summary: `Linked ${faculty.employeeNumber} to Moodle user ${match.user.id}` });
  return { moodleUserId: Number(link.externalId), linkMethod: link.linkMethod, status: link.status, account: mapUser(match.user) };
}

/** Removes only the EduNexusAI link. The Moodle account, its enrolments and history are untouched. */
export async function unlinkFaculty(auth, facultyProfileId) {
  const faculty = await loadFaculty(auth.tenantId, facultyProfileId);
  const link = await identityLink(auth.tenantId, FACULTY, faculty.id);
  if (!link) throw notFound('This faculty member is not linked to a Moodle account.');
  await prisma.externalIdentity.delete({ where: { id: link.id } });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_ACCOUNT_UNLINKED', entityType: 'FacultyProfile', entityId: faculty.id, summary: `Unlinked ${faculty.employeeNumber} from Moodle user ${link.externalId}` });
  return { unlinked: true, moodleUserId: Number(link.externalId) };
}

/**
 * Read-only, for the Systems view: one profile's Moodle state.
 *   LINKED / SUSPENDED          the link, the live account and its courses
 *   NOT_LINKED + candidate      FOUND (an account matches the institutional ID / email: link it),
 *                               NOT_FOUND (create one), CONFLICT (evidence disagrees: an administrator decides)
 *   PROVISIONING_FAILED         not linked, and the last account operation for this profile did not complete
 */
export async function profileMoodleState(tenantId, entityType, profileId) {
  const profile = entityType === STUDENT ? await loadStudent(tenantId, profileId) : await loadFaculty(tenantId, profileId);
  const identity = entityType === STUDENT ? studentIdentity(profile) : facultyIdentity(profile);
  const matchedOn = { institutionalId: identity.idnumber, email: identity.email, username: identity.username };
  const lastOperation = await prisma.integrationOperation.findFirst({
    where: { tenantId, internalId: profileId, operation: { in: ['USER.PROVISION', 'USER.PROVISION_FACULTY'] } },
    orderBy: { updatedAt: 'desc' },
    select: { status: true, errorMessage: true, updatedAt: true, completedAt: true },
  });
  const link = await identityLink(tenantId, entityType, profileId);
  if (!link) {
    const candidate = await lookupMoodleAccount(tenantId, identity);
    const failed = lastOperation && ['FAILED', 'BLOCKED', 'NEEDS_RECONCILIATION', 'PARTIAL'].includes(lastOperation.status);
    return { state: failed ? 'PROVISIONING_FAILED' : 'NOT_LINKED', matchedOn, candidate, lastOperation: lastOperation ?? null };
  }
  const out = { state: link.status === 'SUSPENDED' ? 'SUSPENDED' : 'LINKED', matchedOn, moodleUserId: Number(link.externalId), linkMethod: link.linkMethod, linkedAt: link.createdAt, lastVerifiedAt: link.verifiedAt ?? link.updatedAt, lastOperation: lastOperation ?? null };
  try {
    const { connector } = await connect(tenantId);
    const [user] = await connector.getUsersByField('id', [Number(link.externalId)]);
    if (!user) return { ...out, accountMissing: true };
    out.account = mapUser(user);
    out.courses = (await connector.getUserCourses(Number(link.externalId))).map((c) => ({ moodleCourseId: Number(c.id), shortName: c.shortname, fullName: c.fullname, url: `${connector.baseUrl}/course/view.php?id=${c.id}` }));
    out.checkedAt = new Date().toISOString();
  } catch (error) {
    out.liveError = error.message;
  }
  return out;
}

export async function unlinkStudent(auth, studentProfileId) {
  const student = await loadStudent(auth.tenantId, studentProfileId);
  const link = await studentLink(auth.tenantId, student.id);
  if (!link) throw notFound('This student is not linked to a Moodle account.');
  await prisma.externalIdentity.delete({ where: { id: link.id } });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_ACCOUNT_UNLINKED', entityType: 'StudentProfile', entityId: student.id, summary: `Unlinked ${student.studentNumber} from Moodle user ${link.externalId}` });
  return { unlinked: true, moodleUserId: Number(link.externalId) };
}

/**
 * Create (or adopt) the Moodle account for an existing local identity (student or
 * faculty). Idempotent per identity: a second call returns the first result, and a
 * retry after an uncertain create finds the account by ID number/email/username before
 * considering a new one.
 *
 * `account` lets the development seed supply its own deterministic demo identifiers;
 * `password` (seed only) is passed to Moodle and never stored, logged or returned.
 */
/**
 * How a NEW Moodle account gets its first password. Linking an existing account never
 * changes its password (the person keeps using their own Moodle password).
 *   EMAIL     Moodle generates a password and emails it (Moodle forces a change at first login).
 *   ONE_TIME  EduNexusAI sets a random temporary password with Moodle's "force password change"
 *             flag, and returns it once to the administrator for hand-over. It is never stored,
 *             logged or persisted in the operation record, and cannot be retrieved again.
 *   NONE      a random password nobody knows; the person uses Moodle's "Forgotten password".
 * The EduNexusAI password is never used for Moodle: the two systems authenticate separately.
 */
export const MOODLE_CREDENTIALS = ['EMAIL', 'ONE_TIME', 'NONE'];
const FORCE_CHANGE = [{ type: 'auth_forcepasswordchange', value: '1' }];
const DELIVERY = { EMAIL: 'EMAILED_BY_MOODLE', ONE_TIME: 'ONE_TIME_HANDOFF', NONE: 'NONE_USE_FORGOTTEN_PASSWORD' };
const moodleLoginUrl = () => (moodleConfig().baseUrl ? `${moodleConfig().baseUrl}/login/index.php` : null);

async function provisionIdentity(auth, { entityType, internalId, personUserId = null, label, auditEntity, identity, account, password, sendWelcomeEmail = false, credentials }) {
  const { integration, connector } = await connect(auth.tenantId);
  const target = { ...identity, ...(account ?? {}) };
  const mode = password ? 'SEED' : credentials ?? (sendWelcomeEmail ? 'EMAIL' : 'NONE');
  // Held in memory for this request only: never part of `request`/`result`, which are persisted.
  let oneTimePassword = null;
  const outcome = await runOperation({
    auth,
    integration,
    operation: entityType === FACULTY ? 'USER.PROVISION_FACULTY' : 'USER.PROVISION',
    idempotencyKey: `${entityType === FACULTY ? 'USER.PROVISION_FACULTY' : 'USER.PROVISION'}:${internalId}`,
    entityType,
    internalId,
    request: {
      [entityType === FACULTY ? 'facultyProfileId' : 'studentProfileId']: internalId,
      sendWelcomeEmail: mode === 'EMAIL',
      // A retry never re-issues a one-time password (it could not be shown); it falls back to
      // NONE and the administrator issues a new one-time password afterwards.
      credentials: mode === 'SEED' ? 'NONE' : mode,
      // Non-secret identifiers only, so a retry recreates the same identity.
      ...(account ? { account: { username: target.username, email: target.email, idnumber: target.idnumber, firstname: target.firstname, lastname: target.lastname } } : {}),
    },
    // An earlier success only counts while the identity is still linked.
    stillValid: async () => Boolean(await identityLink(auth.tenantId, entityType, internalId)),
    handler: async () => {
      const existingLink = await identityLink(auth.tenantId, entityType, internalId);
      if (existingLink) return { externalId: existingLink.externalId, result: { action: 'ALREADY_LINKED', moodleUserId: Number(existingLink.externalId) } };

      // The same person already has a Moodle account through their other profile: use it.
      const shared = await samePersonLink(auth.tenantId, personUserId, entityType);
      if (shared) {
        await saveLink(prisma, { tenantId: auth.tenantId, entityType, internalId, externalId: shared.externalId, linkMethod: 'SAME_PERSON', actorUserId: auth.userId, status: shared.status });
        await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_ACCOUNT_LINKED', entityType: auditEntity, entityId: internalId, summary: `Linked ${label} to Moodle user ${shared.externalId}, the account this person already uses through their other profile` });
        return { externalId: shared.externalId, result: { action: 'LINKED_SAME_PERSON', moodleUserId: Number(shared.externalId), passwordDelivery: 'EXISTING_MOODLE_PASSWORD', loginUrl: moodleLoginUrl() } };
      }

      // Check every precondition before the first write.
      await connector.requireFunction('core_user_get_users_by_field');
      await connector.requireFunction('core_user_create_users');

      const found = await findMoodleAccount(connector, target);
      if (found) {
        if (personUserId) await assertNotOtherPerson(auth.tenantId, found.user.id, personUserId);
        await saveLink(prisma, { tenantId: auth.tenantId, entityType, internalId, externalId: found.user.id, linkMethod: found.method, actorUserId: auth.userId, status: Number(found.user.suspended) ? 'SUSPENDED' : 'ACTIVE' });
        return { externalId: found.user.id, result: { action: 'LINKED_EXISTING', moodleUserId: Number(found.user.id), username: found.user.username, passwordDelivery: 'EXISTING_MOODLE_PASSWORD', loginUrl: moodleLoginUrl() } };
      }

      // With MOODLE_ACCOUNT_AUTH=oauth2 the account signs in through the university sign-in: no Moodle password.
      const universitySignIn = moodleConfig().accountAuth === 'oauth2' && mode !== 'SEED';
      if (mode === 'ONE_TIME' && !universitySignIn) oneTimePassword = throwawayPassword();
      const created = await writeOnce(() =>
        connector.createUser({
          username: target.username,
          auth: universitySignIn ? 'oauth2' : 'manual',
          firstname: target.firstname,
          lastname: target.lastname,
          email: target.email,
          idnumber: target.idnumber,
          // See MOODLE_CREDENTIALS. None of these passwords is stored anywhere in EduNexusAI.
          ...(universitySignIn
            ? {}
            : mode === 'EMAIL'
              ? { createpassword: 1 }
              : mode === 'ONE_TIME'
                ? { password: oneTimePassword, preferences: FORCE_CHANGE }
                : { password: mode === 'SEED' ? password : throwawayPassword() }),
        }),
      );

      try {
        await saveLink(prisma, { tenantId: auth.tenantId, entityType, internalId, externalId: created.id, linkMethod: 'PROVISIONED', actorUserId: auth.userId });
      } catch (error) {
        throw moodleError(MoodleErrorKind.MOODLE_EXCEPTION, `Moodle account ${created.id} was created but the link could not be saved (${error.message}). Retry to link it; no second account will be created.`, {
          externalId: created.id,
          reconcile: true,
        });
      }
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_ACCOUNT_PROVISIONED', entityType: auditEntity, entityId: internalId, summary: `Created Moodle user ${created.id} for ${label}` });
      return {
        externalId: created.id,
        result: { action: 'CREATED', moodleUserId: created.id, username: created.username, passwordDelivery: universitySignIn ? 'UNIVERSITY_SIGN_IN' : mode === 'SEED' ? 'SET_BY_SEED' : DELIVERY[mode], loginUrl: moodleLoginUrl() },
      };
    },
  });
  // Only the run that actually created the account can hand over its one-time password.
  const created = outcome.result?.action === 'CREATED' && !outcome.replayed;
  return created && oneTimePassword ? { ...outcome, oneTimeCredential: { username: outcome.result.username, password: oneTimePassword, loginUrl: moodleLoginUrl(), mustChange: true } } : outcome;
}

export async function provisionStudent(auth, studentProfileId, { sendWelcomeEmail = false, account, password, credentials } = {}) {
  const student = await loadStudent(auth.tenantId, studentProfileId);
  return provisionIdentity(auth, {
    entityType: STUDENT,
    internalId: student.id,
    personUserId: student.user.id,
    label: student.studentNumber,
    auditEntity: 'StudentProfile',
    identity: studentIdentity(student),
    account,
    password,
    sendWelcomeEmail,
    credentials,
  });
}

/**
 * Moodle account for an existing EduNexusAI faculty member. The account is an ordinary
 * (manual) user: teaching rights come only from course-level role assignments, never
 * from a site-level role.
 */
export async function provisionFaculty(auth, facultyProfileId, { account, password, credentials } = {}) {
  const faculty = await loadFaculty(auth.tenantId, facultyProfileId);
  return provisionIdentity(auth, {
    entityType: FACULTY,
    internalId: faculty.id,
    personUserId: faculty.user.id,
    label: faculty.employeeNumber,
    auditEntity: 'FacultyProfile',
    identity: facultyIdentity(faculty),
    account,
    password,
    credentials,
  });
}

/**
 * Issue a new one-time Moodle password for a linked account (forgotten or never-delivered
 * password, e.g. on a site whose mail cannot reach the person). Moodle forces a change at
 * the next login. The password is returned once to the administrator and never stored or
 * logged; the operation record holds only the fact that a reset happened.
 */
export async function issueOneTimeMoodlePassword(auth, { entityType, internalId }) {
  if (![STUDENT, FACULTY].includes(entityType)) throw badRequest('Unknown account type.');
  const link = await identityLink(auth.tenantId, entityType, internalId);
  if (!link) throw badRequest('This person has no linked Moodle account.');
  if (link.status === 'SUSPENDED') throw conflict('This Moodle account is suspended. Reactivate it first.');
  const { integration, connector } = await connect(auth.tenantId);
  const moodleUserId = Number(link.externalId);
  const password = throwawayPassword();
  let username = null;
  const outcome = await runOperation({
    auth,
    integration,
    operation: 'USER.PASSWORD_RESET',
    idempotencyKey: `USER.PASSWORD_RESET:${internalId}:${randomUUID()}`,
    entityType,
    internalId,
    request: { [entityType === FACULTY ? 'facultyProfileId' : 'studentProfileId']: internalId, moodleUserId },
    handler: async () => {
      await connector.requireFunction('core_user_update_users');
      const [account] = await connector.getUsersByField('id', [moodleUserId]);
      if (!account) throw notFound(`Moodle user ${moodleUserId} no longer exists. Unlink it and provision again.`);
      if (account.auth && account.auth !== 'manual') throw conflict(`This Moodle account signs in through "${account.auth}", so Moodle does not hold a password for it.`);
      username = account.username;
      await writeOnce(() => connector.updateUser({ id: moodleUserId, password, preferences: FORCE_CHANGE }));
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_PASSWORD_RESET', entityType: entityType === FACULTY ? 'FacultyProfile' : 'StudentProfile', entityId: internalId, summary: `Issued a one-time Moodle password for Moodle user ${moodleUserId} (change forced at next login)` });
      return { externalId: moodleUserId, result: { moodleUserId, username, passwordDelivery: 'ONE_TIME_HANDOFF' } };
    },
  });
  return { operation: outcome.operation, oneTimeCredential: { username, password, loginUrl: moodleLoginUrl(), mustChange: true } };
}

/**
 * Suspend or reactivate the Moodle account. Policy: enrolments are left in place, so
 * course history, submissions and grades survive and reactivation restores access.
 */
export async function setStudentSuspended(auth, studentProfileId, { suspended }, { retryOf } = {}) {
  const student = await loadStudent(auth.tenantId, studentProfileId);
  const link = await studentLink(auth.tenantId, student.id);
  if (!link) throw badRequest('This student has no linked Moodle account.');
  const shared = await samePersonLink(auth.tenantId, student.user.id, STUDENT);
  if (shared && shared.externalId === link.externalId) {
    throw conflict('This Moodle account is also this person’s teaching account. Suspending it would end their teaching access too; end their student course enrolments instead.');
  }
  const { integration, connector } = await connect(auth.tenantId);
  const operation = suspended ? 'USER.SUSPEND' : 'USER.REACTIVATE';
  return runOperation({
    auth,
    integration,
    operation,
    idempotencyKey: retryOf ?? `${operation}:${student.id}:${randomUUID()}`,
    entityType: STUDENT,
    internalId: student.id,
    request: { studentProfileId: student.id, suspended: Boolean(suspended) },
    handler: async () => {
      await writeOnce(() => connector.updateUser({ id: Number(link.externalId), suspended: suspended ? 1 : 0 }));
      await prisma.externalIdentity.update({ where: { id: link.id }, data: { status: suspended ? 'SUSPENDED' : 'ACTIVE' } });
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: suspended ? 'MOODLE_ACCOUNT_SUSPENDED' : 'MOODLE_ACCOUNT_REACTIVATED', entityType: 'StudentProfile', entityId: student.id, summary: `${suspended ? 'Suspended' : 'Reactivated'} Moodle user ${link.externalId}` });
      return { externalId: link.externalId, result: { moodleUserId: Number(link.externalId), suspended: Boolean(suspended), enrolmentsPreserved: true } };
    },
  });
}

/* ----------------------------------------------------------- admin: courses */

/**
 * Admin course view: live Moodle courses with their canonical mapping status.
 *   LINKED         mapped to an existing EduNexusAI course
 *   UNLINKED       no mapping (a suggestion is offered when the Moodle ID number equals a
 *                  local course code that is still free)
 *   CONFLICTED     the Moodle ID number names a local course that is mapped to a
 *                  DIFFERENT Moodle course
 *   MISSING_LOCAL  mapped, but the EduNexusAI course no longer exists
 * plus `missing`: mappings whose Moodle course no longer exists in Moodle.
 */
export async function listCourses(tenantId) {
  const { connector } = await connect(tenantId);
  const [remote, links, localCourses] = await Promise.all([
    connector.listCourses(),
    courseLinks(tenantId),
    prisma.course.findMany({ where: { tenantId }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
  ]);
  const base = connector.baseUrl;
  const localById = new Map(localCourses.map((c) => [c.id, c]));
  const linkByMoodle = new Map(links.map((l) => [l.externalId, l]));
  const linkByLocal = new Map(links.map((l) => [l.internalId, l]));
  const remoteIds = new Set(remote.map((c) => String(c.id)));
  return {
    courses: remote.map((course) => {
      const dto = mapCourse(course, base);
      const link = linkByMoodle.get(String(course.id));
      const namesake = dto.idNumber ? localCourses.find((c) => c.code === dto.idNumber) : null;
      let mappingStatus = 'UNLINKED';
      let conflict = null;
      if (link) mappingStatus = localById.has(link.internalId) ? 'LINKED' : 'MISSING_LOCAL';
      else if (namesake && linkByLocal.has(namesake.id)) {
        mappingStatus = 'CONFLICTED';
        conflict = `${namesake.code} is already mapped to Moodle course ${linkByLocal.get(namesake.id).externalId}.`;
      }
      return {
        ...dto,
        mappingStatus,
        conflict,
        localCourse: link && localById.has(link.internalId) ? { ...localById.get(link.internalId), linkMethod: link.linkMethod } : null,
        suggestedLocalCourse: mappingStatus === 'UNLINKED' && namesake && !linkByLocal.has(namesake.id) ? namesake : null,
      };
    }),
    missing: links.filter((l) => !remoteIds.has(l.externalId)).map((l) => ({ moodleCourseId: Number(l.externalId), localCourse: localById.get(l.internalId) ?? null, mappingStatus: 'MISSING_IN_MOODLE' })),
    localCourses: localCourses.map((c) => ({ ...c, linked: linkByLocal.has(c.id) })),
  };
}

async function requireRemoteCourse(connector, moodleCourseId) {
  const [course] = await connector.listCourses({ ids: [moodleCourseId] });
  if (!course) throw notFound(`Moodle has no course with id ${moodleCourseId}.`);
  return course;
}

export async function linkCourse(auth, moodleCourseId, { courseId }) {
  const local = await loadLocalCourse(auth.tenantId, courseId);
  const { connector } = await connect(auth.tenantId);
  const remote = await requireRemoteCourse(connector, moodleCourseId);
  const link = await saveLink(prisma, {
    tenantId: auth.tenantId,
    entityType: COURSE,
    internalId: local.id,
    externalId: remote.id,
    linkMethod: remote.idnumber && remote.idnumber === local.code ? 'IDNUMBER_MATCH' : 'ADMIN_CONFIRMED',
    actorUserId: auth.userId,
  });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_COURSE_LINKED', entityType: 'Course', entityId: local.id, summary: `Linked ${local.code} to Moodle course ${remote.id}` });
  return { moodleCourseId: Number(link.externalId), courseId: local.id, linkMethod: link.linkMethod };
}

export async function unlinkCourse(auth, moodleCourseId) {
  const link = await prisma.externalIdentity.findUnique({
    where: { tenantId_provider_entityType_externalId: { tenantId: auth.tenantId, provider: PROVIDER, entityType: COURSE, externalId: String(moodleCourseId) } },
  });
  if (!link) throw notFound('This Moodle course is not linked.');
  await prisma.externalIdentity.delete({ where: { id: link.id } });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_COURSE_UNLINKED', entityType: 'Course', entityId: link.internalId, summary: `Unlinked Moodle course ${moodleCourseId}` });
  return { unlinked: true };
}

export async function listCategories(tenantId) {
  const { connector } = await connect(tenantId);
  return (await connector.getCategories()).map(mapCategory);
}

const toUnix = (iso) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined);

/**
 * Create a Moodle course shell (optionally linked to an EduNexusAI course).
 * Keyed by short name: Moodle requires it to be unique, which makes it the natural
 * idempotency key across retries.
 */
export async function createCourse(auth, input) {
  const config = moodleConfig();
  const categoryId = input.categoryId ?? config.defaultCategoryId;
  if (!categoryId) throw badRequest('Choose a Moodle category (or set MOODLE_DEFAULT_CATEGORY_ID).');
  const local = input.localCourseId ? await loadLocalCourse(auth.tenantId, input.localCourseId) : null;
  if (local && (await prisma.externalIdentity.findUnique({ where: { tenantId_provider_entityType_exclusiveInternalId: { tenantId: auth.tenantId, provider: PROVIDER, entityType: COURSE, exclusiveInternalId: local.id } } }))) {
    throw conflict(`${local.code} is already linked to a Moodle course.`);
  }
  const { integration, connector } = await connect(auth.tenantId);
  const shortName = input.shortName.trim();

  return runOperation({
    auth,
    integration,
    operation: 'COURSE.CREATE',
    idempotencyKey: `COURSE.CREATE:${shortName.toLowerCase()}`,
    entityType: COURSE,
    internalId: local?.id ?? null,
    request: { ...input, shortName, categoryId },
    handler: async ({ isRetry }) => {
      await connector.requireFunction('core_course_get_categories');
      await connector.requireFunction('core_course_create_courses');

      const categories = await connector.getCategories();
      if (!categories.some((c) => Number(c.id) === Number(categoryId))) throw badRequest(`Moodle has no course category with id ${categoryId}.`);

      const existing = (await connector.listCourses()).find(
        (c) => c.shortname?.toLowerCase() === shortName.toLowerCase() || (input.idNumber && c.idnumber === input.idNumber),
      );
      let moodleCourseId;
      let action;
      if (existing) {
        // Adopt only what this operation may itself have created on an earlier attempt.
        const ours = isRetry && existing.shortname?.toLowerCase() === shortName.toLowerCase() && existing.fullname === input.fullName;
        if (!ours) {
          throw new AppError(409, ErrorCode.CONFLICT, `A Moodle course with this short name or ID number already exists (id ${existing.id}). Link it instead of creating a new one.`, { moodleCourseId: Number(existing.id) });
        }
        moodleCourseId = Number(existing.id);
        action = 'ADOPTED_AFTER_RETRY';
      } else {
        const created = await writeOnce(() =>
          connector.createCourse({
            fullname: input.fullName,
            shortname: shortName,
            categoryid: categoryId,
            idnumber: input.idNumber || undefined,
            summary: input.summary || undefined,
            summaryformat: input.summary ? 2 : undefined, // FORMAT_PLAIN
            visible: input.visible === false ? 0 : 1,
            startdate: toUnix(input.startDate),
            enddate: toUnix(input.endDate),
          }),
        );
        moodleCourseId = created.id;
        action = 'CREATED';
      }

      if (local) {
        try {
          await saveLink(prisma, { tenantId: auth.tenantId, entityType: COURSE, internalId: local.id, externalId: moodleCourseId, linkMethod: 'PROVISIONED', actorUserId: auth.userId });
        } catch (error) {
          throw moodleError(MoodleErrorKind.MOODLE_EXCEPTION, `Moodle course ${moodleCourseId} exists but the link to ${local.code} could not be saved (${error.message}). Retry to link it.`, { externalId: moodleCourseId, reconcile: true });
        }
      }
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_COURSE_CREATED', entityType: 'Course', entityId: local?.id ?? null, summary: `Moodle course ${moodleCourseId} (${shortName}) ${action === 'CREATED' ? 'created' : 'adopted'}` });
      return { externalId: moodleCourseId, result: { action, moodleCourseId, shortName, courseUrl: courseUrl(connector.baseUrl, moodleCourseId), linkedCourseId: local?.id ?? null } };
    },
  });
}

export async function updateCourse(auth, moodleCourseId, input, { retryOf } = {}) {
  const { integration, connector } = await connect(auth.tenantId);
  await requireRemoteCourse(connector, moodleCourseId);
  const fields = {
    id: moodleCourseId,
    fullname: input.fullName,
    shortname: input.shortName,
    idnumber: input.idNumber,
    summary: input.summary,
    summaryformat: input.summary !== undefined ? 2 : undefined,
    categoryid: input.categoryId,
    startdate: toUnix(input.startDate),
    enddate: toUnix(input.endDate),
    visible: input.visible === undefined ? undefined : input.visible ? 1 : 0,
  };
  const operation = input.visible === false && Object.keys(input).length === 1 ? 'COURSE.HIDE' : input.visible === true && Object.keys(input).length === 1 ? 'COURSE.SHOW' : 'COURSE.UPDATE';
  return runOperation({
    auth,
    integration,
    operation,
    idempotencyKey: retryOf ?? `${operation}:${moodleCourseId}:${randomUUID()}`,
    entityType: COURSE,
    request: { moodleCourseId, ...input },
    handler: async () => {
      await writeOnce(() => connector.updateCourse(fields));
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: `MOODLE_${operation.replace('.', '_')}`, entityType: 'MoodleCourse', entityId: String(moodleCourseId), summary: `${operation} Moodle course ${moodleCourseId}` });
      const [after] = await connector.listCourses({ ids: [moodleCourseId] });
      return { externalId: moodleCourseId, result: after ? mapCourse(after, connector.baseUrl) : { moodleCourseId } };
    },
  });
}

/**
 * Irreversible. Disabled unless MOODLE_ALLOW_COURSE_DELETE=true, and the caller must type
 * the course's short name. Hiding the course is the normal lifecycle action.
 */
export async function deleteCourse(auth, moodleCourseId, { confirmShortName }) {
  if (!moodleConfig().allowCourseDelete) {
    throw forbidden('Deleting Moodle courses is disabled on this server. Hide the course instead, or set MOODLE_ALLOW_COURSE_DELETE=true deliberately.');
  }
  const { integration, connector } = await connect(auth.tenantId);
  const remote = await requireRemoteCourse(connector, moodleCourseId);
  if (!confirmShortName || confirmShortName !== remote.shortname) {
    throw badRequest('Type the course short name exactly to confirm permanent deletion.');
  }
  return runOperation({
    auth,
    integration,
    operation: 'COURSE.DELETE',
    idempotencyKey: `COURSE.DELETE:${moodleCourseId}`,
    entityType: COURSE,
    request: { moodleCourseId, shortName: remote.shortname },
    handler: async () => {
      await writeOnce(() => connector.deleteCourse(moodleCourseId));
      // The local link points at nothing now; the audit entry keeps the history.
      await prisma.externalIdentity.deleteMany({ where: { tenantId: auth.tenantId, provider: PROVIDER, entityType: COURSE, externalId: String(moodleCourseId) } });
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_COURSE_DELETED', entityType: 'MoodleCourse', entityId: String(moodleCourseId), summary: `Permanently deleted Moodle course ${moodleCourseId} (${remote.shortname})` });
      return { externalId: moodleCourseId, result: { deleted: true, moodleCourseId } };
    },
  });
}

/* ------------------------------------------------------- admin: enrolments */

export async function listEnrolments(tenantId, moodleCourseId) {
  const { connector } = await connect(tenantId);
  await requireRemoteCourse(connector, moodleCourseId);
  const links = await prisma.externalIdentity.findMany({ where: { tenantId, provider: PROVIDER, entityType: STUDENT } });
  const students = await prisma.studentProfile.findMany({
    where: { tenantId, id: { in: links.map((l) => l.internalId) } },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });
  const studentOf = new Map(links.map((l) => [l.externalId, students.find((s) => s.id === l.internalId)]));
  const local = (moodleUserId) => {
    const s = studentOf.get(String(moodleUserId));
    return s ? { studentProfileId: s.id, studentNumber: s.studentNumber, name: `${s.user.firstName} ${s.user.lastName}` } : null;
  };
  const facultyLinks = await prisma.externalIdentity.findMany({ where: { tenantId, provider: PROVIDER, entityType: FACULTY } });
  const faculty = await prisma.facultyProfile.findMany({
    where: { tenantId, id: { in: facultyLinks.map((l) => l.internalId) } },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const instructorOf = (moodleUserId) => {
    const link = facultyLinks.find((l) => l.externalId === String(moodleUserId));
    const f = link && faculty.find((x) => x.id === link.internalId);
    return f ? { facultyProfileId: f.id, employeeNumber: f.employeeNumber, name: `${f.user.firstName} ${f.user.lastName}` } : null;
  };

  if (await connector.has('core_enrol_get_enrolled_users')) {
    const users = await connector.getEnrolledUsers(moodleCourseId);
    return {
      source: 'MOODLE_PARTICIPANTS',
      participants: users.map((u) => ({
        moodleUserId: Number(u.id),
        fullName: u.fullname,
        email: u.email ?? null,
        roles: (u.roles ?? []).map((r) => ({ roleId: r.roleid, shortName: r.shortname })),
        student: local(u.id),
        instructor: instructorOf(u.id),
      })),
    };
  }
  // Fallback with only the enabled read functions: check each linked student.
  const participants = [];
  for (const link of links.slice(0, 100)) {
    const courses = await connector.getUserCourses(link.externalId);
    if (courses.some((c) => Number(c.id) === Number(moodleCourseId))) {
      participants.push({ moodleUserId: Number(link.externalId), fullName: null, email: null, roles: [], student: local(link.externalId) });
    }
  }
  return {
    source: 'LINKED_STUDENTS_ONLY',
    note: 'Only linked EduNexusAI students are shown. Enable core_enrol_get_enrolled_users to see every participant and their roles.',
    participants,
  };
}

async function enrolmentContext(auth, moodleCourseId, studentProfileId) {
  const student = await loadStudent(auth.tenantId, studentProfileId);
  const link = await studentLink(auth.tenantId, student.id);
  if (!link) throw badRequest('Link or provision this student’s Moodle account before enrolling them.');
  const { integration, connector } = await connect(auth.tenantId);
  await requireRemoteCourse(connector, moodleCourseId);
  const roleId = moodleConfig().studentRoleId;
  if (!roleId) {
    throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Set MOODLE_STUDENT_ROLE_ID to the id of the Student role in your Moodle site before enrolling.');
  }
  return { student, link, integration, connector, roleId, moodleUserId: Number(link.externalId) };
}

const ROLE_SETTINGS = {
  student: { configKey: 'studentRoleId', env: 'MOODLE_STUDENT_ROLE_ID', operation: 'ENROLMENT.ADD' },
  editingteacher: { configKey: 'teacherRoleId', env: 'MOODLE_TEACHER_ROLE_ID', operation: 'ENROLMENT.ADD_TEACHER' },
};

/**
 * Enrol a linked identity with one Moodle role (student or editingteacher). The role id
 * comes from configuration, never a default. If the person is already a participant
 * with that role nothing is sent; if they participate with a different role the call is
 * refused rather than silently adding a second role.
 */
async function enrolWithRole(auth, moodleCourseId, { entityType, internalId, label, auditEntity, roleShortName }, { retryOf } = {}) {
  const setting = ROLE_SETTINGS[roleShortName];
  const link = await identityLink(auth.tenantId, entityType, internalId);
  if (!link) throw badRequest('Link or provision this person’s Moodle account before enrolling them.');
  if (link.status === 'SUSPENDED') throw conflict('This Moodle account is suspended. Reactivate it first.');
  const { integration, connector } = await connect(auth.tenantId);
  await requireRemoteCourse(connector, moodleCourseId);
  const roleId = moodleConfig()[setting.configKey];
  if (!roleId) throw moodleError(MoodleErrorKind.NOT_CONFIGURED, `Set ${setting.env} to the id of the ${roleShortName} role in your Moodle site before enrolling.`);
  const moodleUserId = Number(link.externalId);
  const idKey = entityType === FACULTY ? 'facultyProfileId' : 'studentProfileId';

  return runOperation({
    auth,
    integration,
    operation: setting.operation,
    idempotencyKey: retryOf ?? `${setting.operation}:${moodleCourseId}:${internalId}:${randomUUID()}`,
    entityType,
    internalId,
    request: { moodleCourseId, [idKey]: internalId },
    handler: async () => {
      await connector.requireFunction('enrol_manual_enrol_users');
      if (await connector.has('core_enrol_get_enrolled_users')) {
        const participant = (await connector.getEnrolledUsers(moodleCourseId)).find((u) => Number(u.id) === moodleUserId);
        const roles = participant?.roles ?? [];
        if (roles.some((r) => Number(r.roleid) === roleId)) {
          return { externalId: moodleCourseId, result: { action: 'ALREADY_ENROLLED', moodleCourseId, moodleUserId, roleId } };
        }
        if (participant && roles.length) {
          throw conflict(`Moodle user ${moodleUserId} already participates in course ${moodleCourseId} as ${roles.map((r) => r.shortname).join(', ')}. Nothing was changed.`);
        }
      } else {
        // core_enrol_get_users_courses lists active enrolments only, so a suspended
        // enrolment is not "already enrolled" and is reactivated by the call below.
        const current = await connector.getUserCourses(moodleUserId);
        if (current.some((c) => Number(c.id) === Number(moodleCourseId))) {
          return { externalId: moodleCourseId, result: { action: 'ALREADY_ENROLLED', moodleCourseId, moodleUserId, roleId } };
        }
      }
      let warning = null;
      try {
        await writeOnce(() => connector.enrol({ roleid: roleId, userid: moodleUserId, courseid: moodleCourseId, suspend: false }));
      } catch (error) {
        // Moodle can apply the enrolment and then fail a follow-up step (e.g. sending the
        // course welcome message). Re-read the roster: if the role is there, the
        // enrolment happened, and the error is reported as a warning, not hidden.
        const enrolled = (await connector.has('core_enrol_get_enrolled_users'))
          && (await connector.getEnrolledUsers(moodleCourseId)).some((u) => Number(u.id) === moodleUserId && (u.roles ?? []).some((r) => Number(r.roleid) === roleId));
        if (!enrolled) throw error;
        warning = `Moodle enrolled the user but reported: ${error.message}`;
      }
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_ENROLMENT_ADDED', entityType: auditEntity, entityId: internalId, summary: `Enrolled ${label} in Moodle course ${moodleCourseId} as ${roleShortName}${warning ? ' (with a Moodle warning)' : ''}` });
      return { externalId: moodleCourseId, result: { action: warning ? 'ENROLLED_WITH_WARNING' : 'ENROLLED', moodleCourseId, moodleUserId, roleId, ...(warning ? { warning } : {}) } };
    },
  });
}

export async function enrolStudent(auth, moodleCourseId, { studentProfileId }, options = {}) {
  const student = await loadStudent(auth.tenantId, studentProfileId);
  return enrolWithRole(auth, moodleCourseId, { entityType: STUDENT, internalId: student.id, label: student.studentNumber, auditEntity: 'StudentProfile', roleShortName: 'student' }, options);
}

/** Course-level editing teacher. Never a site-level role. */
export async function enrolInstructor(auth, moodleCourseId, { facultyProfileId }, options = {}) {
  const faculty = await loadFaculty(auth.tenantId, facultyProfileId);
  return enrolWithRole(auth, moodleCourseId, { entityType: FACULTY, internalId: faculty.id, label: faculty.employeeNumber, auditEntity: 'FacultyProfile', roleShortName: 'editingteacher' }, options);
}

/** Record which Moodle course a seed manifest entry (ENX-DEMO ID number) produced. */
export async function recordSeedCourse(auth, seedKey, moodleCourseId) {
  const existing = await identityLink(auth.tenantId, SEED_COURSE, seedKey);
  if (existing) {
    if (existing.externalId !== String(moodleCourseId)) throw conflict(`${seedKey} is already recorded as Moodle course ${existing.externalId}.`);
    return existing;
  }
  return saveLink(prisma, { tenantId: auth.tenantId, entityType: SEED_COURSE, internalId: seedKey, externalId: moodleCourseId, linkMethod: 'PROVISIONED', actorUserId: auth.userId });
}

export const identityLinkFor = identityLink;

/** mode SUSPEND (default, reversible) keeps the enrolment record; REMOVE unenrols. */
export async function endEnrolment(auth, moodleCourseId, { studentProfileId, mode = 'SUSPEND', confirm = false }, { retryOf } = {}) {
  if (mode === 'REMOVE' && !confirm) throw badRequest('Removing an enrolment needs explicit confirmation. Suspending is the reversible option.');
  const ctx = await enrolmentContext(auth, moodleCourseId, studentProfileId);
  const operation = mode === 'REMOVE' ? 'ENROLMENT.REMOVE' : 'ENROLMENT.SUSPEND';
  return runOperation({
    auth,
    integration: ctx.integration,
    operation,
    idempotencyKey: retryOf ?? `${operation}:${moodleCourseId}:${ctx.student.id}:${randomUUID()}`,
    entityType: STUDENT,
    internalId: ctx.student.id,
    request: { moodleCourseId, studentProfileId: ctx.student.id, mode, confirm: Boolean(confirm) },
    handler: async () => {
      if (mode === 'REMOVE') await writeOnce(() => ctx.connector.unenrol({ userid: ctx.moodleUserId, courseid: moodleCourseId }));
      else await writeOnce(() => ctx.connector.enrol({ roleid: ctx.roleId, userid: ctx.moodleUserId, courseid: moodleCourseId, suspend: true }));
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: `MOODLE_${operation.replace('.', '_')}`, entityType: 'StudentProfile', entityId: ctx.student.id, summary: `${mode === 'REMOVE' ? 'Removed' : 'Suspended'} ${ctx.student.studentNumber} in Moodle course ${moodleCourseId}` });
      return { externalId: moodleCourseId, result: { action: mode === 'REMOVE' ? 'REMOVED' : 'SUSPENDED', moodleCourseId, moodleUserId: ctx.moodleUserId } };
    },
  });
}

/* ------------------------------------------------- admin: LMS roster read */

/** Resolve Moodle user ids to verified local identities (students and faculty). */
async function localIdentityResolver(tenantId) {
  const links = await prisma.externalIdentity.findMany({ where: { tenantId, provider: PROVIDER, entityType: { in: [STUDENT, FACULTY] } } });
  const byMoodleId = new Map(links.map((l) => [Number(l.externalId), { entityType: l.entityType, internalId: l.internalId }]));
  return (moodleUserId) => byMoodleId.get(Number(moodleUserId)) ?? null;
}

/**
 * The LMS counterpart of an SIS "sync": reads every Moodle course and its participants
 * (core_enrol_get_enrolled_users) into canonical enrolment DTOs. Read-only: it writes
 * nothing to the academic tables, and only a sync-log row and health reading locally.
 * A course with no participants is a valid empty result.
 */
export async function readRosters(auth) {
  const integration = await moodleIntegration(auth.tenantId);
  if (!integration) throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Moodle is not registered for this institution.');
  const localOf = await localIdentityResolver(auth.tenantId);
  return runIntegrationOperation({
    integration,
    operation: 'LMS.ROSTERS.READ',
    userId: auth.userId,
    countOf: (r) => r.enrollmentCount,
    run: async (connector) => {
      const startedAt = Date.now();
      const courses = await connector.listCourses();
      const result = [];
      for (const course of courses) {
        const { records, activeIds } = await connector.fetchEnrollments({ externalCourseId: course.id });
        const enrollments = records.map((p) => mapEnrollment(p, { moodleCourseId: course.id, activeIds, localOf }));
        result.push({
          course: mapCourse(course, connector.baseUrl),
          participantCount: enrollments.length,
          linkedCount: enrollments.filter((e) => e.localIdentity).length,
          enrollments,
        });
      }
      return {
        durationMs: Date.now() - startedAt,
        courseCount: courses.length,
        enrollmentCount: result.reduce((n, c) => n + c.participantCount, 0),
        courses: result,
      };
    },
  });
}

/* ------------------------------------------------- admin: student onboarding */

/**
 * Checks for "create a student and enrol them in Moodle courses" that must pass BEFORE
 * the local record is created: writes allowed, functions enabled, student role set, and
 * every selected course id is a real, non-site Moodle course. Read-only.
 */
export async function precheckStudentOnboarding(tenantId, courseIds = [], { role = 'student' } = {}) {
  const config = moodleConfig();
  if (!config.writesEnabled) {
    throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Changes to Moodle are switched off on this server (MOODLE_WRITES_ENABLED is not true). Create the student without Moodle, or enable writes first.', { reason: 'WRITES_DISABLED' });
  }
  const { connector } = await connect(tenantId);
  await connector.requireFunction('core_user_get_users_by_field');
  await connector.requireFunction('core_user_create_users');
  const ids = [...new Set(courseIds.map(Number))];
  if (ids.length) {
    await connector.requireFunction('enrol_manual_enrol_users');
    if (role === 'student' && !config.studentRoleId) throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Set MOODLE_STUDENT_ROLE_ID before enrolling students.');
    if (role === 'editingteacher' && !config.teacherRoleId) throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Set MOODLE_TEACHER_ROLE_ID before enrolling faculty.');
    const found = await connector.listCourses({ ids });
    const valid = new Set(found.filter((c) => !isSiteCourse(c)).map((c) => Number(c.id)));
    const invalid = ids.filter((id) => !valid.has(id));
    if (invalid.length) throw badRequest(`These are not Moodle courses on this site: ${invalid.join(', ')}.`, { field: 'moodle.courseIds', invalid });
  }
  return { courseIds: ids };
}

/**
 * Provision (or verified-link) a student's Moodle account, then enrol them in the
 * selected Moodle courses. One parent operation, keyed by student and course set:
 *   SUCCEEDED  account linked and every course enrolled
 *   PARTIAL    account linked, some enrolments failed (each has its own operation)
 *   FAILED / BLOCKED / NEEDS_RECONCILIATION  the account step did not complete
 * Retrying re-runs it: provisioning replays or reconciles, and enrolment skips courses
 * where the student already holds the student role, so only missing steps are retried.
 */
export async function onboardStudent(auth, studentProfileId, { courseIds = [], credentials = 'NONE' } = {}) {
  const student = await loadStudent(auth.tenantId, studentProfileId);
  const ids = [...new Set(courseIds.map(Number))].sort((a, b) => a - b);
  const { integration } = await connect(auth.tenantId);
  let oneTimeCredential = null;
  const outcome = await runOperation({
    auth,
    integration,
    operation: 'STUDENT.MOODLE_ONBOARD',
    idempotencyKey: `STUDENT.MOODLE_ONBOARD:${student.id}:${ids.join(',') || 'none'}`,
    entityType: STUDENT,
    internalId: student.id,
    request: { studentProfileId: student.id, courseIds: ids },
    stillValid: async () => Boolean(await studentLink(auth.tenantId, student.id)),
    handler: async () => {
      const account = await provisionStudent(auth, student.id, { credentials });
      if (account.oneTimeCredential) oneTimeCredential = account.oneTimeCredential;
      const enrolments = [];
      for (const moodleCourseId of ids) {
        try {
          const { result, operation } = await enrolStudent(auth, moodleCourseId, { studentProfileId: student.id });
          enrolments.push({ moodleCourseId, status: result.action, warning: result.warning ?? null, operationId: operation.id });
        } catch (error) {
          enrolments.push({ moodleCourseId, status: error.details?.operationStatus ?? 'FAILED', message: error.message, operationId: error.details?.operationId ?? null });
        }
      }
      const failed = enrolments.filter((e) => !['ENROLLED', 'ALREADY_ENROLLED', 'ENROLLED_WITH_WARNING'].includes(e.status));
      const result = {
        account: { action: account.result?.action ?? null, moodleUserId: account.result?.moodleUserId ?? null, username: account.result?.username ?? null, passwordDelivery: account.result?.passwordDelivery ?? null, loginUrl: account.result?.loginUrl ?? null, operationId: account.operation?.id ?? null },
        enrolments,
      };
      return {
        externalId: result.account.moodleUserId,
        result,
        partial: failed.length > 0,
        errorMessage: failed.length ? `${failed.length} of ${ids.length} course enrolment(s) did not complete: ${failed.map((f) => `${f.moodleCourseId} (${f.message ?? f.status})`).join('; ')}` : null,
      };
    },
  });
  return oneTimeCredential ? { ...outcome, oneTimeCredential } : outcome;
}

/** Summary for the admin, whatever happened. Never throws for Moodle problems. */
export async function onboardStudentSummary(auth, studentProfileId, { courseIds = [], credentials = 'NONE' } = {}) {
  try {
    const outcome = await onboardStudent(auth, studentProfileId, { courseIds, credentials });
    return {
      status: outcome.operation.status,
      operationId: outcome.operation.id,
      retryable: outcome.operation.retryable,
      message: outcome.operation.errorMessage,
      ...outcome.result,
      ...(outcome.oneTimeCredential ? { oneTimeCredential: outcome.oneTimeCredential } : {}),
    };
  } catch (error) {
    logger.warn('Moodle onboarding did not complete', { kind: error.details?.kind ?? error.code, operationId: error.details?.operationId ?? null });
    return {
      status: error.details?.operationStatus ?? 'FAILED',
      operationId: error.details?.operationId ?? null,
      retryable: Boolean(error.details?.operationId),
      message: error.message,
      account: null,
      enrolments: courseIds.map((moodleCourseId) => ({ moodleCourseId: Number(moodleCourseId), status: 'NOT_ATTEMPTED' })),
    };
  }
}

/* --------------------------------------------------------- admin: operations */

export async function listOperations(tenantId, { status, limit = 50 } = {}) {
  const rows = await prisma.integrationOperation.findMany({
    where: { tenantId, integration: { provider: PROVIDER }, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
  return rows.map(presentOperation);
}

/** Re-run a failed, blocked or unreconciled operation with its stored parameters. */
const HANDLERS = {
  // Retries never re-issue a one-time password (it would have nowhere safe to go): ONE_TIME
  // falls back to NONE and the administrator issues a new one-time password afterwards.
  'STUDENT.MOODLE_ONBOARD': (auth, r) => onboardStudent(auth, r.studentProfileId, { courseIds: r.courseIds }),
  'USER.PROVISION': (auth, r) => provisionStudent(auth, r.studentProfileId, { credentials: r.credentials === 'EMAIL' || r.sendWelcomeEmail ? 'EMAIL' : 'NONE', account: r.account }),
  'USER.PROVISION_FACULTY': (auth, r) => provisionFaculty(auth, r.facultyProfileId, { credentials: r.credentials === 'EMAIL' ? 'EMAIL' : 'NONE', account: r.account }),
  'USER.SUSPEND': (auth, r, key) => setStudentSuspended(auth, r.studentProfileId, { suspended: true }, { retryOf: key }),
  'USER.REACTIVATE': (auth, r, key) => setStudentSuspended(auth, r.studentProfileId, { suspended: false }, { retryOf: key }),
  'COURSE.CREATE': (auth, r) => createCourse(auth, r),
  'COURSE.UPDATE': (auth, r, key) => updateCourse(auth, r.moodleCourseId, stripId(r), { retryOf: key }),
  'COURSE.HIDE': (auth, r, key) => updateCourse(auth, r.moodleCourseId, { visible: false }, { retryOf: key }),
  'COURSE.SHOW': (auth, r, key) => updateCourse(auth, r.moodleCourseId, { visible: true }, { retryOf: key }),
  'ENROLMENT.ADD': (auth, r, key) => enrolStudent(auth, r.moodleCourseId, r, { retryOf: key }),
  'ENROLMENT.ADD_TEACHER': (auth, r, key) => enrolInstructor(auth, r.moodleCourseId, r, { retryOf: key }),
  'ENROLMENT.SUSPEND': (auth, r, key) => endEnrolment(auth, r.moodleCourseId, r, { retryOf: key }),
  'ENROLMENT.REMOVE': (auth, r, key) => endEnrolment(auth, r.moodleCourseId, r, { retryOf: key }),
};

function stripId({ moodleCourseId, ...rest }) {
  return rest;
}

export async function retryOperation(auth, operationId) {
  const op = await prisma.integrationOperation.findFirst({ where: { id: operationId, tenantId: auth.tenantId } });
  if (!op) throw notFound('Operation not found.');
  if (!RETRYABLE.includes(op.status)) throw conflict(`Only failed, partial, blocked or unreconciled operations can be retried (this one is ${op.status}).`);
  const handler = HANDLERS[op.operation];
  if (!handler) throw badRequest(`${op.operation} cannot be retried automatically.`);
  return handler(auth, op.request ?? {}, op.idempotencyKey);
}

/* ------------------------------------------------------------------ student */

/**
 * The signed-in student's Moodle courses. Never throws for Moodle problems: the portal
 * keeps working and the page explains what is unavailable.
 */
export async function myCourses(auth) {
  const integration = await moodleIntegration(auth.tenantId);
  const config = moodleConfig();
  if (!integration || !integration.enabled || integration.mode === 'DISABLED' || !config.valid) {
    return { status: 'NOT_CONFIGURED', courses: [] };
  }
  const link = await studentLink(auth.tenantId, auth.studentProfileId);
  const site = { baseUrl: config.baseUrl, loginUrl: `${config.baseUrl}/login/index.php` };
  if (!link) return { status: 'NOT_LINKED', site, courses: [] };
  if (link.status === 'SUSPENDED') return { status: 'SUSPENDED', site, courses: [] };

  try {
    const { connector } = await connect(auth.tenantId);
    const [allRemote, links, info] = await Promise.all([connector.getUserCourses(link.externalId), courseLinks(auth.tenantId), connector.siteInfo()]);
    const remote = await withoutTaughtCourses(auth, connector, link, allRemote);
    const localIds = links.map((l) => l.internalId);
    const localCourses = localIds.length ? await prisma.course.findMany({ where: { tenantId: auth.tenantId, id: { in: localIds } }, select: { id: true, code: true, name: true } }) : [];
    const localOf = new Map(links.map((l) => [l.externalId, localCourses.find((c) => c.id === l.internalId) ?? null]));
    return {
      status: 'CONNECTED',
      site,
      capabilities: {
        contents: info.functions.has('core_course_get_contents'),
        assignments: info.functions.has('mod_assign_get_assignments'),
        submissions: info.functions.has('mod_assign_get_submission_status'),
        grades: info.functions.has('gradereport_user_get_grade_items'),
      },
      courses: remote.filter((c) => Number(c.visible) === 1 && c.hidden !== true).map((c) => ({ ...mapCourse(c, connector.baseUrl), localCourse: localOf.get(String(c.id)) ?? null })),
    };
  } catch (error) {
    logger.warn('Moodle unavailable for student course list', { kind: error.details?.kind ?? error.code, correlationId: error.details?.correlationId ?? null });
    return { status: 'UNAVAILABLE', site, message: isMoodleError(error) ? 'Moodle is not responding right now. Your other portal features are unaffected.' : 'Moodle data could not be loaded.', courses: [] };
  }
}

const unavailable = (wsfunction) => ({ available: false, reason: 'FUNCTION_NOT_ENABLED', function: wsfunction });

async function optionalPart(connector, wsfunction, load) {
  if (!(await connector.has(wsfunction))) return unavailable(wsfunction);
  try {
    return { available: true, ...(await load()) };
  } catch (error) {
    logger.warn('Moodle detail unavailable', { wsfunction, kind: error.details?.kind ?? error.code });
    return { available: false, reason: 'ERROR', message: 'This information could not be loaded from Moodle.' };
  }
}

/**
 * One course for the signed-in student. The course id is checked against the student's
 * own active Moodle enrolments, so changing it in the URL cannot reveal another course.
 */
export async function myCourse(auth, moodleCourseId) {
  const link = await studentLink(auth.tenantId, auth.studentProfileId);
  if (!link || link.status !== 'ACTIVE') throw notFound('Course not found.');
  const { connector } = await connect(auth.tenantId);
  const remote = (await withoutTaughtCourses(auth, connector, link, await connector.getUserCourses(link.externalId))).find((c) => Number(c.id) === Number(moodleCourseId));
  if (!remote || Number(remote.visible) !== 1 || remote.hidden === true) throw notFound('Course not found.');

  const sections = mapContents(await connector.getCourseContents(moodleCourseId), connector.baseUrl);
  const visibleCmids = new Set(sections.flatMap((s) => s.activities.map((a) => a.cmid)));
  const moodleUserId = Number(link.externalId);

  const assignments = await optionalPart(connector, 'mod_assign_get_assignments', async () => {
    const items = (await connector.getAssignments([Number(moodleCourseId)]))
      .filter((a) => visibleCmids.has(Number(a.cmid)))
      .map((a) => mapAssignment(a, connector.baseUrl))
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
    if (await connector.has('mod_assign_get_submission_status')) {
      for (const item of items.slice(0, SUBMISSION_LOOKUP_LIMIT)) {
        try {
          item.submission = mapSubmissionStatus(await connector.getSubmissionStatus(item.assignmentId, moodleUserId));
        } catch {
          item.submission = null;
        }
      }
    }
    return { items, submissionsAvailable: await connector.has('mod_assign_get_submission_status') };
  });

  const grades = await optionalPart(connector, 'gradereport_user_get_grade_items', async () => {
    const report = mapGradeItems(await connector.getGradeItems(Number(moodleCourseId), moodleUserId));
    return { ...report, items: report.items.filter((item) => !item.cmid || visibleCmids.has(item.cmid)) };
  });

  return { course: mapCourse(remote, connector.baseUrl), sections, assignments, grades };
}


/* ------------------------------------------------- canonical course identity */

/**
 * The one course identity every LMS view uses: Moodle's live course record plus, when
 * an administrator has linked it, the canonical EduNexusAI course it corresponds to.
 * The link never replaces Moodle's title, availability or membership.
 */
async function courseIdentities(tenantId, remoteCourses, baseUrl) {
  const links = await courseLinks(tenantId);
  const locals = links.length
    ? await prisma.course.findMany({ where: { tenantId, id: { in: links.map((l) => l.internalId) } }, select: { id: true, code: true, name: true } })
    : [];
  const linkOf = new Map(links.map((l) => [l.externalId, l]));
  return remoteCourses.map((c) => {
    const link = linkOf.get(String(c.id));
    const local = link ? locals.find((x) => x.id === link.internalId) ?? null : null;
    return { ...mapCourse(c, baseUrl), localCourse: local, mappingStatus: link ? (local ? 'LINKED' : 'MISSING_LOCAL') : 'UNLINKED' };
  });
}

const visibleForStudent = (c) => Number(c.visible) === 1 && c.hidden !== true;

/** The signed-in student's visible Moodle courses, or a status explaining why there are none. */
async function studentContext(auth) {
  const integration = await moodleIntegration(auth.tenantId);
  const config = moodleConfig();
  if (!integration || !integration.enabled || integration.mode === 'DISABLED' || !config.valid) return { status: 'NOT_CONFIGURED' };
  const link = await studentLink(auth.tenantId, auth.studentProfileId);
  if (!link) return { status: 'NOT_LINKED' };
  if (link.status === 'SUSPENDED') return { status: 'SUSPENDED' };
  const { connector } = await connect(auth.tenantId);
  const remote = (await withoutTaughtCourses(auth, connector, link, await connector.getUserCourses(link.externalId))).filter(visibleForStudent);
  return { status: 'CONNECTED', connector, moodleUserId: Number(link.externalId), remote, courses: await courseIdentities(auth.tenantId, remote, connector.baseUrl) };
}

async function degrade(label, fn) {
  try {
    return await fn();
  } catch (error) {
    logger.warn(`Moodle unavailable for ${label}`, { kind: error.details?.kind ?? error.code, correlationId: error.details?.correlationId ?? null });
    if (!isMoodleError(error)) throw error;
    return { status: 'UNAVAILABLE', message: 'Moodle is not responding right now. Your other portal features are unaffected.', courses: [] };
  }
}

/* ------------------------------------------------- student: assignments, grades */

/**
 * Every assignment in the student's own visible Moodle courses, with their submission
 * state and RELEASED grade. Hidden activities are excluded. Nothing comes from local
 * assignment records, and Moodle problems are reported, never replaced by local data.
 */
export async function myAssignments(auth) {
  return degrade('student assignments', async () => {
    const ctx = await studentContext(auth);
    if (ctx.status !== 'CONNECTED') return { status: ctx.status, courses: [], assignments: [] };
    const { connector, moodleUserId, remote, courses } = ctx;
    if (!(await connector.has('mod_assign_get_assignments'))) {
      return { status: 'CONNECTED', courses, assignments: [], unavailable: unavailable('mod_assign_get_assignments') };
    }
    const visibleCmids = new Set();
    for (const c of remote) {
      for (const section of mapContents(await connector.getCourseContents(c.id), connector.baseUrl)) section.activities.forEach((a) => visibleCmids.add(a.cmid));
    }
    const raw = remote.length ? await connector.getAssignments(remote.map((c) => Number(c.id))) : [];
    const assignments = raw.filter((a) => visibleCmids.has(Number(a.cmid))).map((a) => mapAssignment(a, connector.baseUrl));

    const canStatus = await connector.has('mod_assign_get_submission_status');
    const canGrades = await connector.has('gradereport_user_get_grade_items');
    const releasedByCmid = new Map();
    if (canGrades) {
      for (const courseId of new Set(assignments.map((a) => a.moodleCourseId))) {
        for (const item of mapGradeItems(await connector.getGradeItems(courseId, moodleUserId)).items) if (item.cmid) releasedByCmid.set(item.cmid, item);
      }
    }
    const byId = new Map(courses.map((c) => [c.moodleCourseId, c]));
    const rows = [];
    for (const a of assignments.slice(0, 100)) {
      const submission = canStatus ? mapSubmissionStatus(await connector.getSubmissionStatus(a.assignmentId, moodleUserId)) : null;
      const course = byId.get(a.moodleCourseId);
      rows.push({
        ...a,
        course: course ? { moodleCourseId: course.moodleCourseId, shortName: course.shortName, fullName: course.fullName, localCourse: course.localCourse } : null,
        submission,
        ...studentAssignmentState(a, submission, releasedByCmid.get(a.cmid)),
      });
    }
    rows.sort((x, y) => (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999'));
    return {
      status: 'CONNECTED',
      courses,
      assignments: rows,
      capabilities: {
        submissionStatus: canStatus,
        releasedGrades: canGrades,
        // mod_assign_save_submission only saves for the token's own user, so submitting
        // through the portal is not possible with a shared service token.
        submitInPortal: false,
      },
    };
  });
}

/** Released Moodle grades for the student's own courses. No GPA: that belongs to the SIS. */
export async function myGrades(auth) {
  return degrade('student grades', async () => {
    const ctx = await studentContext(auth);
    if (ctx.status !== 'CONNECTED') return { status: ctx.status, courses: [] };
    const { connector, moodleUserId, courses } = ctx;
    if (!(await connector.has('gradereport_user_get_grade_items'))) {
      return { status: 'CONNECTED', courses: courses.map((course) => ({ course, grades: unavailable('gradereport_user_get_grade_items') })) };
    }
    const rows = [];
    for (const course of courses) {
      const report = mapGradeItems(await connector.getGradeItems(course.moodleCourseId, moodleUserId));
      rows.push({ course, grades: { available: true, ...report } });
    }
    return { status: 'CONNECTED', courses: rows };
  });
}

/* ------------------------------------------------- faculty: teaching and grading */

const TEACHING_ROLES = new Set(['editingteacher', 'teacher']);

async function facultyContext(auth) {
  if (!auth.facultyProfileId) throw forbidden('This view is for faculty members.');
  const link = await identityLink(auth.tenantId, FACULTY, auth.facultyProfileId);
  if (!link) return { status: 'NOT_LINKED' };
  if (link.status === 'SUSPENDED') return { status: 'SUSPENDED' };
  const { connector } = await connect(auth.tenantId);
  return { status: 'CONNECTED', connector, moodleUserId: Number(link.externalId) };
}

/**
 * Authorise a faculty member for one Moodle course: their linked Moodle account must hold
 * a teaching role there, as reported live by Moodle. Returns the course and its roster.
 */
async function assertTeaches(auth, moodleCourseId) {
  const ctx = await facultyContext(auth);
  if (ctx.status !== 'CONNECTED') throw forbidden('Your Moodle account is not linked (or is suspended), so Moodle courses cannot be managed here.');
  const { connector, moodleUserId } = ctx;
  const course = await requireRemoteCourse(connector, moodleCourseId);
  const participants = await connector.getEnrolledUsers(moodleCourseId);
  const me = participants.find((u) => Number(u.id) === moodleUserId);
  const roles = (me?.roles ?? []).map((r) => r.shortname);
  if (!roles.some((r) => TEACHING_ROLES.has(r))) throw forbidden('You do not teach this Moodle course.');
  return { connector, moodleUserId, course, participants, roles };
}

/** Moodle courses where the signed-in faculty member holds a teaching role. */
export async function myTeaching(auth) {
  return degrade('faculty teaching', async () => {
    const ctx = await facultyContext(auth);
    if (ctx.status !== 'CONNECTED') return { status: ctx.status, courses: [] };
    const { connector, moodleUserId } = ctx;
    const enrolled = await connector.getUserCourses(moodleUserId);
    const teaching = [];
    for (const c of enrolled) {
      const me = (await connector.getEnrolledUsers(c.id)).find((u) => Number(u.id) === moodleUserId);
      const roles = (me?.roles ?? []).map((r) => r.shortname).filter((r) => TEACHING_ROLES.has(r));
      if (roles.length) teaching.push({ course: c, roles });
    }
    const identities = await courseIdentities(auth.tenantId, teaching.map((t) => t.course), connector.baseUrl);
    return {
      status: 'CONNECTED',
      courses: identities.map((course, i) => ({ ...course, roles: teaching[i].roles, addAssignmentUrl: `${connector.baseUrl}/course/modedit.php?add=assign&course=${course.moodleCourseId}&section=0` })),
      capabilities: {
        submissions: await connector.has('mod_assign_get_submissions'),
        storedGrades: await connector.has('mod_assign_get_grades'),
        saveGrade: await connector.has('mod_assign_save_grade'),
        createAssignment: false,
      },
    };
  });
}

/** One taught course: students (Moodle student role) and every assignment, hidden ones flagged. */
export async function teachingCourse(auth, moodleCourseId) {
  const { connector, course, participants, roles } = await assertTeaches(auth, moodleCourseId);
  const localOf = await localIdentityResolver(auth.tenantId);
  const students = participants
    .filter((u) => (u.roles ?? []).some((r) => r.shortname === 'student'))
    .map((u) => ({ moodleUserId: Number(u.id), fullName: u.fullname, localIdentity: localOf(u.id) }));
  const visible = new Set(mapContents(await connector.getCourseContents(moodleCourseId), connector.baseUrl).flatMap((s) => s.activities.map((a) => a.cmid)));
  const assignments = (await connector.has('mod_assign_get_assignments'))
    ? (await connector.getAssignments([Number(moodleCourseId)])).map((a) => ({ ...mapAssignment(a, connector.baseUrl), visibleToStudents: visible.has(Number(a.cmid)) }))
    : null;
  const [identity] = await courseIdentities(auth.tenantId, [course], connector.baseUrl);
  return {
    course: { ...identity, roles: roles.filter((r) => TEACHING_ROLES.has(r)), addAssignmentUrl: `${connector.baseUrl}/course/modedit.php?add=assign&course=${moodleCourseId}&section=0` },
    students,
    assignments: assignments ?? [],
    assignmentsAvailable: assignments ? { available: true } : unavailable('mod_assign_get_assignments'),
  };
}

async function teachingAssignment(auth, moodleCourseId, assignmentId) {
  const ctx = await assertTeaches(auth, moodleCourseId);
  await ctx.connector.requireFunction('mod_assign_get_assignments');
  const raw = (await ctx.connector.getAssignments([Number(moodleCourseId)])).find((a) => Number(a.id) === Number(assignmentId));
  if (!raw) throw notFound('That assignment is not in this Moodle course.');
  return { ...ctx, assignment: mapAssignment(raw, ctx.connector.baseUrl) };
}

/** Submissions, stored grades and feedback for every student in one assignment. */
export async function assignmentSubmissions(auth, moodleCourseId, assignmentId) {
  const { connector, participants, assignment } = await teachingAssignment(auth, moodleCourseId, assignmentId);
  const localOf = await localIdentityResolver(auth.tenantId);
  const students = participants.filter((u) => (u.roles ?? []).some((r) => r.shortname === 'student'));
  const parts = {};
  if (await connector.has('mod_assign_get_submissions')) {
    const [entry] = await connector.getSubmissions([Number(assignmentId)]);
    parts.submissions = new Map((entry?.submissions ?? []).map((sub) => [Number(sub.userid), sub]));
  }
  if (await connector.has('mod_assign_get_grades')) {
    const [entry] = await connector.getAssignGrades([Number(assignmentId)]);
    parts.grades = new Map((entry?.grades ?? []).map((g) => [Number(g.userid), g]));
  }
  const feedbackAvailable = await connector.has('gradereport_user_get_grade_items');
  const rows = [];
  for (const u of students) {
    const sub = parts.submissions?.get(Number(u.id));
    const g = parts.grades?.get(Number(u.id));
    let feedback = null;
    let releasedToStudent = null;
    if (feedbackAvailable) {
      const item = (mapGradeItems(await connector.getGradeItems(Number(moodleCourseId), Number(u.id))).items ?? []).find((i) => i.cmid === assignment.cmid);
      feedback = item?.feedback ?? null;
      releasedToStudent = Boolean(item?.grade);
    }
    rows.push({
      moodleUserId: Number(u.id),
      fullName: u.fullname,
      localIdentity: localOf(u.id),
      submission: sub ? { status: sub.status, submittedAt: sub.status === 'submitted' && sub.timemodified ? new Date(sub.timemodified * 1000).toISOString() : null, gradingStatus: sub.gradingstatus ?? null } : null,
      grade: g ? parseAssignGrade(g.grade) : null,
      gradedAt: g?.timemodified ? new Date(g.timemodified * 1000).toISOString() : null,
      feedback,
      releasedToStudent,
    });
  }
  return {
    assignment,
    students: rows,
    capabilities: {
      submissions: parts.submissions ? { available: true } : unavailable('mod_assign_get_submissions'),
      storedGrades: parts.grades ? { available: true } : unavailable('mod_assign_get_grades'),
      feedback: feedbackAvailable ? { available: true } : unavailable('gradereport_user_get_grade_items'),
      saveGrade: (await connector.has('mod_assign_save_grade')) ? { available: true } : unavailable('mod_assign_save_grade'),
    },
  };
}

/**
 * Save a grade and feedback in Moodle for one student, then read it back. Only for a
 * faculty member who teaches the course, a student enrolled with the student role, an
 * assignment in that course, and a numeric grade within the assignment's range.
 */
export async function saveStudentGrade(auth, moodleCourseId, assignmentId, moodleUserId, { grade, feedback }) {
  const { connector, participants, assignment } = await teachingAssignment(auth, moodleCourseId, assignmentId);
  const student = participants.find((u) => Number(u.id) === Number(moodleUserId) && (u.roles ?? []).some((r) => r.shortname === 'student'));
  if (!student) throw badRequest('That person is not enrolled as a student in this Moodle course.');
  if (!assignment.maxGrade) throw badRequest('This assignment uses a scale or no numeric grade; grade it in Moodle.');
  if (!(grade >= 0 && grade <= assignment.maxGrade)) throw badRequest(`The grade must be between 0 and ${assignment.maxGrade}.`, { field: 'grade' });
  if (feedback && !assignment.feedbackCommentsEnabled) throw badRequest('Feedback comments are not enabled on this assignment in Moodle, so written feedback cannot be saved.', { field: 'feedback' });
  const integration = await moodleIntegration(auth.tenantId);
  return runOperation({
    auth,
    integration,
    operation: 'GRADE.SAVE',
    idempotencyKey: `GRADE.SAVE:${assignmentId}:${moodleUserId}:${randomUUID()}`,
    entityType: 'MOODLE_GRADE',
    internalId: auth.facultyProfileId ?? null,
    // Grade values are not secrets but are kept out of the operation record anyway.
    request: { moodleCourseId: Number(moodleCourseId), assignmentId: Number(assignmentId), moodleUserId: Number(moodleUserId) },
    handler: async () => {
      await connector.requireFunction('mod_assign_save_grade');
      await writeOnce(() => connector.saveGrade({ assignmentId: Number(assignmentId), moodleUserId: Number(moodleUserId), grade, feedback }));
      let verified = null;
      if (await connector.has('mod_assign_get_grades')) {
        const [entry] = await connector.getAssignGrades([Number(assignmentId)]);
        const stored = parseAssignGrade((entry?.grades ?? []).find((g) => Number(g.userid) === Number(moodleUserId))?.grade);
        verified = stored !== null && Math.abs(stored - grade) < 0.00001;
        if (!verified) throw moodleError(MoodleErrorKind.MOODLE_EXCEPTION, 'Moodle accepted the request but the stored grade does not match. Check the assignment in Moodle.', { reconcile: true });
      }
      await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'MOODLE_GRADE_SAVED', entityType: 'MoodleAssignment', entityId: String(assignmentId), summary: `Graded Moodle user ${moodleUserId} in assignment ${assignmentId}` });
      return { externalId: assignmentId, result: { saved: true, verified, moodleUserId: Number(moodleUserId), assignmentId: Number(assignmentId) } };
    },
  });
}
