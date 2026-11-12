/**
 * LOCAL DEVELOPMENT ONLY: fills one institution with SYNTHETIC usage so the Analytics screens can be looked at
 * and tested by hand. It refuses to run unless the database is on this machine and NODE_ENV is not production.
 * Nothing here is ever shown as real data: use it on the test database (or a throwaway copy), never on a
 * database whose figures anyone will read.
 *
 *   DATABASE_URL=<local test db> node scripts/analytics-dev-seed.mjs seed  --tenant demo-university [--days 35] [--people 60]
 *   DATABASE_URL=<local test db> node scripts/analytics-dev-seed.mjs clear --tenant demo-university
 *
 * seed : creates `--people` fixture accounts (emails `multirole.an.demo.*`, removed by `clear` and by the test
 *        reset), generates their visits, page views and events for the last `--days` days, and aggregates them.
 * clear: deletes ALL analytics rows of that institution, the fixture accounts, and switches its collection off.
 */
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { prisma } from '../src/db/prisma.js';
import { FEATURES, PAGES, WIDGETS, pageByKey, resolveContextRole } from '../../shared/analyticsCatalog.js';
import { addDays, localDateOf, rebuildDay } from '../src/modules/analytics/rollupService.js';

const { positionals, values } = parseArgs({ allowPositionals: true, options: { tenant: { type: 'string' }, days: { type: 'string', default: '35' }, people: { type: 'string', default: '60' } } });
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error('analytics-dev-seed only runs against a local database outside production.');
  process.exit(1);
}
const PREFIX = 'multirole.an.demo.';
const TABLES = ['analyticsEvent', 'analyticsPageView', 'analyticsVisit', 'analyticsUserDaily', 'analyticsRollup', 'analyticsRollupRun'];

// Deterministic pseudo-random numbers, so two runs draw the same picture.
let state = 20261111;
const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
const pick = (list) => list[Math.floor(random() * list.length)];
const uuid = () => crypto.randomUUID();

async function clear(tenant) {
  for (const table of TABLES) await prisma[table].deleteMany({ where: { tenantId: tenant.id } });
  await prisma.userPermission.deleteMany({ where: { tenantId: tenant.id, user: { email: { startsWith: PREFIX } } } });
  const { count } = await prisma.user.deleteMany({ where: { tenantId: tenant.id, email: { startsWith: PREFIX } } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: false, analyticsStartedAt: null } });
  console.log(`Cleared analytics for ${tenant.slug} and removed ${count} fixture account(s).`);
}

async function seed(tenant) {
  const days = Number(values.days);
  const people = Number(values.people);
  await clear(tenant);
  const roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.key, role.id]));
  const mix = [['STUDENT'], ['STUDENT'], ['STUDENT'], ['STUDENT'], ['STUDENT'], ['STUDENT'], ['FACULTY'], ['FACULTY'], ['STAFF'], ['ALUMNI'], ['STUDENT', 'FACULTY'], ['ADMIN']];
  const accounts = [];
  for (let index = 0; index < people; index += 1) {
    const held = mix[index % mix.length];
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `${PREFIX}${index}@feddrick.edu`, firstName: 'Synthetic', lastName: `Person ${index}`, userRoles: { create: held.map((key) => ({ roleId: roles[key] })) } } });
    // How keen this person is, and which device they favour.
    accounts.push({ id: user.id, roles: held, keen: 0.15 + random() * 0.75, device: random() < 0.38 ? 'MOBILE' : random() < 0.12 ? 'TABLET' : 'DESKTOP' });
  }
  const now = new Date();
  const today = localDateOf(now, tenant.timezone);
  const start = new Date(now.getTime() - days * 86_400_000);
  await prisma.tenant.update({ where: { id: tenant.id }, data: { analyticsEnabled: true, analyticsStartedAt: start } });
  const browserFeatures = FEATURES.filter((feature) => feature.origin === 'BROWSER' && !['language.changed', 'pwa.install_prompted'].includes(feature.key));
  const serverFeatures = FEATURES.filter((feature) => feature.origin === 'SERVER' && feature.key !== 'calendar.connected');
  const visits = [];
  const views = [];
  const events = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dayStart = new Date(now.getTime() - offset * 86_400_000);
    const weekday = dayStart.getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    for (const person of accounts) {
      if (random() > person.keen * (weekend ? 0.35 : 1) * (0.7 + (0.3 * (days - offset)) / days)) continue;
      for (let v = 0; v < (random() < 0.3 ? 2 : 1); v += 1) {
        // Mid-morning and early-evening peaks (UTC hours 14–16 and 23–01 are 9–11 am and 6–8 pm in New York).
        const hour = random() < 0.55 ? 14 + Math.floor(random() * 4) : random() < 0.6 ? 23 + Math.floor(random() * 3) : 12 + Math.floor(random() * 14);
        const startedAt = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), 0, Math.floor(random() * 60)) + hour * 3_600_000);
        if (startedAt > now) continue;
        const device = random() < 0.85 ? person.device : pick(['DESKTOP', 'MOBILE']);
        const visitId = uuid();
        const base = { tenantId: tenant.id, userId: person.id, rolesHeld: person.roles };
        let cursor = startedAt.getTime();
        const openable = PAGES.filter((page) => !page.key.startsWith('studio.') && resolveContextRole(page.key, { rolesHeld: person.roles }));
        const count = 2 + Math.floor(random() * 6);
        let entry = null;
        for (let p = 0; p < count; p += 1) {
          // The dashboard and a handful of pages dominate, as on a real portal.
          const page = p === 0 || random() < 0.2 ? pageByKey('dashboard') : random() < 0.6 ? openable[Math.floor(random() * Math.min(12, openable.length))] : pick(openable);
          const visibleMs = random() < 0.08 ? 400 : Math.floor(8_000 + random() * 150_000);
          const id = uuid();
          entry ??= page.key;
          views.push({ id, ...base, visitId, pageKey: page.key, contextRole: resolveContextRole(page.key, { rolesHeld: person.roles, view: person.roles.length > 1 ? pick(['student', 'faculty', 'overview']) : null }), deviceClass: device, startedAt: new Date(cursor), lastSeenAt: new Date(cursor + visibleMs + 5_000), visibleMs });
          const event = (name, extra, at = cursor + 2_000) => events.push({ id: uuid(), ...base, visitId, pageViewId: id, name, pageKey: page.key, deviceClass: device, occurredAt: new Date(at), ...extra });
          if (p > 0 && random() < 0.75) event('nav.click', { subjectKey: page.key, source: random() < 0.72 ? 'SIDEBAR' : pick(['BREADCRUMB', 'SEARCH', 'HEADER_MENU', 'SIDEBAR_FLYOUT']), pageViewId: null });
          if (page.key === 'dashboard') {
            const role = person.roles.includes('ADMIN') ? 'ADMIN' : person.roles[0];
            WIDGETS.filter((widget) => widget.role === role).forEach((widget, position) => {
              if (random() > 0.95 - position * 0.09) return;
              event('widget.impression', { subjectKey: widget.key });
              if (random() < 0.34 - position * 0.03) event('widget.interact', { subjectKey: widget.key, action: random() < 0.7 ? 'LINK' : 'CONTROL' }, cursor + 6_000);
            });
          }
          if (random() < 0.22) {
            const feature = pick(browserFeatures);
            event('feature.use', { subjectKey: feature.key, action: feature.actions ? pick(feature.actions) : null, pageViewId: null });
            const completed = serverFeatures.find((candidate) => candidate.group === feature.group);
            if (completed && random() < 0.45) events.push({ id: uuid(), ...base, name: 'feature.use', subjectKey: completed.key, occurredAt: new Date(cursor + 20_000) });
          }
          cursor += visibleMs + 4_000 + Math.floor(random() * 20_000);
        }
        if (random() < 0.12) events.push({ id: uuid(), ...base, name: 'feature.use', subjectKey: pick(serverFeatures).key, occurredAt: new Date(cursor) });
        events.push({ id: uuid(), ...base, name: 'auth.sign_in', action: random() < 0.8 ? 'SSO' : 'PASSWORD', occurredAt: new Date(startedAt.getTime() - 5_000) });
        visits.push({ id: visitId, ...base, authMethod: 'SSO', deviceClass: device, entryPageKey: entry, startedAt, lastSeenAt: new Date(Math.min(cursor, now.getTime())) });
      }
    }
  }
  const chunks = (rows) => Array.from({ length: Math.ceil(rows.length / 2000) }, (_, index) => rows.slice(index * 2000, (index + 1) * 2000));
  for (const chunk of chunks(visits)) await prisma.analyticsVisit.createMany({ data: chunk });
  for (const chunk of chunks(views)) await prisma.analyticsPageView.createMany({ data: chunk });
  for (const chunk of chunks(events)) await prisma.analyticsEvent.createMany({ data: chunk });
  const first = localDateOf(start, tenant.timezone);
  for (let date = first; date <= today; date = addDays(date, 1)) await rebuildDay({ tenantId: tenant.id, timezone: tenant.timezone, date, final: date <= addDays(today, -2) });
  console.log(`Seeded ${accounts.length} synthetic people, ${visits.length} visits, ${views.length} page views and ${events.length} events over ${days} days for ${tenant.slug}.`);
}

try {
  const tenant = values.tenant ? await prisma.tenant.findUnique({ where: { slug: values.tenant } }) : null;
  if (!tenant || !['seed', 'clear'].includes(positionals[0])) console.error('Usage: node scripts/analytics-dev-seed.mjs <seed|clear> --tenant <slug> [--days 35] [--people 60]');
  else if (positionals[0] === 'seed') await seed(tenant);
  else await clear(tenant);
} finally {
  await prisma.$disconnect();
}
