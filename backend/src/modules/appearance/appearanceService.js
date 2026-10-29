import { prisma } from '../../db/prisma.js';
import { recordAudit } from '../audit/auditService.js';
import { TENANT_FALLBACK_SLUG } from '../auth/constants.js';
import { notFound } from '../../utils/errors.js';
import { findFont, findTheme } from '../../../../shared/appearancePresets.js';

/**
 * Portal appearance: the theme and typography presets an institution's administrators
 * choose. Stored per tenant (never global), returned as preset keys only. Unknown or
 * retired keys fall back to the defaults so a portal always renders.
 */
const present = (tenant) => ({
  themeKey: findTheme(tenant.appearanceTheme).key,
  fontKey: findFont(tenant.appearanceFont).key,
  updatedAt: tenant.appearanceUpdatedAt,
});

const select = { id: true, appearanceTheme: true, appearanceFont: true, appearanceUpdatedAt: true };

export async function getAppearance(tenantId) {
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select })
    : await prisma.tenant.findUnique({ where: { slug: TENANT_FALLBACK_SLUG }, select });
  if (!tenant) throw notFound('Institution not found.');
  return present(tenant);
}

export async function updateAppearance(tenantId, { themeKey, fontKey }, actorUserId) {
  const tenant = await prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.update({
      where: { id: tenantId },
      data: { appearanceTheme: themeKey, appearanceFont: fontKey, appearanceUpdatedAt: new Date() },
      select,
    });
    await recordAudit(
      {
        tenantId,
        actorUserId,
        action: 'APPEARANCE_UPDATED',
        entityType: 'Tenant',
        entityId: tenantId,
        summary: `Portal appearance set to ${findTheme(themeKey).label} with ${findFont(fontKey).label}`,
        metadata: { themeKey, fontKey },
      },
      tx,
    );
    return updated;
  });
  return present(tenant);
}
