import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login, signInFirstTime } from './helpers/testEnv.js';

// Onboarding tests create real accounts (with a teaching section, slots and records) in
// the test database; remove them so later suites see the seeded data only.
after(async () => {
  const { prisma } = await import('../src/db/prisma.js'); // bound to TEST_DATABASE_URL (NODE_ENV=test)
  const users = await prisma.user.findMany({ where: { email: { startsWith: 'onboard.', endsWith: '@feddrick.edu' } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.course.deleteMany({ where: { instructorUserId: { in: ids } } });
    await prisma.directoryProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.portalResource.deleteMany({ where: { createdByUserId: { in: ids } } });
    await prisma.studentIntervention.deleteMany({ where: { createdByUserId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});
after(closeTestServer);

describe('admin user management', () => {
  it('lists users and filters by role', async () => {
    const token = await login('admin');
    const all = await api('/admin/users', { token });
    const students = await api('/admin/users?role=STUDENT', { token });

    assert.equal(all.status, 200);
    assert.ok(all.body.data.length >= 4);
    assert.ok(students.body.data.every((user) => user.roles.includes('STUDENT')));
  });

  it('creates a student together with their student record', async () => {
    const token = await login('admin');
    const email = `created.${Date.now()}@edunexus.ai`;
    const { status, body } = await api('/admin/users', {
      method: 'POST',
      token,
      body: {
        email,
        password: 'CreatedByTests2026',
        firstName: 'Test',
        lastName: 'Student',
        roles: ['STUDENT'],
        tierKey: 'ADVANCED',
      },
    });

    assert.equal(status, 201);
    assert.deepEqual(body.data.roles, ['STUDENT']);
    assert.equal(body.data.tier.key, 'ADVANCED');
    assert.ok(body.data.studentNumber, 'a student number was assigned');

    // The new account signs in with its temporary password, must replace it before anything
    // else, and then reaches its own dashboard.
    const signIn = await api('/auth/login', { method: 'POST', body: { email, password: 'CreatedByTests2026' } });
    assert.equal(signIn.status, 200);
    assert.equal(signIn.body.data.user.passwordChangeRequired, true);
    const blocked = await api('/dashboard', { token: signIn.body.data.accessToken });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
    const dashboard = await api('/dashboard', { token: await signInFirstTime(email, 'CreatedByTests2026') });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.data.tier.key, 'ADVANCED');
  });

  it('onboards a new student with their own baseline data', async () => {
    const token = await login('admin');
    const email = `onboard.student.${Date.now()}@feddrick.edu`;
    const created = await api('/admin/users', {
      method: 'POST',
      token,
      body: { email, password: 'CreatedByTests2026', firstName: 'Onboard', lastName: 'Student', roles: ['STUDENT'], tierKey: 'ADVANCED' },
    });
    assert.equal(created.status, 201);

    const studentToken = await signInFirstTime(email, 'CreatedByTests2026');
    const { body } = await api('/dashboard', { token: studentToken });
    const panel = (key) => body.data.panels[key]?.data;

    assert.ok(panel('dashboard.assignments').length > 0, 'course assignments are visible');
    // Onboarding still writes its local baseline rows (kept until an approved clean-up), but
    // the SIS-owned panels read CampusCore only and never present those rows as the record.
    const { prisma } = await import('../src/db/prisma.js');
    const profile = await prisma.studentProfile.findFirst({ where: { user: { email } }, select: { id: true } });
    assert.ok((await prisma.enrollment.count({ where: { studentProfileId: profile.id } })) > 0, 'local onboarding rows still written');
    assert.equal(panel('dashboard.schedule').courses, undefined, 'no local timetable on the dashboard');
    const grades = panel('dashboard.progress');
    assert.equal(grades.source, 'campuscore');
    assert.notEqual(grades.state, 'OK', 'this account is not linked to CampusCore');
    assert.equal(grades.cumulativeGpa, undefined, 'no local GPA shown in its place');
    assert.ok(panel('dashboard.tuition').currentBalance >= 0 && panel('dashboard.tuition').dueDate, 'bursar account');
    assert.ok(panel('dashboard.financial_aid').awards.length > 0, 'aid offer');
    assert.equal(panel('dashboard.financial_aid').meta.degraded, false);
    assert.ok(panel('dashboard.library').loans.length > 0, 'library loans');
    const notifications = await api('/notifications', { token: studentToken });
    const titles = (notifications.body.data.notifications ?? notifications.body.data).map((n) => n.title);
    assert.ok(titles.includes('Welcome to Feddrick University, Onboard'), 'personal welcome notification');
  });

  it('onboards new faculty with a teaching section, roster and coursework', async () => {
    const token = await login('admin');
    const email = `onboard.faculty.${Date.now()}@feddrick.edu`;
    const created = await api('/admin/users', {
      method: 'POST',
      token,
      body: { email, password: 'CreatedByTests2026', firstName: 'Onboard', lastName: 'Faculty', roles: ['FACULTY'] },
    });
    assert.equal(created.status, 201);

    const facultyToken = await signInFirstTime(email, 'CreatedByTests2026');
    const { body } = await api('/faculty/dashboard', { token: facultyToken });
    assert.equal(body.data.courses.length, 1, 'one teaching section');
    assert.ok(body.data.totals.students > 0, 'a roster');
    assert.ok(body.data.upcomingAssignments.length > 0, 'coursework');
    assert.ok(body.data.announcements.length > 0, 'a welcome announcement');

    const advising = await api('/advising/appointments', { token: facultyToken });
    assert.ok(advising.body.data.upcoming.length > 0, 'an advising booking');

    // Curated demo personas are never pulled into a new section.
    const amit = await api('/academics/courses', { token: await login('student') });
    assert.ok(!amit.body.data.courses?.some((course) => course.code === body.data.courses[0].code));
  });

  it('rejects a weak password and a duplicate email', async () => {
    const token = await login('admin');

    const weak = await api('/admin/users', {
      method: 'POST',
      token,
      body: { email: 'weak@edunexus.ai', password: 'short', firstName: 'A', lastName: 'B', roles: ['STUDENT'] },
    });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.code, 'VALIDATION_ERROR');

    const duplicate = await api('/admin/users', {
      method: 'POST',
      token,
      body: {
        email: 'student@edunexus.ai',
        password: 'DuplicateAccount2026',
        firstName: 'Dup',
        lastName: 'Licate',
        roles: ['STUDENT'],
      },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'CONFLICT');
  });

  it("changes a student's tier and that changes their dashboard", async () => {
    const adminToken = await login('admin');
    const { body: users } = await api('/admin/users?search=student@edunexus.ai', { token: adminToken });
    const amit = users.data.find((user) => user.email === 'student@edunexus.ai');

    const before = await api('/dashboard', { token: await login('student') });
    assert.equal(before.body.data.tier.key, 'STANDARD');

    await api(`/admin/users/${amit.id}`, { method: 'PATCH', token: adminToken, body: { tierKey: 'ADVANCED' } });
    const promoted = await api('/dashboard', { token: await login('student') });
    assert.equal(promoted.body.data.tier.key, 'ADVANCED');
    assert.ok(promoted.body.data.widgets.length > before.body.data.widgets.length);

    await api(`/admin/users/${amit.id}`, { method: 'PATCH', token: adminToken, body: { tierKey: 'STANDARD' } });
    const restored = await api('/dashboard', { token: await login('student') });
    assert.equal(restored.body.data.tier.key, 'STANDARD');
  });
});

describe('admin entitlements', () => {
  it('toggling a widget changes what the student dashboard returns', async () => {
    const adminToken = await login('admin');
    const studentToken = await login('student');

    const { body: tiers } = await api('/admin/student-tiers', { token: adminToken });
    const standard = tiers.data.find((tier) => tier.key === 'STANDARD');

    const before = await api('/dashboard', { token: studentToken });
    assert.ok(before.body.data.widgets.includes('dashboard.financial_aid'));

    const disabled = await api('/admin/widget-entitlements', {
      method: 'PATCH',
      token: adminToken,
      body: { updates: [{ tierId: standard.id, widgetKey: 'dashboard.financial_aid', enabled: false }] },
    });
    assert.equal(disabled.status, 200);

    const after = await api('/dashboard', { token: studentToken });
    assert.ok(!after.body.data.widgets.includes('dashboard.financial_aid'));
    assert.ok(!Object.hasOwn(after.body.data.panels, 'dashboard.financial_aid'));

    // Restore, so the suite leaves the demo data as it found it.
    await api('/admin/widget-entitlements', {
      method: 'PATCH',
      token: adminToken,
      body: { updates: [{ tierId: standard.id, widgetKey: 'dashboard.financial_aid', enabled: true }] },
    });
    const restored = await api('/dashboard', { token: studentToken });
    assert.ok(restored.body.data.widgets.includes('dashboard.financial_aid'));
  });

  it('returns the full tier by widget matrix', async () => {
    const token = await login('admin');
    const { status, body } = await api('/admin/widget-entitlements', { token });
    assert.equal(status, 200);
    assert.ok(body.data.tiers.length >= 2);
    assert.ok(body.data.widgets.length > 0);
    assert.equal(body.data.matrix.length, body.data.tiers.length);
  });

  it('lists roles with their user counts', async () => {
    const token = await login('admin');
    const { status, body } = await api('/admin/roles', { token });
    assert.equal(status, 200);
    assert.deepEqual(
      body.data.map((role) => role.key).sort(),
      ['ADMIN', 'ALUMNI', 'FACULTY', 'STAFF', 'STUDENT'],
    );
    assert.deepEqual(body.data.filter((role) => role.category === 'ADMINISTRATIVE').map((role) => role.key), ['ADMIN']);
    assert.ok(body.data.every((role) => typeof role.userCount === 'number'));
  });
});

describe('unified faculty widget entitlements', () => {
  it('persists faculty visibility and refreshes dashboard entitlements without changing student tiers', async () => {
    const token = await login('admin');
    const facultyToken = await login('faculty');
    const before = await api('/admin/widget-entitlements', { token });
    assert.ok(before.body.data.faculty.widgets.some((widget) => widget.key === 'faculty.tasks'));
    const change = (enabled) => api('/admin/widget-entitlements', { token, method: 'PATCH', body: { updates: [{ tierId: 'FACULTY', widgetKey: 'faculty.tasks', enabled }] } });
    try {
      assert.equal((await change(false)).status, 200);
      const dashboard = await api('/faculty/dashboard', { token: facultyToken });
      assert.ok(!dashboard.body.data.entitlements.includes('faculty.tasks'));
      const after = await api('/admin/widget-entitlements', { token });
      assert.deepEqual(after.body.data.matrix, before.body.data.matrix);
      const rejected = await api('/admin/widget-entitlements', { token, method: 'PATCH', body: { updates: [{ tierId: 'FACULTY', widgetKey: 'faculty.fake', enabled: true }] } });
      assert.equal(rejected.status, 400);
    } finally { await change(true); }
    assert.ok((await api('/faculty/dashboard', { token: facultyToken })).body.data.entitlements.includes('faculty.tasks'));
  });
});
