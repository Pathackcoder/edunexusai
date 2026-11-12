import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { featureByKey } from '../../../../shared/analyticsCatalog.js';
import { analyticsConfig } from './config.js';
import { logger } from '../../utils/logger.js';

/**
 * Events the API records itself: sign-in, sign-out and features that were actually completed (a message sent, a
 * request submitted). The browser cannot write these. They are recorded after the action succeeded, outside its
 * transaction and without being awaited by the request, so analytics can never slow down or fail a real action.
 */
async function write({ tenantId, userId, rolesHeld, name, subjectKey = null, action = null }) {
  const config = analyticsConfig();
  if (!config.enabled) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, analyticsExcludedAt: true, tenant: { select: { analyticsEnabled: true } }, ...(rolesHeld ? {} : { userRoles: { select: { role: { select: { key: true } } } } }) },
  });
  if (!user || user.tenantId !== tenantId || user.analyticsExcludedAt) return false;
  if (!user.tenant.analyticsEnabled && !config.allowUserIds.includes(userId)) return false;
  await prisma.analyticsEvent.create({
    data: { id: crypto.randomUUID(), tenantId, userId, name, subjectKey, action, rolesHeld: rolesHeld ?? user.userRoles.map((link) => link.role.key), occurredAt: new Date() },
  });
  return true;
}

const safely = (promise) => promise.catch((error) => {
  logger.warn('Analytics server event not recorded', { code: error.code ?? error.name ?? 'error' });
  return false;
});

/** A completed feature (catalogue key with origin SERVER). `auth` is the request context. Never throws. */
export function trackFeature(auth, featureKey, action = null) {
  const feature = featureByKey(featureKey);
  if (!feature || feature.origin !== 'SERVER' || !auth?.userId) return Promise.resolve(false);
  return safely(write({ tenantId: auth.tenantId, userId: auth.userId, rolesHeld: auth.roles ?? null, name: 'feature.use', subjectKey: featureKey, action }));
}

/** method: PASSWORD | SSO. */
export function trackSignIn({ tenantId, userId, rolesHeld = null, method }) {
  return safely(write({ tenantId, userId, rolesHeld, name: 'auth.sign_in', action: method === 'SSO' ? 'SSO' : 'PASSWORD' }));
}

/** reason: PORTAL | PORTAL_LOCAL | PROVIDER. */
export function trackSignOut({ tenantId, userId, rolesHeld = null, reason = 'PORTAL' }) {
  return safely(write({ tenantId, userId, rolesHeld, name: 'auth.sign_out', action: reason }));
}
