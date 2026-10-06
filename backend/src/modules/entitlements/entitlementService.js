import { facultyWidgets } from '../../../../shared/facultyWidgets.js';
import { badRequest } from '../../utils/errors.js';
import { prisma } from '../../db/prisma.js';

/**
 * Entitlements.
 *
 * Which widgets a student sees is data, not code. The resolution order is:
 *
 *   role  ->  what kind of experience the user gets at all
 *   tier  ->  which widget set that student's tier grants
 *   entitlement rows  ->  the per-widget on/off switch an admin controls
 *
 * The frontend asks for this list and renders what comes back. There is no
 * `if (user.email === ...)` anywhere, and no component decides its own visibility.
 */

/** Widgets granted to a role that has no tier (faculty, admin). */
const ROLE_DEFAULT_WIDGETS = {
  FACULTY: facultyWidgets.map((widget) => widget.key),
  ADMIN: [
    'admin.users',
    'admin.roles',
    'admin.tiers',
    'admin.entitlements',
    'admin.integrations',
    'admin.integration_health',
  ],
};

/**
 * @returns {Promise<{widgets: string[], tier: object|null, source: string}>}
 */
export async function resolveEntitlements({ tenantId, roles, tierId }) {
  // A student's widgets come from their tier's entitlement rows.
  if (tierId) {
    const tier = await prisma.studentTier.findFirst({
      where: { id: tierId, tenantId },
      include: {
        entitlements: {
          where: { enabled: true },
          include: { widget: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (tier) {
      return {
        tier: { id: tier.id, key: tier.key, name: tier.name, description: tier.description, rank: tier.rank },
        widgets: tier.entitlements.map((entitlement) => entitlement.widget.key),
        widgetDetails: tier.entitlements.map((entitlement) => ({
          key: entitlement.widget.key,
          label: entitlement.widget.label,
          category: entitlement.widget.category,
          route: entitlement.widget.route,
          sortOrder: entitlement.sortOrder,
        })),
        source: 'TIER',
      };
    }
  }

  // Faculty and admin are role-driven; they have no student tier.
  const overrides = await prisma.roleWidgetEntitlement.findMany({ where: { tenantId, roleKey: { in: roles } } });
  const widgets = roles.flatMap((role) => (ROLE_DEFAULT_WIDGETS[role] ?? []).filter((key) =>
    overrides.find((row) => row.roleKey === role && row.widgetKey === key)?.enabled !== false));
  return {
    tier: null,
    widgets: [...new Set(widgets)],
    widgetDetails: [...new Set(widgets)].map((key) => ({ key, label: key, category: 'role', route: null, sortOrder: 0 })),
    source: 'ROLE',
  };
}

/** Admin view: the full grid of tiers x widgets, including the disabled cells. */
export async function listEntitlementMatrix(tenantId) {
  const [tiers, widgets, entitlements] = await Promise.all([
    prisma.studentTier.findMany({ where: { tenantId }, orderBy: { rank: 'asc' } }),
    prisma.widgetDefinition.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.widgetEntitlement.findMany({ where: { tenantId } }),
  ]);

  const facultyOverrides = await prisma.roleWidgetEntitlement.findMany({ where: { tenantId, roleKey: 'FACULTY' } });
  const enabledFor = new Map(entitlements.map((row) => [`${row.tierId}:${row.widgetId}`, row]));

  return {
    faculty: { widgets: facultyWidgets, entitlements: facultyWidgets.map((widget) => ({ widgetKey: widget.key, enabled: facultyOverrides.find((row) => row.widgetKey === widget.key)?.enabled ?? true })) },
    tiers: tiers.map((tier) => ({
      id: tier.id,
      key: tier.key,
      name: tier.name,
      description: tier.description,
      rank: tier.rank,
      studentCount: undefined,
    })),
    widgets: widgets.map((widget) => ({
      id: widget.id,
      key: widget.key,
      label: widget.label,
      description: widget.description,
      category: widget.category,
      route: widget.route,
      sortOrder: widget.sortOrder,
    })),
    matrix: tiers.map((tier) => ({
      tierId: tier.id,
      tierKey: tier.key,
      entitlements: widgets.map((widget) => {
        const row = enabledFor.get(`${tier.id}:${widget.id}`);
        return {
          entitlementId: row?.id ?? null,
          widgetId: widget.id,
          widgetKey: widget.key,
          enabled: row?.enabled ?? false,
        };
      }),
    })),
  };
}

/**
 * Flip widgets on or off for a tier. This is the admin action that changes what a
 * student sees on their next dashboard load.
 */
export async function updateEntitlements(tenantId, updates) {
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const update of updates) {
      if (update.tierId === 'FACULTY') {
        if (!facultyWidgets.some((widget) => widget.key === update.widgetKey)) throw badRequest('Unknown faculty widget.');
        const row = await tx.roleWidgetEntitlement.upsert({
          where: { tenantId_roleKey_widgetKey: { tenantId, roleKey: 'FACULTY', widgetKey: update.widgetKey } },
          create: { tenantId, roleKey: 'FACULTY', widgetKey: update.widgetKey, enabled: update.enabled },
          update: { enabled: update.enabled },
        });
        results.push(row);
        continue;
      }
      const tier = await tx.studentTier.findFirst({ where: { id: update.tierId, tenantId } });
      const widget = await tx.widgetDefinition.findUnique({ where: { key: update.widgetKey } });
      if (!tier || !widget) throw badRequest('Unknown tier or widget.');
      results.push(await tx.widgetEntitlement.upsert({
        where: { tierId_widgetId: { tierId: tier.id, widgetId: widget.id } },
        create: { tenantId, tierId: tier.id, widgetId: widget.id, enabled: update.enabled, sortOrder: widget.sortOrder },
        update: { enabled: update.enabled },
      }));
    }
    return results;
  });
}

export async function listTiers(tenantId) {
  const tiers = await prisma.studentTier.findMany({
    where: { tenantId },
    orderBy: { rank: 'asc' },
    include: {
      _count: { select: { students: true, entitlements: true } },
      entitlements: { where: { enabled: true }, include: { widget: true } },
    },
  });
  return tiers.map((tier) => ({
    id: tier.id,
    key: tier.key,
    name: tier.name,
    description: tier.description,
    rank: tier.rank,
    studentCount: tier._count.students,
    enabledWidgets: tier.entitlements.map((e) => e.widget.key),
  }));
}
