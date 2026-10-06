import bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
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
  return users.map(presentUser);
}

export async function getUser(tenantId, id) {
  const user = await prisma.user.findFirst({ where: { tenantId, id }, include: userInclude });
  if (!user) throw notFound('User not found.');
  return presentUser(user);
}

export async function createUser(tenantId, payload) {
  const email = payload.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } });
  if (existing) throw conflict('A user with that email already exists for this institution.');

  const roles = await prisma.role.findMany({ where: { key: { in: payload.roles } } });
  if (roles.length !== payload.roles.length) throw badRequest('One or more roles are unknown.');

  const passwordHash = await bcrypt.hash(payload.password, env.bcryptRounds);

  const user = await prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone ?? null,
      status: payload.status ?? 'ACTIVE',
      userRoles: { create: roles.map((role) => ({ roleId: role.id })) },
    },
  });

  // Creating a STUDENT also creates the student record the student routes need,
  // otherwise the account would authenticate but have nothing to show.
  if (payload.roles.includes('STUDENT')) {
    const tier = payload.tierKey
      ? await prisma.studentTier.findFirst({ where: { tenantId, key: payload.tierKey } })
      : await prisma.studentTier.findFirst({ where: { tenantId }, orderBy: { rank: 'asc' } });

    const count = await prisma.studentProfile.count({ where: { tenantId } });
    await prisma.studentProfile.create({
      data: {
        tenantId,
        userId: user.id,
        tierId: tier?.id ?? null,
        studentNumber: payload.studentNumber ?? `ENX-${900000 + count + 1}`,
        degree: payload.degree ?? null,
        department: payload.department ?? null,
        academicStanding: 'Good Standing',
        currentTerm: 'Fall 2026',
      },
    });
  }

  if (payload.roles.includes('FACULTY')) {
    const count = await prisma.facultyProfile.count({ where: { tenantId } });
    await prisma.facultyProfile.create({
      data: {
        tenantId,
        userId: user.id,
        employeeNumber: payload.employeeNumber ?? `FAC-${20000 + count + 1}`,
        title: payload.title ?? 'Lecturer',
        department: payload.department ?? null,
      },
    });
  }

  return getUser(tenantId, user.id);
}

export async function updateUser(tenantId, id, payload) {
  const user = await prisma.user.findFirst({ where: { tenantId, id }, include: userInclude });
  if (!user) throw notFound('User not found.');

  const data = {};
  for (const field of ['firstName', 'lastName', 'phone', 'status']) {
    if (payload[field] !== undefined) data[field] = payload[field];
  }
  if (payload.password) data.passwordHash = await bcrypt.hash(payload.password, env.bcryptRounds);
  if (Object.keys(data).length > 0) await prisma.user.update({ where: { id }, data });

  if (payload.roles) {
    const roles = await prisma.role.findMany({ where: { key: { in: payload.roles } } });
    if (roles.length !== payload.roles.length) throw badRequest('One or more roles are unknown.');
    await prisma.userRole.deleteMany({ where: { userId: id } });
    await prisma.userRole.createMany({
      data: roles.map((role) => ({ userId: id, roleId: role.id })),
    });
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

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { key: 'asc' },
    include: { _count: { select: { userRoles: true } } },
  });
  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
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
  startedAt: log.startedAt,
  completedAt: log.completedAt,
  durationMs: log.durationMs,
  recordsProcessed: log.recordsProcessed,
  errorMessage: log.errorMessage,
  triggeredBy: log.triggeredBy
    ? `${log.triggeredBy.firstName} ${log.triggeredBy.lastName}`
    : 'system',
});

export async function createIntegration(tenantId, payload) {
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
  await getIntegration(tenantId, id);
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
