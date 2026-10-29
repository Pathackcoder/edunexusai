/**
 * Multi-role test fixtures. Accounts are created directly in the TEST database (this module
 * only runs under tests/helpers/testEnv.js, which pins Prisma to TEST_DATABASE_URL) and are
 * removed by `removeMultiRoleUsers`, or by tests/reset-test-data.mjs if a run is interrupted.
 *
 * Every fixture email starts with `multirole.` so cleanup can never touch seeded accounts.
 */
import { api } from './testEnv.js';

export const MULTI_ROLE_PREFIX = 'multirole.';
export const MULTI_ROLE_PASSWORD = 'MultiRole#Test2026';
const TENANT_SLUG = 'demo-university';

const prismaModule = () => import('../../src/db/prisma.js');

/**
 * Create one account with the given roles and (optionally) a student and/or faculty profile.
 * Roles and profiles are independent on purpose: a role without its profile is the
 * "unlinked" case that must never expose academic data.
 */
export async function createMultiRoleUser({ key, firstName, lastName = 'Fixture', roles, student = null, faculty = null }) {
  const { prisma } = await prismaModule();
  const { hashPassword } = await import('../../src/modules/auth/passwords.js');
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  const roleRows = await prisma.role.findMany({ where: { key: { in: roles } } });
  if (roleRows.length !== roles.length) throw new Error(`Unknown role in ${roles.join(', ')}`);
  const email = `${MULTI_ROLE_PREFIX}${key}@feddrick.edu`;
  await prisma.user.deleteMany({ where: { tenantId: tenant.id, email } });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash: await hashPassword(MULTI_ROLE_PASSWORD),
      firstName,
      lastName,
      userRoles: { create: roleRows.map((role) => ({ roleId: role.id })) },
    },
  });

  let studentProfile = null;
  if (student) {
    const tier = student.tierKey ? await prisma.studentTier.findFirst({ where: { tenantId: tenant.id, key: student.tierKey } }) : null;
    studentProfile = await prisma.studentProfile.create({
      data: { tenantId: tenant.id, userId: user.id, studentNumber: student.studentNumber, tierId: tier?.id ?? null, degree: student.degree ?? null },
    });
  }
  let facultyProfile = null;
  if (faculty) {
    facultyProfile = await prisma.facultyProfile.create({
      data: { tenantId: tenant.id, userId: user.id, employeeNumber: faculty.employeeNumber, department: faculty.department ?? null },
    });
  }
  return { user, email, studentProfile, facultyProfile, tenantId: tenant.id };
}

/** Sign a fixture account in through the real login endpoint. */
export async function loginFixture(email) {
  const { status, body } = await api('/auth/login', { method: 'POST', body: { email, password: MULTI_ROLE_PASSWORD } });
  if (status !== 200) throw new Error(`Fixture login failed for ${email}: ${status} ${JSON.stringify(body)}`);
  return body.data.accessToken;
}

/** Add or remove one role on an existing fixture account (simulates an administrator change). */
export async function setFixtureRole(userId, roleKey, present) {
  const { prisma } = await prismaModule();
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (present) await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, update: {}, create: { userId, roleId: role.id } });
  else await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
}

/** Expected student-context widgets: the tier's enabled rows, in order. */
export async function expectedTierWidgets(tierKey) {
  const { prisma } = await prismaModule();
  const tier = await prisma.studentTier.findFirst({
    where: { key: tierKey, tenant: { slug: TENANT_SLUG } },
    include: { entitlements: { where: { enabled: true }, include: { widget: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return tier.entitlements.map((row) => row.widget.key);
}

/** Expected faculty-context widgets: the faculty catalogue minus the tenant's switched-off rows. */
export async function expectedFacultyWidgets() {
  const { prisma } = await prismaModule();
  const { facultyWidgets } = await import('../../../shared/facultyWidgets.js');
  const overrides = await prisma.roleWidgetEntitlement.findMany({ where: { roleKey: 'FACULTY', tenant: { slug: TENANT_SLUG } } });
  return facultyWidgets.map((w) => w.key).filter((key) => overrides.find((row) => row.widgetKey === key)?.enabled !== false);
}

/** Remove every fixture account (profiles, roles and tokens cascade). */
export async function removeMultiRoleUsers() {
  const { prisma } = await prismaModule();
  await prisma.user.deleteMany({ where: { email: { startsWith: MULTI_ROLE_PREFIX } } });
}
