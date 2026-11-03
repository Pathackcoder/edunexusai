import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { facultyWidgets } from '../../shared/facultyWidgets.js';

/**
 * Characterization of single-role behaviour (multi-role Phase 0).
 *
 * These assertions record how the session, entitlements, dashboards and audiences behave
 * for one-role accounts BEFORE role contexts were introduced. They must keep passing
 * unchanged: role contexts are additive, and a single-role account must see exactly what
 * it saw before. Expected widget lists are derived from the tenant's entitlement rows, so
 * the tests follow admin changes to those rows instead of hard-coding a snapshot.
 */

const { prisma } = await import('../src/db/prisma.js');

after(closeTestServer);

const TENANT = 'demo-university';
const ADMIN_WIDGETS = ['admin.users', 'admin.roles', 'admin.tiers', 'admin.entitlements', 'admin.integrations', 'admin.integration_health'];

async function tierWidgets(tierKey) {
  const tier = await prisma.studentTier.findFirst({
    where: { key: tierKey, tenant: { slug: TENANT } },
    include: { entitlements: { where: { enabled: true }, include: { widget: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return tier.entitlements.map((row) => row.widget.key);
}

async function facultyRoleWidgets() {
  const overrides = await prisma.roleWidgetEntitlement.findMany({ where: { roleKey: 'FACULTY', tenant: { slug: TENANT } } });
  return facultyWidgets.map((w) => w.key).filter((key) => overrides.find((row) => row.widgetKey === key)?.enabled !== false);
}

async function me(persona) {
  const { status, body } = await api('/auth/me', { token: await login(persona) });
  assert.equal(status, 200);
  return body.data.user;
}

/** Session fields each persona's /auth/me carried before role contexts (none may disappear). */
const LEGACY_ME_KEYS = {
  common: ['appearance', 'email', 'entitlementDetails', 'entitlementSource', 'entitlements', 'firstName', 'fullName', 'id', 'institution', 'lastLoginAt', 'lastName', 'locale', 'passwordChangeRequired', 'persona', 'phone', 'roles', 'status', 'tenant', 'tier'],
  student: ['academicStanding', 'address', 'admitTerm', 'careerGoals', 'city', 'creditsCompleted', 'cumulativeGpa', 'currentTerm', 'degree', 'department', 'directoryVisible', 'emergencyContact', 'honors', 'interests', 'majorGpa', 'preferredName', 'pronouns', 'pronounsVisibility', 'semesterGpa', 'state', 'studentNumber', 'studentProfileId', 'totalCreditsRequired', 'zipCode'],
  faculty: ['bio', 'courseCount', 'department', 'employeeNumber', 'facultyProfileId', 'officeHours', 'officeLocation', 'title'],
  admin: ['department', 'employeeNumber', 'officeLocation', 'staffProfileId', 'title'],
};

const DASHBOARD_KEYS = {
  student: ['entitlements', 'greetingName', 'layout', 'panels', 'persona', 'term', 'tier', 'widgets'],
  faculty: ['announcements', 'courses', 'entitlements', 'layout', 'persona', 'totals', 'upcomingAssignments'],
  admin: ['counts', 'integrationHealth', 'operations', 'persona', 'recentSyncLogs', 'tenant', 'tiers'],
};

const assertKeys = (object, keys, label) => {
  for (const key of keys) assert.ok(Object.hasOwn(object, key), `${label}: missing ${key}`);
};

describe('single-role session (/auth/me) is unchanged', () => {
  it('Standard-tier student', async () => {
    const user = await me('student');
    assertKeys(user, [...LEGACY_ME_KEYS.common, ...LEGACY_ME_KEYS.student], 'student');
    assert.deepEqual(user.roles, ['STUDENT']);
    assert.equal(user.persona, 'STUDENT');
    assert.equal(user.tier.key, 'STANDARD');
    assert.equal(user.entitlementSource, 'TIER');
    assert.deepEqual(user.entitlements, await tierWidgets('STANDARD'));
    assert.equal(user.facultyProfileId, undefined);
  });

  it('Advanced-tier student', async () => {
    const user = await me('advanced');
    assert.deepEqual(user.roles, ['STUDENT']);
    assert.equal(user.persona, 'STUDENT');
    assert.equal(user.tier.key, 'ADVANCED');
    assert.deepEqual(user.entitlements, await tierWidgets('ADVANCED'));
  });

  it('faculty', async () => {
    const user = await me('faculty');
    assertKeys(user, [...LEGACY_ME_KEYS.common, ...LEGACY_ME_KEYS.faculty], 'faculty');
    assert.deepEqual(user.roles, ['FACULTY']);
    assert.equal(user.persona, 'FACULTY');
    assert.equal(user.tier, null);
    assert.equal(user.entitlementSource, 'ROLE');
    assert.deepEqual(user.entitlements, await facultyRoleWidgets());
    assert.equal(user.studentProfileId, undefined);
  });

  it('admin', async () => {
    const user = await me('admin');
    assertKeys(user, [...LEGACY_ME_KEYS.common, ...LEGACY_ME_KEYS.admin], 'admin');
    assert.deepEqual(user.roles, ['ADMIN']);
    assert.equal(user.persona, 'ADMIN');
    assert.equal(user.tier, null);
    assert.deepEqual(user.entitlements, ADMIN_WIDGETS);
  });
});

describe('single-role dashboards are unchanged', () => {
  it('GET /dashboard returns each persona its own dashboard shape', async () => {
    for (const [persona, shape] of [['student', 'student'], ['advanced', 'student'], ['faculty', 'faculty'], ['admin', 'admin']]) {
      const { status, body } = await api('/dashboard', { token: await login(persona) });
      assert.equal(status, 200, persona);
      assert.deepEqual(Object.keys(body.data).sort(), DASHBOARD_KEYS[shape], `${persona} dashboard shape`);
    }
  });

  it('the student dashboard only offers the tier widgets', async () => {
    const { body } = await api('/dashboard', { token: await login('advanced') });
    assert.deepEqual(body.data.entitlements, await tierWidgets('ADVANCED'));
  });

  it('GET /faculty/dashboard: faculty and admin allowed, student refused', async () => {
    const student = await api('/faculty/dashboard', { token: await login('student') });
    assert.equal(student.status, 403);
    const faculty = await api('/faculty/dashboard', { token: await login('faculty') });
    assert.equal(faculty.status, 200);
    assert.deepEqual(faculty.body.data.entitlements, await facultyRoleWidgets());
    const admin = await api('/faculty/dashboard', { token: await login('admin') });
    assert.equal(admin.status, 200, 'administrators keep their existing faculty-dashboard access');
  });
});

describe('single-role audiences are unchanged', () => {
  const openPublishedForms = (audiences) =>
    prisma.portalForm.count({ where: { tenant: { slug: TENANT }, status: 'PUBLISHED', audience: { in: audiences }, OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }] } });
  const publishedResources = (audiences) =>
    prisma.portalResource.count({ where: { tenant: { slug: TENANT }, status: 'PUBLISHED', ...(audiences ? { audience: { in: audiences } } : {}) } });

  it('forms: students see ALL + STUDENT, faculty see ALL + FACULTY, admins see ALL', async () => {
    for (const [persona, allowed] of [['student', ['ALL', 'STUDENT']], ['faculty', ['ALL', 'FACULTY']], ['admin', ['ALL']]]) {
      const { status, body } = await api('/forms', { token: await login(persona) });
      assert.equal(status, 200, persona);
      assert.ok(body.data.forms.every((form) => allowed.includes(form.audience)), `${persona} received a form outside ${allowed}`);
      assert.equal(body.data.forms.length, await openPublishedForms(allowed), `${persona} form count`);
    }
  });

  it('resources: students see ALL + STUDENT, faculty see ALL + FACULTY, admins see everything published', async () => {
    for (const [persona, allowed] of [['student', ['ALL', 'STUDENT']], ['faculty', ['ALL', 'FACULTY']], ['admin', null]]) {
      const { status, body } = await api('/resources', { token: await login(persona) });
      assert.equal(status, 200, persona);
      if (allowed) assert.ok(body.data.resources.every((r) => allowed.includes(r.audience)), `${persona} received a resource outside ${allowed}`);
      assert.equal(body.data.resources.length, await publishedResources(allowed), `${persona} resource count`);
    }
  });
});
