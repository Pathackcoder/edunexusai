import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { PAGE_VISIBLE_CAP_MS, VISIT_DURATION_CAP_MS, analyticsConfig } from './config.js';

/**
 * Aggregation: raw visits, page views and events → person-day rows and daily facts.
 *
 * One institution-local day is rebuilt by REPLACEMENT inside one transaction (delete that day's derived rows,
 * recompute them from the raw rows), so running it again, twice at once, or after a crash always ends in the same
 * correct state. Days are the institution's own calendar days (tenants.timezone), including DST days of 23 or 25
 * hours, because the day's bounds are computed by PostgreSQL from the zone name.
 *
 *   today                    rebuilt on every pass            PARTIAL
 *   yesterday                rebuilt on every pass            PARTIAL (events may still arrive: browsers send up to 24 h late)
 *   two or more days ago     rebuilt once more, then          FINAL
 *
 * Counting rules that matter:
 *  - A person is "active" on a day with a page view, a navigation click, a widget interaction or a feature use.
 *    Signing in, a widget merely being on screen and background API polling are not activity.
 *  - Role rows count everyone HOLDING the role (as recorded on the raw row at the time); the ALL row counts each
 *    person once. A person with two roles is therefore in two role rows and in the ALL row once, never twice.
 *  - `uniqueUsers` is distinct people within that one day. Distinct people over a longer range are never the sum
 *    of days: reports count them from person-day rows or from the raw rows.
 */

export const QUALIFYING_EVENTS = ['nav.click', 'widget.interact', 'feature.use'];
export const VISIT_BUCKETS = [
  ['under-1m', 60_000], ['1-5m', 300_000], ['5-15m', 900_000], ['15-30m', 1_800_000], ['30-60m', 3_600_000], ['over-60m', null],
];

const DATE_FORMATS = new Map();
/** The institution-local calendar date (YYYY-MM-DD) of an instant. */
export function localDateOf(instant, timezone) {
  let format = DATE_FORMATS.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    DATE_FORMATS.set(timezone, format);
  }
  return format.format(instant);
}
export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
/**
 * The time zone used for an institution's days and hours: its configured `tenants.timezone`. When that is empty or
 * not a valid IANA name, analytics uses UTC (and never guesses a country's zone), so days still group consistently.
 */
export const FALLBACK_TIMEZONE = 'UTC';
export function safeTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') return FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return timezone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/**
 * A JavaScript Date as a UTC `timestamp` value. The analytics columns are `timestamp(3)` without time zone holding
 * UTC (as Prisma writes them); a raw-SQL Date parameter arrives as `timestamptz`, which PostgreSQL would otherwise
 * convert using the database session's time zone. This makes every raw insert and comparison independent of it.
 */
export const utcTimestamp = (date) => Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;

/** UTC instant (as stored) at which a local date begins. */
export const startOfLocalDate = (date, timezone) => Prisma.sql`(((${date}::date)::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC')`;
/** Local date of a stored (UTC) timestamp column. */
export const localDateSql = (column, timezone) => Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date`;

async function insertFact(tx, { tenantId, date, fact, source }) {
  const columns = Prisma.sql`"tenantId", "localDate", "fact", "subjectKey", "role", "device", "count", "uniqueUsers", "durationMs", "durationSamples"`;
  const measures = Prisma.sql`count(*)::int, count(DISTINCT s."userId")::int, COALESCE(sum(s.dur), 0)::bigint, COALESCE(sum(s.sample), 0)::int`;
  // Everyone, once.
  await tx.$executeRaw`
    INSERT INTO "analytics_rollups" (${columns})
    SELECT ${tenantId}, ${date}::date, ${fact}, s.subject, 'ALL', COALESCE(s.device, 'ALL'), ${measures}
    FROM (${source}) s
    GROUP BY GROUPING SETS ((s.subject, s.device), (s.subject))`;
  // Per role held.
  await tx.$executeRaw`
    INSERT INTO "analytics_rollups" (${columns})
    SELECT ${tenantId}, ${date}::date, ${fact}, s.subject, r.role::text, COALESCE(s.device, 'ALL'), ${measures}
    FROM (${source}) s CROSS JOIN LATERAL unnest(s."rolesHeld") AS r(role)
    GROUP BY GROUPING SETS ((s.subject, r.role, s.device), (s.subject, r.role))`;
}

/** Rebuild one local day for one institution. Returns FINAL, PARTIAL or BUSY (another process is doing it). */
export async function rebuildDay({ tenantId, timezone, date, final }) {
  const tz = safeTimezone(timezone);
  const startedAt = new Date();
  const from = startOfLocalDate(date, tz);
  const to = startOfLocalDate(addDays(date, 1), tz);
  const pageWindow = Prisma.sql`"tenantId" = ${tenantId} AND "startedAt" >= ${from} AND "startedAt" < ${to}`;
  const eventWindow = Prisma.sql`"tenantId" = ${tenantId} AND "occurredAt" >= ${from} AND "occurredAt" < ${to}`;
  const eventSource = (name, subject) => Prisma.sql`
    SELECT "userId", ${subject} AS subject, "rolesHeld", COALESCE("deviceClass"::text, 'NONE') AS device, 0::bigint AS dur, 0 AS sample
    FROM "analytics_events" WHERE ${eventWindow} AND "name" = ${name} AND ${subject} IS NOT NULL`;
  const localHour = (column) => Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'HH24')`;
  const visitMs = Prisma.sql`LEAST((EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt")) * 1000)::bigint, ${VISIT_DURATION_CAP_MS}::bigint)`;
  const bucket = Prisma.sql`CASE ${Prisma.join(VISIT_BUCKETS.filter(([, limit]) => limit).map(([key, limit]) => Prisma.sql`WHEN ${visitMs} < ${limit} THEN ${key}`), ' ')} ELSE 'over-60m' END`;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${`analytics-rollup:${tenantId}:${date}`})) AS locked`;
      if (!locked) return 'BUSY';

      await tx.$executeRaw`DELETE FROM "analytics_rollups" WHERE "tenantId" = ${tenantId} AND "localDate" = ${date}::date`;
      await tx.$executeRaw`DELETE FROM "analytics_user_daily" WHERE "tenantId" = ${tenantId} AND "localDate" = ${date}::date`;

      // Person-day rows.
      await tx.$executeRaw`
        WITH pv AS (SELECT "userId", "rolesHeld", "deviceClass", "visitId", "visibleMs" FROM "analytics_page_views" WHERE ${pageWindow}),
        act AS (
          SELECT "userId", "rolesHeld", "deviceClass", "visitId" FROM pv
          UNION ALL
          SELECT "userId", "rolesHeld", "deviceClass", "visitId" FROM "analytics_events" WHERE ${eventWindow} AND "name" IN (${Prisma.join(QUALIFYING_EVENTS)})
        )
        INSERT INTO "analytics_user_daily" ("tenantId", "localDate", "userId", "rolesHeld", "devices", "visits", "pageViews", "visibleMs")
        SELECT ${tenantId}, ${date}::date, a."userId",
          COALESCE((SELECT array_agg(DISTINCT r) FROM act x CROSS JOIN LATERAL unnest(x."rolesHeld") r WHERE x."userId" = a."userId"), '{}'),
          COALESCE(array_agg(DISTINCT a."deviceClass") FILTER (WHERE a."deviceClass" IS NOT NULL), '{}'),
          count(DISTINCT a."visitId")::int,
          COALESCE((SELECT count(*) FROM pv WHERE pv."userId" = a."userId"), 0)::int,
          LEAST(COALESCE((SELECT sum(LEAST(pv."visibleMs", ${PAGE_VISIBLE_CAP_MS})) FROM pv WHERE pv."userId" = a."userId"), 0), 86400000)::int
        FROM act a GROUP BY a."userId"`;

      const pageSource = (subject) => Prisma.sql`
        SELECT "userId", ${subject} AS subject, "rolesHeld", "deviceClass"::text AS device,
               (CASE WHEN "visibleMs" >= 1000 THEN LEAST("visibleMs", ${PAGE_VISIBLE_CAP_MS}) ELSE 0 END)::bigint AS dur,
               ("visibleMs" >= 1000)::int AS sample
        FROM "analytics_page_views" WHERE ${pageWindow}`;
      const facts = [
        ['PAGE', pageSource(Prisma.sql`"pageKey"`)],
        ['CONTEXT', pageSource(Prisma.sql`"contextRole"`)],
        ['NAV', eventSource('nav.click', Prisma.sql`"subjectKey"`)],
        ['NAV_SOURCE', eventSource('nav.click', Prisma.sql`"source"`)],
        // A widget seen in one page view counts once, however often the browser reported it.
        ['WIDGET_IMPRESSION', Prisma.sql`
          SELECT DISTINCT ON ("pageViewId", "subjectKey") "userId", "subjectKey" AS subject, "rolesHeld", COALESCE("deviceClass"::text, 'NONE') AS device, 0::bigint AS dur, 0 AS sample
          FROM "analytics_events" WHERE ${eventWindow} AND "name" = 'widget.impression' AND "subjectKey" IS NOT NULL`],
        ['WIDGET_INTERACTION', eventSource('widget.interact', Prisma.sql`"subjectKey"`)],
        ['FEATURE', eventSource('feature.use', Prisma.sql`"subjectKey"`)],
        ['AUTH', eventSource('auth.sign_in', Prisma.sql`"action"`)],
        ['HOUR', Prisma.sql`
          SELECT "userId", ${localHour(Prisma.sql`"startedAt"`)} AS subject, "rolesHeld", "deviceClass"::text AS device, 0::bigint AS dur, 0 AS sample
          FROM "analytics_page_views" WHERE ${pageWindow}
          UNION ALL
          SELECT "userId", ${localHour(Prisma.sql`"occurredAt"`)}, "rolesHeld", COALESCE("deviceClass"::text, 'NONE'), 0::bigint, 0
          FROM "analytics_events" WHERE ${eventWindow} AND "name" IN (${Prisma.join(QUALIFYING_EVENTS)})`],
        // A visit belongs to the day it started.
        ['VISIT', Prisma.sql`
          SELECT "userId", 'all' AS subject, "rolesHeld", "deviceClass"::text AS device, ${visitMs} AS dur, 1 AS sample
          FROM "analytics_visits" WHERE ${pageWindow}`],
        ['VISIT_DURATION', Prisma.sql`
          SELECT "userId", ${bucket} AS subject, "rolesHeld", "deviceClass"::text AS device, 0::bigint AS dur, 0 AS sample
          FROM "analytics_visits" WHERE ${pageWindow}`],
      ];
      for (const [fact, source] of facts) await insertFact(tx, { tenantId, date, fact, source });
      return final ? 'FINAL' : 'PARTIAL';
    }, { timeout: 120_000, maxWait: 10_000 });

    if (outcome !== 'BUSY') {
      const finishedAt = new Date();
      const run = { status: outcome, startedAt, finishedAt, durationMs: finishedAt - startedAt, errorCode: null };
      await prisma.$executeRaw`
        INSERT INTO "analytics_rollup_runs" ("tenantId", "localDate", "status", "startedAt", "finishedAt", "durationMs", "errorCode")
        VALUES (${tenantId}, ${date}::date, ${run.status}::"AnalyticsRollupStatus", ${utcTimestamp(run.startedAt)}, ${utcTimestamp(run.finishedAt)}, ${run.durationMs}, NULL)
        ON CONFLICT ("tenantId", "localDate") DO UPDATE SET "status" = EXCLUDED."status", "startedAt" = EXCLUDED."startedAt", "finishedAt" = EXCLUDED."finishedAt", "durationMs" = EXCLUDED."durationMs", "errorCode" = NULL`;
    }
    return outcome;
  } catch (error) {
    const code = String(error.code ?? error.name ?? 'ERROR').slice(0, 60);
    await prisma.$executeRaw`
      INSERT INTO "analytics_rollup_runs" ("tenantId", "localDate", "status", "startedAt", "finishedAt", "errorCode")
      VALUES (${tenantId}, ${date}::date, 'FAILED'::"AnalyticsRollupStatus", ${utcTimestamp(startedAt)}, ${utcTimestamp(new Date())}, ${code})
      ON CONFLICT ("tenantId", "localDate") DO UPDATE SET "status" = 'FAILED', "startedAt" = EXCLUDED."startedAt", "finishedAt" = EXCLUDED."finishedAt", "errorCode" = EXCLUDED."errorCode"`.catch(() => {});
    throw error;
  }
}

/** The days one pass rebuilds for an institution: today, yesterday, and any of the last week not yet FINAL. */
export async function daysToRebuild({ tenantId, timezone, analyticsStartedAt }, now = new Date()) {
  const tz = safeTimezone(timezone);
  const today = localDateOf(now, tz);
  const firstDay = localDateOf(analyticsStartedAt, tz);
  const candidates = Array.from({ length: 8 }, (_, index) => addDays(today, -index)).filter((date) => date >= firstDay);
  const runs = await prisma.$queryRaw`
    SELECT to_char("localDate", 'YYYY-MM-DD') AS date FROM "analytics_rollup_runs"
    WHERE "tenantId" = ${tenantId} AND "status" = 'FINAL' AND "localDate" >= ${candidates.at(-1) ?? today}::date`;
  const finalised = new Set(runs.map((row) => row.date));
  return candidates.filter((date) => !finalised.has(date)).map((date) => ({ date, final: date <= addDays(today, -2) })).reverse();
}

/** One aggregation pass over one institution. */
export async function aggregateTenant(tenant, { now = new Date() } = {}) {
  const results = [];
  for (const { date, final } of await daysToRebuild(tenant, now)) {
    results.push({ date, outcome: await rebuildDay({ tenantId: tenant.tenantId, timezone: tenant.timezone, date, final }) });
  }
  return results;
}

async function deleteInBatches(run) {
  let total = 0;
  for (;;) {
    const removed = await run();
    total += removed;
    if (removed < 5000) return total;
  }
}

/**
 * Retention. Raw rows older than the raw window are deleted, but a day is only deleted once it has been finalised
 * into aggregates (or is a further week old, so a stuck aggregation can never keep raw data indefinitely).
 */
export async function purgeTenant({ tenantId, timezone }, { now = new Date() } = {}) {
  const config = analyticsConfig();
  const tz = safeTimezone(timezone);
  const cutoff = new Date(now.getTime() - config.rawRetentionDays * 86_400_000);
  const hardCutoff = new Date(cutoff.getTime() - 7 * 86_400_000);
  const finalised = (column) => Prisma.sql`(${column} < ${utcTimestamp(hardCutoff)} OR EXISTS (
    SELECT 1 FROM "analytics_rollup_runs" r WHERE r."tenantId" = ${tenantId} AND r."status" = 'FINAL' AND r."localDate" = ${localDateSql(column, tz)}))`;
  const raw = async (table, column) => deleteInBatches(() => prisma.$executeRaw`
    DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "id" IN (
      SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "tenantId" = ${tenantId} AND ${column} < ${utcTimestamp(cutoff)} AND ${finalised(column)} LIMIT 5000)`);
  const today = localDateOf(now, tz);
  return {
    events: await raw('analytics_events', Prisma.sql`"occurredAt"`),
    pageViews: await raw('analytics_page_views', Prisma.sql`"startedAt"`),
    visits: await raw('analytics_visits', Prisma.sql`"startedAt"`),
    userDays: await prisma.$executeRaw`DELETE FROM "analytics_user_daily" WHERE "tenantId" = ${tenantId} AND "localDate" < ${addDays(today, -config.userDailyRetentionDays)}::date`,
    rollups: await prisma.$executeRaw`DELETE FROM "analytics_rollups" WHERE "tenantId" = ${tenantId} AND "localDate" < ${addDays(today, -config.rollupRetentionDays)}::date`,
    runs: await prisma.$executeRaw`DELETE FROM "analytics_rollup_runs" WHERE "tenantId" = ${tenantId} AND "localDate" < ${addDays(today, -config.rollupRetentionDays)}::date`,
  };
}

/** Institutions that have ever collected (their history is still aggregated and purged after collection is switched off). */
export async function collectingTenants() {
  const rows = await prisma.tenant.findMany({ where: { analyticsStartedAt: { not: null } }, select: { id: true, timezone: true, analyticsStartedAt: true } });
  return rows.map((row) => ({ tenantId: row.id, timezone: row.timezone, analyticsStartedAt: row.analyticsStartedAt }));
}

/**
 * The periodic job (server.js). Runs only while ANALYTICS_ENABLED is on. Each pass aggregates every collecting
 * institution; retention runs at most once an hour. A failure is logged by code and retried on the next pass.
 */
export function startAnalyticsWorker({ log = logger } = {}) {
  const config = analyticsConfig();
  if (!config.enabled) return null;
  let timer = null;
  let stopped = false;
  let lastPurge = 0;
  const tick = async () => {
    try {
      const purge = Date.now() - lastPurge > 3_600_000;
      for (const tenant of await collectingTenants()) {
        try {
          await aggregateTenant(tenant);
          if (purge) await purgeTenant(tenant);
        } catch (error) {
          log.warn('Analytics aggregation failed', { tenantId: tenant.tenantId, code: error.code ?? error.name ?? 'error' });
        }
      }
      if (purge) lastPurge = Date.now();
    } catch (error) {
      log.warn('Analytics aggregation pass failed', { code: error.code ?? error.name ?? 'error' });
    }
    if (!stopped) timer = setTimeout(tick, config.rollupIntervalMs);
  };
  timer = setTimeout(tick, 10_000);
  log.info(`Analytics aggregation started (every ${Math.round(config.rollupIntervalMs / 1000)}s)`);
  return { stop: () => { stopped = true; clearTimeout(timer); } };
}
