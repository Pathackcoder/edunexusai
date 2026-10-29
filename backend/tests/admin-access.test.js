import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';

/**
 * Administering one account's roles safely: community roles need their records, administrative
 * roles need confirmation and can't lock the institution out, removals touch one role only, every
 * change is audited, and nothing crosses institutions. (CampusCore not configured here; the SIS
 * linking path is covered in multirole-sis.test.js.)
 */

const { prisma } = await import('../src/db/prisma.js');
let admin;
let adminUser;
let dual;
let blank;
let outsider;
let otherTenant;

before(async () => {
  admin = await login('admin');
  adminUser = await prisma.user.findFirst({ where: { email: 'admin@edunexus.ai' } });
  dual = await createMultiRoleUser({ key: 'access.dual', firstName: 'Dana', roles: ['STUDENT', 'FACULTY'], student: { studentNumber: 'AC-S-1', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'AC-F-1' } });
  blank = await createMultiRoleUser({ key: 'access.blank', firstName: 'Bea', roles: ['ALUMNI'] });
  await prisma.tenant.deleteMany({ where: { slug: 'mr-test-access-other' } });
  otherTenant = await prisma.tenant.create({ data: { slug: 'mr-test-access-other', name: 'Other (test)' } });
  outsider = await prisma.user.create({ data: { tenantId: otherTenant.id, email: 'multirole.access.outsider@other.edu', passwordHash: 'x', firstName: 'Out', lastName: 'Sider' } });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [dual.user.id, blank.user.id] } } });
  await prisma.tenant.deleteMany({ where: { slug: 'mr-test-access-other' } });
  await removeMultiRoleUsers();
  await closeTestServer();
});

const access = async (user) => (await api(`/admin/users/${user.user.id}/access`, { token: admin })).body.data;
const add = (user, body) => api(`/admin/users/${user.user.id}/roles`, { method: 'POST', token: admin, body });
const remove = (user, role, confirm = true) => api(`/admin/users/${user.user.id}/roles/${role}/remove`, { method: 'POST', token: admin, body: { confirm } });

describe('one account, all its roles', () => {
  it('the user list shows one row per account with every role and its status', async () => {
    const res = await api(`/admin/users?search=${encodeURIComponent(dual.email)}`, { token: admin });
    assert.equal(res.body.data.length, 1);
    assert.deepEqual(res.body.data[0].roleDetails.map((r) => `${r.key}:${r.category}:${r.status}`).sort(), ['FACULTY:COMMUNITY:ACTIVE', 'STUDENT:COMMUNITY:ACTIVE']);
  });

  it('the access view separates community and administrative roles, with records, sources and contexts', async () => {
    const view = await access(dual);
    const student = view.roles.find((r) => r.key === 'STUDENT');
    assert.equal(student.category, 'COMMUNITY');
    assert.equal(student.record.number, 'AC-S-1');
    assert.equal(student.tier.key, 'STANDARD');
    assert.equal(student.sources[0].source, 'EXISTING');
    assert.deepEqual(view.contexts.map((c) => `${c.key}:${c.status}`), ['faculty:ACTIVE', 'student:ACTIVE']);
    assert.ok(view.addable.find((a) => a.key === 'ADMIN' && a.category === 'ADMINISTRATIVE'));
  });

  it('roles count only this institution’s people', async () => {
    const roles = (await api('/admin/roles', { token: admin })).body.data;
    const studentCount = roles.find((r) => r.key === 'STUDENT').userCount;
    const actual = await prisma.userRole.count({ where: { role: { key: 'STUDENT' }, user: { tenantId: adminUser.tenantId } } });
    assert.equal(studentCount, actual);
    assert.deepEqual(roles.map((r) => `${r.key}:${r.category}`).sort(), ['ADMIN:ADMINISTRATIVE', 'ALUMNI:COMMUNITY', 'FACULTY:COMMUNITY', 'STAFF:COMMUNITY', 'STUDENT:COMMUNITY']);
  });
});

describe('community roles need their records', () => {
  it('STUDENT/FACULTY cannot be switched on without the record', async () => {
    for (const role of ['STUDENT', 'FACULTY']) {
      const res = await add(blank, { role });
      assert.equal(res.status, 409, role);
      assert.equal(res.body.error.details.reason, 'RECORD_REQUIRED');
    }
    const view = await access(blank);
    assert.equal(view.addable.find((a) => a.key === 'STUDENT').how, 'RECORD_REQUIRED');
  });

  it('STAFF needs an employee number, which creates the staff record; the context becomes active', async () => {
    assert.equal((await add(blank, { role: 'STAFF' })).status, 409);
    const res = await add(blank, { role: 'STAFF', employeeNumber: 'AC-E-9', department: 'Registry' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const staff = res.body.data.roles.find((r) => r.key === 'STAFF');
    assert.equal(staff.record.number, 'AC-E-9');
    assert.deepEqual(staff.sources.map((s) => s.source), ['MANUAL']);
    assert.equal((await add(dual, { role: 'STAFF', employeeNumber: 'AC-E-9' })).status, 409, 'an employee number belongs to one account');
  });

  it('Staff + Alumni sign in to one account with two contexts', async () => {
    const me = (await api('/auth/me', { token: await loginFixture(blank.email) })).body.data.user;
    assert.deepEqual(me.contexts.map((c) => `${c.key}:${c.status}`), ['staff:ACTIVE', 'alumni:ACTIVE']);
    assert.ok(me.contexts.find((c) => c.key === 'staff').entitlements.includes('staff.announcements'));
    assert.ok(!me.contexts.find((c) => c.key === 'alumni').entitlements.some((w) => w.startsWith('staff.')));
  });
});

describe('administrative roles', () => {
  it('ADMIN needs explicit confirmation, and gives a separate workspace (not a community context)', async () => {
    const unconfirmed = await add(dual, { role: 'ADMIN' });
    assert.equal(unconfirmed.status, 400);
    assert.equal(unconfirmed.body.error.details.reason, 'CONFIRMATION_REQUIRED');
    const res = await add(dual, { role: 'ADMIN', confirm: true });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.workspaces, ['admin']);
    assert.deepEqual(res.body.data.contexts.map((c) => c.key), ['faculty', 'student']);
  });

  it('nobody removes their own administrator role; removal needs confirmation', async () => {
    const self = await api(`/admin/users/${adminUser.id}/roles/ADMIN/remove`, { method: 'POST', token: admin, body: { confirm: true } });
    assert.equal(self.status, 403);
    assert.equal((await remove(dual, 'ADMIN', false)).status, 400);
    assert.equal((await remove(dual, 'ADMIN')).status, 200);
  });

  it('a student or faculty member cannot manage roles at all', async () => {
    const token = await loginFixture(dual.email);
    assert.equal((await api(`/admin/users/${blank.user.id}/access`, { token })).status, 403);
    assert.equal((await api(`/admin/users/${blank.user.id}/roles`, { method: 'POST', token, body: { role: 'ALUMNI' } })).status, 403);
  });
});

describe('removing one role', () => {
  it('removes that role only; the other role, the records and the session keep working', async () => {
    const token = await loginFixture(dual.email);
    const res = await remove(dual, 'STUDENT');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.roles.map((r) => r.key), ['FACULTY']);
    assert.ok(await prisma.studentProfile.findFirst({ where: { userId: dual.user.id } }), 'the student record stays');
    assert.equal((await api('/faculty/dashboard', { token })).status, 200, 'faculty access continues on the same session');
    assert.equal((await api('/dashboard/student', { token })).status, 403, 'student access ends on the next request');
    const restored = await add(dual, { role: 'STUDENT' });
    assert.equal(restored.status, 201, 'with its record still present it can be restored');
  });

  it('every change is audited', async () => {
    const actions = (await prisma.auditLog.findMany({ where: { entityId: dual.user.id, action: { in: ['ROLE_GRANTED', 'ROLE_REMOVED'] } } })).map((a) => `${a.action}:${a.metadata?.roleKey}`);
    for (const expected of ['ROLE_GRANTED:ADMIN', 'ROLE_REMOVED:ADMIN', 'ROLE_REMOVED:STUDENT', 'ROLE_GRANTED:STUDENT']) assert.ok(actions.includes(expected), expected);
  });
});

describe('institution boundaries', () => {
  it('another institution’s account is invisible to this administrator', async () => {
    assert.equal((await api(`/admin/users/${outsider.id}/access`, { token: admin })).status, 404);
    assert.equal((await api(`/admin/users/${outsider.id}/roles`, { method: 'POST', token: admin, body: { role: 'ALUMNI' } })).status, 404);
  });
});
