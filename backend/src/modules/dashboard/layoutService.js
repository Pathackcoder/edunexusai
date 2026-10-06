import { prisma } from '../../db/prisma.js';

/**
 * Per-user dashboard widget order. Visibility is still decided by entitlements; the
 * layout only orders whatever the user is entitled to. Unknown keys are kept so a
 * widget that is switched off and on again returns to its old place.
 */
export const DASHBOARD_KEYS = ['student', 'faculty'];

export async function getLayout(auth, dashboardKey) {
  const row = await prisma.dashboardLayout.findUnique({ where: { userId_dashboardKey: { userId: auth.userId, dashboardKey } } });
  return { dashboardKey, order: row?.widgetOrder ?? [], updatedAt: row?.updatedAt ?? null };
}

export async function saveLayout(auth, dashboardKey, order) {
  const unique = [...new Set(order)];
  const row = await prisma.dashboardLayout.upsert({
    where: { userId_dashboardKey: { userId: auth.userId, dashboardKey } },
    create: { tenantId: auth.tenantId, userId: auth.userId, dashboardKey, widgetOrder: unique },
    update: { widgetOrder: unique },
  });
  return { dashboardKey, order: row.widgetOrder, updatedAt: row.updatedAt };
}

export async function resetLayout(auth, dashboardKey) {
  await prisma.dashboardLayout.deleteMany({ where: { userId: auth.userId, dashboardKey } });
  return { dashboardKey, order: [], updatedAt: null };
}
