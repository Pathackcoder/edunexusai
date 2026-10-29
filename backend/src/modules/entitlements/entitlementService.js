import { facultyWidgets } from '../../../../shared/facultyWidgets.js';
import { alumniWidgets, staffWidgets } from '../../../../shared/communityWidgets.js';
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
  STAFF: staffWidgets.map((widget) => widget.key),
  ALUMNI: alumniWidgets.map((widget) => widget.key),
  ADMIN: [
    'admin.users',
    'admin.roles',
    'admin.tiers',
    'admin.entitlements',
    'admin.integrations',
    'admin.integration_health',
  ],
};

const EMPTY = { tier: null, widgets: [], widgetDetails: [] };

/** A student's widgets come from their tier's entitlement rows. No tier, no widgets. */
async function tierEntitlements(tenantId, tierId) {
  if (!tierId) return null;
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
  if (!tier) return null;
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
  };
}

/** Faculty and admin widgets are role-driven (defaults minus the tenant's switched-off rows). */
async function roleEntitlements(tenantId, roles) {
  const overrides = await prisma.roleWidgetEntitlement.findMany({ where: { tenantId, roleKey: { in: roles } } });
  const widgets = [...new Set(roles.flatMap((role) => (ROLE_DEFAULT_WIDGETS[role] ?? []).filter((key) =>
    overrides.find((row) => row.roleKey === role && row.widgetKey === key)?.enabled !== false)))];
  return { tier: null, widgets, widgetDetails: widgets.map((key) => ({ key, label: key, category: 'role', route: null, sortOrder: 0 })) };
}

/**
 * The widgets of ONE role context ('student', 'faculty' or the 'admin' workspace).
 * Contexts never borrow from each other: a student tier applies only to the student context,
 * and being faculty never adds or upgrades a student widget (or the reverse).
 */
export async function resolveContextEntitlements({ tenantId, context, tierId = null }) {
  if (context === 'student') return { ...((await tierEntitlements(tenantId, tierId)) ?? EMPTY), source: 'TIER' };
  if (context === 'faculty') return { ...(await roleEntitlements(tenantId, ['FACULTY'])), source: 'ROLE' };
  if (context === 'staff') return { ...(await roleEntitlements(tenantId, ['STAFF'])), source: 'ROLE' };
  if (context === 'alumni') return { ...(await roleEntitlements(tenantId, ['ALUMNI'])), source: 'ROLE' };
  if (context === 'admin') return { ...(await roleEntitlements(tenantId, ['ADMIN'])), source: 'ROLE' };
  return { ...EMPTY, source: 'NONE' };
}

/**
 * The legacy flat list behind `/auth/me` `entitlements` (kept for existing clients).
 * For a single-role account it is exactly that role's list, as before. For several roles it
 * is the union of each context's own list; the keys are namespaced per context (dashboard.* /
 * feature.* for students, faculty.*, admin.*), so the union never widens any one context.
 * Tier widgets require the STUDENT role (deny by default).
 *
 * @returns {Promise<{widgets: string[], tier: object|null, source: 'TIER'|'ROLE'|'COMBINED'}>}
 */
export async function resolveEntitlements({ tenantId, roles, tierId }) {
  const student = roles.includes('STUDENT') ? await tierEntitlements(tenantId, tierId) : null;
  const byRole = await roleEntitlements(tenantId, roles.filter((role) => role !== 'STUDENT'));
  if (student && !byRole.widgets.length) return { ...student, source: 'TIER' };
  if (!student) return { ...byRole, source: 'ROLE' };
  const widgets = [...new Set([...student.widgets, ...byRole.widgets])];
  return {
    tier: student.tier,
    widgets,
    widgetDetails: [...student.widgetDetails, ...byRole.widgetDetails.filter((detail) => !student.widgets.includes(detail.key))],
    source: 'COMBINED',
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
