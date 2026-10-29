import { prisma } from '../../db/prisma.js';
import { recordAudit } from '../audit/auditService.js';

/**
 * Role assignments and their provenance.
 *
 * `user_roles` says WHICH roles a person holds (every authorisation check reads it). Each
 * `role_assignment_sources` row is one reason the role is held:
 *   EXISTING  held before provenance was recorded (backfilled by the migration)
 *   MANUAL    assigned by an administrator (Staff, Alumni, Administrator)
 *   SIS       established from a verified SIS record link (Student, Faculty)
 *   IDP       asserted by an identity provider under the institution's mapping rules
 * A role held with no source rows is treated as EXISTING (accounts created by the seed).
 *
 * Community roles describe the person's relationships with the institution; administrative roles
 * describe what they may manage. External identity is never a source of an administrative role.
 */

export const COMMUNITY_ROLES = ['STUDENT', 'FACULTY', 'STAFF', 'ALUMNI'];
export const ADMINISTRATIVE_ROLES = ['ADMIN'];
export const ROLE_CATEGORY = Object.fromEntries([...COMMUNITY_ROLES.map((r) => [r, 'COMMUNITY']), ...ADMINISTRATIVE_ROLES.map((r) => [r, 'ADMINISTRATIVE'])]);
export const SOURCES = ['EXISTING', 'MANUAL', 'SIS', 'IDP'];

export const sourceKeyOf = (source, providerId = null) => (source === 'IDP' ? `IDP:${providerId}` : source);

/**
 * Give `roleKey` to the user from `source` (inside a transaction when `client` is one). Creates the
 * `user_roles` row when missing; never a duplicate role, never a duplicate source row.
 * Returns { created } (true when the role itself was added).
 */
export async function grantRole(client, { tenantId, userId, roleKey, source, providerId = null, grantedByUserId = null, evidence = null }) {
  if (!SOURCES.includes(source) || source === 'EXISTING') throw new Error(`Unknown role source ${source}`);
  if (source === 'IDP' && !COMMUNITY_ROLES.includes(roleKey)) throw new Error('An identity provider can only be the source of a community role.');
  const role = await client.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`Role ${roleKey} does not exist (database migration missing?)`);
  const held = await client.userRole.findUnique({ where: { userId_roleId: { userId, roleId: role.id } } });
  if (!held) await client.userRole.create({ data: { userId, roleId: role.id } });
  const sourceKey = sourceKeyOf(source, providerId);
  await client.roleAssignmentSource.upsert({
    where: { userId_roleKey_sourceKey: { userId, roleKey, sourceKey } },
    update: { confirmedAt: new Date(), ...(evidence ? { evidence } : {}) },
    create: { tenantId, userId, roleKey, source, sourceKey, providerId, grantedByUserId, createdRole: !held, evidence },
  });
  return { created: !held };
}

/**
 * Withdraw one source of a role. The role itself goes only when this source created it and no other
 * source remains, so an identity provider can never take away a role an administrator assigned.
 * Returns { removed } (true when the role itself was removed).
 */
export async function withdrawSource(client, { userId, roleKey, source, providerId = null }) {
  const sourceKey = sourceKeyOf(source, providerId);
  const row = await client.roleAssignmentSource.findUnique({ where: { userId_roleKey_sourceKey: { userId, roleKey, sourceKey } } });
  if (!row) return { removed: false };
  await client.roleAssignmentSource.delete({ where: { id: row.id } });
  const remaining = await client.roleAssignmentSource.count({ where: { userId, roleKey } });
  if (!row.createdRole || remaining > 0) return { removed: false };
  const role = await client.role.findUnique({ where: { key: roleKey } });
  await client.userRole.deleteMany({ where: { userId, roleId: role.id } });
  return { removed: true };
}

/** An administrator removes a role outright (every source). Other roles are untouched. */
export async function removeRole(client, { userId, roleKey }) {
  const role = await client.role.findUnique({ where: { key: roleKey } });
  if (!role) return { removed: false };
  const { count } = await client.userRole.deleteMany({ where: { userId, roleId: role.id } });
  await client.roleAssignmentSource.deleteMany({ where: { userId, roleKey } });
  return { removed: count > 0 };
}

/** Sources per role for one user: { STUDENT: [{ source, providerId, createdAt, ... }], ... }. */
export async function sourcesByRole(userId, client = prisma) {
  const rows = await client.roleAssignmentSource.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, include: { provider: { select: { displayName: true, key: true } } } });
  const out = {};
  for (const row of rows) {
    (out[row.roleKey] ??= []).push({
      source: row.source,
      provider: row.provider ? { key: row.provider.key, displayName: row.provider.displayName } : null,
      grantedByUserId: row.grantedByUserId,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt,
      evidence: row.evidence ?? null,
    });
  }
  return out;
}

export const auditRoleChange = (client, { tenantId, actorUserId, userId, action, roleKey, source, summary, metadata }) =>
  recordAudit({ tenantId, actorUserId, action, entityType: 'User', entityId: userId, summary: summary ?? `${action === 'ROLE_GRANTED' ? 'Granted' : 'Removed'} ${roleKey} (${source})`, metadata: { roleKey, source, ...(metadata ?? {}) } }, client);
