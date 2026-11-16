import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.ANALYTICS_ENABLED = 'true';

import { api, closeTestServer, login } from './helpers/testEnv.js';
import { MULTI_ROLE_PASSWORD, createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';
import { classifyBrowser, classifyOs } from '../../shared/analyticsAgent.js';

/**
 * Admin Analytics, second part: browser and operating-system categories, successful sign-ins, live concurrent users
 * (heartbeat, one person per row, sign-out, expiry, tenant isolation), the concurrency history, accounts that have
 * not signed in recently, and the isolated demo dataset (2 real + 150 demo = 152).
 */

const OTHER_TENANT = 'ld-test-analytics';
const uuid = () => crypto.randomUUID();
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;

let prisma;
let tenant;
let other;
let adminToken;
const people = {};

const envelope = (events, overrides = {}) => ({ schemaVersion: 1, sentAt: iso(), visitId: uuid(), visitStartedAt: iso(-60_000), deviceClass: 'DESKTOP', events, ...overrides });
const send = (token, body) => api('/analytics/events', { method: 'POST', token, body });
const pageView = (pageKey) => ({ name: 'page.view', eventId: uuid(), at: iso(-30_000), pageViewId: uuid(), pageKey });
const beat = (token, body = {}) => api('/analytics/presence', { method: 'POST', token, body });
const live = async () => (await api('/admin/analytics/live', { token: adminToken })).body.data;
const refresh = () => api('/admin/analytics/refresh', { method: 'POST', token: adminToken });
const clearAnalytics = async () => {
  for (const table of ['analyticsEvent', 'analyticsPageView', 'analyticsVisit', 'analyticsUserDaily', 'analyticsRollup', 'analyticsRollupRun', 'analyticsPresence', 'analyticsConcurrency']) await prisma[table].deleteMany({});
};

before(async () => {
  ({ prisma } = await import('../src/db/prisma.js'));
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  await clearAnalytics();
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  other = await prisma.tenant.create({ data: { slug: OTHER_TENANT, name: 'Other University (live test)', timezone: 'UTC', analyticsEnabled: true, analyticsStartedAt: new Date('2026-01-01T00:00:00Z') } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: true, analyticsStartedAt: new Date(Date.now() - 2 * DAY), analyticsDemoEnabled: false } });
  for (const key of ['a', 'b', 'c']) people[key] = await createMultiRoleUser({ key: `ld.${key}`, firstName: `Live${key.toUpperCase()}`, roles: ['STUDENT'] });
  people.admin2 = await createMultiRoleUser({ key: 'ld.admin2', firstName: 'NoAccess', roles: ['ADMIN'] });
  for (const person of Object.values(people)) person.token = await loginFixture(person.email);
  adminToken = await login('admin');
  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'admin@edunexus.ai' } });
  people.admin = { user: admin };
  await prisma.userPermission.upsert({ where: { userId_permission: { userId: admin.id, permission: 'analytics.view' } }, create: { tenantId: tenant.id, userId: admin.id, permission: 'analytics.view' }, update: {} });
});

after(async () => {
  await clearAnalytics();
  const { resetDemoDataset } = await import('../src/modules/analytics/demoService.js');
  await resetDemoDataset(tenant.id);
  await prisma.userPermission.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: false, analyticsStartedAt: null, analyticsDemoEnabled: false } });
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  await removeMultiRoleUsers();
  await closeTestServer();
});

describe('browser and operating-system categories', () => {
  const UA = {
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    operaMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0',
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
    firefoxIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
    chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    headlessMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
    chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0',
    firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
    edgeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0',
    edgeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.0.2849.80 Mobile/15E148 Safari/605.1.15',
    edgeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    operaWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0',
    operaAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 OPR/86.0.0.0',
    ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    androidWebView: 'Mozilla/5.0 (Linux; Android 13; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
    vivaldiLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Vivaldi/7.0.3495.15',
    chromebookFirefox: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0; rv:132.0) Gecko/20100101 Firefox/132.0',
  };

  it('detects common browsers, including the Chromium family and iOS browsers', () => {
    assert.equal(classifyBrowser(UA.chromeWin), 'CHROME');
    assert.equal(classifyBrowser(UA.edgeWin), 'EDGE');
    assert.equal(classifyBrowser(UA.operaMac), 'OPERA');
    assert.equal(classifyBrowser(UA.firefoxLinux), 'FIREFOX');
    assert.equal(classifyBrowser(UA.safariMac), 'SAFARI');
    assert.equal(classifyBrowser(UA.safariIphone), 'SAFARI');
    assert.equal(classifyBrowser(UA.chromeIphone), 'CHROME');
    assert.equal(classifyBrowser(UA.firefoxIphone), 'FIREFOX');
    assert.equal(classifyBrowser(UA.chromeAndroid), 'CHROME');
    assert.equal(classifyBrowser(UA.samsung), 'OTHER');
    // Client hints name Edge and Opera even when the string is reduced.
    assert.equal(classifyBrowser(UA.chromeWin, [{ brand: 'Not?A_Brand' }, { brand: 'Microsoft Edge' }]), 'EDGE');
    assert.equal(classifyBrowser('', null), 'UNKNOWN');
    assert.equal(classifyBrowser('curl/8.4'), 'OTHER');
  });

  it('classifies every common browser and system pair (each pair checked on both axes)', () => {
    const MATRIX = [
      ['chromeWin', 'CHROME', 'WINDOWS'], ['chromeLinux', 'CHROME', 'LINUX'], ['chromebook', 'CHROME', 'CHROMEOS'], ['chromeAndroid', 'CHROME', 'ANDROID'],
      ['chromeIphone', 'CHROME', 'IOS'], ['androidWebView', 'CHROME', 'ANDROID'], ['headlessMac', 'CHROME', 'MACOS'],
      ['firefoxWin', 'FIREFOX', 'WINDOWS'], ['firefoxMac', 'FIREFOX', 'MACOS'], ['firefoxLinux', 'FIREFOX', 'LINUX'], ['firefoxAndroid', 'FIREFOX', 'ANDROID'],
      ['firefoxIphone', 'FIREFOX', 'IOS'], ['chromebookFirefox', 'FIREFOX', 'CHROMEOS'],
      ['safariMac', 'SAFARI', 'MACOS'], ['safariIphone', 'SAFARI', 'IOS'], ['ipadSafari', 'SAFARI', 'IOS'],
      ['edgeWin', 'EDGE', 'WINDOWS'], ['edgeMac', 'EDGE', 'MACOS'], ['edgeAndroid', 'EDGE', 'ANDROID'], ['edgeIphone', 'EDGE', 'IOS'],
      ['operaWin', 'OPERA', 'WINDOWS'], ['operaMac', 'OPERA', 'MACOS'], ['operaAndroid', 'OPERA', 'ANDROID'],
      ['samsung', 'OTHER', 'ANDROID'], ['vivaldiLinux', 'OTHER', 'LINUX'],
    ];
    for (const [name, browser, os] of MATRIX) {
      assert.equal(classifyBrowser(UA[name]), browser, `${name} browser`);
      assert.equal(classifyOs(UA[name]), os, `${name} system`);
    }
  });

  it('prefers client hints: brands name the browser, platform names the system', () => {
    const brands = (...names) => [{ brand: 'Not)A;Brand' }, { brand: 'Chromium' }, ...names.map((brand) => ({ brand }))];
    // Automated Chrome on a Mac used to fall through to Safari ("HeadlessChrome/" has no word boundary before "Chrome").
    assert.equal(classifyBrowser(UA.headlessMac, brands('HeadlessChrome')), 'CHROME');
    assert.equal(classifyBrowser(UA.chromeWin, brands('Google Chrome')), 'CHROME');
    assert.equal(classifyBrowser(UA.chromeWin, brands('Microsoft Edge')), 'EDGE');
    assert.equal(classifyBrowser(UA.chromeWin, brands('Opera')), 'OPERA');
    assert.equal(classifyBrowser(UA.chromeWin, brands('Opera GX')), 'OPERA');
    assert.equal(classifyBrowser(UA.chromeWin, brands('Brave')), 'OTHER');
    assert.equal(classifyBrowser('', brands()), 'CHROME');
    // Platform hints (navigator.userAgentData.platform), including Windows 11, which still says "Windows NT 10.0".
    assert.equal(classifyOs(UA.chromeWin, 'Windows'), 'WINDOWS');
    assert.equal(classifyOs(UA.chromebook, 'Chrome OS'), 'CHROMEOS');
    assert.equal(classifyOs(UA.chromeLinux, 'Linux'), 'LINUX');
    assert.equal(classifyOs(UA.chromeAndroid, 'Android'), 'ANDROID');
    assert.equal(classifyOs(UA.chromeWin, ' macOS '), 'MACOS');
    assert.equal(classifyOs(UA.headlessMac, 'macOS', 5), 'IOS');
    // An empty or unhelpful hint falls back to the string.
    assert.equal(classifyOs(UA.firefoxLinux, ''), 'LINUX');
    assert.equal(classifyOs(UA.chromeWin, 'Unknown'), 'WINDOWS');
  });

  it('detects operating systems independently of the browser, including iPadOS presenting as a Mac', () => {
    assert.equal(classifyOs(UA.chromeWin), 'WINDOWS');
    assert.equal(classifyOs(UA.safariMac), 'MACOS');
    assert.equal(classifyOs(UA.safariMac, null, 5), 'IOS');
    assert.equal(classifyOs(UA.safariIphone), 'IOS');
    assert.equal(classifyOs(UA.chromeAndroid), 'ANDROID');
    assert.equal(classifyOs(UA.chromebook), 'CHROMEOS');
    assert.equal(classifyOs(UA.firefoxLinux), 'LINUX');
    assert.equal(classifyOs(UA.chromeWin, 'macOS'), 'MACOS'); // the client hint wins
    assert.equal(classifyOs(''), 'UNKNOWN');
    assert.equal(classifyOs('SomethingElse/1.0'), 'OTHER');
  });
});

describe('browser, system and device distributions', () => {
  before(async () => {
    await send(people.a.token, envelope([pageView('dashboard')], { browser: 'CHROME', os: 'WINDOWS' }));
    await send(people.b.token, envelope([pageView('dashboard')], { browser: 'SAFARI', os: 'IOS', deviceClass: 'MOBILE' }));
    // A visit recorded before browser and system were measured (an older tab): not recorded, shown under Unknown.
    await send(people.c.token, envelope([pageView('dashboard')]));
    assert.equal((await refresh()).status, 200);
  });

  it('stores only the category, and refuses anything else', async () => {
    const visits = await prisma.analyticsVisit.findMany({ where: { tenantId: tenant.id }, select: { browser: true, os: true } });
    assert.deepEqual(visits.map((visit) => `${visit.browser}/${visit.os}`).sort(), ['CHROME/WINDOWS', 'SAFARI/IOS', 'null/null']);
    const raw = await send(people.a.token, envelope([pageView('dashboard')], { browser: 'Mozilla/5.0 (Windows NT 10.0)' }));
    assert.equal(raw.status, 400);
  });

  it('reconciles browser, system and device shares with the same visit total', async () => {
    const { browsers, operatingSystems, devices, kpis } = (await api('/admin/analytics/overview?range=7d', { token: adminToken })).body.data;
    for (const split of [browsers, operatingSystems, devices]) {
      assert.equal(split.total, 3);
      assert.equal(split.rows.reduce((sum, row) => sum + row.visits, 0), 3);
      assert.ok(Math.abs(split.rows.reduce((sum, row) => sum + (row.share ?? 0), 0) - 1) < 1e-9);
    }
    assert.equal(kpis.visits.value, 3);
    assert.equal(browsers.rows.find((row) => row.key === 'CHROME').visits, 1);
    assert.equal(browsers.rows.find((row) => row.key === 'UNKNOWN').visits, 1);
    assert.equal(browsers.notRecorded, 1);
    assert.equal(operatingSystems.notRecorded, 1);
    assert.equal(devices.notRecorded, 0);
    assert.equal(operatingSystems.rows.find((row) => row.key === 'IOS').visits, 1);
    assert.equal(devices.rows.find((row) => row.key === 'MOBILE').visits, 1);
    // A device filter narrows browsers and systems to that device's visits.
    const mobile = (await api('/admin/analytics/overview?range=7d&device=MOBILE', { token: adminToken })).body.data;
    assert.equal(mobile.browsers.total, 1);
    assert.equal(mobile.browsers.rows.find((row) => row.key === 'SAFARI').visits, 1);
  });
});

describe('successful sign-ins', () => {
  it('counts each issued session once; a token refresh and page visits never count', async () => {
    await prisma.analyticsEvent.deleteMany({ where: { name: 'auth.sign_in' } });
    const first = await api('/auth/login', { method: 'POST', body: { email: people.a.email, password: MULTI_ROLE_PASSWORD } });
    await api('/auth/login', { method: 'POST', body: { email: people.b.email, password: MULTI_ROLE_PASSWORD } });
    await api('/auth/login', { method: 'POST', body: { email: people.b.email, password: 'wrong-password' } });
    await api('/auth/refresh', { method: 'POST', body: { refreshToken: first.body.data.refreshToken } });
    await send(people.a.token, envelope([pageView('academics.grades')]));
    // Recorded after the response, without being awaited: wait until both are stored (at most 5 s).
    for (let waited = 0; waited < 5000 && await prisma.analyticsEvent.count({ where: { name: 'auth.sign_in', tenantId: tenant.id } }) < 2; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
    const { kpis } = (await api('/admin/analytics/overview?range=7d', { token: adminToken })).body.data;
    assert.equal(kpis.logins.value, 2);
    assert.equal(kpis.logins.password, 2);
    assert.equal(kpis.logins.sso, 0);
    assert.equal(kpis.logins.users, 2);
  });
});

describe('live concurrent users', () => {
  before(async () => { await prisma.analyticsPresence.deleteMany({}); });

  it('counts a person once however many tabs send heartbeats, and adds a second person promptly', async () => {
    assert.equal((await live()).real, 0);
    for (let tab = 0; tab < 3; tab += 1) assert.equal((await beat(people.a.token)).body.data.enabled, true);
    assert.equal((await live()).real, 1);
    await beat(people.b.token);
    const now = await live();
    assert.equal(now.real, 2);
    assert.equal(now.total, 2);
    assert.equal(now.demo, null);
    await beat(people.c.token);
    assert.equal((await live()).real, 3);
  });

  it('drops a person at sign-out', async () => {
    const token = await loginFixture(people.c.email);
    await beat(token);
    assert.equal((await api('/auth/logout', { method: 'POST', token, body: {} })).status, 200);
    assert.equal((await live()).real, 2);
  });

  it('drops a person who closed the browser once the presence window passes', async () => {
    await prisma.analyticsPresence.updateMany({ where: { userId: people.b.user.id }, data: { lastSeenAt: new Date(Date.now() - 121_000) } });
    assert.equal((await live()).real, 1);
    await beat(people.b.token); // back again
    assert.equal((await live()).real, 2);
  });

  it('takes the person from the token only, and records nothing while collection is off', async () => {
    assert.equal((await beat(people.a.token, { userId: people.b.user.id })).status, 400);
    assert.equal((await beat(null)).status, 401);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: false } });
    try {
      await prisma.analyticsPresence.deleteMany({ where: { userId: people.c.user.id } });
      assert.equal((await beat(people.c.token)).body.data.enabled, false);
      assert.equal(await prisma.analyticsPresence.count({ where: { userId: people.c.user.id } }), 0);
    } finally {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: true } });
    }
  });

  it("never counts another institution's people", async () => {
    const stranger = await prisma.user.create({ data: { tenantId: other.id, email: 'live@other.test', firstName: 'Other', lastName: 'Person' } });
    await prisma.analyticsPresence.create({ data: { tenantId: other.id, userId: stranger.id, firstSeenAt: new Date(), lastSeenAt: new Date() } });
    assert.equal((await live()).real, 2);
  });

  it('samples the live count into the history, which gives the peak and the timeline', async () => {
    const { sampleConcurrency } = await import('../src/modules/analytics/presenceService.js');
    // Both samples in the same 5-minute bucket (a fixed moment, so the test cannot straddle a bucket boundary).
    const now = new Date();
    await sampleConcurrency({ now });
    await beat(people.c.token);
    await sampleConcurrency({ now }); // same bucket: keeps the higher sample
    const rows = await prisma.analyticsConcurrency.findMany({ where: { tenantId: tenant.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].users, 3);
    const { kpis } = (await api('/admin/analytics/overview?range=7d', { token: adminToken })).body.data;
    assert.equal(kpis.peakConcurrent.value, 3);
    const timeline = (await api('/admin/analytics/concurrency?window=24h', { token: adminToken })).body.data;
    assert.equal(timeline.points.at(-1).live, true);
    assert.equal(timeline.points.at(-1).total, 3);
    assert.equal(timeline.peak.total, 3);
    // Unmeasured intervals are gaps, not zeros.
    assert.ok(timeline.points.slice(0, -2).every((point) => point.total === null));
    assert.equal((await api('/admin/analytics/concurrency?window=1y', { token: adminToken })).status, 400);
  });
});

describe('accounts that have not signed in recently', () => {
  const list = async (query = '') => (await api(`/admin/analytics/inactive-users?${query}`, { token: adminToken })).body.data;

  before(async () => {
    const at = (days) => new Date(Date.now() - days * DAY);
    await prisma.user.update({ where: { id: people.a.user.id }, data: { lastLoginAt: at(2) } });
    await prisma.user.update({ where: { id: people.b.user.id }, data: { lastLoginAt: at(10) } });
    await prisma.user.update({ where: { id: people.c.user.id }, data: { lastLoginAt: at(40) } });
    people.never = await createMultiRoleUser({ key: 'ld.never', firstName: 'Neverseen', roles: ['STUDENT'] });
    people.suspended = await createMultiRoleUser({ key: 'ld.suspended', firstName: 'Suspendedperson', roles: ['STUDENT'] });
    await prisma.user.update({ where: { id: people.never.user.id }, data: { lastLoginAt: null } });
    await prisma.user.update({ where: { id: people.suspended.user.id }, data: { lastLoginAt: at(50), status: 'SUSPENDED' } });
  });

  const ours = (rows) => rows.filter((row) => row.email.startsWith('multirole.ld.')).map((row) => row.email.split('@')[0].replace('multirole.ld.', ''));

  it('filters by 5, 15 and 30 days from the real sign-in date, longest first', async () => {
    assert.deepEqual(ours((await list('days=5&role=STUDENT&search=multirole.ld.&pageSize=50')).rows), ['c', 'b']);
    assert.deepEqual(ours((await list('days=15&role=STUDENT&search=multirole.ld.&pageSize=50')).rows), ['c']);
    const thirty = await list('days=30&role=STUDENT&search=multirole.ld.&pageSize=50');
    assert.deepEqual(ours(thirty.rows), ['c']);
    const row = thirty.rows.find((entry) => entry.email.includes('ld.c'));
    assert.equal(row.daysSinceLogin, 40);
    assert.ok(row.name && row.roles.includes('STUDENT') && row.lastLoginAt && row.demo === false);
  });

  it('lists never-signed-in accounts separately, and leaves suspended accounts out unless asked', async () => {
    const never = await list('view=never&search=multirole.ld.&pageSize=50');
    assert.deepEqual(ours(never.rows), ['never']);
    assert.equal(never.rows[0].daysSinceLogin, null);
    assert.ok(!ours((await list('days=30&search=multirole.ld.&pageSize=50')).rows).includes('suspended'));
    assert.ok(ours((await list('days=30&search=multirole.ld.&includeSuspended=true&pageSize=50')).rows).includes('suspended'));
  });

  it('pages and searches, and is only for analytics.view holders', async () => {
    const first = await list('days=5&search=multirole.ld.&pageSize=10&page=1');
    assert.equal(first.total, 2);
    assert.equal(first.pages, 1);
    // Wildcards in a search are matched literally, never as patterns.
    assert.equal((await list('days=5&search=%25')).total, 0);
    assert.equal((await list('search=nobody-matches-this')).total, 0);
    for (const path of ['inactive-users', 'live', 'concurrency']) assert.equal((await api(`/admin/analytics/${path}`, { token: people.admin2.token })).status, 403, path);
    assert.equal((await api('/admin/analytics/inactive-users', { token: people.a.token })).status, 403);
    assert.equal((await api('/admin/analytics/inactive-users?days=7', { token: adminToken })).status, 400);
  });
});

describe('demo data', () => {
  let usersBefore;
  before(async () => {
    await prisma.analyticsPresence.deleteMany({});
    await beat(people.a.token);
    await beat(people.b.token);
    usersBefore = await prisma.user.count();
  });

  it('is off by default, and only an analytics.view holder can switch it', async () => {
    assert.equal((await live()).demoIncluded, false);
    assert.equal((await api('/admin/analytics/demo', { method: 'PUT', token: people.admin2.token, body: { enabled: true } })).status, 403);
    assert.equal((await api('/admin/analytics/demo', { method: 'PUT', token: adminToken, body: { enabled: 'yes' } })).status, 400);
  });

  it('2 real people online + 150 simulated = 152, with the breakdown', async () => {
    assert.equal((await live()).total, 2);
    const on = await api('/admin/analytics/demo', { method: 'PUT', token: adminToken, body: { enabled: true } });
    assert.equal(on.status, 200);
    assert.equal(on.body.data.generated.online, 150);
    const now = await live();
    assert.deepEqual({ real: now.real, demo: now.demo, total: now.total, demoIncluded: now.demoIncluded }, { real: 2, demo: 150, total: 152, demoIncluded: true });
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'ANALYTICS_DEMO_ENABLED' } }));
  });

  it('never creates a portal account or touches anything outside Analytics', async () => {
    assert.equal(await prisma.user.count(), usersBefore);
    assert.equal(await prisma.user.count({ where: { email: { endsWith: '@example.invalid' } } }), 0);
    assert.equal(await prisma.analyticsDemoPerson.count({ where: { NOT: { email: { endsWith: '@example.invalid' } } } }), 0);
    assert.equal(await prisma.analyticsDemoPerson.count({ where: { NOT: { id: { startsWith: 'demo-' } } } }), 0);
    // Real analytics tables hold only real people.
    assert.equal(await prisma.analyticsVisit.count({ where: { userId: { startsWith: 'demo-' } } }), 0);
    // Integration status is real: demo data never changes it.
    const before = await prisma.integration.findMany({ where: { tenantId: tenant.id }, select: { id: true, status: true }, orderBy: { id: 'asc' } });
    const report = (await api('/admin/analytics/integrations?range=7d', { token: adminToken })).body.data;
    assert.deepEqual(report.integrations.map((row) => ({ id: row.id, status: row.status })).sort((x, y) => x.id.localeCompare(y.id)), before);
    assert.equal(report.meta.demo.included, true);
    assert.ok(report.usage.signIns.total > 0);
  });

  it('fills every usage report, marked as including demo data', async () => {
    const overview = (await api('/admin/analytics/overview?range=30d', { token: adminToken })).body.data;
    assert.equal(overview.meta.demo.included, true);
    assert.ok(overview.kpis.logins.value > 1000);
    assert.ok(overview.kpis.peakConcurrent.value >= 150);
    assert.ok(overview.browsers.rows.filter((row) => row.visits > 0).length >= 5);
    assert.ok(overview.operatingSystems.rows.filter((row) => row.visits > 0).length >= 5);
    assert.equal(overview.browsers.total, overview.devices.total);
    for (const section of ['activity', 'pages', 'navigation', 'features', 'widgets', 'devices', 'communication']) {
      const { status, body } = await api(`/admin/analytics/${section}?range=30d`, { token: adminToken });
      assert.equal(status, 200, section);
      assert.equal(body.data.meta.demo.included, true, section);
    }
    const communication = (await api('/admin/analytics/communication?range=30d', { token: adminToken })).body.data;
    assert.ok(communication.totals.sent > 1000);
    const timeline = (await api('/admin/analytics/concurrency?window=7d', { token: adminToken })).body.data;
    assert.ok(timeline.points.filter((point) => point.total !== null).length > 100);
    assert.equal(timeline.points.at(-1).total, 152);
    // Data health reports the real pipeline only.
    const health = (await api('/admin/analytics/health', { token: adminToken })).body.data;
    assert.equal(health.demo.enabled, true);
    assert.equal(health.demo.dataset.online, 150);
  });

  it('lists synthetic inactive people, each flagged as demo', async () => {
    const inactive = (await api('/admin/analytics/inactive-users?days=15&pageSize=50', { token: adminToken })).body.data;
    assert.ok(inactive.demoAccounts > 0);
    const demoRows = inactive.rows.filter((row) => row.demo);
    assert.ok(demoRows.length > 0);
    assert.ok(demoRows.every((row) => row.email.endsWith('@example.invalid') && row.id.startsWith('demo-') && row.daysSinceLogin >= 15));
    assert.ok((await api('/admin/analytics/inactive-users?view=never&pageSize=50', { token: adminToken })).body.data.rows.some((row) => row.demo));
  });

  it('switching off returns at once to real figures; switching on again creates nothing new', async () => {
    const counts = async () => ({ people: await prisma.analyticsDemoPerson.count(), visits: await prisma.analyticsDemoVisit.count(), rollups: await prisma.analyticsDemoRollup.count() });
    const stored = await counts();
    assert.equal((await api('/admin/analytics/demo', { method: 'PUT', token: adminToken, body: { enabled: false } })).status, 200);
    const now = await live();
    assert.deepEqual({ real: now.real, demo: now.demo, total: now.total }, { real: 2, demo: null, total: 2 });
    const overview = (await api('/admin/analytics/overview?range=30d', { token: adminToken })).body.data;
    assert.equal(overview.meta.demo.included, false);
    assert.ok(overview.kpis.logins.value < 10);
    assert.ok(!(await api('/admin/analytics/inactive-users?days=5&pageSize=50', { token: adminToken })).body.data.rows.some((row) => row.demo));
    // Real analytics are untouched by switching off.
    assert.ok(await prisma.analyticsVisit.count({ where: { tenantId: tenant.id } }) >= 3);
    for (let round = 0; round < 2; round += 1) {
      const on = await api('/admin/analytics/demo', { method: 'PUT', token: adminToken, body: { enabled: true } });
      assert.equal(on.body.data.generated, null); // already there: nothing generated
      await api('/admin/analytics/demo', { method: 'PUT', token: adminToken, body: { enabled: false } });
    }
    assert.deepEqual(await counts(), stored);
  });
});
