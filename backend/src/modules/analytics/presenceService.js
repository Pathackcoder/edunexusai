import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { CONCURRENCY_BUCKET_MS, analyticsConfig } from './config.js';
import { utcTimestamp } from './rollupService.js';
import { tryDemoLock } from './demoService.js';

/**
 * Live concurrent users.
 *
 * Every open, visible portal tab of a signed-in person whose activity is measured sends a heartbeat (POST
 * /analytics/presence) when it opens, when it becomes visible again, and every 30 seconds while it is visible and
 * was used in the last 5 minutes. The person is taken from the access token, never from the request body.
 *
 * There is ONE row per person (analytics_presence, keyed by institution and account), so any number of tabs,
 * windows or refreshes is still one person. Someone is "online now" while their row was refreshed within the
 * presence window (ANALYTICS_PRESENCE_TTL_SECONDS, default 120 s). Signing out deletes the row at once; closing the
 * browser stops the heartbeats, and the person drops out when the window passes.
 *
 * About once a minute the sampler records each institution's live count into a 5-minute bucket of
 * analytics_concurrency, keeping the bucket's highest sample (GREATEST, so two API processes sampling the same
 * minute agree). History charts and "peak concurrent users" read those buckets; a bucket without a row was not
 * measured and is shown as a gap, never as zero.
 */

export const bucketOf = (ms) => new Date(Math.floor(ms / CONCURRENCY_BUCKET_MS) * CONCURRENCY_BUCKET_MS);

/** Record that this person's portal is open now. */
export async function heartbeat(auth, { now = new Date() } = {}) {
  await prisma.$executeRaw`
    INSERT INTO "analytics_presence" ("tenantId", "userId", "firstSeenAt", "lastSeenAt")
    VALUES (${auth.tenantId}, ${auth.userId}, ${utcTimestamp(now)}, ${utcTimestamp(now)})
    ON CONFLICT ("tenantId", "userId") DO UPDATE SET "lastSeenAt" = GREATEST("analytics_presence"."lastSeenAt", EXCLUDED."lastSeenAt"),
      "firstSeenAt" = CASE WHEN "analytics_presence"."lastSeenAt" < ${utcTimestamp(new Date(now.getTime() - analyticsConfig().presenceTtlMs))}
                           THEN EXCLUDED."firstSeenAt" ELSE "analytics_presence"."firstSeenAt" END`;
}

/** The person signed out (or their institutional session ended): they are no longer online. Never throws. */
export function endPresence({ tenantId, userId }) {
  if (!tenantId || !userId) return Promise.resolve(0);
  return prisma.$executeRaw`DELETE FROM "analytics_presence" WHERE "tenantId" = ${tenantId} AND "userId" = ${userId}`.catch((error) => {
    logger.warn('Analytics presence not cleared', { code: error.code ?? error.name ?? 'error' });
    return 0;
  });
}

/** Distinct people of one institution online now. */
export async function liveCount(tenantId, { now = new Date() } = {}) {
  const since = new Date(now.getTime() - analyticsConfig().presenceTtlMs);
  const [row] = await prisma.$queryRaw`
    SELECT count(*)::int AS users FROM "analytics_presence" WHERE "tenantId" = ${tenantId} AND "lastSeenAt" >= ${utcTimestamp(since)}`;
  return row.users;
}

/** The synthetic people marked online in this institution's demo dataset (always 150 once generated). */
export async function demoOnlineCount(tenantId) {
  const [row] = await prisma.$queryRaw`SELECT count(*)::int AS users FROM "analytics_demo_people" WHERE "tenantId" = ${tenantId} AND "online"`;
  return row.users;
}

/**
 * One sampling pass over every institution. A real sample is recorded where the institution collects (a measured
 * zero is meaningful there) or where someone is present anyway (an allow-listed test account). While an institution
 * includes demo data, its simulated online people are recorded into the demo history the same way.
 */
export async function sampleConcurrency({ now = new Date() } = {}) {
  const bucket = bucketOf(now.getTime());
  const since = new Date(now.getTime() - analyticsConfig().presenceTtlMs);
  const tenants = await prisma.$queryRaw`
    SELECT t."id", t."analyticsEnabled" AS collecting, t."analyticsDemoEnabled" AS demo,
      (SELECT count(*) FROM "analytics_presence" p WHERE p."tenantId" = t."id" AND p."lastSeenAt" >= ${utcTimestamp(since)})::int AS live,
      (SELECT count(*) FROM "analytics_demo_people" d WHERE d."tenantId" = t."id" AND d."online")::int AS "demoLive"
    FROM "tenants" t
    WHERE t."analyticsEnabled" OR t."analyticsDemoEnabled" OR EXISTS (SELECT 1 FROM "analytics_presence" p WHERE p."tenantId" = t."id")`;
  for (const tenant of tenants) {
    if (tenant.collecting || tenant.live > 0) {
      await prisma.$executeRaw`
        INSERT INTO "analytics_concurrency" ("tenantId", "bucketStart", "users") VALUES (${tenant.id}, ${utcTimestamp(bucket)}, ${tenant.live})
        ON CONFLICT ("tenantId", "bucketStart") DO UPDATE SET "users" = GREATEST("analytics_concurrency"."users", EXCLUDED."users")`;
    }
    if (tenant.demo && tenant.demoLive > 0) {
      // Under the demo lock, and only if demo data is still included: a reset (which switches it off and deletes the
      // demo rows in one locked transaction) can never be followed by a stray demo sample. Busy (being generated or
      // reset right now): skip this minute.
      await prisma.$transaction(async (tx) => {
        if (!(await tryDemoLock(tx, tenant.id))) return;
        await tx.$executeRaw`
          INSERT INTO "analytics_demo_concurrency" ("tenantId", "bucketStart", "users")
          SELECT t."id", ${utcTimestamp(bucket)}, (SELECT count(*) FROM "analytics_demo_people" d WHERE d."tenantId" = t."id" AND d."online")::int
          FROM "tenants" t WHERE t."id" = ${tenant.id} AND t."analyticsDemoEnabled" AND EXISTS (SELECT 1 FROM "analytics_demo_datasets" s WHERE s."tenantId" = t."id")
          ON CONFLICT ("tenantId", "bucketStart") DO UPDATE SET "users" = GREATEST("analytics_demo_concurrency"."users", EXCLUDED."users")`;
      });
    }
  }
  // Presence rows of people who left without signing out are of no further use after a day.
  await prisma.$executeRaw`DELETE FROM "analytics_presence" WHERE "lastSeenAt" < ${utcTimestamp(new Date(now.getTime() - 86_400_000))}`;
  return tenants.length;
}

/**
 * Concurrency history between two instants, per 5-minute bucket: { at, real, demo } where a side that was not
 * measured is null. `demo` is read only when the institution includes demo data.
 */
export async function concurrencyBuckets(tenantId, from, to, { demo = false } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT "bucketStart" AS at, max(r)::int AS real, max(d)::int AS demo FROM (
      SELECT "bucketStart", "users" AS r, NULL::int AS d FROM "analytics_concurrency"
      WHERE "tenantId" = ${tenantId} AND "bucketStart" >= ${utcTimestamp(from)} AND "bucketStart" < ${utcTimestamp(to)}
      ${demo ? Prisma.sql`UNION ALL SELECT "bucketStart", NULL::int, "users" FROM "analytics_demo_concurrency"
        WHERE "tenantId" = ${tenantId} AND "bucketStart" >= ${utcTimestamp(from)} AND "bucketStart" < ${utcTimestamp(to)}` : Prisma.empty}
    ) s GROUP BY "bucketStart" ORDER BY "bucketStart"`;
  return rows.map((row) => ({ at: row.at, real: row.real, demo: row.demo }));
}

/** The sampler (server.js, inside the analytics worker). Runs only while ANALYTICS_ENABLED is on. */
export function startPresenceSampler({ log = logger } = {}) {
  const config = analyticsConfig();
  if (!config.enabled) return null;
  const timer = setInterval(() => {
    sampleConcurrency().catch((error) => log.warn('Analytics concurrency sample failed', { code: error.code ?? error.name ?? 'error' }));
  }, config.presenceSampleMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
