import { prisma } from '../../db/prisma.js';
import { moodleConfig, sisConfig } from '../../config/env.js';
import { AppError, ErrorCode, badRequest, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { recordAudit } from '../audit/auditService.js';
import { createUser, getUser } from '../admin/adminService.js';
import * as sis from '../sis/sisService.js';
import * as moodle from '../lms/moodleService.js';
import * as alignment from '../lms/courseAlignmentService.js';

/**
 * Person onboarding across EduNexusAI, CampusCore SIS and Moodle.
 *
 * One workflow behind the Users & Roles page, with one owner per piece of data:
 *
 *   CampusCore  the person's institutional record (name, institutional email, student or
 *               employee number, program, status). Found first; created only when CampusCore's
 *               scope and institutional policy allow it (student.create), never worked around.
 *   EduNexusAI  the login (email = the record's institutional email, a temporary password the
 *               person must change), role, tier, and the identity link to the CampusCore record.
 *   Moodle      the LMS account (username and ID number = the institutional ID) and course
 *               enrolments, with an explicit first-password choice (see MOODLE_CREDENTIALS).
 *
 * The systems share no transaction, so each step is reported on its own:
 *   DONE | ALREADY (found and reused) | SKIPPED | BLOCKED (policy, scope, configuration) | FAILED
 * The CampusCore login + link step is atomic (sisService.provisionAccount); Moodle steps are
 * recorded IntegrationOperations that can be retried. Re-submitting the same onboarding
 * resumes: an already-linked record reuses its login, an existing Moodle account is linked,
 * and courses already held are skipped. Nothing is matched by name, and nothing is linked
 * automatically when the evidence disagrees.
 */

const SIS_ROLES = ['STUDENT', 'FACULTY'];
const step = (status, message, extra = {}) => ({ status, message, ...extra });

const blockedFrom = (error) => {
  const code = error.details?.sisCode ?? error.code;
  const status = [403, 409, 422].includes(error.status) || ['write_not_permitted', 'policy_disabled', 'insufficient_scope'].includes(code) ? 'BLOCKED' : 'FAILED';
  return step(status, error.message, { code: code ?? null, requestId: error.details?.requestId ?? null });
};

/* ---------------------------------------------------------------- lookup */

/**
 * Preview: what already exists for this person in each system, and what onboarding would do.
 * Read-only in all three systems.
 */
export async function lookupPerson(auth, { role, email, institutionalId, sisRecordId }) {
  const normalisedEmail = email ? email.trim().toLowerCase() : null;
  const result = { role, portal: null, sis: null, moodle: null, recommendation: null };

  if (!SIS_ROLES.includes(role)) {
    const existing = normalisedEmail ? await prisma.user.findUnique({ where: { tenantId_email: { tenantId: auth.tenantId, email: normalisedEmail } } }) : null;
    result.portal = { existingUser: existing ? await getUser(auth.tenantId, existing.id) : null };
    result.recommendation = existing
      ? { action: 'EXISTS', message: 'An EduNexusAI account with this email already exists. Edit it instead of creating another.' }
      : { action: 'CREATE_LOCAL_ACCOUNT', message: 'Administrators have an EduNexusAI login only; they have no SIS record or Moodle account.' };
    return result;
  }

  const recordType = role;
  result.sis = await sis.lookupRecords(auth, { recordType, email: normalisedEmail, institutionalId, sisRecordId });
  const record = result.sis.records?.length === 1 ? result.sis.records[0] : null;
  const loginEmail = record?.email?.trim().toLowerCase() ?? normalisedEmail;

  const existing = loginEmail ? await prisma.user.findUnique({ where: { tenantId_email: { tenantId: auth.tenantId, email: loginEmail } } }) : null;
  const linkedUser = record?.linkedTo?.inThisPortal ? await getUser(auth.tenantId, record.linkedTo.userId) : null;
  result.portal = {
    existingUser: existing ? await getUser(auth.tenantId, existing.id) : null,
    linkedUser,
  };

  if (record) {
    const idnumber = record.institutionalId;
    result.moodle = await moodle.lookupMoodleAccount(auth.tenantId, { username: String(idnumber).toLowerCase().replace(/[^a-z0-9._@-]/g, '-'), email: loginEmail, idnumber });
  } else {
    result.moodle = { state: 'NOT_CHECKED', message: 'Moodle is checked once the CampusCore record is known.' };
  }

  result.recommendation = recommend({ role, sis: result.sis, record, existing: result.portal.existingUser, linkedUser });
  return result;
}

function recommend({ role, sis: sisResult, record, existing, linkedUser }) {
  if (sisResult.state === 'NOT_CONFIGURED') return { action: 'BLOCKED', message: 'CampusCore SIS is not configured, so students and faculty cannot be onboarded against their institutional record.' };
  if (sisResult.state === 'UNAVAILABLE') return { action: 'RETRY_LATER', message: sisResult.message ?? 'CampusCore SIS is unavailable. Try again shortly.' };
  if (sisResult.records.length > 1) return { action: 'AMBIGUOUS', message: 'More than one CampusCore record matches. Search by the exact institutional ID to choose one; nothing is linked automatically.' };
  if (record) {
    if (!record.provisionable) return { action: 'BLOCKED', message: `The CampusCore record is ${String(record.status).toLowerCase().replace(/_/g, ' ')}. Resolve it in CampusCore first.` };
    if (record.linkedTo && !record.linkedTo.inThisPortal) return { action: 'BLOCKED', message: 'This CampusCore record is linked to an account that is not in this portal tenant.' };
    if (linkedUser) return { action: 'ALREADY_ONBOARDED', userId: linkedUser.id, message: `Already linked to ${linkedUser.email}. Onboarding again only completes missing Moodle steps.` };
    if (existing) {
      const roleMatches = (existing.roles ?? []).includes(role);
      return { action: 'LINK_EXISTING_LOGIN', userId: existing.id, roleMatches, message: `An EduNexusAI login with this email exists but is not linked to CampusCore. Verify it is the same person, then link it instead of creating a second login.` };
    }
    return { action: 'PROVISION_FROM_SIS', message: 'The person exists in CampusCore. Create their EduNexusAI login and link it to that record.' };
  }
  if (existing) return { action: 'EXISTING_LOGIN_NO_SIS_RECORD', userId: existing.id, message: 'An EduNexusAI login exists, but no CampusCore record matches. Find the record by institutional ID, or have the registrar create it.' };
  if (role === 'FACULTY') return { action: 'BLOCKED', message: 'No CampusCore faculty record matches. CampusCore’s API cannot create faculty records; HR or the registrar must create the record in CampusCore first.' };
  const create = sisResult.capabilities?.createStudent;
  if (create?.effective) return { action: 'CREATE_IN_SIS', message: 'No CampusCore record matches. CampusCore allows this connection to create the student record first.' };
  return { action: 'BLOCKED', message: `No CampusCore record matches, and this connection may not create students (${create?.reason ?? 'not permitted'}). The registrar must create the record in CampusCore, or a CampusCore administrator must enable "Allow student creation via API".` };
}

/* ---------------------------------------------------------------- onboard */

/**
 * Run the onboarding. Body:
 *   role: STUDENT | FACULTY | ADMIN
 *   sis:   { mode: 'EXISTING', sisRecordId } | { mode: 'CREATE', idempotencyKey, record }   (STUDENT/FACULTY)
 *   login: { mode: 'NEW', password } | { mode: 'LINK_EXISTING', userId, verificationNote? }
 *   account (ADMIN only): { email, firstName, lastName, password }
 *   tierKey (students)
 *   moodle: { enabled, fromSis, courseIds, credentials: EMAIL | ONE_TIME | NONE }
 *     fromSis (default true): enrol in the Moodle courses mapped to the person's CampusCore
 *       registrations (students) or teaching sections (faculty); see courseAlignmentService.
 *     courseIds: additional Moodle courses that are not CampusCore classes (e.g. orientation).
 */
export async function onboardPerson(auth, input) {
  if (input.role === 'ADMIN') return onboardAdmin(auth, input);
  if (!SIS_ROLES.includes(input.role)) throw badRequest('Unknown role.');
  if (!sisConfig().valid) throw new AppError(409, ErrorCode.INTEGRATION_NOT_CONFIGURED, 'CampusCore SIS is not configured, so students and faculty cannot be onboarded against their institutional record.');

  const recordType = input.role;
  const steps = { sisRecord: null, login: null, moodleAccount: null, moodleEnrolments: [] };
  const requiredActions = [];
  let oneTimeCredential = null;
  const wantsMoodle = Boolean(input.moodle?.enabled);
  const courseIds = [...new Set((input.moodle?.courseIds ?? []).map(Number))];

  // Moodle preconditions are checked before anything is created anywhere, so a bad course
  // id or disabled writes never leave a half-onboarded person.
  const fromSis = input.moodle?.fromSis !== false;
  if (wantsMoodle) await moodlePrecheck(auth, recordType, courseIds, { fromSis });

  // 1. The CampusCore record: existing (verified) or created where policy allows.
  let record = null;
  if (input.sis?.mode === 'CREATE') {
    if (recordType !== 'STUDENT') throw badRequest('CampusCore’s API can create student records only. Faculty records are created in CampusCore.');
    try {
      const created = await sis.createStudent(auth, input.sis.record, { idempotencyKey: input.sis.idempotencyKey });
      record = { sisId: created.student.source.id, institutionalId: created.student.institutionalId };
      steps.sisRecord = step(created.replayed ? 'ALREADY' : 'DONE', created.replayed ? `CampusCore record ${record.institutionalId} was already created by this submission.` : `Created CampusCore student ${record.institutionalId}.`, record);
    } catch (error) {
      steps.sisRecord = blockedFrom(error);
      requiredActions.push(steps.sisRecord.status === 'BLOCKED' ? 'Create the student in CampusCore (registrar), or ask a CampusCore administrator to allow student creation for this integration. Then onboard again; nothing else was created.' : 'Retry onboarding with the same form; the same idempotency key prevents a duplicate CampusCore record.');
      return finish(auth, input, { outcome: steps.sisRecord.status, steps, requiredActions });
    }
  } else if (input.sis?.mode === 'EXISTING') {
    const found = await sis.lookupRecords(auth, { recordType, sisRecordId: input.sis.sisRecordId });
    if (found.state !== 'OK') {
      steps.sisRecord = step('FAILED', found.message ?? 'CampusCore is unavailable.');
      requiredActions.push('Try again when CampusCore is available. Nothing was created.');
      return finish(auth, input, { outcome: 'FAILED', steps, requiredActions });
    }
    const r = found.records[0];
    if (!r.provisionable) {
      steps.sisRecord = step('BLOCKED', `The CampusCore record is ${String(r.status).toLowerCase().replace(/_/g, ' ')}.`, { sisId: r.sisId, institutionalId: r.institutionalId });
      requiredActions.push('Resolve the record’s status in CampusCore first. Nothing was created.');
      return finish(auth, input, { outcome: 'BLOCKED', steps, requiredActions });
    }
    record = { sisId: r.sisId, institutionalId: r.institutionalId, email: r.email, linkedTo: r.linkedTo };
    steps.sisRecord = step('ALREADY', `Using existing CampusCore ${recordType.toLowerCase()} ${r.institutionalId}.`, { sisId: r.sisId, institutionalId: r.institutionalId });
  } else {
    throw badRequest('Choose the CampusCore record (existing, or create one where allowed).');
  }

  // 2. The EduNexusAI login, linked to that record.
  let userId = null;
  const current = await sis.lookupRecords(auth, { recordType, sisRecordId: record.sisId }).catch(() => null);
  const linked = current?.records?.[0]?.linkedTo;
  try {
    if (linked?.inThisPortal) {
      userId = linked.userId;
      steps.login = step('ALREADY', `Already linked to the EduNexusAI login ${linked.email}. No second login was created.`, { userId });
    } else if (linked) {
      steps.login = step('BLOCKED', 'This CampusCore record is linked to an account outside this portal tenant.');
    } else if (input.login?.mode === 'LINK_EXISTING') {
      const user = await prisma.user.findFirst({ where: { id: input.login.userId, tenantId: auth.tenantId }, include: { userRoles: { include: { role: true } }, studentProfile: true, facultyProfile: true } });
      if (!user) throw notFound('That EduNexusAI login does not exist in this institution.');
      if (!user.userRoles.some((r) => r.role.key === recordType) || (recordType === 'STUDENT' ? !user.studentProfile : !user.facultyProfile)) {
        throw badRequest(`That login is not a ${recordType.toLowerCase()} account. Change its role first, or create a new login.`);
      }
      await sis.linkIdentity(auth, { userId: user.id, recordType, sisRecordId: record.sisId, evidenceMismatchReason: input.login.verificationNote });
      userId = user.id;
      steps.login = step('DONE', `Linked the existing login ${user.email} to CampusCore ${record.institutionalId}.`, { userId });
    } else {
      const provisioned = await sis.provisionAccount(auth, { recordType, sisRecordId: record.sisId, password: input.login?.password, tierKey: input.tierKey });
      userId = provisioned.user.id;
      steps.login = step('DONE', `Created the EduNexusAI login ${provisioned.user.email} (temporary password; the person must change it at first sign-in) and linked it to CampusCore ${record.institutionalId}.`, { userId, email: provisioned.user.email });
    }
  } catch (error) {
    steps.login = blockedFrom(error);
    if (error.details?.reason === 'EMAIL_IN_USE') {
      steps.login.status = 'BLOCKED';
      steps.login.existingUserId = error.details.userId;
      requiredActions.push('An EduNexusAI login already uses this email. Verify it is the same person and choose "Link the existing login".');
    } else {
      requiredActions.push(`Fix the problem and onboard again${steps.sisRecord.status === 'DONE' ? '; the CampusCore record already created is reused, not duplicated' : ''}.`);
    }
  }
  if (!userId) return finish(auth, input, { outcome: steps.sisRecord.status === 'DONE' ? 'PARTIAL' : steps.login.status, steps, requiredActions, record });

  // 3–4. Moodle account and course enrolments.
  if (!wantsMoodle) {
    steps.moodleAccount = step('SKIPPED', 'Moodle was not requested.');
  } else {
    const profile = await localProfile(auth.tenantId, recordType, userId);
    const account = { username: String(record.institutionalId).toLowerCase().replace(/[^a-z0-9._@-]/g, '-'), idnumber: record.institutionalId };
    try {
      const provision = recordType === 'STUDENT' ? moodle.provisionStudent : moodle.provisionFaculty;
      const out = await provision(auth, profile.id, { credentials: input.moodle.credentials ?? 'EMAIL', account });
      const r = out.result ?? {};
      // A replayed operation (same person, provisioned before) is not a new account.
      const already = out.replayed || ['ALREADY_LINKED', 'LINKED_EXISTING'].includes(r.action);
      steps.moodleAccount = step(already ? 'ALREADY' : 'DONE', out.replayed ? `Moodle account "${r.username ?? r.moodleUserId}" was provisioned earlier and is still linked; its password is unchanged.` : moodleAccountMessage(r), { action: r.action, moodleUserId: r.moodleUserId ?? null, username: r.username ?? null, passwordDelivery: r.passwordDelivery ?? null, loginUrl: r.loginUrl ?? null, operationId: out.operation?.id ?? null });
      if (out.oneTimeCredential) oneTimeCredential = out.oneTimeCredential;
      if (!out.replayed && r.passwordDelivery === 'NONE_USE_FORGOTTEN_PASSWORD') requiredActions.push('The Moodle account has no known password. The person uses "Forgotten password" on the Moodle login page, or an administrator issues a one-time Moodle password.');
      if (already) steps.moodleAccount.passwordDelivery = 'EXISTING_MOODLE_PASSWORD';
    } catch (error) {
      steps.moodleAccount = step(error.details?.operationStatus === 'BLOCKED' ? 'BLOCKED' : 'FAILED', error.message, { operationId: error.details?.operationId ?? null, operationStatus: error.details?.operationStatus ?? null });
      requiredActions.push('Moodle: retry the failed operation from Admin → Moodle LMS → Operations, or onboard again (the login is reused).');
    }
    if (['DONE', 'ALREADY'].includes(steps.moodleAccount.status) && fromSis) {
      // Course enrolments that follow from CampusCore: registered (or teaching) sections that
      // are mapped to a Moodle course. Unmapped classes are reported, not invented.
      const applied = recordType === 'STUDENT' ? await alignment.applyStudentPlan(auth, userId) : await alignment.applyFacultyPlan(auth, userId);
      const resultBy = new Map(applied.results.map((r) => [r.moodleCourseId, r]));
      const seen = new Set();
      for (const c of applied.plan.classes ?? []) {
        const label = `${c.courseCode}-${c.sectionCode} (${c.termCode})`;
        if (!c.moodleCourse) {
          steps.moodleEnrolments.push(step('SKIPPED', `${label}: no Moodle course is mapped to this CampusCore section.`, { sisSectionId: c.sisSectionId, source: 'CAMPUSCORE' }));
          continue;
        }
        if (seen.has(c.moodleCourse.moodleCourseId)) continue;
        seen.add(c.moodleCourse.moodleCourseId);
        const r = resultBy.get(c.moodleCourse.moodleCourseId);
        const status = r ? r.status : ['ENROLLED', 'TEACHING'].includes(c.status) ? 'ALREADY' : c.status === 'WAITLISTED' ? 'SKIPPED' : 'BLOCKED';
        steps.moodleEnrolments.push(step(status, r?.message ?? `${label} \u2192 Moodle ${c.moodleCourse.shortName}: ${status === 'ALREADY' ? 'already enrolled' : status === 'DONE' ? 'enrolled' : c.status.toLowerCase().replace(/_/g, ' ')}.`, { moodleCourseId: c.moodleCourse.moodleCourseId, sisSectionId: c.sisSectionId, source: 'CAMPUSCORE', operationId: r?.operationId ?? null }));
      }
      if (applied.plan.state !== 'OK') steps.moodleEnrolments.push(step('SKIPPED', `CampusCore registrations could not be read (${applied.plan.state}).`, { source: 'CAMPUSCORE' }));
      if ((applied.plan.classes ?? []).length === 0 && applied.plan.state === 'OK') steps.moodleEnrolments.push(step('SKIPPED', recordType === 'STUDENT' ? 'No current or upcoming CampusCore registrations yet, so no Moodle courses. Register the student in CampusCore, then sync from Users & Roles \u2192 Systems.' : 'No current or upcoming CampusCore teaching sections.', { source: 'CAMPUSCORE' }));
    }
    if (['DONE', 'ALREADY'].includes(steps.moodleAccount.status)) {
      for (const moodleCourseId of courseIds) {
        try {
          const enrol = recordType === 'STUDENT'
            ? await moodle.enrolStudent(auth, moodleCourseId, { studentProfileId: profile.id })
            : await moodle.enrolInstructor(auth, moodleCourseId, { facultyProfileId: profile.id });
          const action = enrol.result?.action;
          steps.moodleEnrolments.push(step(action === 'ALREADY_ENROLLED' ? 'ALREADY' : 'DONE', action === 'ENROLLED_WITH_WARNING' ? enrol.result.warning : action === 'ALREADY_ENROLLED' ? 'Already enrolled (additional course).' : 'Enrolled (additional course, not a CampusCore class).', { moodleCourseId, operationId: enrol.operation?.id ?? null, source: 'ADDITIONAL' }));
        } catch (error) {
          steps.moodleEnrolments.push(step(error.details?.operationStatus === 'BLOCKED' ? 'BLOCKED' : 'FAILED', error.message, { moodleCourseId, operationId: error.details?.operationId ?? null, source: 'ADDITIONAL' }));
        }
      }
      if (steps.moodleEnrolments.some((e) => !['DONE', 'ALREADY', 'SKIPPED'].includes(e.status))) requiredActions.push('Some Moodle enrolments did not complete: retry them from Admin → Moodle LMS → Operations.');
    } else {
      for (const moodleCourseId of courseIds) steps.moodleEnrolments.push(step('SKIPPED', 'Not attempted: the Moodle account step did not complete.', { moodleCourseId }));
    }
  }

  const all = [steps.sisRecord, steps.login, steps.moodleAccount, ...steps.moodleEnrolments].filter(Boolean);
  const outcome = all.every((s) => ['DONE', 'ALREADY', 'SKIPPED'].includes(s.status)) ? 'COMPLETED' : 'PARTIAL';
  return finish(auth, input, { outcome, steps, requiredActions, record, userId, oneTimeCredential });
}

function moodleAccountMessage(r) {
  if (r.action === 'ALREADY_LINKED') return `Already linked to Moodle user ${r.moodleUserId}; the person keeps their existing Moodle password.`;
  if (r.action === 'LINKED_EXISTING') return `Linked the existing Moodle account "${r.username}" (matched by ${r.username ? 'ID number or email' : 'evidence'}); its password is unchanged.`;
  const how = { UNIVERSITY_SIGN_IN: 'It signs in with the university sign-in (no Moodle password).', EMAILED_BY_MOODLE: 'Moodle emails a generated password to the institutional email and asks for a new one at first login.', ONE_TIME_HANDOFF: 'A one-time password is shown once below; Moodle requires a new one at first login.', NONE_USE_FORGOTTEN_PASSWORD: 'No password was set; the person uses "Forgotten password".' };
  return `Created Moodle account "${r.username}". ${how[r.passwordDelivery] ?? ''}`.trim();
}

async function localProfile(tenantId, recordType, userId) {
  const profile = recordType === 'STUDENT'
    ? await prisma.studentProfile.findFirst({ where: { tenantId, userId }, select: { id: true } })
    : await prisma.facultyProfile.findFirst({ where: { tenantId, userId }, select: { id: true } });
  if (!profile) throw badRequest('This login has no student or faculty profile.');
  return profile;
}

async function moodlePrecheck(auth, recordType, courseIds, { fromSis = false } = {}) {
  const config = moodleConfig();
  if (!config.valid) throw new AppError(409, ErrorCode.INTEGRATION_NOT_CONFIGURED, `Moodle is not configured: ${config.problems.join(' ')} Untick Moodle to onboard without it.`);
  if (!config.writesEnabled) throw new AppError(409, ErrorCode.OPERATION_NOT_SUPPORTED, 'Moodle writes are switched off (MOODLE_WRITES_ENABLED). Untick Moodle, or enable writes.');
  // Validates the functions, the role setting and every course id against Moodle; creates nothing.
  await moodle.precheckStudentOnboarding(auth.tenantId, courseIds, { role: recordType === 'STUDENT' ? 'student' : 'editingteacher' });
  if (fromSis && recordType === 'STUDENT' && !config.studentRoleId) throw new AppError(409, ErrorCode.INTEGRATION_NOT_CONFIGURED, 'Set MOODLE_STUDENT_ROLE_ID before enrolling students from their CampusCore registrations.');
  if (fromSis && recordType === 'FACULTY' && !config.teacherRoleId) throw new AppError(409, ErrorCode.INTEGRATION_NOT_CONFIGURED, 'Set MOODLE_TEACHER_ROLE_ID before enrolling faculty from their CampusCore sections.');
}

async function onboardAdmin(auth, input) {
  const a = input.account ?? {};
  const user = await createUser(auth.tenantId, { email: a.email, password: a.password, firstName: a.firstName, lastName: a.lastName, roles: ['ADMIN'] }, { actorUserId: auth.userId, baseline: false });
  const steps = {
    sisRecord: step('SKIPPED', 'Administrators have no SIS record.'),
    login: step('DONE', `Created the EduNexusAI login ${user.email} (temporary password; must be changed at first sign-in).`, { userId: user.id }),
    moodleAccount: step('SKIPPED', 'Administrators get no Moodle account from EduNexusAI.'),
    moodleEnrolments: [],
  };
  return finish(auth, input, { outcome: 'COMPLETED', steps, requiredActions: [], userId: user.id });
}

async function finish(auth, input, { outcome, steps, requiredActions, record = null, userId = null, oneTimeCredential = null }) {
  const statuses = { sisRecord: steps.sisRecord?.status ?? null, login: steps.login?.status ?? null, moodleAccount: steps.moodleAccount?.status ?? null, moodleEnrolments: steps.moodleEnrolments.map((e) => `${e.moodleCourseId}:${e.status}`) };
  await recordAudit({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: outcome === 'COMPLETED' ? 'PERSON_ONBOARDED' : `PERSON_ONBOARDING_${outcome}`,
    entityType: 'User',
    entityId: userId,
    summary: `Onboarding ${input.role.toLowerCase()}${record?.institutionalId ? ` ${record.institutionalId}` : ''}: ${outcome}`,
    metadata: { steps: statuses, oneTimeMoodlePasswordIssued: Boolean(oneTimeCredential) },
  }).catch((error) => logger.warn('Onboarding audit not written', { code: error.code ?? null }));
  return {
    outcome,
    user: userId ? await getUser(auth.tenantId, userId) : null,
    sisRecord: record ? { sisId: record.sisId, institutionalId: record.institutionalId } : null,
    steps,
    requiredActions,
    ...(oneTimeCredential ? { oneTimeCredential: { system: 'MOODLE', ...oneTimeCredential } } : {}),
  };
}

/* ---------------------------------------------------------------- status */

/**
 * One person across the three systems, with consistency checks. Reads CampusCore and Moodle
 * live; the local mirror is refreshed from CampusCore, never trusted on its own.
 */
export async function personSystems(auth, userId) {
  const user = await getUser(auth.tenantId, userId);
  const local = await prisma.user.findFirst({ where: { id: userId, tenantId: auth.tenantId }, select: { passwordChangeRequired: true, studentProfile: { select: { id: true, studentNumber: true } }, facultyProfile: { select: { id: true, employeeNumber: true } } } });
  const warnings = [];
  const isSisPerson = user.roles.some((r) => SIS_ROLES.includes(r));

  const campuscore = isSisPerson ? await sis.identityOf(auth, userId).catch((error) => ({ state: 'ERROR', message: error.message })) : { state: 'NOT_APPLICABLE' };
  const profile = local.studentProfile ? { entityType: 'STUDENT', id: local.studentProfile.id, localId: local.studentProfile.studentNumber } : local.facultyProfile ? { entityType: 'FACULTY', id: local.facultyProfile.id, localId: local.facultyProfile.employeeNumber } : null;

  let moodleState = { state: 'NOT_LINKED' };
  if (profile) {
    const link = await moodle.moodleLinkOf(auth.tenantId, profile.entityType, profile.id);
    if (link) {
      moodleState = { state: link.status === 'SUSPENDED' ? 'SUSPENDED' : 'LINKED', moodleUserId: Number(link.externalId), linkMethod: link.linkMethod };
      const account = await moodle.moodleAccountById(auth.tenantId, Number(link.externalId)).catch((error) => ({ error: error.message }));
      if (account?.error) moodleState.liveError = account.error;
      else if (account) {
        moodleState.account = account;
        if (campuscore.state === 'LINKED' && account.idnumber && account.idnumber !== campuscore.institutionalId) warnings.push(`Moodle ID number ${account.idnumber} differs from CampusCore ${campuscore.institutionalId}: the Moodle account may belong to a different identity. Verify before relying on it.`);
        if (account.email && account.email.toLowerCase() !== user.email.toLowerCase()) warnings.push('The Moodle account email differs from the EduNexusAI login email.');
      } else warnings.push(`Moodle user ${link.externalId} no longer exists in Moodle.`);
    }
  }
  if (campuscore.state === 'UNMAPPED' && isSisPerson) warnings.push('Not linked to a CampusCore record: SIS pages show "not linked" until an administrator verifies and links the record.');
  if (campuscore.state === 'LINKED' && profile?.localId && profile.localId !== campuscore.institutionalId) warnings.push(`The portal profile carries the local number ${profile.localId}, not CampusCore’s institutional ID ${campuscore.institutionalId}. Onboarding uses the CampusCore ID for new Moodle accounts.`);

  return {
    user,
    login: { status: user.status, passwordChangeRequired: local.passwordChangeRequired },
    profile: profile ? { entityType: profile.entityType, id: profile.id, localId: profile.localId } : null,
    // Every profile the person holds (a lecturer who also studies has both); each has its own Moodle link.
    profiles: [
      ...(local.studentProfile ? [{ entityType: 'STUDENT', id: local.studentProfile.id, localId: local.studentProfile.studentNumber }] : []),
      ...(local.facultyProfile ? [{ entityType: 'FACULTY', id: local.facultyProfile.id, localId: local.facultyProfile.employeeNumber }] : []),
    ],
    campuscore,
    moodle: moodleState,
    warnings,
  };
}
