import { prisma } from '../../db/prisma.js';
import { AppError, ErrorCode, badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { sisConfig } from '../../config/env.js';
import { recordAudit } from '../audit/auditService.js';
import { resolveRoleContexts } from '../users/roleContexts.js';
import { resolveContextEntitlements } from '../entitlements/entitlementService.js';
import { ADMINISTRATIVE_ROLES, COMMUNITY_ROLES, ROLE_CATEGORY, grantRole, removeRole, sourcesByRole, withdrawSource, auditRoleChange } from '../roles/roleAssignments.js';

/**
 * One account's access, as an administrator manages it: community roles (relationships with the
 * institution, each backed by its record), administrative roles (what the person may manage), the
 * provenance of every role, record and SIS links, sign-in identities and the resulting contexts.
 *
 * Rules (safe by design):
 * - STUDENT and FACULTY are never switched on by a toggle: they need their record, and with
 *   CampusCore connected, a verified CampusCore link. The way to add them is linking the record
 *   (POST /admin/users/:id/relationships), which creates the record, the link and the role together.
 * - STAFF needs a staff record (an employee number); with no HR integration, the administrator
 *   establishes it. ALUMNI is an administrator's assertion under institutional policy.
 * - ADMIN is administrative: only administrators assign it, with explicit confirmation; nobody can
 *   remove their own ADMIN role or the institution's last administrator.
 * - Removing one role never touches the person's other roles, records or links.
 */

const RECORD_OF = { STUDENT: 'studentProfile', FACULTY: 'facultyProfile', STAFF: 'staffProfile' };
const NUMBER_OF = { studentProfile: 'studentNumber', facultyProfile: 'employeeNumber', staffProfile: 'employeeNumber' };
const accountInclude = { userRoles: { include: { role: true } }, studentProfile: { include: { tier: true } }, facultyProfile: true, staffProfile: true };

async function loadAccount(tenantId, userId) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, include: accountInclude });
  if (!user) throw notFound('User not found.');
  return user;
}

const sisLinked = async (tenantId, userId, recordType) =>
  Boolean(await prisma.externalIdentity.findFirst({ where: { tenantId, provider: 'CAMPUSCORE', internalId: userId, entityType: recordType }, select: { id: true } }));

const recordRequired = (roleKey, message) =>
  new AppError(409, ErrorCode.CONFLICT, message, { reason: 'RECORD_REQUIRED', role: roleKey });

/** Throws unless `roleKey` may be given to this account right now (see the rules above). */
export async function assertRoleAssignable(tenantId, user, roleKey) {
  if (!ROLE_CATEGORY[roleKey]) throw badRequest(`Unknown role ${roleKey}.`);
  if (roleKey === 'STUDENT' || roleKey === 'FACULTY') {
    const label = roleKey === 'STUDENT' ? 'student' : 'faculty';
    if (!user[RECORD_OF[roleKey]]) throw recordRequired(roleKey, `The ${label} role needs this person's ${label} record. Link their CampusCore ${label} record instead; that creates the record link and the role together.`);
    if (sisConfig().valid && !(await sisLinked(tenantId, user.id, roleKey))) throw recordRequired(roleKey, `This account's ${label} record is not linked to CampusCore. Link the CampusCore ${label} record first.`);
  }
  if (roleKey === 'STAFF' && !user.staffProfile) throw recordRequired('STAFF', 'The staff role needs a staff record. Enter the employee number to create it.');
}

/**
 * Apply role additions and removals for one account (validated by the caller with
 * assertRoleAssignable). Each change is recorded with its source and audited.
 */
export async function assignRoles(tenantId, userId, { add = [], remove = [], actorUserId = null }) {
  for (const roleKey of remove.filter((r) => r === 'ADMIN')) {
    if (actorUserId && actorUserId === userId) throw forbidden('You cannot remove your own administrator role.');
    const admins = await prisma.userRole.count({ where: { role: { key: 'ADMIN' }, user: { tenantId, status: 'ACTIVE' } } });
    if (admins <= 1) throw conflict('This is the institution’s last active administrator. Make someone else an administrator first.');
    void roleKey;
  }
  const sis = sisConfig().valid;
  await prisma.$transaction(async (tx) => {
    for (const roleKey of add) {
      const source = (roleKey === 'STUDENT' || roleKey === 'FACULTY') && sis ? 'SIS' : 'MANUAL';
      await grantRole(tx, { tenantId, userId, roleKey, source, grantedByUserId: actorUserId });
      await auditRoleChange(tx, { tenantId, actorUserId, userId, action: 'ROLE_GRANTED', roleKey, source });
    }
    for (const roleKey of remove) {
      await removeRole(tx, { userId, roleKey });
      await auditRoleChange(tx, { tenantId, actorUserId, userId, action: 'ROLE_REMOVED', roleKey, source: 'MANUAL' });
    }
  });
}

/** Add one role (with its record where the policy allows the administrator to establish it). */
export async function addRole(tenantId, userId, { role, employeeNumber, title, department, confirm }, { actorUserId }) {
  const user = await loadAccount(tenantId, userId);
  if (user.userRoles.some((link) => link.role.key === role)) throw conflict(`This account already has the ${role} role.`);
  if (ADMINISTRATIVE_ROLES.includes(role) && confirm !== true) throw badRequest('Confirm that this person should get administrative access.', { reason: 'CONFIRMATION_REQUIRED' });
  if (role === 'STAFF' && !user.staffProfile) {
    const number = String(employeeNumber ?? '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(number)) throw recordRequired('STAFF', 'Enter the staff member’s employee number to create their staff record.');
    const taken = await prisma.staffProfile.findFirst({ where: { tenantId, employeeNumber: number }, select: { userId: true } });
    if (taken) throw conflict('Another account already has a staff record with this employee number.');
    await prisma.staffProfile.create({ data: { tenantId, userId, employeeNumber: number, title: title ?? null, department: department ?? null } });
    await recordAudit({ tenantId, actorUserId, action: 'STAFF_RECORD_CREATED', entityType: 'User', entityId: userId, summary: `Created staff record ${number}` });
    user.staffProfile = { employeeNumber: number };
  }
  await assertRoleAssignable(tenantId, user, role);
  await assignRoles(tenantId, userId, { add: [role], actorUserId });
  return getAccess(tenantId, userId);
}

/** Remove one role. Records and links stay; other roles are untouched. */
export async function removeRoleFrom(tenantId, userId, role, { confirm }, { actorUserId }) {
  const user = await loadAccount(tenantId, userId);
  if (!user.userRoles.some((link) => link.role.key === role)) throw notFound(`This account does not have the ${role} role.`);
  if (confirm !== true) throw badRequest('Confirm the removal.', { reason: 'CONFIRMATION_REQUIRED' });
  const sources = (await sourcesByRole(userId))[role] ?? [];
  await assignRoles(tenantId, userId, { remove: [role], actorUserId });
  const access = await getAccess(tenantId, userId);
  const reassertedBy = sources.filter((s) => s.source === 'IDP' && s.provider).map((s) => s.provider.displayName);
  return { ...access, notice: reassertedBy.length ? `${reassertedBy.join(', ')} still asserts this role; it will be granted again at the next sign-in unless the provider or the mapping changes.` : null };
}

/** Unlink an institutional sign-in identity. The provider's role grants go with it. */
export async function unlinkFederatedIdentity(tenantId, userId, federatedId, { actorUserId }) {
  const link = await prisma.federatedIdentity.findFirst({ where: { id: federatedId, tenantId, userId }, include: { provider: true } });
  if (!link) throw notFound('Sign-in identity not found.');
  await prisma.$transaction(async (tx) => {
    const grants = await tx.roleAssignmentSource.findMany({ where: { userId, providerId: link.providerId, source: 'IDP' } });
    for (const grant of grants) {
      const { removed } = await withdrawSource(tx, { userId, roleKey: grant.roleKey, source: 'IDP', providerId: link.providerId });
      if (removed) await auditRoleChange(tx, { tenantId, actorUserId, userId, action: 'ROLE_REMOVED', roleKey: grant.roleKey, source: 'IDP', summary: `Removed ${grant.roleKey}: ${link.provider.displayName} sign-in unlinked` });
    }
    await tx.federatedIdentity.delete({ where: { id: link.id } });
    // Sessions started with this identity end now, not when their tokens expire.
    await tx.ssoSession.updateMany({ where: { userId, providerId: link.providerId, subject: link.subject, endedAt: null }, data: { endedAt: new Date(), endedReason: 'IDENTITY_UNLINKED', idTokenSealed: null } });
    await recordAudit({ tenantId, actorUserId, action: 'SSO_IDENTITY_UNLINKED', entityType: 'User', entityId: userId, summary: `Unlinked ${link.provider.displayName} sign-in` }, tx);
  });
  return getAccess(tenantId, userId);
}

/**
 * Link an institutional sign-in to an account on an administrator's verification, for people the
 * automatic first-sign-in rule cannot match (it needs a student or employee number on the account,
 * e.g. alumni have neither). The administrator names the provider and the person's subject at that
 * provider (the Keycloak user id) and records how they verified it; email is never used. Linking
 * grants no role: roles still come only from this institution's mapping rules (or an administrator),
 * applied at each sign-in. Audited with the verification note.
 */
export async function linkFederatedIdentity(tenantId, userId, { providerId, subject, verificationNote }, { actorUserId }) {
  await loadAccount(tenantId, userId);
  const provider = await prisma.identityProvider.findFirst({ where: { id: providerId, tenantId } });
  if (!provider) throw notFound('Sign-in provider not found.');
  if (await prisma.federatedIdentity.findFirst({ where: { providerId: provider.id, userId } })) throw conflict(`This account already has a ${provider.displayName} sign-in. Unlink it first.`);
  if (await prisma.federatedIdentity.findUnique({ where: { issuer_subject: { issuer: provider.issuer, subject } } })) throw conflict('This sign-in identity is already linked to an account.');
  await prisma.$transaction(async (tx) => {
    await tx.federatedIdentity.create({ data: { tenantId, userId, providerId: provider.id, issuer: provider.issuer, subject, emailAtLink: null, linkMethod: 'ADMIN_VERIFIED' } });
    await recordAudit({ tenantId, actorUserId, action: 'SSO_IDENTITY_LINKED', entityType: 'User', entityId: userId, summary: `Linked ${provider.displayName} sign-in (administrator verified: ${verificationNote})` }, tx);
  });
  return getAccess(tenantId, userId);
}

/** Everything an administrator needs to understand and manage one account's access. */
export async function getAccess(tenantId, userId) {
  const user = await loadAccount(tenantId, userId);
  const roles = user.userRoles.map((link) => link.role.key);
  const [sources, links, federated, contexts] = await Promise.all([
    sourcesByRole(userId),
    prisma.externalIdentity.findMany({ where: { tenantId, OR: [{ provider: 'CAMPUSCORE', internalId: userId }, { provider: 'MOODLE', internalId: { in: [user.studentProfile?.id, user.facultyProfile?.id].filter(Boolean) } }] } }),
    prisma.federatedIdentity.findMany({ where: { tenantId, userId }, include: { provider: { select: { id: true, displayName: true, key: true } } }, orderBy: { linkedAt: 'asc' } }),
    resolveRoleContexts(user, roles, (context) => resolveContextEntitlements({ tenantId, context, tierId: user.studentProfile?.tierId ?? null })),
  ]);
  const sisMode = sisConfig().valid;
  const sisLink = (type) => links.find((l) => l.provider === 'CAMPUSCORE' && l.entityType === type) ?? null;
  const moodleLink = (profileId, type) => links.find((l) => l.provider === 'MOODLE' && l.entityType === type && l.internalId === profileId) ?? null;
  const recordFor = (roleKey) => {
    const relation = RECORD_OF[roleKey];
    const profile = relation ? user[relation] : null;
    if (!relation) return null;
    return profile ? { type: relation, number: profile[NUMBER_OF[relation]], profileId: profile.id } : null;
  };
  const roleRow = (roleKey) => {
    const record = recordFor(roleKey);
    const sis = roleKey === 'STUDENT' || roleKey === 'FACULTY' ? (sisMode ? (sisLink(roleKey) ? 'LINKED' : 'NOT_LINKED') : 'NOT_CONFIGURED') : null;
    const moodle = roleKey === 'STUDENT' || roleKey === 'FACULTY' ? (record ? moodleLink(record.profileId, roleKey) : null) : null;
    const context = contexts.contexts.find((c) => c.role === roleKey) ?? null;
    return {
      key: roleKey,
      category: ROLE_CATEGORY[roleKey],
      status: ROLE_CATEGORY[roleKey] === 'ADMINISTRATIVE' ? 'ACTIVE' : context?.status ?? 'UNLINKED',
      record,
      sisLink: sis,
      sisRecordId: sisLink(roleKey)?.externalId ?? null,
      moodle: moodle ? { moodleUserId: Number(moodle.externalId), status: moodle.status, linkMethod: moodle.linkMethod } : null,
      sources: sources[roleKey]?.length ? sources[roleKey] : [{ source: 'EXISTING', provider: null, createdAt: null }],
      ...(roleKey === 'STUDENT' ? { tier: user.studentProfile?.tier ? { key: user.studentProfile.tier.key, name: user.studentProfile.tier.name } : null } : {}),
    };
  };
  const held = [...COMMUNITY_ROLES, ...ADMINISTRATIVE_ROLES].filter((r) => roles.includes(r));
  const addable = await Promise.all([...COMMUNITY_ROLES, ...ADMINISTRATIVE_ROLES].filter((r) => !roles.includes(r)).map(async (roleKey) => {
    try {
      await assertRoleAssignable(tenantId, user, roleKey);
      return { key: roleKey, category: ROLE_CATEGORY[roleKey], how: 'ASSIGN' };
    } catch (error) {
      const how = roleKey === 'STUDENT' || roleKey === 'FACULTY' ? (sisMode ? 'LINK_SIS_RECORD' : 'RECORD_REQUIRED') : roleKey === 'STAFF' ? 'CREATE_STAFF_RECORD' : 'ASSIGN';
      return { key: roleKey, category: ROLE_CATEGORY[roleKey], how, reason: error.message };
    }
  }));
  return {
    user: { id: user.id, email: user.email, fullName: `${user.firstName} ${user.lastName}`, status: user.status, lastLoginAt: user.lastLoginAt },
    sisConfigured: sisMode,
    roles: held.map(roleRow),
    addable,
    contexts: contexts.contexts.map(({ key, role, status, reason }) => ({ key, role, status, reason: reason ?? null })),
    workspaces: contexts.workspaces,
    signInIdentities: federated.map((f) => ({ id: f.id, provider: f.provider, linkMethod: f.linkMethod, linkedAt: f.linkedAt, lastLoginAt: f.lastLoginAt, lastEvaluation: f.lastEvaluation ?? null })),
  };
}

/** Role badges with their status for the user list (one query for every listed account). */
export async function roleStatusesFor(tenantId, users) {
  const ids = users.map((u) => u.id);
  const sisMode = sisConfig().valid;
  const mirror = sisMode ? await prisma.externalIdentity.findMany({ where: { tenantId, provider: 'CAMPUSCORE', internalId: { in: ids } }, select: { internalId: true, entityType: true } }) : [];
  const linked = new Set(mirror.map((m) => `${m.internalId}:${m.entityType}`));
  return new Map(users.map((u) => [u.id, (u.userRoles ?? []).map((link) => {
    const key = link.role.key;
    const relation = RECORD_OF[key];
    let status = 'ACTIVE';
    if (relation && !u[relation]) status = 'UNLINKED';
    else if (sisMode && (key === 'STUDENT' || key === 'FACULTY') && !linked.has(`${u.id}:${key}`)) status = 'SIS_NOT_LINKED';
    return { key, category: ROLE_CATEGORY[key] ?? 'COMMUNITY', status };
  })]));
}
