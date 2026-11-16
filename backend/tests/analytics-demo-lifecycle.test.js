import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

process.env.ANALYTICS_ENABLED = 'true';

import { api, closeTestServer, login } from './helpers/testEnv.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';

/**
 * The demo data lifecycle, end to end, through the real command (scripts/analytics-demo.mjs, run against the test
 * database) and the Data health switch:
 *
 *   generate → the dataset exists, demo data is ON, every section shows real + demo, live = real + 150;
 *   generate again → rebuilt, never duplicated;
 *   switch off / on → real only / combined, the dataset is kept;
 *   reset → every demo row of the institution is gone, demo data is OFF, every section is exactly what it was
 *           before generation.
 *
 * Throughout: real analytics rows and portal accounts are byte-for-byte unchanged (fingerprints), and another
 * institution's real and demo rows are untouched.
 */

const exec = promisify(execFile);
const BACKEND = fileURLToPath(new URL('..', import.meta.url));
const OTHER_TENANT = 'lc-test-analytics';
const SECTIONS = ['overview', 'activity', 'pages', 'navigation', 'features', 'widgets', 'devices', 'communication', 'integrations', 'health'];
const DEMO_TABLES = ['datasets', 'people', 'visits', 'page_views', 'events', 'user_daily', 'rollups', 'concurrency', 'notifications'];
const uuid = () => crypto.randomUUID();
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

let prisma;
let tenant;
let other;
let adminToken;
const people = {};

/** Run the demo command against the test database (NODE_ENV=test selects TEST_DATABASE_URL). */
const cli = async (...args) => {
  const { stdout } = await exec(process.execPath, ['scripts/analytics-demo.mjs', ...args], { cwd: BACKEND, env: { ...process.env, NODE_ENV: 'test' }, timeout: 180_000 });
  return stdout;
};
const get = async (path) => {
  const { status, body } = await api(`/admin/analytics/${path}`, { token: adminToken });
  assert.equal(status, 200, path);
  return body.data;
};
const live = () => get('live');
const send = (token, events, extra = {}) => api('/analytics/events', {
  method: 'POST', token, body: { schemaVersion: 1, sentAt: iso(), visitId: uuid(), visitStartedAt: iso(-120_000), deviceClass: 'DESKTOP', events, ...extra },
});
const pageView = (pageKey) => ({ name: 'page.view', eventId: uuid(), at: iso(-60_000), pageViewId: uuid(), pageKey });

/** Rows per demo table for one institution. */
async function demoCounts(tenantId) {
  const { demoRecordCounts } = await import('../src/modules/analytics/demoService.js');
  return demoRecordCounts(tenantId);
}

/**
 * A fingerprint of every real analytics row and every portal account of one institution: if any row is added,
 * removed or changed, the fingerprint changes.
 */
async function realFingerprint(tenantId) {
  const tables = {
    analytics_visits: '"id"', analytics_page_views: '"id"', analytics_events: '"id"', analytics_user_daily: '"localDate", "userId"',
    analytics_rollups: '"localDate", "fact", "subjectKey", "role", "device"', analytics_concurrency: '"bucketStart"', analytics_presence: '"userId"', users: '"id"',
  };
  const result = {};
  for (const [table, order] of Object.entries(tables)) {
    const [row] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n, md5(COALESCE(string_agg(t::text, '|' ORDER BY ${order}), '')) AS hash FROM "${table}" t WHERE "tenantId" = $1`, tenantId);
    result[table] = `${row.n}:${row.hash}`;
  }
  return result;
}

/** Every Analytics section as the API returns it, without the parts that legitimately differ between calls. */
async function sections() {
  const out = {};
  for (const section of SECTIONS) {
    const data = await get(`${section}?range=30d`);
    const { meta, ...rest } = data;
    if (section === 'health') {
      // Data health reports the real pipeline: compare what it says about data, not when it last looked.
      out.health = { collection: rest.collection, coverage: rest.coverage, failedRuns: rest.failedRuns, demoEnabled: rest.demo.enabled, demoDataset: Boolean(rest.demo.dataset) };
    } else out[section] = rest;
    out[`${section}.sources`] = meta.sources;
    out[`${section}.demo`] = meta.demo.included;
  }
  out.inactive = {};
  for (const view of ['days=5', 'days=15', 'days=30', 'view=never']) {
    const data = await get(`inactive-users?${view}&role=STUDENT&pageSize=50`);
    out.inactive[view] = { total: data.total, demo: data.rows.filter((row) => row.demo).length, ids: data.rows.map((row) => row.id) };
  }
  return out;
}
const withoutDemoFlags = (snapshot) => Object.fromEntries(Object.entries(snapshot).filter(([key]) => !key.endsWith('.demo') && !key.endsWith('.sources')));

let realOnly;
let realSources;
let realFingerprintBefore;
let otherBefore;
let otherDemoBefore;
let firstCounts;

before(async () => {
  ({ prisma } = await import('../src/db/prisma.js'));
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  const { resetDemoDataset } = await import('../src/modules/analytics/demoService.js');
  await resetDemoDataset(tenant.id);
  for (const table of ['analyticsEvent', 'analyticsPageView', 'analyticsVisit', 'analyticsUserDaily', 'analyticsRollup', 'analyticsRollupRun', 'analyticsPresence', 'analyticsConcurrency']) await prisma[table].deleteMany({});
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: true, analyticsStartedAt: new Date(Date.now() - 86_400_000), analyticsDemoEnabled: false } });

  // Another institution with its own real and demo analytics rows: nothing here may touch them.
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  other = await prisma.tenant.create({ data: { slug: OTHER_TENANT, name: 'Other University (lifecycle test)', timezone: 'UTC', analyticsEnabled: true, analyticsStartedAt: new Date('2026-01-01T00:00:00Z'), analyticsDemoEnabled: true } });
  await prisma.$executeRaw`INSERT INTO "analytics_concurrency" ("tenantId", "bucketStart", "users") VALUES (${other.id}, now() - interval '1 hour', 7)`;
  await prisma.$executeRaw`INSERT INTO "analytics_demo_datasets" ("tenantId", "seed", "generatedAt", "coversFrom", "coversTo", "people", "online") VALUES (${other.id}, 1, now(), current_date - 1, current_date, 1, 1)`;
  await prisma.$executeRaw`INSERT INTO "analytics_demo_people" ("id", "tenantId", "firstName", "lastName", "email", "institutionId", "rolesHeld", "status", "online", "deviceClass", "browser", "os", "lastLoginAt", "createdAt")
    VALUES ('demo-other-1', ${other.id}, 'Other', 'Person', 'other.person@example.invalid', 'DEMO-O-1', ARRAY['STUDENT']::"RoleKey"[], 'ACTIVE', true, 'DESKTOP', 'CHROME', 'WINDOWS', now(), now())`;
  await prisma.$executeRaw`INSERT INTO "analytics_demo_concurrency" ("tenantId", "bucketStart", "users") VALUES (${other.id}, now() - interval '1 hour', 1)`;

  // Real activity: two students sign in (two successful logins), visit pages from different browsers and systems,
  // and are online now.
  for (const key of ['a', 'b']) people[key] = await createMultiRoleUser({ key: `lc.${key}`, firstName: `Cycle${key.toUpperCase()}`, roles: ['STUDENT'] });
  adminToken = await login('admin');
  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'admin@edunexus.ai' } });
  await prisma.userPermission.upsert({ where: { userId_permission: { userId: admin.id, permission: 'analytics.view' } }, create: { tenantId: tenant.id, userId: admin.id, permission: 'analytics.view' }, update: {} });
  for (const person of Object.values(people)) person.token = await loginFixture(person.email);
  assert.equal((await send(people.a.token, [pageView('dashboard'), pageView('courses')], { browser: 'FIREFOX', os: 'LINUX' })).status, 202);
  assert.equal((await send(people.b.token, [pageView('dashboard')], { browser: 'SAFARI', os: 'IOS', deviceClass: 'MOBILE' })).status, 202);
  for (const person of Object.values(people)) assert.equal((await api('/analytics/presence', { method: 'POST', token: person.token, body: {} })).status, 200);
  // Sign-in events are written just after the session is issued: wait for both.
  for (let tries = 0; tries < 50 && (await prisma.analyticsEvent.count({ where: { tenantId: tenant.id, name: 'auth.sign_in', userId: { in: [people.a.user.id, people.b.user.id] } } })) < 2; tries += 1) await new Promise((done) => setTimeout(done, 100));
  assert.equal((await api('/admin/analytics/refresh', { method: 'POST', token: adminToken })).status, 200);

  realFingerprintBefore = await realFingerprint(tenant.id);
  otherBefore = await realFingerprint(other.id);
  otherDemoBefore = await demoCounts(other.id);
});

after(async () => {
  const { resetDemoDataset } = await import('../src/modules/analytics/demoService.js');
  await resetDemoDataset(tenant.id);
  for (const table of ['analyticsEvent', 'analyticsPageView', 'analyticsVisit', 'analyticsUserDaily', 'analyticsRollup', 'analyticsRollupRun', 'analyticsPresence', 'analyticsConcurrency']) await prisma[table].deleteMany({});
  await prisma.userPermission.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: false, analyticsStartedAt: null, analyticsDemoEnabled: false } });
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  await removeMultiRoleUsers();
  await closeTestServer();
});

const assertRealUntouched = async () => {
  assert.deepEqual(await realFingerprint(tenant.id), realFingerprintBefore, 'real analytics rows and accounts unchanged');
  assert.deepEqual(await realFingerprint(other.id), otherBefore, "the other institution's real rows unchanged");
  assert.deepEqual(await demoCounts(other.id), otherDemoBefore, "the other institution's demo rows unchanged");
};

describe('demo data lifecycle', () => {
  it('starts with real data only: demo OFF, no demo rows, real figures from the real tables', async (t) => {
    const status = await live();
    assert.equal(status.demoIncluded, false);
    assert.equal(status.real, 2);
    assert.equal(status.total, 2);
    assert.match(status.demoState, /^off:none$/);
    assert.ok(Object.values(await demoCounts(tenant.id)).every((count) => count === 0));
    realOnly = await sections();
    realSources = realOnly['overview.sources'];
    assert.deepEqual(realSources.real, { visits: 2, people: 2, logins: realSources.real.logins });
    assert.ok(realSources.real.logins >= 2);
    assert.deepEqual(realSources.demo, { visits: 0, people: 0, logins: 0 });
    assert.deepEqual(realSources.displayed, realSources.real);
    // Real browsers and systems are classified (never all Unknown), and nothing is demo.
    assert.equal(realOnly.overview.browsers.rows.find((row) => row.key === 'FIREFOX').visits, 1);
    assert.equal(realOnly.overview.operatingSystems.rows.find((row) => row.key === 'IOS').visits, 1);
    assert.equal(realOnly.overview.browsers.notRecorded, 0);
    for (const view of Object.values(realOnly.inactive)) assert.equal(view.demo, 0);
    t.diagnostic(`REAL only · concurrent ${status.real} · visits ${realSources.real.visits} · logins ${realSources.real.logins}`);
  });

  it('generate (command): builds the dataset, switches demo ON, and every section shows real + demo', async (t) => {
    const output = await cli('generate', '--tenant', 'demo-university', '--apply');
    assert.match(output, /Demo generation: successful/);
    assert.match(output, /Demo data included in reports: ON/);
    const counts = await demoCounts(tenant.id);
    for (const table of DEMO_TABLES) assert.ok(counts[table] > 0, `demo ${table} populated`);
    assert.equal(counts.datasets, 1);
    assert.equal(counts.people, 520);
    firstCounts = counts;
    assert.equal((await prisma.tenant.findUnique({ where: { id: tenant.id } })).analyticsDemoEnabled, true);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'ANALYTICS_DEMO_ENABLED', summary: { contains: 'command line' } } }));

    // Concurrent users = real + 150.
    const status = await live();
    assert.deepEqual({ real: status.real, demo: status.demo, total: status.total }, { real: 2, demo: 150, total: 152 });
    assert.match(status.demoState, /^on:\d{4}-/);

    const combined = await sections();
    for (const section of SECTIONS) {
      assert.equal(combined[`${section}.demo`], true, `${section} says it includes demo data`);
      const sources = combined[`${section}.sources`];
      // The real part is exactly what it was; demo adds; shown = real + demo.
      assert.deepEqual(sources.real, realSources.real, `${section} real part unchanged`);
      for (const key of ['visits', 'people', 'logins']) {
        assert.ok(sources.demo[key] > 0, `${section} demo ${key}`);
        assert.equal(sources.displayed[key], sources.real[key] + sources.demo[key], `${section} ${key} = real + demo`);
      }
    }
    // Every section is populated by demo data.
    const { overview, activity, pages, navigation, features, widgets, devices, communication, integrations, health } = combined;
    assert.equal(overview.kpis.logins.value, combined['overview.sources'].displayed.logins);
    assert.equal(overview.kpis.visits.value, combined['overview.sources'].displayed.visits);
    assert.ok(overview.kpis.peakConcurrent.value >= 150);
    assert.ok(overview.browsers.rows.filter((row) => row.visits > 0).length >= 6, 'browsers');
    assert.ok(overview.operatingSystems.rows.filter((row) => row.visits > 0).length >= 6, 'systems');
    assert.equal(overview.devices.rows.filter((row) => row.visits > 0).length, 3, 'devices');
    for (const split of [overview.browsers, overview.operatingSystems, overview.devices]) assert.equal(split.rows.reduce((sum, row) => sum + row.visits, 0), split.total);
    assert.ok(overview.topPages.length >= 5 && overview.topFeatures.length >= 5);
    assert.ok(activity.series.some((day) => day.users > 100) && activity.roles.length >= 4 && activity.heatmap.length > 0);
    assert.ok(pages.pages.filter((row) => row.views > 0).length >= 10);
    assert.ok(navigation.totalClicks > 0);
    assert.ok(features.features.filter((row) => row.uses > 0).length >= 5);
    assert.ok(widgets.widgets.some((row) => row.impressions > 0));
    assert.ok(devices.browsers.rows.filter((row) => row.visits > 0).length >= 6 && devices.durations);
    assert.ok(communication.totals.sent > 1000 && communication.totals.read > 0);
    assert.ok(integrations.usage.signIns.total > 1000);
    assert.deepEqual(integrations.integrations.map((row) => row.status), realOnly.integrations.integrations.map((row) => row.status), 'integration status stays real');
    assert.deepEqual({ collection: health.collection, failedRuns: health.failedRuns }, { collection: realOnly.health.collection, failedRuns: realOnly.health.failedRuns }, 'data health stays real');
    // Synthetic inactive people at 5+, 15+, 30+ days and never signed in, all marked demo.
    for (const [view, result] of Object.entries(combined.inactive)) assert.ok(result.demo > 0, `inactive ${view} has demo people`);
    const demoRows = (await get('inactive-users?days=30&pageSize=50')).rows.filter((row) => row.demo);
    assert.ok(demoRows.every((row) => row.email.endsWith('@example.invalid') && row.id.startsWith('demo-') && row.institutionId.startsWith('DEMO-') && row.daysSinceLogin >= 30));

    await assertRealUntouched();
    const shown = combined['overview.sources'];
    t.diagnostic(`GENERATE · concurrent ${status.real} + ${status.demo} = ${status.total} · visits ${shown.real.visits} + ${shown.demo.visits} = ${shown.displayed.visits} · logins ${shown.real.logins} + ${shown.demo.logins} = ${shown.displayed.logins}`);
  });

  it('generate again: rebuilt in place, never duplicated', async () => {
    await cli('generate', '--tenant', 'demo-university', '--apply');
    const counts = await demoCounts(tenant.id);
    assert.equal(counts.datasets, 1);
    assert.equal(counts.people, 520);
    for (const table of DEMO_TABLES) assert.ok(counts[table] < firstCounts[table] * 1.1, `${table}: ${counts[table]} vs ${firstCounts[table]} (not doubled)`);
    assert.equal((await live()).demo, 150);
    await assertRealUntouched();
  });

  it('date filters add real and demo for the chosen range only', async () => {
    const week = (await get('overview?range=7d')).meta.sources;
    const month = (await get('overview?range=30d')).meta.sources;
    assert.ok(week.demo.visits < month.demo.visits);
    for (const sources of [week, month]) assert.equal(sources.displayed.visits, sources.real.visits + sources.demo.visits);
    // A period before real collection began: demo only.
    const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() - 50 * 86_400_000).toISOString().slice(0, 10);
    const old = (await get(`overview?from=${from}&to=${to}`)).meta.sources;
    assert.deepEqual(old.real, { visits: 0, people: 0, logins: 0 });
    assert.ok(old.demo.visits > 0);
  });

  it('switch off (Data health): real only at once, demo rows kept; switch on: combined again, nothing generated', async () => {
    const stored = await demoCounts(tenant.id);
    assert.equal((await api('/admin/analytics/demo', { method: 'PUT', token: adminToken, body: { enabled: false } })).status, 200);
    const status = await live();
    assert.deepEqual({ total: status.total, demoIncluded: status.demoIncluded }, { total: 2, demoIncluded: false });
    const off = await sections();
    // Data health says the dataset is still there (kept while off); everything else is exactly the real-only figures.
    assert.equal(off.health.demoDataset, true);
    assert.deepEqual(withoutDemoFlags({ ...off, health: { ...off.health, demoDataset: false } }), withoutDemoFlags(realOnly), 'every section is real-only again');
    assert.deepEqual(await demoCounts(tenant.id), stored, 'demo rows kept while off');
    const on = await api('/admin/analytics/demo', { method: 'PUT', token: adminToken, body: { enabled: true } });
    assert.equal(on.body.data.generated, null);
    assert.equal((await live()).total, 152);
    assert.deepEqual(await demoCounts(tenant.id), stored);
    await assertRealUntouched();
  });

  it('reset (command): every demo row deleted, demo OFF, every section exactly as before generation', async (t) => {
    const output = await cli('reset', '--tenant', 'demo-university', '--apply');
    assert.match(output, /Demo records remaining: 0/);
    assert.match(output, /Demo data included in reports: OFF/);
    assert.ok(Object.values(await demoCounts(tenant.id)).every((count) => count === 0), 'no demo row left');
    assert.equal((await prisma.tenant.findUnique({ where: { id: tenant.id } })).analyticsDemoEnabled, false);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'ANALYTICS_DEMO_RESET' } }));
    const status = await live();
    assert.deepEqual({ real: status.real, demo: status.demo, total: status.total, demoState: status.demoState }, { real: 2, demo: null, total: 2, demoState: 'off:none' });
    const after = await sections();
    assert.deepEqual(withoutDemoFlags(after), withoutDemoFlags(realOnly), 'every section is exactly the real-only figures');
    for (const section of SECTIONS) assert.deepEqual(after[`${section}.sources`], realSources, `${section} sources real only`);
    await assertRealUntouched();
    t.diagnostic(`RESET · concurrent ${status.real} + 0 = ${status.total} · visits ${realSources.real.visits} + 0 · logins ${realSources.real.logins} + 0 · demo rows 0`);
  });

  it('reset again removes nothing and fails nothing; the sampler never writes demo samples without a dataset or while off', async () => {
    assert.match(await cli('reset', '--tenant', 'demo-university', '--apply'), /Demo records remaining: 0/);
    const { sampleConcurrency } = await import('../src/modules/analytics/presenceService.js');
    await sampleConcurrency();
    // Switched on without a dataset (e.g. set directly): still no demo sample.
    await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsDemoEnabled: true } });
    await sampleConcurrency();
    await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsDemoEnabled: false } });
    assert.equal((await demoCounts(tenant.id)).concurrency, 0);
    assert.deepEqual(await demoCounts(other.id), { ...otherDemoBefore, concurrency: (await demoCounts(other.id)).concurrency });
  });
});
