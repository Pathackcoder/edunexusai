import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import {
  createMultiRoleUser,
  expectedFacultyWidgets,
  expectedTierWidgets,
  loginFixture,
  removeMultiRoleUsers,
  setFixtureRole,
} from './helpers/multiRole.js';

/**
 * Role contexts (multi-role Phase 1): one account, one context per community role, each
 * with its own entitlements and its own record. Single-role behaviour is covered by
 * roles-characterization.test.js and must not change.
 */

const { prisma } = await import('../src/db/prisma.js');

const STUDENT_DASHBOARD_KEYS = ['entitlements', 'greetingName', 'layout', 'panels', 'persona', 'term', 'tier', 'widgets'];
const FACULTY_DASHBOARD_KEYS = ['announcements', 'courses', 'entitlements', 'layout', 'persona', 'totals', 'upcomingAssignments'];
const ADMIN_WIDGETS = ['admin.users', 'admin.roles', 'admin.tiers', 'admin.entitlements', 'admin.integrations', 'admin.integration_health'];

let rahul;
let unlinked;
let adminFaculty;
const tokens = {};

before(async () => {
  // Teaches (faculty record) and studies on a postgraduate programme (student record).
  rahul = await createMultiRoleUser({
    key: 'rahul', firstName: 'Rahul', lastName: 'Sharma', roles: ['STUDENT', 'FACULTY'],
    student: { studentNumber: 'MR-S-0001', tierKey: 'STANDARD', degree: 'MSc Data Science' },
    faculty: { employeeNumber: 'MR-F-0001', department: 'Computer Science' },
  });
  // Holds the STUDENT role but has no student record: the role alone proves nothing.
  unlinked = await createMultiRoleUser({ key: 'unlinked', firstName: 'Uma', roles: ['STUDENT', 'FACULTY'], faculty: { employeeNumber: 'MR-F-0002' } });
  // An administrator who also teaches.
  adminFaculty = await createMultiRoleUser({ key: 'adminfaculty', firstName: 'Asha', roles: ['ADMIN', 'FACULTY'], faculty: { employeeNumber: 'MR-F-0003' } });
  tokens.rahul = await loginFixture(rahul.email);
  tokens.unlinked = await loginFixture(unlinked.email);
  tokens.adminFaculty = await loginFixture(adminFaculty.email);
});

after(async () => {
  await removeMultiRoleUsers();
  await closeTestServer();
});

const me = async (token) => {
  const { status, body } = await api('/auth/me', { token });
  assert.equal(status, 200);
  return body.data.user;
};
const contextOf = (user, key) => user.contexts.find((context) => context.key === key);

describe('single-role accounts get exactly one context', () => {
  it('student: one ACTIVE student context matching the legacy fields', async () => {
    const user = await me(await login('student'));
    assert.deepEqual(user.contexts.map((c) => c.key), ['student']);
    const student = contextOf(user, 'student');
    assert.equal(student.status, 'ACTIVE');
    assert.equal(student.profileId, user.studentProfileId);
    assert.equal(student.tier.key, 'STANDARD');
    assert.deepEqual(student.entitlements, user.entitlements);
    assert.deepEqual(student.dashboard, { endpoint: '/dashboard/student', layoutKey: 'student' });
    assert.deepEqual(user.workspaces, []);
    assert.equal(user.defaultContext, 'student');
  });

  it('faculty: one ACTIVE faculty context', async () => {
    const user = await me(await login('faculty'));
    assert.deepEqual(user.contexts.map((c) => c.key), ['faculty']);
    const faculty = contextOf(user, 'faculty');
    assert.equal(faculty.profileId, user.facultyProfileId);
    assert.equal(faculty.tier, null);
    assert.deepEqual(faculty.entitlements, await expectedFacultyWidgets());
    assert.equal(user.defaultContext, 'faculty');
  });

  it('admin: no community context, one admin workspace', async () => {
    const user = await me(await login('admin'));
    assert.deepEqual(user.contexts, []);
    assert.deepEqual(user.workspaces, ['admin']);
    assert.equal(user.defaultContext, null);
  });

  it('GET /dashboard/student matches the legacy student dashboard and is refused to other roles', async () => {
    const token = await login('advanced');
    const legacy = await api('/dashboard', { token });
    const explicit = await api('/dashboard/student', { token });
    assert.equal(explicit.status, 200);
    assert.deepEqual(Object.keys(explicit.body.data).sort(), STUDENT_DASHBOARD_KEYS);
    assert.deepEqual(explicit.body.data.entitlements, legacy.body.data.entitlements);
    assert.equal(explicit.body.data.greetingName, legacy.body.data.greetingName);
    for (const persona of ['faculty', 'admin']) {
      const refused = await api('/dashboard/student', { token: await login(persona) });
      assert.equal(refused.status, 403, `${persona} must not get a student dashboard`);
    }
  });
});

describe('one account that is both Student and Faculty', () => {
  it('has two ACTIVE contexts, each bound to its own record and its own widgets', async () => {
    const user = await me(tokens.rahul);
    assert.deepEqual([...user.roles].sort(), ['FACULTY', 'STUDENT']);
    assert.deepEqual(user.contexts.map((c) => c.key), ['faculty', 'student']);

    const student = contextOf(user, 'student');
    const faculty = contextOf(user, 'faculty');
    assert.equal(student.status, 'ACTIVE');
    assert.equal(faculty.status, 'ACTIVE');
    assert.equal(student.profileId, rahul.studentProfile.id);
    assert.equal(faculty.profileId, rahul.facultyProfile.id);
    assert.equal(student.tier.key, 'STANDARD');
    assert.equal(faculty.tier, null, 'a student tier never applies to the faculty context');
    assert.deepEqual(student.entitlements, await expectedTierWidgets('STANDARD'));
    assert.deepEqual(faculty.entitlements, await expectedFacultyWidgets());
    assert.ok(!student.entitlements.some((key) => faculty.entitlements.includes(key)), 'contexts share no widget keys');
  });

  it('keeps the legacy single-persona fields, with the flat list as the union of both contexts', async () => {
    const user = await me(tokens.rahul);
    assert.equal(user.persona, 'FACULTY', 'legacy persona precedence is unchanged');
    assert.equal(user.defaultContext, 'faculty');
    assert.equal(user.entitlementSource, 'COMBINED');
    assert.deepEqual(user.entitlements, [...(await expectedTierWidgets('STANDARD')), ...(await expectedFacultyWidgets())]);
    assert.deepEqual(user.workspaces, []);
  });

  it('GET /dashboard/student serves his student context only', async () => {
    const { status, body } = await api('/dashboard/student', { token: tokens.rahul });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body.data).sort(), STUDENT_DASHBOARD_KEYS);
    assert.deepEqual(body.data.entitlements, await expectedTierWidgets('STANDARD'));
    assert.ok(!body.data.entitlements.some((key) => key.startsWith('faculty.')));
    assert.equal(body.data.tier.key, 'STANDARD');
  });

  it('GET /faculty/dashboard serves his teaching context only (his own courses)', async () => {
    const { status, body } = await api('/faculty/dashboard', { token: tokens.rahul });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body.data).sort(), FACULTY_DASHBOARD_KEYS);
    assert.deepEqual(body.data.entitlements, await expectedFacultyWidgets());
    assert.equal(body.data.courses.length, 0, 'he is instructor of record for no seeded course');
  });

  it('GET /dashboard keeps its legacy single-persona answer (compatibility)', async () => {
    const { body } = await api('/dashboard', { token: tokens.rahul });
    assert.deepEqual(Object.keys(body.data).sort(), FACULTY_DASHBOARD_KEYS);
  });

  it('the FACULTY role does not open another instructor’s class list', async () => {
    const course = await prisma.course.findFirst({ where: { instructor: { email: 'faculty@edunexus.ai' } } });
    assert.ok(course, 'seeded course taught by the demo faculty member');
    const { status } = await api(`/faculty/courses/${course.id}/students`, { token: tokens.rahul });
    assert.equal(status, 403);
  });

  it('sees forms and resources for both of his audiences, and nothing else', async () => {
    const allowed = ['ALL', 'STUDENT', 'FACULTY'];
    const forms = await api('/forms', { token: tokens.rahul });
    assert.equal(forms.status, 200);
    assert.ok(forms.body.data.forms.every((form) => allowed.includes(form.audience)));
    const expectedForms = await prisma.portalForm.count({ where: { tenantId: rahul.tenantId, status: 'PUBLISHED', audience: { in: allowed }, OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }] } });
    assert.equal(forms.body.data.forms.length, expectedForms);

    const resources = await api('/resources', { token: tokens.rahul });
    assert.ok(resources.body.data.resources.every((r) => allowed.includes(r.audience)));
    const audiences = new Set(resources.body.data.resources.map((r) => r.audience));
    assert.ok(audiences.has('STUDENT') && audiences.has('FACULTY'), 'student and faculty resources both visible');
  });
});

describe('a role without its record (unlinked context)', () => {
  it('reports the student context as UNLINKED with no widgets', async () => {
    const user = await me(tokens.unlinked);
    const student = contextOf(user, 'student');
    assert.equal(student.status, 'UNLINKED');
    assert.equal(student.reason, 'NO_STUDENT_RECORD');
    assert.equal(student.profileId, null);
    assert.deepEqual(student.entitlements, []);
    assert.equal(contextOf(user, 'faculty').status, 'ACTIVE');
    assert.equal(user.defaultContext, 'faculty');
    assert.deepEqual(user.entitlements, await expectedFacultyWidgets(), 'no student widgets in the flat list either');
  });

  it('exposes no student data', async () => {
    for (const path of ['/dashboard/student', '/grades', '/courses']) {
      const { status, body } = await api(path, { token: tokens.unlinked });
      assert.equal(status, 404, `${path} must not serve an unlinked student context`);
      assert.equal(body.error.code, 'PROFILE_NOT_FOUND');
    }
  });
});

describe('ADMIN is a workspace, not a community context', () => {
  it('an administrator who teaches has the admin workspace and only a faculty context', async () => {
    const user = await me(tokens.adminFaculty);
    assert.equal(user.persona, 'ADMIN');
    assert.deepEqual(user.contexts.map((c) => c.key), ['faculty']);
    assert.deepEqual(user.workspaces, ['admin']);
    assert.deepEqual(new Set(user.entitlements), new Set([...ADMIN_WIDGETS, ...(await expectedFacultyWidgets())]));
    const studentDashboard = await api('/dashboard/student', { token: tokens.adminFaculty });
    assert.equal(studentDashboard.status, 403, 'ADMIN does not imply a student context');
  });
});

describe('role changes take effect on the next request', () => {
  it('removing and restoring STUDENT updates contexts and access without signing in again', async () => {
    await setFixtureRole(rahul.user.id, 'STUDENT', false);
    try {
      const user = await me(tokens.rahul);
      assert.deepEqual(user.contexts.map((c) => c.key), ['faculty']);
      const refused = await api('/dashboard/student', { token: tokens.rahul });
      assert.equal(refused.status, 403);
    } finally {
      await setFixtureRole(rahul.user.id, 'STUDENT', true);
    }
    const restored = await me(tokens.rahul);
    assert.deepEqual(restored.contexts.map((c) => c.key), ['faculty', 'student']);
    assert.equal((await api('/dashboard/student', { token: tokens.rahul })).status, 200);
  });
});
