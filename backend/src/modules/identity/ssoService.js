import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { recordAudit } from '../audit/auditService.js';
import { issueSession } from '../auth/authService.js';
import { provisionFromSignIn, verifyRelationship } from '../sis/sisService.js';
import { provisionLmsAfterSignIn } from '../people/lmsFollowUp.js';
import { refreshDirectoryEntry } from '../people/directorySync.js';
import { logger } from '../../utils/logger.js';
import { grantRole, withdrawSource, auditRoleChange } from '../roles/roleAssignments.js';
import { decideAccountLink, planRoleSync, readClaim, resolveCommunityRoles } from './identityPolicy.js';
import { evaluateClaims } from './providerService.js';
import { activeSsoSession, redeemHandoff, startSsoSession } from './ssoSessions.js';

/**
 * Institutional sign-in, after the provider's response has been verified (oidcClient.completeLogin):
 *
 *   1. the account: the stable link (issuer + subject), or at first sign-in the account whose VERIFIED
 *      institutional numbers equal the provider's claims (email must agree; never email alone), or, when the
 *      provider's JIT switch is on and nobody has those numbers, an account created from the CampusCore
 *      person who holds them (sisService.provisionFromSignIn)
 *   2. the records: each record-backed role is checked (Student/Faculty: live in CampusCore when it is
 *      connected; Staff: a staff record, or the provider's staff policy)
 *   3. the roles: this institution's mapping rules turn claims into community roles, granted only with
 *      their evidence; the provider adds or withdraws only its own grants; never an administrative role
 *   4. the session: an sso_sessions row now; the same session as a password sign-in when the browser
 *      exchanges the single-use hand-off code (ssoSessions.js)
 *
 * Every refusal names a reason code for the user and is audited without identity details.
 */

export class SsoRefusal extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SsoRefusal';
    this.reason = reason;
  }
}

const accountInclude = { userRoles: { include: { role: true } }, studentProfile: true, facultyProfile: true, staffProfile: true };

async function refuse(tenantId, reason, providerKey) {
  await recordAudit({ tenantId, action: 'SSO_REFUSED', entityType: 'IdentityProvider', summary: `Institutional sign-in refused (${providerKey}): ${reason}` }).catch(() => {});
  throw new SsoRefusal(reason);
}

/** Accounts whose verified institutional numbers equal the claimed ones. */
async function matchesFor(tenantId, providerId, { studentIds, employeeIds }) {
  const rows = [
    ...(studentIds.length ? (await prisma.studentProfile.findMany({ where: { tenantId, studentNumber: { in: studentIds } }, include: { user: true } })).map((p) => ({ user: p.user, via: 'STUDENT_NUMBER' })) : []),
    ...(employeeIds.length ? (await prisma.facultyProfile.findMany({ where: { tenantId, employeeNumber: { in: employeeIds } }, include: { user: true } })).map((p) => ({ user: p.user, via: 'EMPLOYEE_NUMBER' })) : []),
    ...(employeeIds.length ? (await prisma.staffProfile.findMany({ where: { tenantId, employeeNumber: { in: employeeIds } }, include: { user: true } })).map((p) => ({ user: p.user, via: 'EMPLOYEE_NUMBER' })) : []),
  ];
  const linked = new Set((await prisma.federatedIdentity.findMany({ where: { providerId, userId: { in: rows.map((r) => r.user.id) } }, select: { userId: true } })).map((r) => r.userId));
  return rows.map(({ user, via }) => ({ userId: user.id, email: user.email, status: user.status, via, linkedSubject: linked.has(user.id) }));
}

/** Which records back this account's roles right now: { student, faculty, staff } plus reasons. */
async function verifiedRecords(user, tenant, { studentIds, employeeIds }) {
  const auth = { userId: user.id, tenantId: tenant.id, tenantSlug: tenant.slug, email: user.email, roles: user.userRoles.map((l) => l.role.key) };
  const reasons = {};
  const check = async (kind, profile, number, ids) => {
    if (!profile) { reasons[kind] = `NO_${kind.toUpperCase()}_RECORD`; return false; }
    if (ids.length && !ids.includes(number)) { reasons[kind] = 'RECORD_MISMATCH'; return false; }
    const result = await verifyRelationship(auth, kind.toUpperCase(), number);
    if (!result.verified) reasons[kind] = result.reason;
    return result.verified;
  };
  const student = await check('student', user.studentProfile, user.studentProfile?.studentNumber, studentIds);
  const faculty = await check('faculty', user.facultyProfile, user.facultyProfile?.employeeNumber, employeeIds);
  let staff = Boolean(user.staffProfile) && (!employeeIds.length || employeeIds.includes(user.staffProfile.employeeNumber));
  if (!user.staffProfile) reasons.staff = 'NO_STAFF_RECORD';
  else if (!staff) reasons.staff = 'RECORD_MISMATCH';
  return { student, faculty, staff, reasons };
}

/**
 * Resolve a verified external identity to an EdunexusAI session.
 * `identity`: { issuer, subject, claims, idToken } from completeLogin. Returns { userId, ssoSessionId, evaluation }.
 */
export async function signInWithProvider({ tenant, provider, identity }) {
  const claims = identity.claims ?? {};
  const studentIds = provider.studentIdClaim ? readClaim(claims, provider.studentIdClaim) : [];
  const employeeIds = provider.employeeIdClaim ? readClaim(claims, provider.employeeIdClaim) : [];

  // 1. The account.
  const existing = await prisma.federatedIdentity.findUnique({ where: { issuer_subject: { issuer: identity.issuer, subject: identity.subject } }, include: { user: true } });
  if (existing && (existing.tenantId !== tenant.id || existing.providerId !== provider.id)) await refuse(tenant.id, 'IDENTITY_BELONGS_ELSEWHERE', provider.key);
  const decision = decideAccountLink({
    existing: existing ? { userId: existing.userId, status: existing.user.status } : null,
    claims: { email: claims.email ?? null, emailVerified: claims.email_verified === true, studentIds, employeeIds },
    matches: existing ? [] : await matchesFor(tenant.id, provider.id, { studentIds, employeeIds }),
  });
  // SSO-first (the provider's switch): nobody has these numbers yet, so the account is created from CampusCore.
  if (decision.decision === 'REFUSE' && decision.reason === 'NO_MATCHING_RECORD' && provider.jitProvisioning) {
    const created = await provisionFromSignIn({ tenant, providerLabel: provider.displayName, email: claims.email ?? null, emailVerified: claims.email_verified === true, studentIds, employeeIds });
    if (created.refused) await refuse(tenant.id, created.refused, provider.key);
    Object.assign(decision, { decision: 'LINK', userId: created.userId, via: ['JIT_PROVISIONED'] });
    // Moodle account and enrolments follow in the background (MOODLE_JIT_PROVISIONING); the sign-in never waits.
    setImmediate(() => provisionLmsAfterSignIn({ tenantId: tenant.id, userId: created.userId }).catch((error) => logger.warn('Moodle follow-up could not start', { code: error.code ?? null })));
    // People Search lists the new account (derived from CampusCore), so others can find and message them.
    setImmediate(() => refreshDirectoryEntry(tenant.id, created.userId));
  }
  if (decision.decision === 'REFUSE') await refuse(tenant.id, decision.reason, provider.key);
  if (decision.decision === 'LINK') {
    try {
      await prisma.federatedIdentity.create({ data: { tenantId: tenant.id, userId: decision.userId, providerId: provider.id, issuer: identity.issuer, subject: identity.subject, emailAtLink: claims.email ?? null, linkMethod: decision.via[0] === 'JIT_PROVISIONED' ? 'JIT_PROVISIONED' : 'INSTITUTIONAL_ID' } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') await refuse(tenant.id, 'ACCOUNT_LINKED_TO_ANOTHER_IDENTITY', provider.key);
      throw error;
    }
    await recordAudit({ tenantId: tenant.id, actorUserId: decision.userId, action: 'SSO_IDENTITY_LINKED', entityType: 'User', entityId: decision.userId, summary: decision.via[0] === 'JIT_PROVISIONED' ? `Linked ${provider.displayName} sign-in to the account created at this first sign-in` : `Linked ${provider.displayName} sign-in at first sign-in (verified ${decision.via.join(' and ').toLowerCase().replace(/_/g, ' ')})` });
  }
  const userId = decision.userId;
  let user = await prisma.user.findUnique({ where: { id: userId }, include: accountInclude });
  if (!user || user.status !== 'ACTIVE') await refuse(tenant.id, 'ACCOUNT_DISABLED', provider.key);

  // 2 + 3. Records and roles.
  const rules = await prisma.identityRoleMapping.findMany({ where: { tenantId: tenant.id, providerId: provider.id } });
  const { mapped, unknown } = evaluateClaims(claims, rules);
  // Institutional policy: the provider's employee number establishes a staff record.
  if (mapped.has('STAFF') && !user.staffProfile && provider.employeeIdEstablishesStaff && employeeIds.length === 1) {
    const taken = await prisma.staffProfile.findFirst({ where: { tenantId: tenant.id, employeeNumber: employeeIds[0] }, select: { userId: true } });
    if (!taken) {
      await prisma.staffProfile.create({ data: { tenantId: tenant.id, userId, employeeNumber: employeeIds[0] } });
      await recordAudit({ tenantId: tenant.id, actorUserId: userId, action: 'STAFF_RECORD_CREATED', entityType: 'User', entityId: userId, summary: `Staff record ${employeeIds[0]} established from ${provider.displayName} (institutional policy)` });
      user = await prisma.user.findUnique({ where: { id: userId }, include: accountInclude });
    }
  }
  const records = await verifiedRecords(user, tenant, { studentIds, employeeIds });
  const { granted, withheld } = resolveCommunityRoles(mapped, records);
  const withheldWithReasons = withheld.map((w) => ({ ...w, reason: records.reasons[w.role.toLowerCase()] ?? w.reason }));
  const current = (await prisma.roleAssignmentSource.findMany({ where: { userId, providerId: provider.id, source: 'IDP' }, select: { roleKey: true } })).map((r) => r.roleKey);
  const plan = planRoleSync({ current, desired: granted.map((g) => g.role) });
  await prisma.$transaction(async (tx) => {
    for (const role of plan.grant) {
      const values = granted.find((g) => g.role === role)?.values ?? [];
      const { created } = await grantRole(tx, { tenantId: tenant.id, userId, roleKey: role, source: 'IDP', providerId: provider.id, evidence: { claims: values } });
      if (created) await auditRoleChange(tx, { tenantId: tenant.id, actorUserId: userId, userId, action: 'ROLE_GRANTED', roleKey: role, source: 'IDP', summary: `Granted ${role} from ${provider.displayName} (${values.join(', ')})` });
    }
    for (const role of plan.withdraw) {
      const { removed } = await withdrawSource(tx, { userId, roleKey: role, source: 'IDP', providerId: provider.id });
      if (removed) await auditRoleChange(tx, { tenantId: tenant.id, actorUserId: userId, userId, action: 'ROLE_REMOVED', roleKey: role, source: 'IDP', summary: `Removed ${role}: no longer asserted by ${provider.displayName}` });
    }
  });

  const evaluation = { at: new Date().toISOString(), mapped: Object.fromEntries(mapped), granted: granted.map((g) => g.role), withheld: withheldWithReasons.map(({ role, reason }) => ({ role, reason })), unknown };
  await prisma.federatedIdentity.update({ where: { issuer_subject: { issuer: identity.issuer, subject: identity.subject } }, data: { lastLoginAt: new Date(), lastEvaluation: evaluation } });

  // The account must still be able to do something after the provider's roles were applied.
  const roleCount = await prisma.userRole.count({ where: { userId } });
  if (roleCount === 0) await refuse(tenant.id, 'NO_ACCESS', provider.key);

  // 4. The institutional session (sso_sessions); the portal session is issued when the browser exchanges
  //    the hand-off code for it.
  const ssoSession = await startSsoSession({ tenantId: tenant.id, userId, providerId: provider.id, subject: identity.subject, idpSessionId: claims.sid ? String(claims.sid) : null, idToken: identity.idToken ?? null });
  await recordAudit({ tenantId: tenant.id, actorUserId: userId, action: 'SSO_SIGN_IN', entityType: 'User', entityId: userId, summary: `Signed in with ${provider.displayName}` });
  return { userId, ssoSessionId: ssoSession.id, evaluation };
}

/** Exchange a hand-off code (once) for the portal session. Null when the code or its session is no longer valid. */
export async function exchangeHandoff(code) {
  const handoff = await redeemHandoff(code);
  if (!handoff) return null;
  const session = await activeSsoSession(handoff.ssoSessionId, handoff.userId);
  if (!session) return null;
  const tokens = await issueSession({ id: handoff.userId }, { idp: session.provider.key, sid: session.id });
  return { ...tokens, returnTo: handoff.returnTo };
}
