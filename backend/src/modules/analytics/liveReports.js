import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { CONCURRENCY_BUCKET_MS, analyticsConfig } from './config.js';
import { concurrencyBuckets, demoOnlineCount, liveCount } from './presenceService.js';
import { safeTimezone } from './rollupService.js';

/**
 * Live concurrent users and the concurrency timeline (Admin → Analytics → Overview).
 *
 * Both use one definition (presenceService.js): a person is online while a heartbeat from any of their tabs arrived
 * within the presence window. The live figure counts that now; the timeline shows the highest such count sampled in
 * each interval. While demo data is included, the 150 simulated online people are added and reported separately.
 */

export const CONCURRENCY_WINDOWS = {
  '24h': { ms: 24 * 3_600_000, stepMs: 15 * 60_000 },
  '7d': { ms: 7 * 86_400_000, stepMs: 3_600_000 },
  '30d': { ms: 30 * 86_400_000, stepMs: 4 * 3_600_000 },
};
export const concurrencyQuerySchema = z.object({ window: z.enum(Object.keys(CONCURRENCY_WINDOWS)).optional() }).strict();

async function tenantState(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, analyticsEnabled: true, analyticsDemoEnabled: true } });
  return { ...tenant, collecting: analyticsConfig().enabled && tenant.analyticsEnabled };
}

/** People online right now: real, demo (when included) and the total shown. */
export async function liveReport(tenantId, { now = new Date() } = {}) {
  const tenant = await tenantState(tenantId);
  const [real, demo, [dataset]] = await Promise.all([
    liveCount(tenantId, { now }), tenant.analyticsDemoEnabled ? demoOnlineCount(tenantId) : 0,
    prisma.$queryRaw`SELECT "generatedAt" FROM "analytics_demo_datasets" WHERE "tenantId" = ${tenantId}`,
  ]);
  return {
    // Changes whenever demo data is switched, generated or reset (from Data health or the command line): open
    // Analytics pages compare it on every poll and reload their figures when it changes.
    demoState: `${tenant.analyticsDemoEnabled ? 'on' : 'off'}:${dataset ? dataset.generatedAt.toISOString() : 'none'}`,
    asOf: now,
    real,
    demo: tenant.analyticsDemoEnabled ? demo : null,
    total: real + (tenant.analyticsDemoEnabled ? demo : 0),
    collecting: tenant.collecting,
    demoIncluded: tenant.analyticsDemoEnabled,
    presenceWindowSeconds: Math.round(analyticsConfig().presenceTtlMs / 1000),
  };
}

/**
 * Concurrent people over the last 24 hours, 7 days or 30 days. Each point is the highest count sampled in its
 * interval (sampled every minute into 5-minute buckets); an interval with no sample is a gap (null), never a zero.
 * The last point is the live count now.
 */
export async function concurrencyReport(tenantId, { window = '24h', now = new Date() } = {}) {
  const { ms, stepMs } = CONCURRENCY_WINDOWS[window];
  const tenant = await tenantState(tenantId);
  const end = Math.floor(now.getTime() / CONCURRENCY_BUCKET_MS) * CONCURRENCY_BUCKET_MS + CONCURRENCY_BUCKET_MS;
  const start = Math.floor((now.getTime() - ms) / stepMs) * stepMs + stepMs;
  const buckets = await concurrencyBuckets(tenantId, new Date(start), new Date(end), { demo: tenant.analyticsDemoEnabled });

  const points = [];
  for (let at = start; at < end; at += stepMs) points.push({ at: new Date(at), real: null, demo: null, total: null });
  for (const bucket of buckets) {
    const point = points[Math.floor((bucket.at.getTime() - start) / stepMs)];
    if (!point) continue;
    const total = (bucket.real ?? 0) + (bucket.demo ?? 0);
    // The interval shows its busiest moment, with that moment's real/demo split.
    if (point.total === null || total > point.total) Object.assign(point, { total, real: bucket.real, demo: tenant.analyticsDemoEnabled ? bucket.demo ?? 0 : null }); // real null: not measured then
  }
  const live = await liveReport(tenantId, { now });
  // Nothing is measured (collection off, no demo data): "now" is unknown, not zero.
  const measuring = live.collecting || live.demoIncluded || live.real > 0;
  points.push(measuring ? { at: now, real: live.real, demo: live.demo, total: live.total, live: true } : { at: now, real: null, demo: null, total: null, live: true });

  const measured = points.filter((point) => point.total !== null && !point.live);
  const peak = measured.reduce((best, point) => (!best || point.total > best.total ? point : best), null);
  return {
    window,
    stepMinutes: stepMs / 60_000,
    timezone: safeTimezone(tenant.timezone),
    collecting: tenant.collecting,
    demoIncluded: tenant.analyticsDemoEnabled,
    points,
    peak: peak ? { at: peak.at, total: peak.total, real: peak.real, demo: peak.demo } : null,
    measuredIntervals: measured.length,
  };
}
