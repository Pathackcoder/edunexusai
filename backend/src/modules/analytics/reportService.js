import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { badRequest } from '../../utils/errors.js';
import {
  CONTEXT_KEYS, DEVICE_CLASSES, FEATURES, NAV_EXTERNAL_TARGETS, NAV_SOURCES, PAGE_KEYS, ROLE_KEYS, WIDGETS,
  navTargetLabel, pageByKey,
} from '../../../../shared/analyticsCatalog.js';
import { analyticsConfig } from './config.js';
import { VISIT_BUCKETS, addDays, localDateOf, localDateSql, safeTimezone, startOfLocalDate, utcTimestamp } from './rollupService.js';

/**
 * Admin Analytics reports. Every function takes a report context whose tenantId comes from the signed-in
 * administrator's session, and every query starts with that tenant. Nothing here returns a person (no ids, names
 * or emails): only exact aggregate counts, small ones included, for the institution's own administrators who hold
 * the analytics.view permission.
 *
 * Sources: person-day rows (active people over any range), daily facts (counts, durations) and, inside the raw
 * retention window, the raw rows (exact distinct people per page, feature or widget over the chosen range).
 * Days are the institution's local days.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const reportQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional(),
  from: z.string().regex(DATE).optional(),
  to: z.string().regex(DATE).optional(),
  role: z.enum(ROLE_KEYS).optional(),
  device: z.enum(DEVICE_CLASSES).optional(),
});
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const MAX_RANGE_DAYS = 400;

const dayDiff = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const iso = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value));
const ratio = (part, whole) => (whole > 0 && part !== null && part !== undefined ? part / whole : null);
const num = (value) => Number(value ?? 0);

/** Resolve dates, time zone and filters for one report request. */
export async function reportContext(tenantId, query = {}, { now = new Date() } = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, analyticsEnabled: true, analyticsStartedAt: true } });
  const tz = safeTimezone(tenant.timezone);
  const today = localDateOf(now, tz);
  let to = query.to ?? today;
  let from = query.from ?? addDays(to, -(RANGE_DAYS[query.range ?? '30d'] - 1));
  if (query.from && !query.to) to = today;
  if (Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) throw badRequest('Enter valid dates.');
  if (from > to) throw badRequest('The start date must be on or before the end date.');
  if (to > today) to = today;
  if (from > to) from = to;
  const days = dayDiff(from, to) + 1;
  if (days > MAX_RANGE_DAYS) throw badRequest(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);
  const config = analyticsConfig();
  return {
    tenantId, tz, today, from, to, days,
    prevFrom: addDays(from, -days), prevTo: addDays(from, -1),
    role: query.role ?? null, device: query.device ?? null,
    startedOn: tenant.analyticsStartedAt ? localDateOf(tenant.analyticsStartedAt, tz) : null,
    collecting: tenant.analyticsEnabled && config.enabled,
    // The oldest local day whose raw rows are certainly still held.
    rawFloor: addDays(today, -(config.rawRetentionDays - 1)),
  };
}

const meta = (ctx) => ({
  timezone: ctx.tz, from: ctx.from, to: ctx.to, days: ctx.days, previousFrom: ctx.prevFrom, previousTo: ctx.prevTo,
  role: ctx.role, device: ctx.device, today: ctx.today, includesToday: ctx.to === ctx.today,
  collectingSince: ctx.startedOn, collecting: ctx.collecting,
  uniquesExact: ctx.from >= ctx.rawFloor,
});

/* ----- filters ----- */
const dailyFilter = (ctx) => Prisma.sql`"tenantId" = ${ctx.tenantId}
  ${ctx.role ? Prisma.sql`AND "rolesHeld" @> ARRAY[${ctx.role}]::"RoleKey"[]` : Prisma.empty}
  ${ctx.device ? Prisma.sql`AND "devices" @> ARRAY[${ctx.device}]::"AnalyticsDevice"[]` : Prisma.empty}`;
const rollupFilter = (ctx, fact, { role = ctx.role, device = ctx.device } = {}) => Prisma.sql`"tenantId" = ${ctx.tenantId} AND "fact" = ${fact}
  AND "role" = ${role ?? 'ALL'} AND "device" = ${device ?? 'ALL'}`;
const between = (from, to) => Prisma.sql`"localDate" BETWEEN ${from}::date AND ${to}::date`;
const rawFilter = (ctx, column) => Prisma.sql`"tenantId" = ${ctx.tenantId}
  AND ${column} >= ${startOfLocalDate(ctx.from, ctx.tz)} AND ${column} < ${startOfLocalDate(addDays(ctx.to, 1), ctx.tz)}
  ${ctx.role ? Prisma.sql`AND "rolesHeld" @> ARRAY[${ctx.role}]::"RoleKey"[]` : Prisma.empty}
  ${ctx.device ? Prisma.sql`AND "deviceClass" = ${ctx.device}::"AnalyticsDevice"` : Prisma.empty}`;

/* ----- building blocks ----- */

/**
 * Days of [from, to] on which usage was actually being measured: from the day collection first started (if later
 * than `from`) to `to`. Earlier days were not measured at all, so they are not counted as days with nobody active.
 */
const measuredDays = (ctx, from, to) => {
  const start = ctx.startedOn && ctx.startedOn > from ? ctx.startedOn : from;
  return start > to ? 0 : dayDiff(start, to) + 1;
};

/** Distinct active people, person-days, page views and visible time over [from, to]. */
async function periodTotals(ctx, from, to) {
  const [row] = await prisma.$queryRaw`
    SELECT count(DISTINCT "userId")::int AS users, count(*)::int AS "personDays", COALESCE(sum("pageViews"), 0)::float8 AS "pageViews",
           count(DISTINCT "userId") FILTER (WHERE "pageViews" > 0)::int AS "pageVisitors"
    FROM "analytics_user_daily" WHERE ${dailyFilter(ctx)} AND ${between(from, to)}`;
  const [returning] = await prisma.$queryRaw`
    SELECT count(*)::int AS users FROM (
      SELECT "userId" FROM "analytics_user_daily" WHERE ${dailyFilter(ctx)} AND ${between(from, to)} GROUP BY "userId" HAVING count(*) >= 2) r`;
  const [visit] = await prisma.$queryRaw`
    SELECT COALESCE(sum("count"), 0)::float8 AS visits, COALESCE(sum("durationMs"), 0)::float8 AS ms, COALESCE(sum("durationSamples"), 0)::float8 AS samples
    FROM "analytics_rollups" WHERE ${rollupFilter(ctx, 'VISIT')} AND ${between(from, to)}`;
  const [page] = await prisma.$queryRaw`
    SELECT COALESCE(sum("durationMs"), 0)::float8 AS ms, COALESCE(sum("durationSamples"), 0)::float8 AS samples
    FROM "analytics_rollups" WHERE ${rollupFilter(ctx, 'PAGE')} AND ${between(from, to)}`;
  const days = measuredDays(ctx, from, to);
  return {
    users: row.users,
    pageViews: row.pageViews,
    // Distinct people who opened at least one page (one person opening ten pages is one visitor, ten page views).
    pageVisitors: row.pageVisitors,
    personDays: row.personDays,
    measuredDays: days,
    visits: visit.visits,
    returningUsers: returning.users,
    returningRate: ratio(returning.users, row.users),
    // Average daily active users: person-days ÷ measured days (each person counts once per day they were active).
    averageDailyUsers: days ? row.personDays / days : null,
    averageVisibleMs: page.samples ? page.ms / page.samples : null,
    averageVisitMs: visit.samples ? visit.ms / visit.samples : null,
    pageViewsPerVisit: ratio(row.pageViews, visit.visits),
  };
}

async function trailingUsers(ctx, to, days) {
  const [row] = await prisma.$queryRaw`
    SELECT count(DISTINCT "userId")::int AS users FROM "analytics_user_daily" WHERE ${dailyFilter(ctx)} AND ${between(addDays(to, -(days - 1)), to)}`;
  return row.users;
}

/** One point per local day (days with nobody are present with zeros). */
async function dailySeries(ctx) {
  const rows = await prisma.$queryRaw`
    SELECT to_char(d, 'YYYY-MM-DD') AS date, COALESCE(u.users, 0)::int AS users, COALESCE(u.views, 0)::float8 AS "pageViews", COALESCE(v.visits, 0)::float8 AS visits
    FROM generate_series(${ctx.from}::date, ${ctx.to}::date, interval '1 day') d
    LEFT JOIN (SELECT "localDate", count(*) AS users, sum("pageViews") AS views FROM "analytics_user_daily"
               WHERE ${dailyFilter(ctx)} AND ${between(ctx.from, ctx.to)} GROUP BY "localDate") u ON u."localDate" = d::date
    LEFT JOIN (SELECT "localDate", sum("count") AS visits FROM "analytics_rollups"
               WHERE ${rollupFilter(ctx, 'VISIT')} AND ${between(ctx.from, ctx.to)} GROUP BY "localDate") v ON v."localDate" = d::date
    ORDER BY d`;
  return rows.map((row) => ({ ...row, beforeCollection: !ctx.startedOn || row.date < ctx.startedOn, partial: row.date === ctx.today }));
}

/** Facts summed over the range, per subject. */
async function factTotals(ctx, fact, from = ctx.from, to = ctx.to, filter = {}) {
  const rows = await prisma.$queryRaw`
    SELECT "subjectKey" AS key, sum("count")::float8 AS count, max("uniqueUsers")::int AS "peakDailyUsers",
           sum("durationMs")::float8 AS ms, sum("durationSamples")::float8 AS samples
    FROM "analytics_rollups" WHERE ${rollupFilter(ctx, fact, filter)} AND ${between(from, to)} GROUP BY "subjectKey"`;
  return new Map(rows.map((row) => [row.key, row]));
}

/**
 * Distinct people per subject over the whole range. Exact while the range lies inside the raw window; for older
 * ranges the busiest single day is used instead (a lower bound; the response flags it with `uniquesExact: false`).
 */
async function rangeUsers(ctx, kind, totals) {
  if (ctx.from < ctx.rawFloor) return new Map([...totals].map(([key, row]) => [key, row.peakDailyUsers]));
  const rows = kind === 'page'
    ? await prisma.$queryRaw`SELECT "pageKey" AS key, count(DISTINCT "userId")::int AS users FROM "analytics_page_views" WHERE ${rawFilter(ctx, Prisma.sql`"startedAt"`)} GROUP BY "pageKey"`
    : await prisma.$queryRaw`SELECT "subjectKey" AS key, count(DISTINCT "userId")::int AS users FROM "analytics_events" WHERE ${rawFilter(ctx, Prisma.sql`"occurredAt"`)} AND "name" = ${kind} AND "subjectKey" IS NOT NULL GROUP BY "subjectKey"`;
  return new Map(rows.map((row) => [row.key, row.users]));
}

const withChange = (current, previous) => ({ value: current, previous, change: previous ? (current - previous) / previous : null });

/* ----- reports ----- */

export async function overviewReport(ctx) {
  const [current, previous, wau, mau, series] = await Promise.all([
    periodTotals(ctx, ctx.from, ctx.to), periodTotals(ctx, ctx.prevFrom, ctx.prevTo), trailingUsers(ctx, ctx.to, 7), trailingUsers(ctx, ctx.to, 30), dailySeries(ctx),
  ]);
  const previousComparable = Boolean(ctx.startedOn) && ctx.prevFrom >= ctx.startedOn;
  const kpi = (field) => withChange(current[field], previousComparable ? previous[field] : null);
  const [pages, features, devices] = await Promise.all([pagesReport(ctx), featuresReport(ctx), devicesReport(ctx)]);
  return {
    meta: meta(ctx),
    hasData: current.users > 0,
    previousComparable,
    // How the averages were formed, so the interface can say so: days measured in the range, and person-days.
    basis: { measuredDays: current.measuredDays, personDays: current.personDays, rangeDays: ctx.days },
    kpis: {
      activeUsers: kpi('users'),
      averageDailyUsers: kpi('averageDailyUsers'),
      weeklyActiveUsers: { value: wau },
      monthlyActiveUsers: { value: mau },
      stickiness: { value: mau ? ratio(await averageDailyOver(ctx, 30), mau) : null },
      pageViews: kpi('pageViews'),
      pageVisitors: kpi('pageVisitors'),
      visits: kpi('visits'),
      averageVisibleMs: kpi('averageVisibleMs'),
      averageVisitMs: kpi('averageVisitMs'),
      pageViewsPerVisit: kpi('pageViewsPerVisit'),
      returningUsers: kpi('returningUsers'),
      returningRate: kpi('returningRate'),
    },
    series,
    topPages: pages.pages.filter((row) => row.views > 0).slice(0, 6),
    unusedPages: pages.pages.filter((row) => row.views === 0).length,
    trackedPages: pages.pages.length,
    topFeatures: features.features.filter((row) => row.uses > 0).slice(0, 6),
    unusedFeatures: features.features.filter((row) => row.uses === 0).map((row) => row.label),
    devices: devices.distribution,
  };
}

/** Average daily active people over the `days` ending at ctx.to (the numerator of stickiness). */
async function averageDailyOver(ctx, days) {
  const [row] = await prisma.$queryRaw`
    SELECT count(*)::float8 AS "personDays" FROM "analytics_user_daily" WHERE ${dailyFilter(ctx)} AND ${between(addDays(ctx.to, -(days - 1)), ctx.to)}`;
  const counted = measuredDays(ctx, addDays(ctx.to, -(days - 1)), ctx.to);
  return counted ? row.personDays / counted : null;
}

export async function activityReport(ctx) {
  const series = await dailySeries(ctx);
  const rolling = await prisma.$queryRaw`
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
      (SELECT count(DISTINCT "userId") FROM "analytics_user_daily" WHERE ${dailyFilter(ctx)} AND "localDate" BETWEEN d::date - 6 AND d::date)::int AS wau,
      (SELECT count(DISTINCT "userId") FROM "analytics_user_daily" WHERE ${dailyFilter(ctx)} AND "localDate" BETWEEN d::date - 29 AND d::date)::int AS mau
    FROM generate_series(${ctx.from}::date, ${ctx.to}::date, interval '1 day') d ORDER BY d`;

  // By role held. A person with two roles is counted under both, so these rows do not add up to the total.
  const roleCtx = (role) => ({ ...ctx, role });
  const accounts = await prisma.$queryRaw`
    SELECT r."key"::text AS role, count(DISTINCT u."id")::int AS accounts
    FROM "users" u JOIN "user_roles" ur ON ur."userId" = u."id" JOIN "roles" r ON r."id" = ur."roleId"
    WHERE u."tenantId" = ${ctx.tenantId} AND u."status" = 'ACTIVE' AND u."analyticsExcludedAt" IS NULL GROUP BY r."key"`;
  const accountsByRole = new Map(accounts.map((row) => [row.role, row.accounts]));
  const roles = [];
  for (const role of ctx.role ? [ctx.role] : ROLE_KEYS) {
    const totals = await periodTotals(roleCtx(role), ctx.from, ctx.to);
    const held = accountsByRole.get(role) ?? 0;
    if (!held && !totals.users) continue;
    roles.push({ role, accounts: held, users: totals.users, activeShare: ratio(totals.users, held), pageViews: totals.pageViews, visits: totals.visits, averageDailyUsers: totals.averageDailyUsers, returningRate: totals.returningRate });
  }

  // Where page views happened (additive: each page view belongs to exactly one workspace).
  const contextRows = await prisma.$queryRaw`
    SELECT to_char("localDate", 'YYYY-MM-DD') AS date, "subjectKey" AS context, "count"::float8 AS views, "uniqueUsers"::int AS users
    FROM "analytics_rollups" WHERE ${rollupFilter(ctx, 'CONTEXT', { role: null })} AND ${between(ctx.from, ctx.to)}`;
  const contextTotals = new Map();
  const contextByDate = new Map();
  for (const row of contextRows) {
    const total = contextTotals.get(row.context) ?? { context: row.context, views: 0, peakDailyUsers: 0 };
    total.views += row.views;
    total.peakDailyUsers = Math.max(total.peakDailyUsers, row.users);
    contextTotals.set(row.context, total);
    const day = contextByDate.get(row.date) ?? {};
    day[row.context] = row.views;
    contextByDate.set(row.date, day);
  }
  const contexts = CONTEXT_KEYS.filter((key) => contextTotals.has(key));
  const allContextViews = [...contextTotals.values()].reduce((sum, row) => sum + row.views, 0);

  // Peak hours: for each weekday and hour, the average number of distinct people active in that hour.
  const hourRows = await prisma.$queryRaw`
    SELECT EXTRACT(ISODOW FROM "localDate")::int AS weekday, "subjectKey" AS hour, sum("uniqueUsers")::float8 AS people, max("uniqueUsers")::int AS peak
    FROM "analytics_rollups" WHERE ${rollupFilter(ctx, 'HOUR')} AND ${between(ctx.from, ctx.to)} GROUP BY 1, 2`;
  const measuredFrom = ctx.startedOn && ctx.startedOn > ctx.from ? ctx.startedOn : ctx.from;
  const weekdayDays = Array(8).fill(0);
  for (let date = measuredFrom; date <= ctx.to; date = addDays(date, 1)) weekdayDays[new Date(`${date}T00:00:00Z`).getUTCDay() || 7] += 1;
  const heatmap = hourRows.map((row) => ({ weekday: row.weekday, hour: Number(row.hour), value: weekdayDays[row.weekday] ? row.people / weekdayDays[row.weekday] : 0, peak: row.peak }));

  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const points = series.filter((point) => !point.beforeCollection && (new Date(`${point.date}T00:00:00Z`).getUTCDay() || 7) === weekday);
    return { weekday, days: points.length, averageUsers: points.length ? points.reduce((sum, point) => sum + point.users, 0) / points.length : null };
  });

  const signIns = await factTotals(ctx, 'AUTH');
  const signInRows = ['SSO', 'PASSWORD'].map((method) => ({ method, signIns: signIns.get(method)?.count ?? 0, users: signIns.get(method)?.peakDailyUsers ?? 0 }));

  return {
    meta: meta(ctx),
    series,
    // Days before collection began were not measured: no value (a gap), never a zero.
    rolling: rolling.map((row) => (ctx.startedOn && row.date >= ctx.startedOn ? row : { date: row.date, wau: null, mau: null, beforeCollection: true })),
    roles,
    contexts: {
      keys: contexts,
      totals: contexts.map((key) => ({ ...contextTotals.get(key), share: ratio(contextTotals.get(key).views, allContextViews) })),
      series: [...contextByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values })),
    },
    heatmap,
    weekdays,
    signIns: signInRows.map(({ users: _people, ...row }) => row),
  };
}

export async function pagesReport(ctx) {
  const [current, previous] = await Promise.all([factTotals(ctx, 'PAGE'), factTotals(ctx, 'PAGE', ctx.prevFrom, ctx.prevTo)]);
  const users = await rangeUsers(ctx, 'page', current);
  const comparable = Boolean(ctx.startedOn) && ctx.prevFrom >= ctx.startedOn;
  const rows = PAGE_KEYS.map((key) => pageByKey(key))
    // With a role filter, only pages that role can open are listed (so "no visits" is meaningful).
    .filter((page) => !ctx.role || !page.roles || page.roles.includes(ctx.role))
    .map((page) => {
      const row = current.get(page.key);
      return {
        key: page.key, label: page.label, section: page.section, audience: page.roles,
        views: row?.count ?? 0,
        users: users.get(page.key) ?? 0,
        averageVisibleMs: row?.samples ? row.ms / row.samples : null,
        previousViews: comparable ? previous.get(page.key)?.count ?? 0 : null,
      };
    })
    .sort((a, b) => b.views - a.views || a.label.localeCompare(b.label));
  const totalViews = rows.reduce((sum, row) => sum + row.views, 0);
  const pages = rows.map((row) => ({ ...row, share: ratio(row.views, totalViews) }));
  const sections = new Map();
  for (const row of rows) {
    const section = sections.get(row.section) ?? { section: row.section, views: 0, pages: 0, unused: 0 };
    section.views += row.views;
    section.pages += 1;
    if (!row.views) section.unused += 1;
    sections.set(row.section, section);
  }
  return { meta: meta(ctx), totalViews, pages, sections: [...sections.values()].sort((a, b) => b.views - a.views) };
}

/** Drill-down for one page: its daily trend and its split by role held and by device. */
export async function pageDetailReport(ctx, pageKey) {
  const page = pageByKey(pageKey);
  if (!page) throw badRequest('Unknown page.');
  const series = await prisma.$queryRaw`
    SELECT to_char(d, 'YYYY-MM-DD') AS date, COALESCE(r."count", 0)::float8 AS views, COALESCE(r."uniqueUsers", 0)::int AS users
    FROM generate_series(${ctx.from}::date, ${ctx.to}::date, interval '1 day') d
    LEFT JOIN "analytics_rollups" r ON r."localDate" = d::date AND r."subjectKey" = ${pageKey} AND ${Prisma.sql`r."tenantId" = ${ctx.tenantId} AND r."fact" = 'PAGE' AND r."role" = ${ctx.role ?? 'ALL'} AND r."device" = ${ctx.device ?? 'ALL'}`}
    ORDER BY d`;
  const exact = ctx.from >= ctx.rawFloor;
  const split = async (dimension) => {
    const keys = dimension === 'role' ? ROLE_KEYS : DEVICE_CLASSES;
    const rows = [];
    for (const key of keys) {
      const scoped = { ...ctx, [dimension]: key };
      const totals = (await factTotals(scoped, 'PAGE')).get(pageKey);
      if (!totals) continue;
      const people = exact ? (await rangeUsers(scoped, 'page', new Map())).get(pageKey) ?? 0 : totals.peakDailyUsers;
      rows.push({ key, views: totals.count, users: people, averageVisibleMs: totals.samples ? totals.ms / totals.samples : null });
    }
    return rows;
  };
  return {
    meta: meta(ctx),
    page: { key: page.key, label: page.label, section: page.section },
    series,
    byRole: ctx.role ? [] : await split('role'),
    byDevice: ctx.device ? [] : await split('device'),
  };
}

export async function navigationReport(ctx) {
  const [targets, sources] = await Promise.all([factTotals(ctx, 'NAV'), factTotals(ctx, 'NAV_SOURCE')]);
  const users = await rangeUsers(ctx, 'nav.click', targets);
  const totalClicks = [...targets.values()].reduce((sum, row) => sum + row.count, 0);
  const pageTargets = PAGE_KEYS.map((key) => pageByKey(key)).filter((page) => !ctx.role || !page.roles || page.roles.includes(ctx.role))
    .map((page) => ({ key: page.key, label: page.label, section: page.section }));
  const externalTargets = Object.keys(NAV_EXTERNAL_TARGETS).map((key) => ({ key, label: navTargetLabel(key), section: 'University systems' }));
  const rows = [...pageTargets, ...externalTargets]
    .map((target) => ({ ...target, clicks: targets.get(target.key)?.count ?? 0, users: users.get(target.key) ?? 0 }))
    .map((row) => ({ ...row, share: ratio(row.clicks, totalClicks) }))
    .sort((a, b) => b.clicks - a.clicks || a.label.localeCompare(b.label));
  const sectionTotals = new Map();
  for (const row of rows) sectionTotals.set(row.section, (sectionTotals.get(row.section) ?? 0) + row.clicks);
  const sourceRows = NAV_SOURCES.map((source) => ({ source, clicks: sources.get(source)?.count ?? 0, users: sources.get(source)?.peakDailyUsers ?? 0 }));
  const sourceClicks = sourceRows.reduce((sum, row) => sum + row.clicks, 0);
  return {
    meta: meta(ctx),
    totalClicks,
    targets: rows,
    sections: [...sectionTotals.entries()].map(([section, clicks]) => ({ section, clicks, share: ratio(clicks, totalClicks) })).sort((a, b) => b.clicks - a.clicks),
    sources: sourceRows.map(({ users: _people, ...row }) => ({ ...row, share: ratio(row.clicks, sourceClicks) })),
  };
}

export async function featuresReport(ctx) {
  // Completed actions are recorded by the API and carry no device, so a device filter would hide them.
  const scoped = { ...ctx, device: null };
  const [totals, period] = await Promise.all([factTotals(scoped, 'FEATURE'), periodTotals(scoped, ctx.from, ctx.to)]);
  const users = await rangeUsers(scoped, 'feature.use', totals);
  const previous = await factTotals(scoped, 'FEATURE', ctx.prevFrom, ctx.prevTo);
  const comparable = Boolean(ctx.startedOn) && ctx.prevFrom >= ctx.startedOn;
  const rows = FEATURES.map((feature) => {
    const people = users.get(feature.key) ?? 0;
    return {
      key: feature.key, label: feature.label, group: feature.group, stage: feature.stage, origin: feature.origin,
      uses: totals.get(feature.key)?.count ?? 0,
      users: people,
      adoptionRate: ratio(people, period.users),
      usesPerUser: ratio(totals.get(feature.key)?.count ?? 0, people),
      previousUses: comparable ? previous.get(feature.key)?.count ?? 0 : null,
    };
  });
  return {
    meta: { ...meta(ctx), device: null },
    activeUsers: period.users,
    features: rows,
  };
}

export async function widgetsReport(ctx) {
  const [impressions, interactions] = await Promise.all([factTotals(ctx, 'WIDGET_IMPRESSION'), factTotals(ctx, 'WIDGET_INTERACTION')]);
  const [viewers, interactors] = await Promise.all([rangeUsers(ctx, 'widget.impression', impressions), rangeUsers(ctx, 'widget.interact', interactions)]);
  const rows = WIDGETS.filter((widget) => !ctx.role || widget.role === ctx.role).map((widget) => {
    const seen = viewers.get(widget.key) ?? 0;
    const used = interactors.get(widget.key) ?? 0;
    return {
      key: widget.key, label: widget.label, dashboard: widget.dashboard,
      impressions: impressions.get(widget.key)?.count ?? 0,
      users: seen,
      interactions: interactions.get(widget.key)?.count ?? 0,
      // People who used it are a subset of the people who saw it; fewer than five of them is withheld as well.
      interactors: used,
      engagementRate: ratio(used, seen),
    };
  })
    .sort((a, b) => b.impressions - a.impressions || a.label.localeCompare(b.label));
  return { meta: meta(ctx), widgets: rows };
}

export async function devicesReport(ctx) {
  const scoped = { ...ctx, device: null };
  const visitRows = await prisma.$queryRaw`
    SELECT "device", sum("count")::float8 AS visits, sum("durationMs")::float8 AS ms, sum("durationSamples")::float8 AS samples
    FROM "analytics_rollups" WHERE "tenantId" = ${ctx.tenantId} AND "fact" = 'VISIT' AND "role" = ${ctx.role ?? 'ALL'} AND "device" IN (${Prisma.join(DEVICE_CLASSES)})
      AND ${between(ctx.from, ctx.to)} GROUP BY "device"`;
  const people = await prisma.$queryRaw`
    SELECT d::text AS device, count(DISTINCT "userId")::int AS users
    FROM "analytics_user_daily" CROSS JOIN LATERAL unnest("devices") d WHERE ${dailyFilter(scoped)} AND ${between(ctx.from, ctx.to)} GROUP BY d`;
  const peopleByDevice = new Map(people.map((row) => [row.device, row.users]));
  const totalVisits = visitRows.reduce((sum, row) => sum + row.visits, 0);
  const distribution = DEVICE_CLASSES.map((device) => {
    const row = visitRows.find((entry) => entry.device === device);
    return { device, visits: row?.visits ?? 0, users: peopleByDevice.get(device) ?? 0, share: ratio(row?.visits ?? 0, totalVisits), averageVisitMs: row?.samples ? row.ms / row.samples : null };
  });

  const trendRows = await prisma.$queryRaw`
    SELECT to_char("localDate", 'YYYY-MM-DD') AS date, "device", "count"::float8 AS visits
    FROM "analytics_rollups" WHERE "tenantId" = ${ctx.tenantId} AND "fact" = 'VISIT' AND "role" = ${ctx.role ?? 'ALL'} AND "device" IN (${Prisma.join(DEVICE_CLASSES)})
      AND ${between(ctx.from, ctx.to)}`;
  const trend = new Map();
  for (const row of trendRows) {
    const day = trend.get(row.date) ?? { date: row.date };
    day[row.device] = row.visits;
    trend.set(row.date, day);
  }

  // Device by role held: exact people only inside the raw window.
  let byRole = null;
  if (ctx.from >= ctx.rawFloor) {
    const rows = await prisma.$queryRaw`
      SELECT r::text AS role, "deviceClass"::text AS device, count(*)::float8 AS visits, count(DISTINCT "userId")::int AS users
      FROM "analytics_visits" CROSS JOIN LATERAL unnest("rolesHeld") r
      WHERE ${rawFilter(scoped, Prisma.sql`"startedAt"`)} GROUP BY 1, 2`;
    byRole = (ctx.role ? [ctx.role] : ROLE_KEYS).map((role) => {
      const cells = DEVICE_CLASSES.map((device) => {
        const row = rows.find((entry) => entry.role === role && entry.device === device);
        return { device, visits: row?.visits ?? 0, users: row?.users ?? 0 };
      });
      const total = cells.reduce((sum, cell) => sum + cell.visits, 0);
      return { role, total, cells: cells.map((cell) => ({ ...cell, share: ratio(cell.visits, total) })) };
    }).filter((row) => row.total > 0);
  }

  const buckets = await factTotals(ctx, 'VISIT_DURATION');
  const [visitTotals] = await prisma.$queryRaw`
    SELECT COALESCE(sum("count"), 0)::float8 AS visits, COALESCE(sum("durationMs"), 0)::float8 AS ms, COALESCE(sum("durationSamples"), 0)::float8 AS samples, COALESCE(max("uniqueUsers"), 0)::int AS peak
    FROM "analytics_rollups" WHERE ${rollupFilter(ctx, 'VISIT')} AND ${between(ctx.from, ctx.to)}`;
  const [pageTime] = await prisma.$queryRaw`
    SELECT COALESCE(sum("durationMs"), 0)::float8 AS ms FROM "analytics_rollups" WHERE ${rollupFilter(ctx, 'PAGE')} AND ${between(ctx.from, ctx.to)}`;
  const period = await periodTotals(ctx, ctx.from, ctx.to);
  return {
    meta: meta(ctx),
    distribution,
    trend: [...trend.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byRole,
    visits: {
      total: visitTotals.visits,
      averageVisitMs: visitTotals.samples ? visitTotals.ms / visitTotals.samples : null,
      // Time the portal was actually on screen and in use, per visit (always at most the visit's length).
      averageActiveMs: visitTotals.visits ? Math.min(pageTime.ms / visitTotals.visits, visitTotals.samples ? visitTotals.ms / visitTotals.samples : Infinity) : null,
      visitsPerUser: ratio(visitTotals.visits, period.users),
    },
    durations: VISIT_BUCKETS.map(([key]) => ({ bucket: key, visits: buckets.get(key)?.count ?? 0, share: ratio(buckets.get(key)?.count ?? 0, visitTotals.visits) })),
  };
}

/** Is the analytics itself trustworthy and up to date? No person-level data. */
export async function dataHealthReport(ctx, { rejections = {} } = {}) {
  const config = analyticsConfig();
  const runs = await prisma.$queryRaw`
    SELECT to_char("localDate", 'YYYY-MM-DD') AS date, "status"::text AS status, "finishedAt", "durationMs", "errorCode"
    FROM "analytics_rollup_runs" WHERE "tenantId" = ${ctx.tenantId} AND "localDate" >= ${addDays(ctx.today, -13)}::date ORDER BY "localDate" DESC`;
  const [last] = await prisma.$queryRaw`
    SELECT max("finishedAt") AS at FROM "analytics_rollup_runs" WHERE "tenantId" = ${ctx.tenantId} AND "status" <> 'FAILED'`;
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [recent] = await prisma.$queryRaw`
    SELECT (SELECT max("receivedAt") FROM "analytics_events" WHERE "tenantId" = ${ctx.tenantId}) AS "lastEventAt",
           (SELECT max("lastSeenAt") FROM "analytics_page_views" WHERE "tenantId" = ${ctx.tenantId}) AS "lastPageViewAt",
           (SELECT count(*) FROM "analytics_events" WHERE "tenantId" = ${ctx.tenantId} AND "occurredAt" >= ${utcTimestamp(dayAgo)})::int AS "events24h",
           (SELECT count(*) FROM "analytics_page_views" WHERE "tenantId" = ${ctx.tenantId} AND "startedAt" >= ${utcTimestamp(dayAgo)})::int AS "pageViews24h"`;
  const weekAgo = startOfLocalDate(addDays(ctx.today, -6), ctx.tz);
  const [coverage] = await prisma.$queryRaw`
    SELECT count(*)::int AS views, count(*) FILTER (WHERE "visibleMs" >= 1000)::int AS timed
    FROM "analytics_page_views" WHERE "tenantId" = ${ctx.tenantId} AND "startedAt" >= ${weekAgo}`;
  const [oldest] = await prisma.$queryRaw`
    SELECT to_char(min(${localDateSql(Prisma.sql`"startedAt"`, ctx.tz)}), 'YYYY-MM-DD') AS date FROM "analytics_page_views" WHERE "tenantId" = ${ctx.tenantId}`;
  const [excluded] = await prisma.$queryRaw`SELECT count(*)::int AS accounts FROM "users" WHERE "tenantId" = ${ctx.tenantId} AND "analyticsExcludedAt" IS NOT NULL`;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { analyticsEnabled: true, analyticsStartedAt: true } });
  return {
    meta: meta(ctx),
    collection: {
      deploymentEnabled: config.enabled,
      institutionEnabled: tenant.analyticsEnabled,
      collecting: config.enabled && tenant.analyticsEnabled,
      startedAt: tenant.analyticsStartedAt,
      excludedAccounts: excluded.accounts,
    },
    freshness: {
      lastAggregationAt: last?.at ?? null,
      aggregationIntervalSeconds: Math.round(config.rollupIntervalMs / 1000),
      lastActivityReceivedAt: [recent.lastEventAt, recent.lastPageViewAt].filter(Boolean).sort((a, b) => b - a)[0] ?? null,
      events24h: recent.events24h,
      pageViews24h: recent.pageViews24h,
    },
    runs,
    failedRuns: runs.filter((run) => run.status === 'FAILED').length,
    coverage: {
      // Page views whose visible time was measured (the rest closed within a second or lost their heartbeat).
      timedPageViewShare: coverage.views >= 20 ? coverage.timed / coverage.views : null,
      pageViews7d: coverage.views,
      trackedPages: PAGE_KEYS.length,
      trackedWidgets: WIDGETS.length,
      trackedFeatures: FEATURES.length,
    },
    rejections: { sinceRestart: rejections },
    retention: {
      rawDays: config.rawRetentionDays,
      personDayDays: config.userDailyRetentionDays,
      aggregateDays: config.rollupRetentionDays,
      oldestRawDate: oldest?.date ?? null,
    },
  };
}
