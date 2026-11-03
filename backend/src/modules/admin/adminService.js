import { prisma } from '../../db/prisma.js';
import { hashPassword } from '../auth/passwords.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import {
  getIntegration,
  listIntegrations,
  listSyncLogs,
  presentIntegration,
  testIntegration,
  availableProviders,
  tenantIntegrationSummary,
} from '../../integrations/integrationService.js';
import { syncAcademicDomains } from '../../integrations/syncService.js';
import { assertSisCapable, LIVE_ONLY_PROVIDERS } from '../../integrations/integrationService.js';
import { onboardUser } from '../onboarding/onboardingService.js';
import { assertRoleAssignable, assignRoles, roleStatusesFor } from './accessService.js';
import { grantRole, ROLE_CATEGORY } from '../roles/roleAssignments.js';

/** USERS ---------------------------------------------------------------------- */

function presentUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    phone: user.phone,
    status: user.status,
    roles: user.userRoles?.map((link) => link.role.key) ?? [],
    tier: user.studentProfile?.tier
      ? { id: user.studentProfile.tier.id, key: user.studentProfile.tier.key, name: user.studentProfile.tier.name }
      : null,
    studentNumber: user.studentProfile?.studentNumber ?? null,
    employeeNumber: user.facultyProfile?.employeeNumber ?? user.staffProfile?.employeeNumber ?? null,
    department: user.studentProfile?.department ?? user.facultyProfile?.department ?? user.staffProfile?.department ?? null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

const userInclude = {
  userRoles: { include: { role: true } },
  studentProfile: { include: { tier: true } },
  facultyProfile: true,
  staffProfile: true,
};

export async function listUsers(tenantId, { role, search, limit = 100 } = {}) {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      ...(role ? { userRoles: { some: { role: { key: role } } } } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: userInclude,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
  });
  // One row per account, with every role and whether its record is linked.
  const statuses = await roleStatusesFor(tenantId, users);
  return users.map((user) => ({ ...presentUser(user), roleDetails: statuses.get(user.id) ?? [] }));
}

export async function getUser(tenantId, id) {
  const user = await prisma.user.findFirst({ where: { tenantId, id }, include: userInclude });
  if (!user) throw notFound('User not found.');
  return presentUser(user);
}

/**
 * Next unused generated identifier. Starting from the count keeps numbers short, and
 * stepping past taken values avoids collisions once accounts have been removed.
 */
async function nextFreeNumber(model, tenantId, field, prefix, start) {
  let candidate = start;
  // eslint-disable-next-line no-await-in-loop
  while (await model.findFirst({ where: { tenantId, [field]: `${prefix}${candidate}` }, select: { id: true } })) candidate += 1;
  return `${prefix}${candidate}`;
}

/**
 * `baseline: false` creates only the identity (user, roles, persona profile) without the
 * onboarding baseline (demo teaching section, roster, coursework). The Moodle seed uses it
 * so demo faculty never bring fabricated local courses with them.
 */
export async function createUser(tenantId, payload, { actorUserId = null, baseline = true, temporaryPassword = true } = {}) {
  const email = payload.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } });
  if (existing) throw conflict('A user with that email already exists for this institution.');

  const roles = await prisma.role.findMany({ where: { key: { in: payload.roles } } });
  if (roles.length !== payload.roles.length) throw badRequest('One or more roles are unknown.');

  const passwordHash = await hashPassword(payload.password);

  // The account, its persona records and its onboarding data commit together: a new
  // Student or Faculty user never exists half-initialised with an empty dashboard.
  const userId = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          // An administrator-issued password is temporary: the user replaces it at first sign-in.
          passwordChangeRequired: temporaryPassword,
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone ?? null,
          status: payload.status ?? 'ACTIVE',
        },
      });
      // Every role is recorded with its source: an administrator created this account.
      for (const role of roles) {
        await grantRole(tx, { tenantId, userId: user.id, roleKey: role.key, source: 'MANUAL', grantedByUserId: actorUserId });
      }

      // Creating a STUDENT also creates the student record the student routes need.
      if (payload.roles.includes('STUDENT')) {
        const tier = payload.tierKey
          ? await tx.studentTier.findFirst({ where: { tenantId, key: payload.tierKey } })
          : await tx.studentTier.findFirst({ where: { tenantId }, orderBy: { rank: 'asc' } });

        const count = await tx.studentProfile.count({ where: { tenantId } });
        await tx.studentProfile.create({
          data: {
            tenantId,
            userId: user.id,
            tierId: tier?.id ?? null,
            studentNumber: payload.studentNumber ?? (await nextFreeNumber(tx.studentProfile, tenantId, 'studentNumber', 'ENX-', 900000 + count + 1)),
            degree: payload.degree ?? null,
            department: payload.department ?? null,
            academicStanding: 'Good Standing',
            currentTerm: 'Fall 2026',
          },
        });
      }

      if (payload.roles.includes('FACULTY')) {
        const count = await tx.facultyProfile.count({ where: { tenantId } });
        await tx.facultyProfile.create({
          data: {
            tenantId,
            userId: user.id,
            employeeNumber: payload.employeeNumber ?? (await nextFreeNumber(tx.facultyProfile, tenantId, 'employeeNumber', 'FAC-', 20000 + count + 1)),
            title: payload.title ?? 'Lecturer',
            department: payload.department ?? null,
          },
        });
      }

      // A STAFF member needs a staff record (the administrator is the source; no HR integration exists).
      if (payload.roles.includes('STAFF')) {
        const count = await tx.staffProfile.count({ where: { tenantId } });
        await tx.staffProfile.create({
          data: { tenantId, userId: user.id, employeeNumber: payload.employeeNumber ?? (await nextFreeNumber(tx.staffProfile, tenantId, 'employeeNumber', 'STF-', 30000 + count + 1)), title: payload.title ?? null, department: payload.department ?? null },
        });
      }

      // Baseline academic/teaching data for the new persona (see modules/onboarding).
      if (baseline) await onboardUser(tx, { tenantId, userId: user.id, roles: payload.roles, actorUserId });
      return user.id;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return getUser(tenantId, userId);
}

export async function updateUser(tenantId, id, payload, { actorUserId = null } = {}) {
  const user = await prisma.user.findFirst({ where: { tenantId, id }, include: userInclude });
  if (!user) throw notFound('User not found.');

  const data = {};
  for (const field of ['firstName', 'lastName', 'phone', 'status']) {
    if (payload[field] !== undefined) data[field] = payload[field];
  }
  if (payload.password) {
    // An administrator reset is a temporary password too.
    data.passwordHash = await hashPassword(payload.password);
    data.passwordChangeRequired = true;
  }
  if (Object.keys(data).length > 0) await prisma.user.update({ where: { id }, data });

  // A role list is applied as the difference to the current roles, through the same rules as the
  // single-role endpoints: no Student/Faculty context without its record, audited, with provenance.
  if (payload.roles) {
    const known = await prisma.role.findMany({ where: { key: { in: payload.roles } } });
    if (known.length !== new Set(payload.roles).size) throw badRequest('One or more roles are unknown.');
    const current = user.userRoles.map((link) => link.role.key);
    for (const roleKey of payload.roles.filter((r) => !current.includes(r))) await assertRoleAssignable(tenantId, user, roleKey);
    await assignRoles(tenantId, id, { add: payload.roles.filter((r) => !current.includes(r)), remove: current.filter((r) => !payload.roles.includes(r)), actorUserId });
  }

  // Moving a student between tiers is the admin action that changes which widgets that
  // student's dashboard returns on the next load.
  if (payload.tierKey !== undefined && user.studentProfile) {
    const tier = payload.tierKey
      ? await prisma.studentTier.findFirst({ where: { tenantId, key: payload.tierKey } })
      : null;
    if (payload.tierKey && !tier) throw badRequest(`Unknown student tier: ${payload.tierKey}`);
    await prisma.studentProfile.update({
      where: { id: user.studentProfile.id },
      data: { tierId: tier?.id ?? null },
    });
  }

  return getUser(tenantId, id);
}

/** Roles with this institution's user counts (roles are global; their holders are per tenant). */
export async function listRoles(tenantId) {
  const roles = await prisma.role.findMany({
    orderBy: { key: 'asc' },
    include: { _count: { select: { userRoles: { where: { user: { tenantId } } } } } },
  });
  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    category: ROLE_CATEGORY[role.key] ?? 'COMMUNITY',
    userCount: role._count.userRoles,
  }));
}

/** INTEGRATIONS --------------------------------------------------------------- */

export const adminListIntegrations = listIntegrations;
export const adminIntegrationSummary = tenantIntegrationSummary;
export const adminProviders = availableProviders;

export async function getIntegrationDetail(tenantId, id) {
  const row = await getIntegration(tenantId, id);
  const logs = await listSyncLogs(tenantId, id, { limit: 10 });
  return {
    ...presentIntegration(row),
    recentLogs: logs.map(presentLog),
  };
}

const presentLog = (log) => ({
  id: log.id,
  operation: log.operation,
  status: log.status,
  outcome: log.outcome ?? null,
  startedAt: log.startedAt,
  completedAt: log.completedAt,
  durationMs: log.durationMs,
  recordsProcessed: log.recordsProcessed,
  errorMessage: log.errorMessage,
  triggeredBy: log.triggeredBy
    ? `${log.triggeredBy.firstName} ${log.triggeredBy.lastName}`
    : 'system',
});

/** LMS-only providers never take SIS sync domains: their data must not reach the academic tables. */
function assertDomainsAllowed(provider, supportedDomains) {
  if (LIVE_ONLY_PROVIDERS.includes(provider) && supportedDomains?.length) {
    throw badRequest(`${provider} is read live and cannot serve local sync domains (${supportedDomains.join(', ')}). Leave them empty; LMS data is read through the LMS actions.`, {
      field: 'supportedDomains',
    });
  }
}

export async function createIntegration(tenantId, payload) {
  assertDomainsAllowed(payload.provider, payload.supportedDomains);
  const existing = await prisma.integration.findFirst({ where: { tenantId, key: payload.key } });
  if (existing) throw conflict(`An integration with key "${payload.key}" already exists.`);

  const row = await prisma.integration.create({
    data: {
      tenantId,
      key: payload.key,
      provider: payload.provider,
      displayName: payload.displayName,
      description: payload.description ?? null,
      mode: payload.mode ?? 'MOCK',
      baseUrl: payload.baseUrl ?? null,
      apiVersion: payload.apiVersion ?? null,
      authType: payload.authType ?? 'NONE',
      // Only the NAME of an environment variable is accepted here. The admin UI never
      // posts a secret, and this column never holds one.
      credentialRef: payload.credentialRef ?? null,
      enabled: payload.enabled ?? false,
      timeoutMs: payload.timeoutMs ?? 8000,
      supportedDomains: payload.supportedDomains ?? [],
      status: 'NOT_CONFIGURED',
    },
  });
  return presentIntegration(row);
}

export async function updateIntegration(tenantId, id, payload) {
  const current = await getIntegration(tenantId, id);
  assertDomainsAllowed(current.provider, payload.supportedDomains);
  const data = {};
  for (const field of [
    'displayName',
    'description',
    'mode',
    'baseUrl',
    'apiVersion',
    'authType',
    'credentialRef',
    'enabled',
    'timeoutMs',
    'supportedDomains',
  ]) {
    if (payload[field] !== undefined) data[field] = payload[field];
  }
  // Disabling or reconfiguring invalidates the previous health reading.
  if (payload.mode === 'DISABLED' || payload.enabled === false) data.status = 'NOT_CONNECTED';

  const row = await prisma.integration.update({ where: { id }, data });
  return presentIntegration(row);
}

export async function runIntegrationTest(tenantId, id, userId) {
  const integration = await getIntegration(tenantId, id);
  const result = await testIntegration({ integration, userId });
  const refreshed = await getIntegration(tenantId, id);
  return { ...result, integration: presentIntegration(refreshed) };
}

export async function runIntegrationSync(tenantId, id, userId) {
  const integration = await getIntegration(tenantId, id);
  // Refused before any sync log is opened: nothing ran, so nothing is reported as run.
  assertSisCapable(integration);
  const result = await syncAcademicDomains(tenantId, { userId, integrationKey: integration.key });
  const refreshed = await getIntegration(tenantId, id);
  return { ...result, integration: presentIntegration(refreshed) };
}

export async function getIntegrationHealth(tenantId, id) {
  const row = await getIntegration(tenantId, id);
  const presented = presentIntegration(row);
  return {
    integrationKey: row.key,
    provider: row.provider,
    displayName: row.displayName,
    ...presented.health,
  };
}

export async function getIntegrationLogs(tenantId, id, limit) {
  await getIntegration(tenantId, id);
  const logs = await listSyncLogs(tenantId, id, { limit });
  return logs.map(presentLog);
}
