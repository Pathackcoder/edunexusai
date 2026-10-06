import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';

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

    // The new account can sign in and reach its own dashboard.
    const signIn = await api('/auth/login', {
      method: 'POST',
      body: { email, password: 'CreatedByTests2026' },
    });
    assert.equal(signIn.status, 200);
    const dashboard = await api('/dashboard', { token: signIn.body.data.accessToken });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.data.tier.key, 'ADVANCED');
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
      ['ADMIN', 'FACULTY', 'STUDENT'],
    );
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
