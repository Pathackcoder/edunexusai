import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// The deployment's master switch: off by default, read on every call.
process.env.ANALYTICS_ENABLED = 'true';

import { api, closeTestServer, login } from './helpers/testEnv.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers, setFixtureRole } from './helpers/multiRole.js';

/**
 * Portal usage analytics: collection gate, ingestion (validation, idempotency, privacy), aggregation (time zone,
 * re-runs, multi-role counting), reports (permission, tenant isolation, exact small counts) and the rule that
 * analytics can never break an ordinary portal action.
 */

const OTHER_TENANT = 'mr-test-analytics';
const uuid = () => crypto.randomUUID();
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

let prisma;
let tenant;
let other;
let adminToken;
const people = {};

const envelope = (events, overrides = {}) => ({ schemaVersion: 1, sentAt: iso(), visitId: uuid(), visitStartedAt: iso(-60_000), deviceClass: 'DESKTOP', events, ...overrides });
const send = (token, body) => api('/analytics/events', { method: 'POST', token, body });
const pageView = (pageKey, extra = {}) => ({ name: 'page.view', eventId: uuid(), at: iso(-30_000), pageViewId: uuid(), pageKey, ...extra });
const clearAnalytics = async () => {
  for (const table of ['analyticsEvent', 'analyticsPageView', 'analyticsVisit', 'analyticsUserDaily', 'analyticsRollup', 'analyticsRollupRun']) await prisma[table].deleteMany({});
};
const refresh = () => api('/admin/analytics/refresh', { method: 'POST', token: adminToken });

before(async () => {
  ({ prisma } = await import('../src/db/prisma.js'));
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  await clearAnalytics();
  await prisma.userPermission.deleteMany({});
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  other = await prisma.tenant.create({ data: { slug: OTHER_TENANT, name: 'Other University (analytics test)', timezone: 'America/New_York', analyticsEnabled: true, analyticsStartedAt: new Date('2026-01-01T00:00:00Z') } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: false, analyticsStartedAt: null } });

  for (let index = 1; index <= 6; index += 1) people[`s${index}`] = await createMultiRoleUser({ key: `an.s${index}`, firstName: `Student${index}`, roles: ['STUDENT'] });
  people.dual = await createMultiRoleUser({ key: 'an.dual', firstName: 'Dual', roles: ['STUDENT', 'FACULTY'] });
  people.admin2 = await createMultiRoleUser({ key: 'an.admin2', firstName: 'Second', roles: ['ADMIN'] });
  for (const person of Object.values(people)) person.token = await loginFixture(person.email);
  adminToken = await login('admin');
  people.admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'admin@edunexus.ai' } });
});

after(async () => {
  await clearAnalytics();
  await prisma.userPermission.deleteMany({});
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: false, analyticsStartedAt: null } });
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  await removeMultiRoleUsers();
  await closeTestServer();
});

describe('collection is off until it is switched on', () => {
  it('stores nothing while the institution has not enabled collection', async () => {
    const { status, body } = await send(people.s1.token, envelope([pageView('dashboard')]));
    assert.equal(status, 200);
    assert.deepEqual(body.data, { enabled: false, accepted: 0, duplicates: 0, rejected: 0 });
    assert.equal(await prisma.analyticsPageView.count(), 0);
    const me = await api('/auth/me', { token: people.s1.token });
    assert.equal(me.body.data.user.analytics.collecting, false);
  });

  it('stores nothing while the deployment master switch is off, even for an enabled institution', async () => {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: true, analyticsStartedAt: new Date(Date.now() - 86_400_000) } });
    process.env.ANALYTICS_ENABLED = 'false';
    try {
      const { body } = await send(people.s1.token, envelope([pageView('dashboard')]));
      assert.equal(body.data.enabled, false);
      assert.equal(await prisma.analyticsPageView.count(), 0);
    } finally {
      process.env.ANALYTICS_ENABLED = 'true';
    }
  });

  it('requires a signed-in session', async () => {
    const { status } = await send(null, envelope([pageView('dashboard')]));
    assert.equal(status, 401);
  });

  it('never measures an excluded account', async () => {
    await prisma.user.update({ where: { id: people.s6.user.id }, data: { analyticsExcludedAt: new Date() } });
    const { body } = await send(people.s6.token, envelope([pageView('dashboard')]));
    assert.equal(body.data.enabled, false);
    await prisma.user.update({ where: { id: people.s6.user.id }, data: { analyticsExcludedAt: null } });
  });
});

describe('ingestion', () => {
  it('records a visit, a page view and events with server-derived identity', async () => {
    const view = pageView('academics.grades');
    const batch = envelope([
      view,
      { name: 'page.ping', eventId: uuid(), at: iso(-5_000), pageViewId: view.pageViewId, pageKey: 'academics.grades', visibleMs: 20_000 },
      { name: 'nav.click', eventId: uuid(), at: iso(-4_000), targetKey: 'academics.schedule', source: 'SIDEBAR', pageKey: 'academics.grades' },
      { name: 'feature.use', eventId: uuid(), at: iso(-3_000), featureKey: 'chat.opened', action: 'INBOX' },
    ], { deviceClass: 'MOBILE' });
    const { status, body } = await send(people.s1.token, batch);
    assert.equal(status, 202);
    assert.deepEqual(body.data, { enabled: true, accepted: 4, duplicates: 0, rejected: 0 });

    const visit = await prisma.analyticsVisit.findUnique({ where: { id: batch.visitId } });
    assert.equal(visit.tenantId, tenant.id);
    assert.equal(visit.userId, people.s1.user.id);
    assert.deepEqual(visit.rolesHeld, ['STUDENT']);
    assert.equal(visit.deviceClass, 'MOBILE');
    assert.equal(visit.authMethod, 'PASSWORD');
    assert.equal(visit.entryPageKey, 'academics.grades');
    const stored = await prisma.analyticsPageView.findUnique({ where: { id: view.pageViewId } });
    assert.equal(stored.contextRole, 'STUDENT');
    assert.equal(stored.visibleMs, 20_000);
    // Stored in UTC whatever the database session's time zone is (raw SQL inserts must not shift by the server offset).
    const seconds = (date) => Math.abs(date.getTime() - Date.now()) / 1000;
    assert.ok(seconds(visit.startedAt) < 120 && seconds(visit.lastSeenAt) < 120, `visit times off by ${seconds(visit.startedAt)}s`);
    assert.ok(seconds(stored.startedAt) < 120 && seconds(stored.lastSeenAt) < 120, `page view times off by ${seconds(stored.startedAt)}s`);
    const [session] = await prisma.$queryRaw`SELECT current_setting('TimeZone') AS tz`;
    console.log(`database session time zone during this test: ${session.tz}`);
  });

  it('is idempotent: the same batch twice changes nothing, and visible time only grows', async () => {
    const view = pageView('campus.overview');
    const ping = (visibleMs, at) => ({ name: 'page.ping', eventId: uuid(), at: iso(at), pageViewId: view.pageViewId, pageKey: 'campus.overview', visibleMs });
    const click = { name: 'nav.click', eventId: uuid(), at: iso(-2_000), targetKey: 'campus.map', source: 'BREADCRUMB' };
    const batch = envelope([view, ping(10_000, -15_000), click]);
    await send(people.s2.token, batch);
    const again = await send(people.s2.token, batch);
    assert.equal(again.body.data.duplicates, 1);
    assert.equal(await prisma.analyticsEvent.count({ where: { id: click.eventId } }), 1);
    assert.equal(await prisma.analyticsPageView.count({ where: { id: view.pageViewId } }), 1);
    // A late, smaller heartbeat never reduces the counter; a larger one raises it.
    await send(people.s2.token, envelope([ping(4_000, -14_000)], { visitId: batch.visitId }));
    assert.equal((await prisma.analyticsPageView.findUnique({ where: { id: view.pageViewId } })).visibleMs, 10_000);
    await send(people.s2.token, envelope([ping(14_000, -1_000)], { visitId: batch.visitId }));
    assert.equal((await prisma.analyticsPageView.findUnique({ where: { id: view.pageViewId } })).visibleMs, 14_000);
  });

  it('caps visible time at the time the page view has existed', async () => {
    const view = pageView('campus.map', { at: iso(-10_000) });
    await send(people.s2.token, envelope([view, { name: 'page.exit', eventId: uuid(), at: iso(-1_000), pageViewId: view.pageViewId, pageKey: 'campus.map', visibleMs: 3_600_000 }]));
    const stored = await prisma.analyticsPageView.findUnique({ where: { id: view.pageViewId } });
    assert.ok(stored.visibleMs <= 15_000, `visibleMs ${stored.visibleMs} should be capped near 9s`);
  });

  it('rejects anything outside the fixed schema, one event at a time', async () => {
    const good = pageView('dashboard');
    const { body } = await send(people.s3.token, envelope([
      good,
      { ...pageView('dashboard'), url: '/faculty/courses/8f1c?q=secret' }, // unknown property
      pageView('/academics/grades?student=42'), // a URL is not a page key
      { name: 'nav.click', eventId: uuid(), at: iso(), targetKey: 'https://example.com', source: 'SIDEBAR' },
      { name: 'feature.use', eventId: uuid(), at: iso(), featureKey: 'directory.searched', action: 'PEOPLE', query: 'jane doe' }, // search text
      { name: 'feature.use', eventId: uuid(), at: iso(), featureKey: 'chat.message_sent' }, // server-only feature
      { name: 'auth.sign_in', eventId: uuid(), at: iso() }, // server-only event
      { name: 'widget.interact', eventId: uuid(), at: iso(), pageViewId: good.pageViewId, pageKey: 'dashboard', widgetKey: 'cms.1234', action: 'LINK' },
      { name: 'page.view', eventId: uuid(), at: iso(-3 * 86_400_000), pageViewId: uuid(), pageKey: 'dashboard' }, // older than a day
      'not an object',
    ]));
    assert.equal(body.data.accepted, 1);
    assert.equal(body.data.rejected, 9);
    const text = JSON.stringify(await prisma.analyticsEvent.findMany({ where: { userId: people.s3.user.id } })) + JSON.stringify(await prisma.analyticsPageView.findMany({ where: { userId: people.s3.user.id } }));
    for (const forbidden of ['secret', 'jane', 'example.com', 'student=42']) assert.ok(!text.includes(forbidden), `${forbidden} must not be stored`);
  });

  it('rejects a malformed envelope, an oversized batch and identity fields from the browser', async () => {
    assert.equal((await send(people.s3.token, { events: [] })).status, 400);
    assert.equal((await send(people.s3.token, envelope(Array.from({ length: 51 }, () => pageView('dashboard'))))).status, 400);
    for (const spoof of [{ tenantId: other.id }, { userId: people.s1.user.id }, { roles: ['ADMIN'] }, { userAgent: 'Mozilla/5.0' }]) {
      assert.equal((await send(people.s3.token, { ...envelope([pageView('dashboard')]), ...spoof })).status, 400, JSON.stringify(spoof));
    }
  });

  it('drops a page the account cannot open, and decides the dashboard context itself', async () => {
    const denied = await send(people.s3.token, envelope([pageView('admin.users'), pageView('faculty.courses')]));
    assert.equal(denied.body.data.rejected, 2);
    // A student claiming the admin view of the dashboard is still a student.
    const claimed = pageView('dashboard', { view: 'admin' });
    await send(people.s3.token, envelope([claimed]));
    assert.equal((await prisma.analyticsPageView.findUnique({ where: { id: claimed.pageViewId } })).contextRole, 'STUDENT');
    // A person with two roles: the view they are really in, Overview is shared, a shared page is shared.
    const teaching = pageView('dashboard', { view: 'faculty' });
    const overview = pageView('dashboard', { view: 'overview' });
    const forged = pageView('dashboard', { view: 'admin' });
    const campus = pageView('campus.overview');
    const grades = pageView('academics.grades');
    await send(people.dual.token, envelope([teaching, overview, forged, campus, grades]));
    const context = async (id) => (await prisma.analyticsPageView.findUnique({ where: { id } })).contextRole;
    assert.equal(await context(teaching.pageViewId), 'FACULTY');
    assert.equal(await context(overview.pageViewId), 'SHARED');
    assert.equal(await context(forged.pageViewId), 'SHARED');
    assert.equal(await context(campus.pageViewId), 'SHARED');
    assert.equal(await context(grades.pageViewId), 'STUDENT');
  });

  it('refuses a visit or page view id that belongs to someone else', async () => {
    const view = pageView('dashboard');
    const batch = envelope([view]);
    await send(people.s4.token, batch);
    const stolenVisit = await send(people.s5.token, envelope([pageView('dashboard')], { visitId: batch.visitId }));
    assert.equal(stolenVisit.body.data.accepted, 0);
    assert.equal(stolenVisit.body.data.rejected, 1);
    const stolenView = await send(people.s5.token, envelope([{ name: 'page.ping', eventId: uuid(), at: iso(), pageViewId: view.pageViewId, pageKey: 'dashboard', visibleMs: 30_000 }]));
    assert.equal(stolenView.body.data.rejected, 1);
    const stored = await prisma.analyticsPageView.findUnique({ where: { id: view.pageViewId } });
    assert.equal(stored.userId, people.s4.user.id);
    assert.equal(stored.visibleMs, 0);
  });

  it('applies its own per-account rate limit', async () => {
    process.env.ANALYTICS_TEST_ACCOUNT_LIMIT = '0';
    try {
      const { status, body } = await send(people.s5.token, envelope([pageView('dashboard')]));
      assert.equal(status, 429);
      assert.equal(body.error.code, 'RATE_LIMITED');
    } finally {
      delete process.env.ANALYTICS_TEST_ACCOUNT_LIMIT;
    }
  });
});

describe('server-side events', () => {
  it('records a sign-in once per issued session, never on a token refresh, and a sign-out', async () => {
    const count = () => prisma.analyticsEvent.count({ where: { userId: people.s5.user.id, name: 'auth.sign_in' } });
    const before = await count();
    const signIn = await api('/auth/login', { method: 'POST', body: { email: people.s5.email, password: 'MultiRole#Test2026' } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await count(), before + 1);
    const refreshed = await api('/auth/refresh', { method: 'POST', body: { refreshToken: signIn.body.data.refreshToken } });
    assert.equal(refreshed.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await count(), before + 1);
    await api('/auth/logout', { method: 'POST', token: refreshed.body.data.accessToken, body: { refreshToken: refreshed.body.data.refreshToken } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const signOut = await prisma.analyticsEvent.findFirst({ where: { userId: people.s5.user.id, name: 'auth.sign_out' } });
    assert.equal(signOut.action, 'PORTAL');
    assert.equal(signOut.visitId, null);
  });

  it('records a completed feature only when the action succeeded', async () => {
    const count = () => prisma.analyticsEvent.count({ where: { userId: people.s1.user.id, subjectKey: 'notifications.read' } });
    const failed = await api(`/notifications/${uuid()}/read`, { method: 'PATCH', token: people.s1.token });
    assert.notEqual(failed.status, 200);
    const ok = await api('/notifications/read-all', { method: 'PATCH', token: people.s1.token });
    assert.equal(ok.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await count(), 1);
  });

  it('never lets an analytics failure break a real action', async () => {
    const { trackFeature, trackSignIn } = await import('../src/modules/analytics/serverEvents.js');
    // A tenant id that does not match, an unknown feature and a missing user: all resolve quietly to false.
    assert.equal(await trackFeature({ tenantId: other.id, userId: people.s1.user.id, roles: ['STUDENT'] }, 'chat.message_sent'), false);
    assert.equal(await trackFeature({ tenantId: tenant.id, userId: people.s1.user.id }, 'not.a.feature'), false);
    assert.equal(await trackSignIn({ tenantId: tenant.id, userId: uuid(), method: 'PASSWORD' }), false);
  });
});

describe('access', () => {
  it('denies reports to non-administrators and to administrators without the named permission', async () => {
    for (const token of [people.s1.token, people.dual.token]) assert.equal((await api('/admin/analytics/overview', { token })).status, 403);
    const { status, body } = await api('/admin/analytics/overview', { token: adminToken });
    assert.equal(status, 403);
    assert.equal(body.error.details.reason, 'PERMISSION_REQUIRED');
    assert.equal((await api('/admin/analytics/access', { token: people.s1.token })).status, 403);
  });

  it('lets an administrator without access neither see nor change who has it (no mutual granting)', async () => {
    for (const [method, path, body] of [['GET', '/admin/analytics/access'], ['PUT', `/admin/analytics/access/${people.admin.id}`, { granted: true }], ['PUT', `/admin/analytics/access/${people.admin2.user.id}`, { granted: true }]]) {
      const { status, body: response } = await api(path, { method, token: people.admin2.token, body });
      assert.equal(status, 403, `${method} ${path}`);
      assert.equal(response.error.details.reason, 'PERMISSION_REQUIRED');
    }
    for (const token of [adminToken, people.admin2.token]) assert.equal((await api('/admin/analytics/overview', { token })).status, 403);
    assert.equal(await prisma.userPermission.count({ where: { tenantId: tenant.id } }), 0);
  });

  it('grants the first access with the administration script, for that one account only', async () => {
    const { execFileSync } = await import('node:child_process');
    const run = (...args) => execFileSync(process.execPath, ['scripts/analytics-access.mjs', ...args], { env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8' });
    assert.match(run('grant', '--tenant', 'demo-university', '--email', 'admin@edunexus.ai'), /Dry run/);
    assert.equal(await prisma.userPermission.count({ where: { tenantId: tenant.id } }), 0);
    assert.throws(() => run('grant', '--tenant', 'demo-university', '--email', people.s1.email, '--apply'), /not an administrator/);
    assert.match(run('grant', '--tenant', 'demo-university', '--email', 'admin@edunexus.ai', '--apply'), /Granted analytics.view/);
    const grants = await prisma.userPermission.findMany({ where: { tenantId: tenant.id } });
    assert.deepEqual(grants.map((grant) => grant.userId), [people.admin.id]);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'ANALYTICS_ACCESS_GRANTED', entityId: people.admin.id } }));
    assert.equal((await api('/admin/analytics/overview', { token: adminToken })).status, 200);
    assert.ok((await api('/auth/me', { token: adminToken })).body.data.user.permissions.includes('analytics.view'));
    assert.deepEqual((await api('/auth/me', { token: people.admin2.token })).body.data.user.permissions, []);
  });

  it('lets an administrator with access manage it for other active administrators of the institution only', async () => {
    const list = await api('/admin/analytics/access', { token: adminToken });
    assert.equal(list.status, 200);
    const ids = list.body.data.map((row) => row.id);
    assert.ok(ids.includes(people.admin.id) && ids.includes(people.admin2.user.id));
    assert.ok(!ids.includes(people.s1.user.id), 'only administrators are listed');
    const otherTenantIds = (await prisma.user.findMany({ where: { tenantId: other.id }, select: { id: true } })).map((row) => row.id);
    assert.ok(!ids.some((id) => otherTenantIds.includes(id)), 'only this institution\'s administrators are listed');

    const self = await api(`/admin/analytics/access/${people.admin.id}`, { method: 'PUT', token: adminToken, body: { granted: false } });
    assert.equal(self.status, 403);
    assert.equal(self.body.error.details.reason, 'SELF_GRANT');
    assert.equal((await api(`/admin/analytics/access/${people.s1.user.id}`, { method: 'PUT', token: adminToken, body: { granted: true } })).status, 400);
    const suspended = await createMultiRoleUser({ key: 'an.suspended', firstName: 'Suspended', roles: ['ADMIN'] });
    await prisma.user.update({ where: { id: suspended.user.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await api(`/admin/analytics/access/${suspended.user.id}`, { method: 'PUT', token: adminToken, body: { granted: true } })).status, 400);
    const stranger = await prisma.user.create({ data: { tenantId: other.id, email: 'admin@other.test', firstName: 'Other', lastName: 'Admin', userRoles: { create: [{ role: { connect: { key: 'ADMIN' } } }] } } });
    assert.equal((await api(`/admin/analytics/access/${stranger.id}`, { method: 'PUT', token: adminToken, body: { granted: true } })).status, 404);
    assert.equal(await prisma.userPermission.count({ where: { userId: { in: [suspended.user.id, stranger.id, people.s1.user.id] } } }), 0);

    const granted = await api(`/admin/analytics/access/${people.admin2.user.id}`, { method: 'PUT', token: adminToken, body: { granted: true } });
    assert.equal(granted.status, 200);
    assert.equal(granted.body.data.find((row) => row.id === people.admin2.user.id).hasAccess, true);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'ANALYTICS_ACCESS_GRANTED', entityId: people.admin2.user.id }, orderBy: { createdAt: 'desc' } });
    assert.equal(audit.actorUserId, people.admin.id);
    assert.equal((await api('/admin/analytics/overview', { token: people.admin2.token })).status, 200);
  });

  it('ends access at once when it is withdrawn, or when the ADMIN role is removed', async () => {
    const revoked = await api(`/admin/analytics/access/${people.admin2.user.id}`, { method: 'PUT', token: adminToken, body: { granted: false } });
    assert.equal(revoked.status, 200);
    const denied = await api('/admin/analytics/overview', { token: people.admin2.token }); // same token as before
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.details.reason, 'PERMISSION_REQUIRED');
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'ANALYTICS_ACCESS_REVOKED', entityId: people.admin2.user.id, actorUserId: people.admin.id } }));

    // A grant left behind on an account that is no longer an administrator opens nothing.
    const former = await createMultiRoleUser({ key: 'an.former', firstName: 'Former', roles: ['ADMIN'] });
    const formerToken = await loginFixture(former.email);
    await prisma.userPermission.create({ data: { tenantId: tenant.id, userId: former.user.id, permission: 'analytics.view' } });
    assert.equal((await api('/admin/analytics/overview', { token: formerToken })).status, 200);
    await setFixtureRole(former.user.id, 'ADMIN', false);
    for (const path of ['/admin/analytics/overview', '/admin/analytics/access']) assert.equal((await api(path, { token: formerToken })).status, 403, path);
    assert.equal((await api(`/admin/analytics/access/${people.admin2.user.id}`, { method: 'PUT', token: formerToken, body: { granted: true } })).status, 403);
  });

  it('never lets a non-administrator in, even with a permission row', async () => {
    await prisma.userPermission.create({ data: { tenantId: tenant.id, userId: people.s1.user.id, permission: 'analytics.view' } });
    for (const path of ['/admin/analytics/overview', '/admin/analytics/access', '/admin/analytics/health']) assert.equal((await api(path, { token: people.s1.token })).status, 403, path);
    assert.equal((await api(`/admin/analytics/access/${people.s1.user.id}`, { method: 'PUT', token: people.s1.token, body: { granted: true } })).status, 403);
    assert.equal((await api('/admin/analytics/settings', { method: 'PUT', token: people.s1.token, body: { enabled: true, noticeConfirmed: true } })).status, 403);
    await prisma.userPermission.deleteMany({ where: { userId: people.s1.user.id } });
  });

  it('requires the privacy-notice confirmation to switch collection on, and audits the change', async () => {
    const off = await api('/admin/analytics/settings', { method: 'PUT', token: adminToken, body: { enabled: false } });
    assert.equal(off.body.data.institutionEnabled, false);
    assert.equal((await api('/admin/analytics/settings', { method: 'PUT', token: adminToken, body: { enabled: true } })).status, 400);
    const on = await api('/admin/analytics/settings', { method: 'PUT', token: adminToken, body: { enabled: true, noticeConfirmed: true } });
    assert.equal(on.body.data.institutionEnabled, true);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'ANALYTICS_COLLECTION_ENABLED' } }));
    assert.equal((await api('/admin/analytics/settings', { method: 'PUT', token: people.admin2.token, body: { enabled: false } })).status, 403);
  });
});

describe('aggregation and reports', () => {
  before(async () => {
    await clearAnalytics();
    // Six students each view the dashboard and grades; five use chat; the dual-role person views two pages.
    for (const key of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const dashboard = pageView('dashboard');
      const grades = pageView('academics.grades');
      const events = [
        dashboard, grades,
        { name: 'page.exit', eventId: uuid(), at: iso(-1_000), pageViewId: grades.pageViewId, pageKey: 'academics.grades', visibleMs: 12_000 },
        { name: 'widget.impression', eventId: uuid(), at: iso(-20_000), pageViewId: dashboard.pageViewId, pageKey: 'dashboard', widgetKey: 'dashboard.schedule' },
        { name: 'widget.impression', eventId: uuid(), at: iso(-19_000), pageViewId: dashboard.pageViewId, pageKey: 'dashboard', widgetKey: 'dashboard.schedule' },
        { name: 'nav.click', eventId: uuid(), at: iso(-18_000), targetKey: 'academics.grades', source: 'SIDEBAR', pageKey: 'dashboard' },
      ];
      if (key !== 's6') events.push({ name: 'feature.use', eventId: uuid(), at: iso(-10_000), featureKey: 'chat.opened', action: 'INBOX' });
      if (key === 's1' || key === 's2') events.push({ name: 'widget.interact', eventId: uuid(), at: iso(-9_000), pageViewId: dashboard.pageViewId, pageKey: 'dashboard', widgetKey: 'dashboard.schedule', action: 'LINK' });
      // Only two people open the transcripts page: a small group, reported exactly.
      if (key === 's1' || key === 's2') events.push(pageView('academics.transcripts'));
      await send(people[key].token, envelope(events, { deviceClass: key === 's1' ? 'MOBILE' : 'DESKTOP' }));
    }
    await send(people.dual.token, envelope([pageView('dashboard', { view: 'faculty' }), pageView('academics.grades')]));
    // Another institution's activity, which must never appear in this one's reports.
    const stranger = await prisma.user.create({ data: { tenantId: other.id, email: 'someone@other.test', firstName: 'Other', lastName: 'Person' } });
    const visitId = uuid();
    await prisma.analyticsVisit.create({ data: { id: visitId, tenantId: other.id, userId: stranger.id, rolesHeld: ['STUDENT'], authMethod: 'PASSWORD', deviceClass: 'TABLET', startedAt: new Date(), lastSeenAt: new Date() } });
    for (let index = 0; index < 40; index += 1) {
      await prisma.analyticsPageView.create({ data: { id: uuid(), tenantId: other.id, userId: stranger.id, visitId, pageKey: 'campus.library', rolesHeld: ['STUDENT'], contextRole: 'STUDENT', deviceClass: 'TABLET', startedAt: new Date(), lastSeenAt: new Date() } });
    }
    const refreshed = await refresh();
    assert.equal(refreshed.status, 200);
  });

  it('counts each person once overall, and under every role they hold', async () => {
    const overview = (await api('/admin/analytics/overview?range=7d', { token: adminToken })).body.data;
    assert.equal(overview.kpis.activeUsers.value, 7);
    assert.equal(overview.kpis.pageViews.value, 16);
    assert.equal(overview.kpis.visits.value, 7);
    assert.equal(overview.meta.timezone, 'America/New_York');
    assert.equal(overview.meta.includesToday, true);
    const activity = (await api('/admin/analytics/activity?range=7d', { token: adminToken })).body.data;
    const students = activity.roles.find((row) => row.role === 'STUDENT');
    assert.equal(students.users, 7); // six students and the dual-role person
    // One faculty member (the dual-role person): a small group, shown exactly.
    const faculty = activity.roles.find((row) => row.role === 'FACULTY');
    assert.equal(faculty.users, 1);
    assert.equal(faculty.pageViews, 2);
    const filtered = (await api('/admin/analytics/overview?range=7d&role=STUDENT', { token: adminToken })).body.data;
    assert.equal(filtered.kpis.activeUsers.value, 7);
  });

  it('averages daily active users over measured days only, and tells unique visitors from page views', async () => {
    const tenantRow = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    const { localDateOf } = await import('../src/modules/analytics/rollupService.js');
    const today = localDateOf(new Date(), tenantRow.timezone);
    const started = localDateOf(tenantRow.analyticsStartedAt, tenantRow.timezone);
    const measured = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${started}T00:00:00Z`)) / 86_400_000) + 1;
    for (const range of ['7d', '30d']) {
      const { kpis, basis } = (await api(`/admin/analytics/overview?range=${range}`, { token: adminToken })).body.data;
      // 7 people active today = 7 person-days, whatever the range: days before collection are not counted.
      assert.equal(basis.personDays, 7);
      assert.equal(basis.measuredDays, measured, range);
      assert.ok(Math.abs(kpis.averageDailyUsers.value - 7 / measured) < 1e-9, `${range}: ${kpis.averageDailyUsers.value}`);
      assert.equal(kpis.pageVisitors.value, 7);
      assert.equal(kpis.pageViews.value, 16);
      assert.ok(Math.abs(kpis.pageViewsPerVisit.value - 16 / 7) < 1e-9);
      assert.equal(kpis.weeklyActiveUsers.value, 7);
      assert.equal(kpis.monthlyActiveUsers.value, 7);
      assert.ok(Math.abs(kpis.stickiness.value - (7 / measured) / 7) < 1e-9);
    }
    // A period entirely before collection began has no measured days and no average (never a zero).
    const activity = (await api('/admin/analytics/activity?range=30d', { token: adminToken })).body.data;
    const startedLocal = started;
    for (const row of activity.rolling) {
      if (row.date < startedLocal) assert.ok(row.wau === null && row.mau === null && row.beforeCollection, row.date);
      else assert.equal(typeof row.wau, 'number');
    }
    const before = (await api('/admin/analytics/overview?from=2026-01-01&to=2026-01-31', { token: adminToken })).body.data;
    assert.equal(before.basis.measuredDays, 0);
    assert.equal(before.kpis.averageDailyUsers.value, null);
  });

  it('re-running the aggregation gives exactly the same figures', async () => {
    const first = (await api('/admin/analytics/pages?range=7d', { token: adminToken })).body.data;
    await refresh();
    await refresh();
    const second = (await api('/admin/analytics/pages?range=7d', { token: adminToken })).body.data;
    assert.deepEqual(second.pages, first.pages);
    assert.equal(await prisma.analyticsUserDaily.count({ where: { tenantId: tenant.id } }), 7);
  });

  it('reports pages with exact unique visitors, measured time and unused pages', async () => {
    const { pages, totalViews } = (await api('/admin/analytics/pages?range=7d', { token: adminToken })).body.data;
    assert.equal(totalViews, 16);
    const grades = pages.find((row) => row.key === 'academics.grades');
    assert.equal(grades.views, 7);
    assert.equal(grades.users, 7);
    assert.equal(grades.averageVisibleMs, 12_000); // only views whose time was measured are averaged
    const library = pages.find((row) => row.key === 'campus.library');
    assert.equal(library.views, 0); // the other institution's 40 views are not here
    assert.ok(!pages.some((row) => row.key.includes('/')));
  });

  it('reports small groups exactly: nothing is withheld', async () => {
    const { pages } = (await api('/admin/analytics/pages?range=7d', { token: adminToken })).body.data;
    const transcripts = pages.find((row) => row.key === 'academics.transcripts');
    assert.equal(transcripts.views, 2);
    assert.equal(transcripts.users, 2);
    assert.ok(!pages.some((row) => 'suppressed' in row || row.views === null));

    const { widgets } = (await api('/admin/analytics/widgets?range=7d', { token: adminToken })).body.data;
    const schedule = widgets.find((row) => row.key === 'dashboard.schedule');
    assert.equal(schedule.impressions, 6); // twice in one page view counts once
    assert.equal(schedule.users, 6);
    assert.equal(schedule.interactors, 2);
    assert.equal(schedule.interactions, 2);
    assert.ok(Math.abs(schedule.engagementRate - 2 / 6) < 1e-9);

    const mobile = (await api('/admin/analytics/overview?range=7d&device=MOBILE', { token: adminToken })).body.data;
    assert.equal(mobile.kpis.activeUsers.value, 1);
    assert.equal(mobile.kpis.pageViews.value, 3);
    const { distribution, byRole } = (await api('/admin/analytics/devices?range=7d', { token: adminToken })).body.data;
    const phone = distribution.find((row) => row.device === 'MOBILE');
    assert.equal(phone.visits, 1);
    assert.equal(phone.users, 1);
    assert.equal(distribution.find((row) => row.device === 'DESKTOP').visits, 6);
    assert.equal(byRole.find((row) => row.role === 'FACULTY').total, 1);
    // Still no person in any response.
    const all = JSON.stringify([pages, widgets, mobile, distribution]);
    for (const person of Object.values(people)) assert.ok(!all.includes(person.email ?? '@@') && !all.includes(person.user?.id ?? '@@'));
  });

  it('reports features, navigation and their adoption', async () => {
    const features = (await api('/admin/analytics/features?range=7d', { token: adminToken })).body.data;
    const chat = features.features.find((row) => row.key === 'chat.opened');
    assert.equal(chat.users, 5);
    assert.equal(chat.uses, 5);
    assert.ok(Math.abs(chat.adoptionRate - 5 / 7) < 1e-9);
    assert.equal(features.features.find((row) => row.key === 'forms.submitted').uses, 0);
    const navigation = (await api('/admin/analytics/navigation?range=7d', { token: adminToken })).body.data;
    assert.equal(navigation.totalClicks, 6);
    assert.equal(navigation.targets[0].key, 'academics.grades');
    assert.equal(navigation.sources.find((row) => row.source === 'SIDEBAR').clicks, 6);
  });

  it('keeps institutions apart', async () => {
    const { runAsOther } = { runAsOther: async () => (await import('../src/modules/analytics/reportService.js')) };
    const reports = await runAsOther();
    const { rebuildDay, localDateOf } = await import('../src/modules/analytics/rollupService.js');
    await rebuildDay({ tenantId: other.id, timezone: 'America/New_York', date: localDateOf(new Date(), 'America/New_York'), final: false });
    const ctx = await reports.reportContext(other.id, { range: '7d' });
    const theirs = await reports.pagesReport(ctx);
    assert.equal(theirs.totalViews, 40);
    assert.equal(theirs.pages.filter((row) => row.views !== 0).length, 1); // only their own page
    assert.equal(theirs.pages.find((row) => row.key === 'campus.library').users, 1);
    assert.equal(await prisma.analyticsRollup.count({ where: { tenantId: tenant.id, subjectKey: 'campus.library' } }), 0);
  });

  it('validates report dates and filters', async () => {
    assert.equal((await api('/admin/analytics/overview?from=2026-13-45', { token: adminToken })).status, 400);
    assert.equal((await api('/admin/analytics/overview?from=2026-11-10&to=2026-11-01', { token: adminToken })).status, 400);
    assert.equal((await api('/admin/analytics/overview?role=SUPERADMIN', { token: adminToken })).status, 400);
    assert.equal((await api('/admin/analytics/pages/not.a.page', { token: adminToken })).status, 400);
    assert.equal((await api('/admin/analytics/pages/academics.grades?range=7d', { token: adminToken })).status, 200);
  });

  it('serves every report section', async () => {
    for (const section of ['overview', 'activity', 'pages', 'navigation', 'features', 'widgets', 'devices', 'communication', 'integrations', 'health']) {
      const { status, body } = await api(`/admin/analytics/${section}?range=30d`, { token: adminToken });
      assert.equal(status, 200, `${section}: ${JSON.stringify(body.error ?? {})}`);
      assert.ok(!/"userId"|"email"|passwordHash/.test(JSON.stringify(body.data)), `${section} must not carry a person`);
    }
    const health = (await api('/admin/analytics/health', { token: adminToken })).body.data;
    assert.equal(health.collection.collecting, true);
    assert.equal(health.runs[0].status, 'PARTIAL');
    assert.equal(health.retention.rawDays, 90);
  });
});

describe('time zone, role history and retention', () => {
  let stranger;
  const TZ = 'America/New_York';
  const insertView = (at, pageKey = 'dashboard', visitId = null) => prisma.analyticsPageView.create({
    data: { id: uuid(), tenantId: other.id, userId: stranger.id, visitId: visitId ?? uuid(), pageKey, rolesHeld: ['STUDENT'], contextRole: 'STUDENT', deviceClass: 'DESKTOP', startedAt: new Date(at), lastSeenAt: new Date(at) },
  });

  before(async () => {
    stranger = await prisma.user.findFirst({ where: { tenantId: other.id } });
    await prisma.analyticsPageView.deleteMany({ where: { tenantId: other.id } });
  });

  it('assigns activity to the institution\'s local day, including across a DST change', async () => {
    const { rebuildDay } = await import('../src/modules/analytics/rollupService.js');
    // 03:30Z on 10 June is 23:30 on 9 June in New York (UTC-4); 04:30Z is 00:30 on 10 June.
    await insertView('2026-06-10T03:30:00Z');
    await insertView('2026-06-10T04:30:00Z');
    // 8 March 2026: clocks go forward, so the local day is 23 hours long (05:00Z → 04:00Z).
    await insertView('2026-03-08T05:00:00Z');
    await insertView('2026-03-09T03:59:00Z');
    await insertView('2026-03-09T04:00:00Z'); // already 9 March locally
    for (const date of ['2026-06-09', '2026-06-10', '2026-03-08', '2026-03-09']) await rebuildDay({ tenantId: other.id, timezone: TZ, date, final: true });
    const views = async (date) => (await prisma.analyticsRollup.findFirst({ where: { tenantId: other.id, localDate: new Date(`${date}T00:00:00Z`), fact: 'PAGE', subjectKey: 'dashboard', role: 'ALL', device: 'ALL' } }))?.count ?? 0;
    assert.equal(await views('2026-06-09'), 1);
    assert.equal(await views('2026-06-10'), 1);
    assert.equal(await views('2026-03-08'), 2);
    assert.equal(await views('2026-03-09'), 1);
    const hour = await prisma.analyticsRollup.findFirst({ where: { tenantId: other.id, localDate: new Date('2026-06-09T00:00:00Z'), fact: 'HOUR', role: 'ALL', device: 'ALL' } });
    assert.equal(hour.subjectKey, '23');
  });

  it('uses the institution\'s configured zone, and UTC (never a guessed zone) when it has none or an invalid one', async () => {
    const { safeTimezone, localDateOf } = await import('../src/modules/analytics/rollupService.js');
    assert.equal(safeTimezone('Asia/Kolkata'), 'Asia/Kolkata');
    for (const missing of [null, undefined, '', 'Not/AZone']) assert.equal(safeTimezone(missing), 'UTC');
    // 20:00 UTC on 9 June is already 10 June in Kolkata, still 9 June in UTC.
    assert.equal(localDateOf(new Date('2026-06-09T20:00:00Z'), safeTimezone('Asia/Kolkata')), '2026-06-10');
    assert.equal(localDateOf(new Date('2026-06-09T20:00:00Z'), safeTimezone(null)), '2026-06-09');
  });

  it('keeps the roles a person held at the time, whatever they hold later', async () => {
    const { rebuildDay } = await import('../src/modules/analytics/rollupService.js');
    const role = await prisma.role.findUnique({ where: { key: 'FACULTY' } });
    await prisma.userRole.create({ data: { userId: stranger.id, roleId: role.id } });
    await rebuildDay({ tenantId: other.id, timezone: TZ, date: '2026-06-09', final: true });
    const day = await prisma.analyticsUserDaily.findFirst({ where: { tenantId: other.id, localDate: new Date('2026-06-09T00:00:00Z') } });
    assert.deepEqual(day.rolesHeld, ['STUDENT']);
    assert.equal(await prisma.analyticsRollup.count({ where: { tenantId: other.id, localDate: new Date('2026-06-09T00:00:00Z'), role: 'FACULTY' } }), 0);
  });

  it('deletes raw rows past retention only once their day is final, and always after a further week', async () => {
    const { purgeTenant } = await import('../src/modules/analytics/rollupService.js');
    const now = new Date('2026-09-20T12:00:00Z'); // 90 days back is 22 June; the hard limit is 15 June
    await insertView('2026-06-20T15:00:00Z'); // past retention, its day never finalised: kept for now
    await insertView('2026-06-01T15:00:00Z'); // past the hard limit: deleted regardless
    await insertView('2026-09-01T15:00:00Z'); // inside retention: kept
    const removed = await purgeTenant({ tenantId: other.id, timezone: TZ }, { now });
    // Finalised June and March days, plus the one beyond the hard limit.
    assert.equal(removed.pageViews, 6);
    const left = (await prisma.analyticsPageView.findMany({ where: { tenantId: other.id }, select: { startedAt: true } })).map((row) => row.startedAt.toISOString().slice(0, 10)).sort();
    assert.deepEqual(left, ['2026-06-20', '2026-09-01']);
    // Aggregates and the other institution's rows are untouched.
    assert.ok(await prisma.analyticsRollup.count({ where: { tenantId: other.id } }) > 0);
    assert.ok(await prisma.analyticsPageView.count({ where: { tenantId: tenant.id } }) > 0);
  });
});
