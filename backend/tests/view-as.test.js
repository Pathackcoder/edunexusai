import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer, login, DEMO } from './helpers/testEnv.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';

/**
 * View-As (read-only administrator support access), over real HTTP against the test database.
 *
 * The administrator stays the authenticated actor; a View-As tab adds the session secret header. Covered here:
 * who may start a session for whom and as which persona; the session lifecycle (refresh, end, expiry, replay,
 * another administrator's secret, several tabs, revocation); that every state-changing call is refused server-side
 * (HTTP gate) and that the Prisma and integration-client guards refuse writes even where the gate would not; that
 * the subject's own account, sign-in and analytics are untouched; and that the audit trail keeps actor and subject apart.
 */

const OTHER_TENANT = 'mr-test-viewas-other';
const HEADER = 'X-View-As-Session';
let prisma;
let origin;
const t = {};
const ids = {};
const fx = {};

const start = (token, body) => api('/admin/view-as/sessions', { method: 'POST', token, body: { reason: 'Troubleshooting a reported issue', ...body } });
const as = (secret, path, { token = t.admin, ...options } = {}) => api(path, { token, ...options, headers: { [HEADER]: secret, ...(options.headers ?? {}) } });
async function session(userId, persona, token = t.admin) {
  const response = await start(token, { userId, ...(persona ? { persona } : {}) });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}
const auditRows = (action, where = {}) => prisma.auditLog.findMany({ where: { action, ...where }, orderBy: { createdAt: 'asc' } });

before(async () => {
  ({ origin } = await getTestServer());
  ({ prisma } = await import('../src/db/prisma.js'));
  const [admin, student, faculty, advanced] = await Promise.all(['admin', 'student', 'faculty', 'advanced'].map(login));
  Object.assign(t, { admin, student, faculty, advanced });
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(DEMO).map((d) => d.email) } } });
  for (const [key, demo] of Object.entries(DEMO)) ids[key] = users.find((u) => u.email === demo.email).id;
  ids.tenant = users[0].tenantId;
  await prisma.viewAsSession.deleteMany({});
  await prisma.userPermission.upsert({ where: { userId_permission: { userId: ids.admin, permission: 'users.view_as' } }, create: { tenantId: ids.tenant, userId: ids.admin, permission: 'users.view_as' }, update: {} });

  fx.multi = await createMultiRoleUser({ key: 'viewas.both', firstName: 'Riya', lastName: 'Both', roles: ['STUDENT', 'FACULTY'], student: { studentNumber: 'VAS-0001' }, faculty: { employeeNumber: 'VAF-0001' } });
  fx.suspended = await createMultiRoleUser({ key: 'viewas.suspended', firstName: 'Sam', lastName: 'Suspended', roles: ['STUDENT'], student: { studentNumber: 'VAS-0002' } });
  await prisma.user.update({ where: { id: fx.suspended.user.id }, data: { status: 'SUSPENDED' } });
  fx.unlinked = await createMultiRoleUser({ key: 'viewas.unlinked', firstName: 'Una', lastName: 'Unlinked', roles: ['STUDENT'] });
  fx.admin2 = await createMultiRoleUser({ key: 'viewas.admin2', firstName: 'Second', lastName: 'Admin', roles: ['ADMIN'] });
  fx.admin3 = await createMultiRoleUser({ key: 'viewas.admin3', firstName: 'Third', lastName: 'Admin', roles: ['ADMIN'] });
  await prisma.userPermission.create({ data: { tenantId: ids.tenant, userId: fx.admin2.user.id, permission: 'users.view_as' } });
  t.admin2 = await loginFixture(fx.admin2.email);
  t.admin3 = await loginFixture(fx.admin3.email); // an administrator WITHOUT users.view_as
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  const other = await prisma.tenant.create({ data: { slug: OTHER_TENANT, name: 'Other University (View-As test)' } });
  fx.otherStudent = await prisma.user.create({ data: { tenantId: other.id, email: 'multirole.viewas.other@other.edu', firstName: 'Olga', lastName: 'Other', studentProfile: { create: { tenantId: other.id, studentNumber: 'OTH-1' } }, userRoles: { create: [{ role: { connect: { key: 'STUDENT' } } }] } } });
});

// Each test starts with no live sessions, so the per-administrator limit only applies where a test exercises it.
beforeEach(async () => {
  await prisma?.viewAsSession.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date(), endReason: 'TEST_RESET' } });
});

after(async () => {
  await prisma.viewAsSession.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: 'VIEW_AS_' } } });
  await prisma.userPermission.deleteMany({ where: { permission: 'users.view_as' } });
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  await removeMultiRoleUsers();
  await closeTestServer();
});

/* ======================================================================= A. accounts and personas */
describe('View-As: who can be viewed, by whom, as which persona', () => {
  it('views a student: the portal is the student\'s own, the administrator stays the actor', async () => {
    const { token, session: s } = await session(ids.student);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(s.persona, 'STUDENT');
    assert.equal(s.mode, 'READ_ONLY');

    const me = (await as(token, '/auth/me')).body.data.user;
    assert.equal(me.id, ids.student);
    assert.deepEqual(me.roles, ['STUDENT']);
    assert.equal(me.viewAs.persona, 'STUDENT');
    assert.equal(me.viewAs.actor.id, ids.admin);
    assert.deepEqual(me.permissions, [], 'the administrator\'s permissions never appear in the viewed portal');
    assert.deepEqual(me.apps, [], 'no university app sign-in links (they would sign the administrator in elsewhere)');
    assert.equal(me.analytics.collecting, false);
    assert.equal(me.signInMethod, 'VIEW_AS');

    // Exactly the data the student gets when signed in themselves.
    for (const path of ['/academics/courses', '/academics/grades', '/notifications', '/profile']) {
      const viewed = await as(token, path);
      const own = await api(path, { token: t.student });
      assert.equal(viewed.status, own.status, path);
      assert.deepEqual(viewed.body.data, own.body.data, `${path} matches the student's own view`);
    }
    // The administrator's own tab, at the same time, is the administrator.
    assert.equal((await api('/auth/me', { token: t.admin })).body.data.user.id, ids.admin);
    assert.equal((await api('/admin/users', { token: t.admin })).status, 200);
  });

  it('views a faculty member as Faculty', async () => {
    const { token, session: s } = await session(ids.faculty);
    assert.equal(s.persona, 'FACULTY');
    const me = (await as(token, '/auth/me')).body.data.user;
    assert.equal(me.id, ids.faculty);
    assert.deepEqual(me.roles, ['FACULTY']);
    for (const path of ['/faculty/courses', '/faculty/dashboard']) {
      const viewed = await as(token, path);
      assert.equal(viewed.status, 200, path);
      if (path === '/faculty/courses') assert.deepEqual(viewed.body.data, (await api(path, { token: t.faculty })).body.data);
    }
  });

  it('requires an explicit persona for a student-and-faculty account, and shows only that persona', async () => {
    const ask = await start(t.admin, { userId: fx.multi.user.id });
    assert.equal(ask.status, 400);
    assert.equal(ask.body.error.details.reason, 'PERSONA_REQUIRED');
    assert.deepEqual([...ask.body.error.details.personas].sort(), ['FACULTY', 'STUDENT']);

    const eligibility = (await api(`/admin/view-as/targets/${fx.multi.user.id}`, { token: t.admin })).body.data;
    assert.equal(eligibility.eligible, true);
    assert.deepEqual(eligibility.personas.map((p) => p.key).sort(), ['FACULTY', 'STUDENT']);

    const asStudent = (await session(fx.multi.user.id, 'STUDENT')).token;
    const meS = (await as(asStudent, '/auth/me')).body.data.user;
    assert.deepEqual(meS.roles, ['STUDENT']);
    assert.deepEqual(meS.contexts.map((c) => c.key), ['student']);
    assert.equal(meS.facultyProfileId, undefined);
    assert.equal((await as(asStudent, '/faculty/courses')).status, 403, 'no teaching data when viewing as Student');

    const asFaculty = (await session(fx.multi.user.id, 'FACULTY')).token;
    const meF = (await as(asFaculty, '/auth/me')).body.data.user;
    assert.deepEqual(meF.roles, ['FACULTY']);
    assert.equal(meF.studentProfileId, undefined);
    assert.equal(meF.facultyProfileId, fx.multi.facultyProfile.id);
    assert.equal((await as(asFaculty, '/academics/grades')).status, 403, 'no student records when viewing as Faculty');
    assert.equal((await as(asFaculty, '/faculty/courses')).status, 200);
  });

  it('refuses inactive, administrator, own, unlinked, other-institution and unknown accounts', async () => {
    const cases = [
      [fx.suspended.user.id, 409, 'NOT_ACTIVE'],
      [fx.admin2.user.id, 403, 'ADMIN_ACCOUNT'],
      [ids.admin, 403, 'SELF'],
      [fx.unlinked.user.id, 403, 'NO_PORTAL'],
      [fx.otherStudent.id, 404, 'NOT_FOUND'],
      ['6f1b1c4e-0000-4000-8000-000000000000', 404, 'NOT_FOUND'],
    ];
    for (const [userId, status, reason] of cases) {
      const response = await start(t.admin, { userId });
      assert.equal(response.status, status, `${reason}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.error.details.reason, reason);
    }
    assert.equal((await start(t.admin, { userId: 'not-a-uuid' })).status, 400);
    assert.equal((await start(t.admin, { userId: ids.student, persona: 'FACULTY' })).body.error.details.reason, 'PERSONA_NOT_AVAILABLE');
    assert.equal((await api('/admin/view-as/sessions', { method: 'POST', token: t.admin, body: { userId: ids.student } })).status, 400, 'a reason is required');
    assert.equal((await api('/admin/view-as/sessions', { method: 'POST', token: t.admin, body: { userId: ids.student, reason: 'Support', tenantId: 'x' } })).status, 400, 'no extra fields (e.g. a tenant) are accepted');
    const rejected = await auditRows('VIEW_AS_START_REJECTED', { actorUserId: ids.admin });
    assert.ok(rejected.length >= 6, 'refusals are audited');
  });

  it('refuses administrators without users.view_as, and non-administrators', async () => {
    const noGrant = await start(t.admin3, { userId: ids.student });
    assert.equal(noGrant.status, 403);
    assert.equal(noGrant.body.error.details.reason, 'PERMISSION_REQUIRED');
    assert.equal((await start(t.student, { userId: ids.advanced })).status, 403);
    assert.equal((await start(t.faculty, { userId: ids.student })).status, 403);
    assert.equal((await api(`/admin/view-as/targets/${ids.student}`, { token: t.admin3 })).status, 403);
  });
});

/* ======================================================================= B. lifecycle */
describe('View-As: session lifecycle', () => {
  it('survives refreshes, ends on End Impersonation, and is audited with actor and subject apart', async () => {
    const { token, session: s } = await session(ids.student);
    for (let i = 0; i < 3; i += 1) assert.equal((await as(token, '/view-as/current')).body.data.id, s.id, 'a reload keeps the session');

    const endedResponse = await as(token, '/view-as/current', { method: 'DELETE' });
    assert.equal(endedResponse.status, 200);
    assert.equal(endedResponse.body.data.status, 'ENDED');
    assert.equal(endedResponse.body.data.endReason, 'ENDED_BY_ADMIN');

    const after = await as(token, '/academics/courses');
    assert.equal(after.status, 403, 'never 401: the administrator\'s own sign-in is still fine');
    assert.equal(after.body.error.code, 'VIEW_AS_SESSION_ENDED');
    assert.equal((await as(token, '/view-as/current', { method: 'DELETE' })).body.data.status, 'ENDED', 'ending twice is harmless');
    assert.equal((await api('/auth/me', { token: t.admin })).status, 200, 'the administrator is still signed in');

    const [started] = await auditRows('VIEW_AS_STARTED', { entityId: ids.student, metadata: { path: ['sessionId'], equals: s.id } });
    const [endedRow] = await auditRows('VIEW_AS_ENDED', { metadata: { path: ['sessionId'], equals: s.id } });
    for (const row of [started, endedRow]) {
      assert.equal(row.actorUserId, ids.admin, 'actor is the administrator');
      assert.equal(row.entityId, ids.student, 'subject is the student');
      assert.equal(row.metadata.subject.id, ids.student);
      assert.equal(row.metadata.actor.id, ids.admin);
      assert.equal(JSON.stringify(row.metadata).includes(token), false, 'the secret is never logged');
    }
    assert.equal(started.metadata.reason, 'Troubleshooting a reported issue');
  });

  it('expires after its absolute lifetime and after inactivity, and an expired secret stays dead', async () => {
    const absolute = await session(ids.student);
    await prisma.viewAsSession.update({ where: { id: absolute.session.id }, data: { createdAt: new Date(Date.now() - 31 * 60_000), expiresAt: new Date(Date.now() - 1000) } });
    const a = await as(absolute.token, '/academics/courses');
    assert.equal(a.body.error.code, 'VIEW_AS_SESSION_ENDED');
    assert.equal(a.body.error.details.reason, 'ABSOLUTE_TIMEOUT');
    assert.equal((await prisma.viewAsSession.findUnique({ where: { id: absolute.session.id } })).status, 'EXPIRED');
    // Moving the clock back does not revive it.
    await prisma.viewAsSession.update({ where: { id: absolute.session.id }, data: { expiresAt: new Date(Date.now() + 600_000) } });
    assert.equal((await as(absolute.token, '/academics/courses')).body.error.code, 'VIEW_AS_SESSION_ENDED');

    const idle = await session(ids.student);
    await prisma.viewAsSession.update({ where: { id: idle.session.id }, data: { lastSeenAt: new Date(Date.now() - 16 * 60_000) } });
    const b = await as(idle.token, '/academics/courses');
    assert.equal(b.body.error.details.reason, 'IDLE_TIMEOUT');
    assert.equal((await auditRows('VIEW_AS_EXPIRED', { metadata: { path: ['sessionId'], equals: idle.session.id } })).length, 1);
  });

  it('cannot be used by another administrator, without the administrator\'s token, or replayed', async () => {
    const { token } = await session(ids.student);
    const stolen = await as(token, '/academics/courses', { token: t.admin2 });
    assert.equal(stolen.status, 403);
    assert.equal(stolen.body.error.code, 'VIEW_AS_SESSION_INVALID');
    assert.equal((await auditRows('VIEW_AS_SESSION_MISUSE', { actorUserId: fx.admin2.user.id })).length >= 1, true);
    assert.equal((await as(token, '/academics/courses', { token: t.student })).status, 403, 'the subject\'s own token cannot use it either');
    assert.equal((await as(token, '/academics/courses', { token: null })).status, 401, 'the secret alone authenticates nobody');
    assert.equal((await as(token, '/view-as/current', { method: 'DELETE', token: t.admin2 })).status, 403, 'another administrator cannot end it');
    assert.equal((await as(token, '/academics/courses')).status, 200, 'still works for its own administrator');
    for (const bad of ['x'.repeat(43), 'short', `${token}x`]) assert.equal((await as(bad, '/academics/courses')).body.error.code, 'VIEW_AS_SESSION_INVALID');
  });

  it('runs several tabs independently; ending one leaves the others and the admin tab alone', async () => {
    const one = await session(ids.student);
    const two = await session(ids.faculty);
    assert.equal((await as(one.token, '/auth/me')).body.data.user.id, ids.student);
    assert.equal((await as(two.token, '/auth/me')).body.data.user.id, ids.faculty);
    await as(one.token, '/view-as/current', { method: 'DELETE' });
    assert.equal((await as(one.token, '/auth/me')).status, 403);
    assert.equal((await as(two.token, '/auth/me')).body.data.user.id, ids.faculty, 'the other tab is unaffected');
    assert.equal((await api('/auth/me', { token: t.admin })).body.data.user.id, ids.admin);

    // From the admin tab: list, and end one of one's own sessions (another administrator's is not found).
    const mine = (await api('/admin/view-as/sessions', { token: t.admin })).body.data;
    assert.ok(mine.some((s) => s.id === two.session.id));
    assert.equal((await api(`/admin/view-as/sessions/${two.session.id}/end`, { method: 'POST', token: t.admin2 })).status, 404);
    assert.equal((await api(`/admin/view-as/sessions/${two.session.id}/end`, { method: 'POST', token: t.admin })).body.data.endReason, 'ENDED_FROM_ADMIN_TAB');
    assert.equal((await as(two.token, '/auth/me')).status, 403);
  });

  it('limits concurrent sessions per administrator', async () => {
    await prisma.viewAsSession.updateMany({ where: { actorUserId: ids.admin, status: 'ACTIVE' }, data: { status: 'ENDED' } });
    for (let i = 0; i < 5; i += 1) await session(ids.student);
    const sixth = await start(t.admin, { userId: ids.student });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.body.error.details.reason, 'TOO_MANY_SESSIONS');
    await prisma.viewAsSession.updateMany({ where: { actorUserId: ids.admin, status: 'ACTIVE' }, data: { status: 'ENDED' } });
  });

  it('stops at once when the administrator\'s permission is withdrawn or the subject is suspended', async () => {
    const revoked = await session(ids.student, null, t.admin2);
    await prisma.userPermission.deleteMany({ where: { userId: fx.admin2.user.id, permission: 'users.view_as' } });
    const r = await as(revoked.token, '/academics/courses', { token: t.admin2 });
    assert.equal(r.body.error.details.reason, 'ACCESS_REVOKED');
    await prisma.userPermission.create({ data: { tenantId: ids.tenant, userId: fx.admin2.user.id, permission: 'users.view_as' } });
    assert.equal((await as(revoked.token, '/academics/courses', { token: t.admin2 })).body.error.code, 'VIEW_AS_SESSION_ENDED', 'a new grant does not revive it');

    const subject = await session(fx.multi.user.id, 'STUDENT');
    await prisma.user.update({ where: { id: fx.multi.user.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await as(subject.token, '/auth/me')).body.error.details.reason, 'SUBJECT_INELIGIBLE');
    await prisma.user.update({ where: { id: fx.multi.user.id }, data: { status: 'ACTIVE' } });
  });

  it('never touches the subject\'s account or sign-in, and does not count as their activity', async () => {
    const before = await prisma.user.findUnique({ where: { id: ids.advanced }, include: { userRoles: true } });
    const { token } = await session(ids.advanced);
    for (const path of ['/auth/me', '/academics/courses', '/dashboard/student', '/notifications']) await as(token, path);
    await as(token, '/view-as/current', { method: 'DELETE' });
    const afterwards = await prisma.user.findUnique({ where: { id: ids.advanced }, include: { userRoles: true } });
    assert.equal(afterwards.updatedAt.getTime(), before.updatedAt.getTime(), 'account row unchanged');
    assert.equal(String(afterwards.lastLoginAt), String(before.lastLoginAt), 'no sign-in recorded for the subject');
    assert.equal(afterwards.passwordHash, before.passwordHash);
    assert.deepEqual(afterwards.userRoles.map((r) => r.roleId).sort(), before.userRoles.map((r) => r.roleId).sort());
  });
});

/* ======================================================================= C. read-only enforcement */
describe('View-As: read-only, enforced by the server', () => {
  const UUID = '6f1b1c4e-0000-4000-8000-000000000001';
  // [method, path, body]: every prohibited category, sent directly (no frontend involved).
  const STUDENT_WRITES = [
    ['POST', '/advising/appointments', { advisorId: UUID, startsAt: new Date().toISOString(), topic: 'x' }],
    ['POST', `/advising/appointments/${UUID}/reschedule`, {}],
    ['PATCH', `/advising/appointments/${UUID}/status`, { status: 'CANCELLED' }],
    ['POST', '/chat/conversations', { participantId: UUID }],
    ['POST', `/chat/conversations/${UUID}/messages`, { body: 'hello', clientId: UUID }],
    ['POST', `/chat/conversations/${UUID}/read`, {}],
    ['PATCH', '/profile', { phone: '555-0100' }],
    ['POST', '/profile/address-change', { addressLine1: '1 Test St' }],
    ['POST', '/profile/name-change', { firstName: 'X' }],
    ['PATCH', '/profile/communication-preferences', { email: false }],
    ['POST', '/finance/payments', { amount: 1, method: 'CARD' }],
    ['POST', '/finance/reset', {}],
    ['PATCH', `/notifications/${UUID}/read`, {}],
    ['PATCH', '/notifications/read-all', {}],
    ['POST', `/notifications/urgent/${UUID}/acknowledge`, {}],
    ['POST', `/academics/assignments/${UUID}/submit`, { note: 'x' }],
    ['PATCH', `/academics/announcements/${UUID}/read`, {}],
    ['POST', '/academics/transcript-requests', { type: 'OFFICIAL' }],
    ['POST', '/requests', { type: 'GENERAL', subject: 'x', description: 'y', attachments: [{ name: 'a.pdf', contentBase64: 'AAAA' }] }],
    ['POST', '/support/tickets', { subject: 'x', description: 'y' }],
    ['POST', `/forms/${UUID}/submissions`, { answers: {} }],
    ['PUT', '/dashboard/layout/student', { order: [] }],
    ['DELETE', '/dashboard/layout/student'],
    ['POST', '/career/portfolio', { title: 'x' }],
    ['DELETE', `/career/portfolio/${UUID}`],
    ['POST', `/career/groups/${UUID}/join`, {}],
    ['PUT', '/planning/plan', { items: [] }],
    ['POST', '/calendar-sync/connections', { provider: 'GOOGLE' }],
    ['POST', '/nexora/conversations', {}],
    ['POST', `/nexora/conversations/${UUID}/messages`, { content: 'book me an advising appointment' }],
    ['POST', `/nexora/actions/${UUID}/confirm`, {}],
    ['DELETE', `/nexora/conversations/${UUID}`],
    ['POST', '/analytics/events', { events: [] }],
    ['POST', '/analytics/presence', {}],
    ['POST', '/auth/logout', {}],
    ['POST', '/auth/password', { currentPassword: 'x', newPassword: 'y' }],
    ['POST', '/auth/refresh', { refreshToken: 'x' }],
    ['POST', '/studio/media', { name: 'x.png', contentBase64: 'AAAA' }],
    ['POST', '/admin/view-as/sessions', { userId: UUID, reason: 'nested session' }],
  ];
  const FACULTY_WRITES = [
    ['PUT', `/faculty/courses/${UUID}/gradebook/scores`, { scores: [] }],
    ['POST', `/faculty/courses/${UUID}/gradebook/publish`, {}],
    ['PUT', `/faculty/courses/${UUID}/gradebook/settings`, {}],
    ['POST', '/faculty/sections/sec-1/announcements', { title: 'x', body: 'y', idempotencyKey: UUID }],
    ['POST', `/faculty/courses/${UUID}/notifications`, { title: 'x', message: 'y' }],
    ['POST', '/advising/slots', { startsAt: new Date().toISOString() }],
    ['DELETE', `/advising/slots/${UUID}`],
    ['POST', '/interventions', { studentId: UUID, type: 'x' }],
    ['PUT', '/lms/faculty/moodle/courses/9/assignments/3/grades/8', { grade: 90 }],
    ['POST', '/sis/admin/students', { firstName: 'x' }],
    ['POST', '/lms/admin/moodle/courses', { fullname: 'x' }],
  ];

  it('refuses every prohibited action for a student, before any handler runs, and audits it', async () => {
    const { token, session: s } = await session(ids.student);
    const notificationsBefore = await prisma.notification.findMany({ where: { userId: ids.student }, select: { id: true, isRead: true, acknowledgedAt: true } });
    for (const [method, path, body] of STUDENT_WRITES) {
      const response = await as(token, path, { method, body });
      assert.equal(response.status, 403, `${method} ${path} → ${response.status} ${JSON.stringify(response.body)}`);
      assert.equal(response.body.error.code, 'VIEW_AS_READ_ONLY', `${method} ${path}`);
    }
    const notificationsAfter = await prisma.notification.findMany({ where: { userId: ids.student }, select: { id: true, isRead: true, acknowledgedAt: true } });
    assert.deepEqual(notificationsAfter, notificationsBefore, 'nothing was marked read or acknowledged');
    // Audited asynchronously: give the last few a moment.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const row = await prisma.viewAsSession.findUnique({ where: { id: s.id } });
    assert.equal(row.blockedCount, STUDENT_WRITES.length);
    const blocked = await auditRows('VIEW_AS_ACTION_BLOCKED', { metadata: { path: ['sessionId'], equals: s.id } });
    assert.equal(blocked.length, STUDENT_WRITES.length);
    assert.ok(blocked.every((r) => r.actorUserId === ids.admin && r.entityId === ids.student), 'blocked attempts are the administrator\'s, never the student\'s');
    assert.ok(blocked.every((r) => !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(r.metadata.route)), 'route templates only, no record ids');
  });

  it('refuses every prohibited action for a faculty member (grades, announcements, Moodle, CampusCore)', async () => {
    const { token } = await session(ids.faculty);
    for (const [method, path, body] of FACULTY_WRITES) {
      const response = await as(token, path, { method, body });
      assert.equal(response.status, 403, `${method} ${path} → ${response.status}`);
      assert.equal(response.body.error.code, 'VIEW_AS_READ_ONLY', `${method} ${path}`);
    }
  });

  it('cannot be dodged by method case, path case, slashes or encoding', async () => {
    const { token } = await session(ids.student);
    const raw = (method, path) => fetch(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${t.admin}`, [HEADER]: token, 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'HEAD' ? undefined : '{}' });
    // Lower-case methods never reach the app: Node's HTTP parser rejects them (400).
    assert.equal((await raw('patch', '/api/v1/profile')).status, 400);
    for (const [method, path] of [['PATCH', '/API/V1/PROFILE'], ['PATCH', '//api/v1//profile/'], ['PUT', '/api/v1/%70rofile'], ['POST', '/api/v1/view-as/current'], ['PUT', '/api/v1/view-as/current'], ['DELETE', '/api/v1/view-as/current/x']]) {
      assert.equal((await raw(method, path)).status, 403, `${method} ${path}`);
    }
    assert.equal((await raw('HEAD', '/api/v1/academics/courses')).status, 200, 'HEAD is a read');
  });

  it('keeps private conversations and administration closed even for reads', async () => {
    const { token } = await session(ids.student);
    for (const path of ['/chat/conversations', '/chat/unread', '/nexora/conversations', '/admin/users', '/studio/pages', '/auth/oidc/providers']) {
      const response = await as(token, path);
      assert.equal(response.status, 403, path);
      assert.equal(response.body.error.code, 'VIEW_AS_NOT_ALLOWED', path);
    }
  });

  it('serves every parameterless portal read without the write guard firing (no GET side effects)', async () => {
    const { app } = await import('../src/app.js');
    const routes = listGetRoutes(app).filter((path) => !path.includes(':') && !/^\/api\/v1\/(admin|studio|chat|nexora\/conversations|auth\/oidc|public|health|view-as)/.test(path));
    assert.ok(routes.length > 40, `found ${routes.length} routes`);
    const student = (await session(ids.student)).token;
    const faculty = (await session(ids.faculty)).token;
    const offenders = [];
    for (const path of routes) {
      for (const secret of [student, faculty]) {
        const response = await as(secret, path.replace(/^\/api\/v1/, ''));
        // An integration that is simply not configured in the test environment (the CMS) is not a View-As failure.
        const notConfigured = response.status === 503 && /NOT_CONFIGURED/.test(response.body?.error?.code ?? '');
        if (response.body?.error?.code === 'VIEW_AS_READ_ONLY' || (response.status >= 500 && !notConfigured)) offenders.push(`${path} → ${response.status} ${response.body?.error?.details?.blocked ?? response.body?.error?.message ?? ''}`);
      }
    }
    assert.deepEqual(offenders, [], 'a portal read tried to write (or failed) under View-As');
  });

  it('records which pages were read, as route templates, and keeps them out of the subject\'s analytics', async () => {
    const { token, session: s } = await session(ids.student);
    await as(token, '/academics/courses');
    await as(token, `/academics/courses/${UUID}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const events = await prisma.viewAsAccessEvent.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(events.map((e) => e.route), ['/api/v1/academics/courses', '/api/v1/academics/courses/:id']);
    assert.ok(events.every((e) => e.area === 'academics'));
    assert.equal((await prisma.viewAsSession.findUnique({ where: { id: s.id } })).requestCount, 2);
    assert.equal(await prisma.analyticsPageView.count({ where: { userId: ids.student } }), 0);
    assert.equal(await prisma.analyticsEvent.count({ where: { userId: ids.student } }), 0);
  });
});

/* ======================================================================= guards below the HTTP gate */
describe('View-As: write guards below the routes', () => {
  it('the Prisma client refuses writes inside a View-As request, including raw SQL and transactions', async () => {
    const { runWithViewAs, outsideViewAs } = await import('../src/modules/viewAs/viewAsContext.js');
    const tenant = await prisma.tenant.findUnique({ where: { id: ids.tenant } });
    const write = () => prisma.tenant.updateMany({ where: { id: tenant.id }, data: { name: tenant.name } });
    await runWithViewAs({ sessionId: 'unit' }, async () => {
      assert.ok((await prisma.user.findMany({ take: 1 })).length, 'reads work');
      for (const attempt of [write, () => prisma.$transaction(async (tx) => tx.tenant.update({ where: { id: tenant.id }, data: { name: tenant.name } })), () => prisma.$transaction([write()]), () => prisma.$executeRaw`UPDATE tenants SET name = name WHERE id = ${tenant.id}`, () => prisma.$queryRaw`UPDATE tenants SET name = name WHERE id = ${tenant.id} RETURNING id`, () => new Promise((resolve, reject) => setTimeout(() => write().then(resolve, reject), 5))]) {
        await assert.rejects(attempt, (error) => error.code === 'VIEW_AS_READ_ONLY');
      }
      assert.equal((await outsideViewAs(write)).count, 1, 'the View-As module\'s own bookkeeping can still write');
    });
    assert.equal((await write()).count, 1, 'normal requests are unaffected');
  });

  it('CampusCore, Moodle, connector and CMS clients refuse writes inside a View-As request', async () => {
    const { runWithViewAs } = await import('../src/modules/viewAs/viewAsContext.js');
    const { viewAsGuardedFetch } = await import('../src/modules/viewAs/guardedFetch.js');
    const { createMoodleClient } = await import('../src/integrations/moodle/moodleClient.js');
    const { cmsRequest } = await import('../src/modules/cms/cmsClient.js');
    const sent = [];
    const fakeFetch = async (url, init = {}) => { sent.push(`${init.method ?? 'GET'} ${url}`); return new Response('{}', { status: 200 }); };
    const sisFetch = viewAsGuardedFetch('CampusCore', fakeFetch);
    const moodle = createMoodleClient({ baseUrl: 'https://moodle.test', token: 't', fetchImpl: fakeFetch, maxRetries: 0 });
    await runWithViewAs({ sessionId: 'unit' }, async () => {
      await sisFetch('https://sis.test/api/v1/students?q=1');
      await sisFetch('https://sis.test/api/v1/oauth/token', { method: 'POST' });
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await assert.rejects(() => sisFetch('https://sis.test/api/v1/students/1', { method }), (e) => e.code === 'VIEW_AS_READ_ONLY');
      await moodle.call('core_enrol_get_users_courses', { userid: 8 }, { idempotent: true });
      await assert.rejects(() => moodle.call('enrol_manual_enrol_users', {}, { idempotent: false }), (e) => e.code === 'VIEW_AS_READ_ONLY');
      await assert.rejects(() => moodle.call('core_course_view_course', {}, { idempotent: true }), (e) => e.code === 'VIEW_AS_READ_ONLY');
      await assert.rejects(() => cmsRequest('POST', '/pages', { body: {} }), (e) => e.code === 'VIEW_AS_READ_ONLY');
    });
    assert.deepEqual(sent, ['GET https://sis.test/api/v1/students?q=1', 'POST https://sis.test/api/v1/oauth/token', 'POST https://moodle.test/webservice/rest/server.php'], 'only reads (and the integration\'s own token request) left the server');
    await sisFetch('https://sis.test/api/v1/students/1', { method: 'PATCH' });
    assert.equal(sent.at(-1), 'PATCH https://sis.test/api/v1/students/1', 'outside View-As, writes go through as before');
  });
});

/** Every GET route the app serves, as full paths (Express 4 router stack). */
function listGetRoutes(app) {
  const out = new Set();
  const mount = (layer) => {
    if (layer.regexp?.fast_slash) return '';
    const match = layer.regexp?.source.replace('\\/?(?=\\/|$)', '').replace(/^\^/, '').replace(/\\\//g, '/');
    return match && !/[()[\]|*+?]/.test(match) ? match : null;
  };
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        if (layer.route.methods.get) for (const p of [].concat(layer.route.path)) if (typeof p === 'string') out.add(`${prefix}${p}`.replace(/\/+$/, '') || '/');
      } else if (layer.handle?.stack) {
        const m = mount(layer);
        if (m !== null) walk(layer.handle.stack, `${prefix}${m}`);
      }
    }
  };
  walk(app._router.stack, '');
  return [...out].filter((path) => path.startsWith('/api/v1/'));
}
