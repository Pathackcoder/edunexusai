import { prisma } from '../../db/prisma.js';
import { AppError, ErrorCode, badRequest, notFound } from '../../utils/errors.js';
import { recordAudit } from '../audit/auditService.js';
import { analyticsConfig } from './config.js';

/**
 * Who may open Admin → Analytics, and whether the institution collects at all.
 *
 * Access is a named grant (`analytics.view` in user_permissions) on top of the ADMIN role: holding ADMIN alone is
 * not enough, and losing ADMIN ends it. An administrator who holds it may grant or withdraw it for another active
 * administrator of the same institution; nobody changes their own (the first grant is made with
 * scripts/analytics-access.mjs). The routes enforce "who holds it"; this module enforces the rest.
 * Every grant, withdrawal and collection change is written to the audit trail.
 */
export const ANALYTICS_VIEW = 'analytics.view';

export async function listAccess(tenantId) {
  const admins = await prisma.user.findMany({
    where: { tenantId, userRoles: { some: { role: { key: 'ADMIN' } } } },
    select: { id: true, firstName: true, lastName: true, email: true, status: true, permissions: { where: { permission: ANALYTICS_VIEW }, select: { createdAt: true, grantedByUserId: true } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  const granterIds = [...new Set(admins.flatMap((admin) => admin.permissions.map((grant) => grant.grantedByUserId)).filter(Boolean))];
  const granters = new Map((await prisma.user.findMany({ where: { tenantId, id: { in: granterIds } }, select: { id: true, firstName: true, lastName: true } })).map((user) => [user.id, `${user.firstName} ${user.lastName}`]));
  return admins.map((admin) => ({
    id: admin.id, name: `${admin.firstName} ${admin.lastName}`, email: admin.email, status: admin.status,
    hasAccess: admin.permissions.length > 0,
    grantedAt: admin.permissions[0]?.createdAt ?? null,
    grantedBy: admin.permissions[0]?.grantedByUserId ? granters.get(admin.permissions[0].grantedByUserId) ?? null : null,
  }));
}

export async function setAccess(auth, userId, granted) {
  if (userId === auth.userId) throw new AppError(403, ErrorCode.FORBIDDEN, 'You cannot change your own analytics access. Ask another administrator.', { reason: 'SELF_GRANT' });
  const target = await prisma.user.findFirst({ where: { id: userId, tenantId: auth.tenantId }, select: { id: true, firstName: true, lastName: true, status: true, userRoles: { select: { role: { select: { key: true } } } } } });
  if (!target) throw notFound('Account not found.');
  if (granted && !target.userRoles.some((link) => link.role.key === 'ADMIN')) throw badRequest('Analytics access can only be given to an administrator.');
  if (granted && target.status !== 'ACTIVE') throw badRequest('Analytics access can only be given to an active account.');
  const name = `${target.firstName} ${target.lastName}`;
  if (granted) {
    await prisma.userPermission.upsert({
      where: { userId_permission: { userId, permission: ANALYTICS_VIEW } },
      create: { tenantId: auth.tenantId, userId, permission: ANALYTICS_VIEW, grantedByUserId: auth.userId },
      update: {},
    });
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'ANALYTICS_ACCESS_GRANTED', entityType: 'User', entityId: userId, summary: `Analytics access granted to ${name}` });
  } else {
    const { count } = await prisma.userPermission.deleteMany({ where: { tenantId: auth.tenantId, userId, permission: ANALYTICS_VIEW } });
    if (count) await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'ANALYTICS_ACCESS_REVOKED', entityType: 'User', entityId: userId, summary: `Analytics access withdrawn from ${name}` });
  }
  return listAccess(auth.tenantId);
}

/**
 * The institution's own collection switch. Switching it on requires the administrator to confirm that the
 * institution's privacy notice covers portal usage measurement; nothing is collected unless the deployment's
 * master switch (ANALYTICS_ENABLED) is on as well.
 */
export async function setCollection(auth, { enabled, noticeConfirmed = false }) {
  if (enabled && !noticeConfirmed) throw badRequest('Confirm that your institution\'s privacy notice covers portal usage measurement before switching collection on.');
  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { analyticsEnabled: true, analyticsStartedAt: true } });
  if (tenant.analyticsEnabled !== enabled) {
    await prisma.tenant.update({ where: { id: auth.tenantId }, data: { analyticsEnabled: enabled, ...(enabled && !tenant.analyticsStartedAt ? { analyticsStartedAt: new Date() } : {}) } });
    await recordAudit({
      tenantId: auth.tenantId, actorUserId: auth.userId, action: enabled ? 'ANALYTICS_COLLECTION_ENABLED' : 'ANALYTICS_COLLECTION_DISABLED', entityType: 'Tenant', entityId: auth.tenantId,
      summary: enabled ? 'Portal usage analytics switched on (privacy notice confirmed by the administrator)' : 'Portal usage analytics switched off',
    });
  }
  return { institutionEnabled: enabled, deploymentEnabled: analyticsConfig().enabled };
}
