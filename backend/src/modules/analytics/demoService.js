import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { recordAudit } from '../audit/auditService.js';
import { FEATURES, NAV_SOURCES, PAGES, WIDGETS, resolveContextRole } from '../../../../shared/analyticsCatalog.js';
import { CONCURRENCY_BUCKET_MS, DEMO_ONLINE_PEOPLE } from './config.js';
import { addDays, localDateOf, rebuildDay, safeTimezone, utcTimestamp } from './rollupService.js';

/**
 * Demo analytics data: a synthetic, internally consistent dataset that lets an institution see every Analytics
 * report working before real usage has built up.
 *
 * Isolation. Everything lives in analytics_demo_* tables. The synthetic people are rows of analytics_demo_people
 * (ids "demo-…", addresses @example.invalid, enforced by CHECK constraints), never portal accounts: nothing is
 * written to "users", Keycloak, CampusCore, Moodle, Strapi or any other table or system, and no other part of the
 * portal reads these tables. Reports include them only while the institution's "Include demo data" switch is on
 * (tenants.analyticsDemoEnabled), and say so on every section.
 *
 * Consistency. The generator writes raw visits, page views and events exactly as the tracker would, then the real
 * aggregation (rollupService.rebuildDay, source DEMO) turns them into daily facts, so a demo figure is computed the
 * same way as a real one. The concurrency history is counted from the generated visits, and exactly
 * DEMO_ONLINE_PEOPLE (150) people have a visit open at the moment of generation: they are the simulated online people.
 *
 * Idempotent. Generation is deterministic for an institution (fixed seed) and replaces the institution's whole
 * dataset in one transaction, so running it again never duplicates anything.
 *
 * Lifecycle (one source of truth: tenants.analyticsDemoEnabled, shown and changed under Data health):
 *   generate (command line)  → build or repair the dataset, then include it in reports.
 *   reset (command line)     → stop including it and delete every analytics_demo_* row of the institution, in one
 *                              transaction. Real analytics and portal accounts are never touched.
 *   switch on (Data health)  → include the dataset, generating it first if there is none.
 *   switch off (Data health) → stop including it; the dataset is kept, so switching on again is instant.
 * Every change is audited. Generation, reset and the demo concurrency sampler take the same per-institution lock, so
 * a sample or an aggregation can never land after a reset.
 */

export const DEMO_PEOPLE = 520;
export const DEMO_HISTORY_DAYS = 90;
const DEMO_SEED = 20261112;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/* ----- deterministic randomness ----- */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashString = (text) => [...text].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, 7);
function createRandom(seed) {
  const next = mulberry32(seed);
  const random = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    /** entries: [[value, weight], ...] */
    weighted: (entries) => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries.at(-1)[0];
    },
    uuid: () => {
      const hex = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16));
      hex[12] = '4';
      hex[16] = ['8', '9', 'a', 'b'][Math.floor(next() * 4)];
      const s = hex.join('');
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    },
  };
  return random;
}

/* ----- local time ----- */
const OFFSET_FORMATS = new Map();
function zoneOffsetMs(ms, timezone) {
  let format = OFFSET_FORMATS.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    OFFSET_FORMATS.set(timezone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(ms / 1000) * 1000;
}
/** The instant of a local date and minute of the day in the institution's time zone (DST-safe). */
export function localInstant(date, minuteOfDay, timezone) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  let utc = guess - zoneOffsetMs(guess, timezone);
  const corrected = guess - zoneOffsetMs(utc, timezone);
  if (corrected !== utc) utc = corrected;
  return utc;
}

/* ----- the synthetic population ----- */
const FIRST_NAMES = ['Aarav', 'Abigail', 'Adrian', 'Aisha', 'Alejandro', 'Amara', 'Andre', 'Anika', 'Arjun', 'Ava', 'Bianca', 'Caleb', 'Camila', 'Chen', 'Chloe', 'Daniel', 'Daria', 'Diego', 'Elena', 'Elijah', 'Emeka', 'Emma', 'Ethan', 'Fatima', 'Felix', 'Gabriel', 'Grace', 'Hana', 'Hiro', 'Imani', 'Isaac', 'Isla', 'Jamal', 'Jasmine', 'Jonah', 'Julia', 'Kai', 'Kavya', 'Laila', 'Leo', 'Liam', 'Lucia', 'Malik', 'Maya', 'Mei', 'Mila', 'Nadia', 'Noah', 'Nora', 'Omar', 'Priya', 'Rafael', 'Riya', 'Rosa', 'Samuel', 'Sara', 'Sofia', 'Tariq', 'Theo', 'Valentina', 'Wei', 'Yara', 'Yusuf', 'Zoe'];
const LAST_NAMES = ['Abara', 'Alvarez', 'Bennett', 'Bose', 'Brooks', 'Castillo', 'Chowdhury', 'Clarke', 'Dang', 'Delgado', 'Dubois', 'Eriksen', 'Farah', 'Fischer', 'Garcia', 'Gupta', 'Haddad', 'Hughes', 'Ibrahim', 'Ito', 'Jensen', 'Kapoor', 'Kim', 'Kowalski', 'Larsen', 'Lopez', 'Mbeki', 'Mehta', 'Moreau', 'Nakamura', 'Nguyen', 'Novak', 'Okafor', 'Olsen', 'Park', 'Patel', 'Petrov', 'Quinn', 'Ramirez', 'Reyes', 'Rossi', 'Sato', 'Schmidt', 'Shah', 'Silva', 'Singh', 'Sullivan', 'Tanaka', 'Torres', 'Usman', 'Varga', 'Wagner', 'Walsh', 'Weber', 'Xu', 'Yilmaz', 'Zhang'];

const DEVICE_PROFILES = {
  DESKTOP: [
    [['WINDOWS', 'CHROME'], 34], [['WINDOWS', 'EDGE'], 16], [['WINDOWS', 'FIREFOX'], 5], [['WINDOWS', 'OPERA'], 2],
    [['MACOS', 'SAFARI'], 14], [['MACOS', 'CHROME'], 15], [['MACOS', 'FIREFOX'], 2],
    [['CHROMEOS', 'CHROME'], 7], [['LINUX', 'FIREFOX'], 3], [['LINUX', 'CHROME'], 2],
  ],
  MOBILE: [
    [['IOS', 'SAFARI'], 38], [['IOS', 'CHROME'], 8], [['ANDROID', 'CHROME'], 40], [['ANDROID', 'OTHER'], 8],
    [['ANDROID', 'FIREFOX'], 2], [['ANDROID', 'OPERA'], 2], [['ANDROID', 'UNKNOWN'], 2],
  ],
  TABLET: [[['IOS', 'SAFARI'], 62], [['IOS', 'CHROME'], 6], [['ANDROID', 'CHROME'], 26], [['ANDROID', 'OTHER'], 6]],
};
// Share of people who are, per day: very regular, regular, occasional; lapsed (stopped some days ago); never signed in.
const ENGAGEMENT = [['high', 34], ['medium', 34], ['low', 16], ['lapsed', 11], ['never', 5]];
const DAILY_ACTIVE = { high: 0.9, medium: 0.58, low: 0.22, lapsed: 0.5 };
// Relative chance that a session starts in each local hour.
const HOUR_WEIGHTS = [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1.5, 4, 8, 11, 12, 11, 9, 10, 11, 10, 8, 6, 5, 6, 7, 6, 4, 2];
const NOTIFICATION_KINDS = [[['academic', 'ADVISING'], 14], [['academic', 'GRADES'], 18], [['administrative', 'SERVICE_REQUEST'], 12], [['administrative', 'SUPPORT_TICKET'], 8], [['campus', 'BROADCAST'], 16], [['finance', 'PAYMENT'], 9], [['campus', 'GROUP'], 10], [['academic', 'FACULTY_MESSAGE'], 11], [['emergency', 'BROADCAST'], 2]];

function buildPeople(random, now) {
  const people = [];
  for (let index = 1; index <= DEMO_PEOPLE; index += 1) {
    const roles = random.weighted([[['STUDENT'], 72], [['STUDENT', 'STAFF'], 3], [['FACULTY'], 12], [['STAFF'], 8], [['ALUMNI'], 3], [['ADMIN'], 2]]);
    const deviceClass = random.weighted([['DESKTOP', 55], ['MOBILE', 38], ['TABLET', 7]]);
    const [os, browser] = random.weighted(DEVICE_PROFILES[deviceClass]);
    const firstName = random.pick(FIRST_NAMES);
    const lastName = random.pick(LAST_NAMES);
    const number = String(index).padStart(5, '0');
    const prefix = roles[0] === 'STUDENT' ? 'S' : roles[0] === 'ALUMNI' ? 'A' : 'E';
    people.push({
      id: `demo-${number}`,
      firstName,
      lastName,
      email: `${firstName}.${lastName}.${number}@example.invalid`.toLowerCase(),
      institutionId: `DEMO-${prefix}-${number}`,
      rolesHeld: roles,
      status: 'ACTIVE',
      engagement: random.weighted(ENGAGEMENT),
      online: false,
      deviceClass, browser, os,
      createdAt: new Date(now - random.int(120, 900) * DAY_MS),
      lastLoginAt: null,
      // Lapsed people stopped signing in this many days ago (some before the history begins).
      lapsedDays: random.int(4, 140),
    });
  }
  // Exactly 150 regular users are online at the moment of generation.
  const candidates = people.filter((person) => person.engagement === 'high' || person.engagement === 'medium');
  for (let picked = 0; picked < DEMO_ONLINE_PEOPLE; picked += 1) {
    const at = random.int(0, candidates.length - 1);
    candidates.splice(at, 1)[0].online = true;
  }
  // A few accounts are suspended or still only invited (never signed in).
  for (const person of people) {
    if (person.online) continue;
    if (person.engagement === 'never') person.status = random.chance(0.6) ? 'INVITED' : 'ACTIVE';
    else if (person.engagement === 'lapsed' && random.chance(0.12)) person.status = 'SUSPENDED';
  }
  return people;
}

const pagesFor = (roles) => PAGES.filter((page) => !page.roles || page.roles.some((role) => roles.includes(role)));
const widgetsFor = (roles) => WIDGETS.filter((widget) => roles.includes(widget.role));
const PAGE_WEIGHT = (key, random) => (key === 'dashboard' ? 14 : key.startsWith('analytics') ? 0.4 : 1 + (hashString(key) % 9) * random);

/**
 * Generate the visits, page views and events of one session. `start`/`end` are instants; returns the session's
 * rows. Times never pass `now`.
 */
function buildSession(random, person, { start, end, pages, pageWeights, widgets, features, signIn = true }) {
  const visitId = random.uuid();
  const rows = { visits: [], pageViews: [], events: [] };
  const authMethod = random.chance(0.8) ? 'SSO' : 'PASSWORD';
  const base = { tenantId: person.tenantId, userId: person.id, rolesHeld: person.rolesHeld };
  if (signIn) rows.events.push({ ...base, id: random.uuid(), visitId: null, pageViewId: null, name: 'auth.sign_in', pageKey: null, subjectKey: null, action: authMethod, source: null, deviceClass: null, occurredAt: new Date(start) });
  const count = random.int(2, 5);
  const span = Math.max(end - start, count * MINUTE_MS);
  let cursor = start;
  let previous = null;
  for (let index = 0; index < count; index += 1) {
    const page = index === 0 ? pages.find((entry) => entry.key === 'dashboard') ?? random.pick(pages) : random.weighted(pages.map((entry) => [entry, pageWeights.get(entry.key)]));
    const pvStart = cursor;
    const pvEnd = index === count - 1 ? end : Math.min(end, cursor + Math.floor((span / count) * (0.5 + random.next())));
    const pageViewId = random.uuid();
    const contextRole = resolveContextRole(page.key, { rolesHeld: person.rolesHeld }) ?? 'SHARED';
    rows.pageViews.push({ ...base, id: pageViewId, visitId, pageKey: page.key, contextRole, deviceClass: person.deviceClass, startedAt: new Date(pvStart), lastSeenAt: new Date(pvEnd), visibleMs: Math.min(Math.floor((pvEnd - pvStart) * (0.35 + random.next() * 0.5)), 4 * 3_600_000) });
    const event = (fields) => rows.events.push({ ...base, id: random.uuid(), visitId, pageViewId: null, pageKey: null, subjectKey: null, action: null, source: null, deviceClass: person.deviceClass, ...fields });
    if (previous && random.chance(0.55)) event({ name: 'nav.click', pageKey: previous.key, subjectKey: page.key, source: random.weighted([[NAV_SOURCES[0], 70], [NAV_SOURCES[1], 4], [NAV_SOURCES[2], 9], [NAV_SOURCES[3], 5], [NAV_SOURCES[4], 12]]), occurredAt: new Date(pvStart) });
    if (page.key === 'dashboard' && index === 0) {
      for (const widget of widgets) event({ name: 'widget.impression', pageViewId, pageKey: page.key, subjectKey: widget.key, occurredAt: new Date(pvStart + 1500) });
      if (widgets.length && random.chance(0.35)) event({ name: 'widget.interact', pageViewId, pageKey: page.key, subjectKey: random.pick(widgets).key, action: random.chance(0.7) ? 'LINK' : 'CONTROL', occurredAt: new Date(pvStart + random.int(5, 90) * 1000) });
    }
    if (random.chance(0.28)) {
      const feature = random.weighted(features);
      event({ name: 'feature.use', pageKey: feature.origin === 'BROWSER' ? page.key : null, subjectKey: feature.key, action: feature.actions ? random.pick(feature.actions) : null, deviceClass: feature.origin === 'SERVER' ? null : person.deviceClass, occurredAt: new Date(Math.min(pvEnd, pvStart + random.int(10, 240) * 1000)) });
    }
    previous = page;
    cursor = pvEnd;
  }
  if (person.rolesHeld.some((role) => ['FACULTY', 'STAFF', 'ADMIN'].includes(role)) && random.chance(0.15)) {
    rows.events.push({ ...base, id: random.uuid(), visitId, pageViewId: null, name: 'nav.click', pageKey: previous.key, subjectKey: 'app.campuscore', action: null, source: 'SIDEBAR', deviceClass: person.deviceClass, occurredAt: new Date(end - MINUTE_MS) });
  }
  rows.visits.push({ ...base, id: visitId, authMethod, deviceClass: person.deviceClass, entryPageKey: rows.pageViews[0].pageKey, startedAt: new Date(start), lastSeenAt: new Date(end), browser: person.browser, os: person.os });
  return rows;
}

/** Build the whole dataset in memory (pure apart from the clock and zone passed in). */
export function buildDemoDataset({ tenantId, timezone, now = new Date(), seed = DEMO_SEED }) {
  const tz = safeTimezone(timezone);
  const random = createRandom(seed ^ hashString(tenantId));
  const nowMs = now.getTime();
  const today = localDateOf(now, tz);
  const coversFrom = addDays(today, -(DEMO_HISTORY_DAYS - 1));
  const people = buildPeople(random, nowMs).map((person) => ({ ...person, tenantId }));
  const features = FEATURES.map((feature) => [feature, feature.origin === 'SERVER' ? 1.4 : 1 + (hashString(feature.key) % 5)]);
  const rows = { visits: [], pageViews: [], events: [] };
  const hourEntries = HOUR_WEIGHTS.map((weight, hour) => [hour, weight]);

  for (const person of people) {
    if (person.engagement === 'never') continue;
    const pages = pagesFor(person.rolesHeld);
    const pageWeights = new Map(pages.map((page) => [page.key, PAGE_WEIGHT(page.key, 1)]));
    const widgets = widgetsFor(person.rolesHeld).slice(0, 3);
    const lastDay = person.online ? today : person.engagement === 'lapsed' ? addDays(today, -person.lapsedDays) : addDays(today, -random.int(0, person.engagement === 'low' ? 3 : 1));
    let lastLogin = null;
    for (let date = coversFrom; date <= lastDay; date = addDays(date, 1)) {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekend = weekday === 0 || weekday === 6;
      const mustBeActive = date === lastDay;
      if (!mustBeActive && !random.chance(DAILY_ACTIVE[person.engagement] * (weekend ? 0.45 : 1))) continue;
      // An online person's day so far is one session that is still open.
      const onlineNow = person.online && date === today;
      const sessions = onlineNow ? 1 : 1 + (random.chance(0.4) ? 1 : 0) + (random.chance(0.12) ? 1 : 0);
      const starts = Array.from({ length: sessions }, () => random.weighted(hourEntries) * 60 + random.int(0, 59)).sort((a, b) => a - b);
      let earliest = 0;
      for (let index = 0; index < sessions; index += 1) {
        const minute = Math.max(starts[index], earliest);
        if (minute >= 24 * 60 - 10) break;
        let start = localInstant(date, minute, tz);
        let end = start + random.int(70, 330) * MINUTE_MS;
        if (date === today) {
          // Today: the online people are in a session right now; nobody else is (so exactly 150 are online).
          if (onlineNow) {
            start = nowMs - random.int(3, 150) * MINUTE_MS;
            end = nowMs;
          } else {
            if (start > nowMs - 30 * MINUTE_MS) break;
            end = Math.min(end, nowMs - 15 * MINUTE_MS);
          }
        }
        if (end <= start) break;
        // The day's first visit signs in; a later visit that day often reuses the still-valid portal session (as
        // real visits do), so successful logins are fewer than visits.
        const signIn = index === 0 || random.chance(0.35);
        const session = buildSession(random, person, { start, end, pages, pageWeights, widgets, features, signIn });
        // Nothing is dated after the moment of generation.
        for (const event of session.events) if (event.occurredAt.getTime() > nowMs) event.occurredAt = new Date(nowMs);
        rows.visits.push(...session.visits);
        rows.pageViews.push(...session.pageViews);
        rows.events.push(...session.events);
        if (signIn) lastLogin = start;
        earliest = Math.round((end - localInstant(date, 0, tz)) / MINUTE_MS) + 5;
      }
    }
    // Lapsed before the history began: a sign-in date with no recorded activity.
    person.lastLoginAt = lastLogin ? new Date(lastLogin) : person.engagement === 'lapsed' ? new Date(localInstant(lastDay, random.int(8 * 60, 20 * 60), tz)) : null;
  }
  // Someone listed as online signed in during their current session.
  for (const person of people) if (person.online && !person.lastLoginAt) person.lastLoginAt = new Date(nowMs - 10 * MINUTE_MS);

  // Concurrency history: distinct people with a visit open in each 5-minute bucket (a person's sessions never overlap).
  const firstBucket = Math.floor(localInstant(coversFrom, 0, tz) / CONCURRENCY_BUCKET_MS) * CONCURRENCY_BUCKET_MS;
  const lastBucket = Math.floor(nowMs / CONCURRENCY_BUCKET_MS) * CONCURRENCY_BUCKET_MS;
  const buckets = new Array(Math.floor((lastBucket - firstBucket) / CONCURRENCY_BUCKET_MS) + 1).fill(0);
  for (const visit of rows.visits) {
    const from = Math.max(0, Math.floor((visit.startedAt.getTime() - firstBucket) / CONCURRENCY_BUCKET_MS));
    const to = Math.min(buckets.length - 1, Math.floor((visit.lastSeenAt.getTime() - firstBucket) / CONCURRENCY_BUCKET_MS));
    for (let index = from; index <= to; index += 1) buckets[index] += 1;
  }
  // The current bucket shows the simulated online people exactly (earlier sessions in it have just ended).
  buckets[buckets.length - 1] = people.filter((person) => person.online).length;
  const concurrency = buckets.map((users, index) => ({ tenantId, bucketStart: new Date(firstBucket + index * CONCURRENCY_BUCKET_MS), users }));

  // In-app notifications received by the synthetic people, about three a week each, most of them read.
  const notifications = [];
  const historyStart = localInstant(coversFrom, 0, tz);
  for (const person of people) {
    const count = person.engagement === 'never' ? random.int(1, 6) : random.int(20, 50);
    for (let index = 0; index < count; index += 1) {
      const createdAt = historyStart + Math.floor(random.next() * (nowMs - historyStart));
      const [category, sourceType] = random.weighted(NOTIFICATION_KINDS);
      const readProbability = person.engagement === 'high' ? 0.88 : person.engagement === 'medium' ? 0.7 : person.engagement === 'never' ? 0 : 0.4;
      let readAt = random.chance(readProbability) ? createdAt + Math.floor((random.chance(0.7) ? random.next() * 20 : 20 + random.next() * 100) * 3_600_000) : null;
      if (readAt && (readAt > nowMs || (person.lastLoginAt && readAt > person.lastLoginAt.getTime() + DAY_MS))) readAt = null;
      notifications.push({ id: random.uuid(), tenantId, userId: person.id, category, sourceType, isRead: Boolean(readAt), readAt: readAt ? new Date(readAt) : null, createdAt: new Date(createdAt) });
    }
  }

  return {
    coversFrom, coversTo: today, seed,
    people: people.map(({ engagement: _e, lapsedDays: _l, ...person }) => person),
    ...rows, concurrency, notifications,
  };
}

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

/**
 * Set-based insert: one statement per 20,000 rows, each column passed as one array and expanded with unnest (far
 * faster than row-by-row parameters for a dataset of a few hundred thousand rows). `columns`: [name, cast] where
 * cast turns the text array element into the column's type.
 */
const TS = (value) => (value == null ? null : value.toISOString());
const ROLES = (value) => `{${value.join(',')}}`;
async function bulkInsert(client, table, columns, rows) {
  for (const part of chunk(rows, 20_000)) {
    const arrays = columns.map(([name, , read]) => part.map((row) => (read ? read(row[name]) : row[name] ?? null)));
    const selects = columns.map(([, cast], index) => cast.replace('$', `u.c${index}`)).join(', ');
    const sql = `INSERT INTO "${table}" (${columns.map(([name]) => `"${name}"`).join(', ')})
      SELECT ${selects} FROM unnest(${columns.map((_, index) => `$${index + 1}::text[]`).join(', ')}) AS u(${columns.map((_, index) => `c${index}`).join(', ')})`;
    await client.$executeRawUnsafe(sql, ...arrays.map((values) => values.map((value) => (value == null ? null : String(value)))));
  }
}
const text = '$';
const uuidCol = '$::uuid';
const int = '$::int';
const bool = '$::boolean';
const time = "($::timestamptz AT TIME ZONE 'UTC')";
const roles = '$::"RoleKey"[]';
const device = '$::"AnalyticsDevice"';
const DEMO_COLUMNS = {
  analytics_demo_people: [['id', text], ['tenantId', text], ['firstName', text], ['lastName', text], ['email', text], ['institutionId', text], ['rolesHeld', roles, ROLES], ['status', text], ['online', bool], ['deviceClass', device], ['browser', text], ['os', text], ['lastLoginAt', time, TS], ['createdAt', time, TS]],
  analytics_demo_visits: [['id', uuidCol], ['tenantId', text], ['userId', text], ['rolesHeld', roles, ROLES], ['authMethod', text], ['deviceClass', device], ['entryPageKey', text], ['startedAt', time, TS], ['lastSeenAt', time, TS], ['browser', text], ['os', text]],
  analytics_demo_page_views: [['id', uuidCol], ['tenantId', text], ['userId', text], ['visitId', uuidCol], ['pageKey', text], ['rolesHeld', roles, ROLES], ['contextRole', text], ['deviceClass', device], ['startedAt', time, TS], ['lastSeenAt', time, TS], ['visibleMs', int]],
  analytics_demo_events: [['id', uuidCol], ['tenantId', text], ['userId', text], ['visitId', uuidCol], ['pageViewId', uuidCol], ['name', text], ['pageKey', text], ['subjectKey', text], ['action', text], ['source', text], ['rolesHeld', roles, ROLES], ['deviceClass', device], ['occurredAt', time, TS], ['receivedAt', time, TS]],
  analytics_demo_concurrency: [['tenantId', text], ['bucketStart', time, TS], ['users', int]],
  analytics_demo_notifications: [['id', uuidCol], ['tenantId', text], ['userId', text], ['category', text], ['sourceType', text], ['isRead', bool], ['readAt', time, TS], ['createdAt', time, TS]],
};

/** Every table that holds demo rows, for counting and for proving a reset left nothing behind. */
export const DEMO_TABLES = [
  'analytics_demo_datasets', 'analytics_demo_people', 'analytics_demo_visits', 'analytics_demo_page_views', 'analytics_demo_events',
  'analytics_demo_user_daily', 'analytics_demo_rollups', 'analytics_demo_concurrency', 'analytics_demo_notifications',
];

/** Rows per demo table for one institution. */
export async function demoRecordCounts(tenantId, client = prisma) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT ${DEMO_TABLES.map((table) => `(SELECT count(*) FROM "${table}" WHERE "tenantId" = $1)::int AS "${table.replace('analytics_demo_', '')}"`).join(', ')}`,
    tenantId,
  );
  return row;
}

/** The per-institution lock shared by generation, reset and the demo concurrency sampler (transaction-scoped). */
const demoLock = (client, tenantId) => client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`analytics-demo:${tenantId}`}))`;
export const tryDemoLock = async (client, tenantId) => {
  const [row] = await client.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${`analytics-demo:${tenantId}`})) AS locked`;
  return row.locked;
};

let generating = null;
/** The dataset being generated right now for this institution, if any (Data health shows it). */
export const demoGenerationInProgress = (tenantId) => generating?.tenantId === tenantId;

/**
 * Replace this institution's demo dataset (delete, then write it again, in one transaction), then aggregate it.
 * Touches analytics_demo_* tables only. Concurrent calls share one run.
 */
export function generateDemoDataset({ tenantId, timezone, now = new Date(), log = logger } = {}) {
  if (generating?.tenantId === tenantId) return generating.promise;
  const promise = (async () => {
    const startedAt = Date.now();
    const data = buildDemoDataset({ tenantId, timezone, now });
    await prisma.$transaction(async (tx) => {
      await demoLock(tx, tenantId);
      await removeDemoRows(tx, tenantId);
      await bulkInsert(tx, 'analytics_demo_people', DEMO_COLUMNS.analytics_demo_people, data.people);
      await bulkInsert(tx, 'analytics_demo_visits', DEMO_COLUMNS.analytics_demo_visits, data.visits);
      await bulkInsert(tx, 'analytics_demo_page_views', DEMO_COLUMNS.analytics_demo_page_views, data.pageViews);
      await bulkInsert(tx, 'analytics_demo_events', DEMO_COLUMNS.analytics_demo_events, data.events.map((event) => ({ ...event, receivedAt: event.occurredAt })));
      await bulkInsert(tx, 'analytics_demo_concurrency', DEMO_COLUMNS.analytics_demo_concurrency, data.concurrency);
      await bulkInsert(tx, 'analytics_demo_notifications', DEMO_COLUMNS.analytics_demo_notifications, data.notifications);
      await tx.analyticsDemoDataset.create({
        data: { tenantId, seed: data.seed, generatedAt: now, coversFrom: new Date(`${data.coversFrom}T00:00:00Z`), coversTo: new Date(`${data.coversTo}T00:00:00Z`), people: data.people.length, online: data.people.filter((person) => person.online).length },
      });
    }, { timeout: 180_000, maxWait: 20_000 });
    // The same aggregation the real data goes through, into the demo rollup and person-day tables. Each day is its
    // own transaction and lock, so four run side by side.
    const dates = [];
    for (let date = data.coversFrom; date <= data.coversTo; date = addDays(date, 1)) dates.push(date);
    for (const group of chunk(dates, 4)) await Promise.all(group.map((date) => rebuildDay({ tenantId, timezone, date, final: true, source: 'DEMO' })));
    // A reset that ran while the days were being aggregated deleted the dataset: remove what aggregation added since.
    await prisma.$transaction(async (tx) => {
      await demoLock(tx, tenantId);
      const [current] = await tx.$queryRaw`SELECT 1 FROM "analytics_demo_datasets" WHERE "tenantId" = ${tenantId} AND "generatedAt" = ${utcTimestamp(now)}`;
      if (!current) await removeDemoRows(tx, tenantId);
    });
    const summary = { people: data.people.length, online: data.people.filter((person) => person.online).length, visits: data.visits.length, pageViews: data.pageViews.length, events: data.events.length, notifications: data.notifications.length, coversFrom: data.coversFrom, coversTo: data.coversTo, ms: Date.now() - startedAt };
    log.info?.('Analytics demo dataset generated', summary);
    return summary;
  })().finally(() => { generating = null; });
  generating = { tenantId, promise };
  return promise;
}

async function removeDemoRows(client, tenantId) {
  // People first: their visits, page views, events, person-days and notifications go with them (ON DELETE CASCADE).
  const people = await client.$executeRaw`DELETE FROM "analytics_demo_people" WHERE "tenantId" = ${tenantId}`;
  await client.$executeRaw`DELETE FROM "analytics_demo_rollups" WHERE "tenantId" = ${tenantId}`;
  await client.$executeRaw`DELETE FROM "analytics_demo_concurrency" WHERE "tenantId" = ${tenantId}`;
  await client.$executeRaw`DELETE FROM "analytics_demo_datasets" WHERE "tenantId" = ${tenantId}`;
  return people;
}

/** Turn "Include demo data" on or off, auditing a change. `via` says where it was changed (shown in the audit log). */
async function setIncluded(client, { tenantId, actorUserId = null, enabled, via }) {
  const tenant = await client.tenant.findUnique({ where: { id: tenantId }, select: { analyticsDemoEnabled: true } });
  if (tenant.analyticsDemoEnabled === enabled) return false;
  await client.tenant.update({ where: { id: tenantId }, data: { analyticsDemoEnabled: enabled } });
  await recordAudit({
    tenantId, actorUserId, action: enabled ? 'ANALYTICS_DEMO_ENABLED' : 'ANALYTICS_DEMO_DISABLED', entityType: 'Tenant', entityId: tenantId,
    summary: `${enabled ? 'Analytics demo data included in reports (synthetic, Analytics only)' : 'Analytics demo data removed from reports'} (${via})`,
  }, client);
  return true;
}

/**
 * Reset: stop including demo data and delete every demo row of this institution, in one transaction under the demo
 * lock. Touches tenants.analyticsDemoEnabled and analytics_demo_* only. Returns the rows removed per table, what is
 * left (always zero) and whether the switch was on.
 */
export async function resetDemoDataset(tenantId, { actorUserId = null, via = 'command line' } = {}) {
  return prisma.$transaction(async (tx) => {
    await demoLock(tx, tenantId);
    const removed = await demoRecordCounts(tenantId, tx);
    const wasIncluded = await setIncluded(tx, { tenantId, actorUserId, enabled: false, via });
    await removeDemoRows(tx, tenantId);
    const remaining = await demoRecordCounts(tenantId, tx);
    if (removed.datasets || removed.people) {
      await recordAudit({ tenantId, actorUserId, action: 'ANALYTICS_DEMO_RESET', entityType: 'Tenant', entityId: tenantId, summary: `Analytics demo data deleted: ${removed.people} synthetic people and their rows (${via})`, metadata: { removed } }, tx);
    }
    return { removed, remaining, wasIncluded };
  }, { timeout: 120_000, maxWait: 30_000 });
}

/**
 * Generate: build (or rebuild and repair) this institution's dataset, then include it in reports. Idempotent: the
 * dataset is replaced, never added to. Audited.
 */
export async function generateAndIncludeDemo({ tenantId, actorUserId = null, via = 'command line', log } = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  const generated = await generateDemoDataset({ tenantId, timezone: tenant.timezone, ...(log ? { log } : {}) });
  await recordAudit({ tenantId, actorUserId, action: 'ANALYTICS_DEMO_REGENERATED', entityType: 'Tenant', entityId: tenantId, summary: `Analytics demo data generated (${generated.people} synthetic people, ${generated.coversFrom} to ${generated.coversTo}) (${via})` });
  await setIncluded(prisma, { tenantId, actorUserId, enabled: true, via });
  return { ...generated, records: await demoRecordCounts(tenantId) };
}

/**
 * "Include demo data" on or off (Admin → Analytics → Data health). On: the dataset is generated first if this
 * institution has none. Off: reports stop reading it at once; the dataset is kept, so switching on again is
 * instant and creates nothing new. Audited.
 */
export async function setDemoMode(auth, { enabled }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { timezone: true } });
  let generated = null;
  if (enabled) {
    const [dataset] = await prisma.$queryRaw`SELECT 1 FROM "analytics_demo_datasets" WHERE "tenantId" = ${auth.tenantId}`;
    if (!dataset) generated = await generateDemoDataset({ tenantId: auth.tenantId, timezone: tenant.timezone });
  }
  await setIncluded(prisma, { tenantId: auth.tenantId, actorUserId: auth.userId, enabled, via: 'Data health' });
  return { enabled, generated };
}

/** Regenerate the dataset so its history ends today (same people, same rules), and include it. Audited. */
export async function regenerateDemo(auth) {
  return generateAndIncludeDemo({ tenantId: auth.tenantId, actorUserId: auth.userId, via: 'Data health' });
}
