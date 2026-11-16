import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { FEATURES, NAV_EXTERNAL_TARGETS, ROLE_KEYS } from '../../../../shared/analyticsCatalog.js';
import { addDays, localDateSql, startOfLocalDate } from './rollupService.js';
import { loginTotals, meta, src } from './reportService.js';

/**
 * Reports built from records the portal already keeps (no new tracking, so they work before collection is
 * switched on): in-app notifications and broadcasts with their read state, and the outcomes the integrations log.
 *
 * What these records do NOT contain is stated in the response rather than invented: there is no email or SMS
 * delivery receipt, no acknowledgement step, and no uptime probe of the connected systems.
 */

const ratio = (part, whole) => (whole > 0 && part !== null && part !== undefined ? part / whole : null);
const window = (ctx, column) => Prisma.sql`${column} >= ${startOfLocalDate(ctx.from, ctx.tz)} AND ${column} < ${startOfLocalDate(addDays(ctx.to, 1), ctx.tz)}`;
const day = (ctx, column) => Prisma.sql`to_char(${localDateSql(column, ctx.tz)}, 'YYYY-MM-DD')`;

/**
 * Notifications with their recipient's roles. With demo data included, the synthetic people's notifications are
 * added (analytics_demo_notifications); broadcasts and course announcements stay real records only.
 */
const notificationSource = (ctx) => {
  const real = Prisma.sql`
    SELECT x."tenantId", x."userId", x."isRead", x."readAt", x."createdAt", x."sourceType", x."category",
      COALESCE((SELECT array_agg(r."key"::text) FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."roleId" WHERE ur."userId" = x."userId"), '{}') AS roles
    FROM "notifications" x WHERE x."tenantId" = ${ctx.tenantId}`;
  if (!ctx.demo) return real;
  return Prisma.sql`${real} UNION ALL
    SELECT d."tenantId", d."userId", d."isRead", d."readAt", d."createdAt", d."sourceType", d."category", p."rolesHeld"::text[]
    FROM "analytics_demo_notifications" d JOIN "analytics_demo_people" p ON p."id" = d."userId" WHERE d."tenantId" = ${ctx.tenantId}`;
};

export async function communicationReport(ctx) {
  const recipientRole = ctx.role ? Prisma.sql`AND ${ctx.role} = ANY(n.roles)` : Prisma.empty;
  const base = Prisma.sql`FROM (${notificationSource(ctx)}) n WHERE n."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`n."createdAt"`)} ${recipientRole}`;
  const measures = Prisma.sql`count(*)::float8 AS sent, count(*) FILTER (WHERE n."isRead")::float8 AS read, count(DISTINCT n."userId")::int AS recipients`;

  const [totals] = await prisma.$queryRaw`
    SELECT ${measures},
      (avg(EXTRACT(EPOCH FROM (n."readAt" - n."createdAt"))) FILTER (WHERE n."readAt" IS NOT NULL) * 1000)::float8 AS "averageMsToRead",
      count(*) FILTER (WHERE n."readAt" IS NOT NULL AND n."readAt" - n."createdAt" <= interval '24 hours')::float8 AS "readWithinDay"
    ${base}`;
  const group = async (expression) => (await prisma.$queryRaw`SELECT ${expression} AS key, ${measures} ${base} GROUP BY 1 ORDER BY 2 DESC`)
    .map((row) => ({ ...row, readRate: ratio(row.read, row.sent) }));

  const roleRows = [];
  if (!ctx.role) {
    const rows = await prisma.$queryRaw`
      SELECT r AS key, ${measures} FROM (${notificationSource(ctx)}) n CROSS JOIN LATERAL unnest(n.roles) r
      WHERE n."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`n."createdAt"`)} GROUP BY 1`;
    for (const role of ROLE_KEYS) {
      const row = rows.find((entry) => entry.key === role);
      if (row) roleRows.push({ ...row, readRate: ratio(row.read, row.sent) });
    }
  }

  const daily = await prisma.$queryRaw`
    SELECT to_char(d, 'YYYY-MM-DD') AS date, COALESCE(s.sent, 0)::float8 AS sent, COALESCE(s.read, 0)::float8 AS read, COALESCE(s.recipients, 0)::int AS recipients
    FROM generate_series(${ctx.from}::date, ${ctx.to}::date, interval '1 day') d
    LEFT JOIN (SELECT ${localDateSql(Prisma.sql`n."createdAt"`, ctx.tz)} AS day, ${measures} ${base} GROUP BY 1) s ON s.day = d::date
    ORDER BY d`;

  const broadcasts = await prisma.$queryRaw`
    SELECT b."id", b."title", b."category", b."priority", b."audienceType", b."audienceLabel", b."sentAt", b."recipientCount"::int AS recipients,
      (SELECT count(*) FROM "notifications" n WHERE n."tenantId" = b."tenantId" AND n."sourceType" = 'BROADCAST' AND n."sourceRefId" = b."id" AND n."isRead")::float8 AS read
    FROM "communication_broadcasts" b
    WHERE b."tenantId" = ${ctx.tenantId} AND b."status" = 'SENT' AND ${window(ctx, Prisma.sql`b."sentAt"`)}
    ORDER BY b."sentAt" DESC LIMIT 100`;
  const broadcastRows = broadcasts.map((row) => ({ ...row, readRate: ratio(row.read, row.recipients) }));
  const audiences = new Map();
  for (const row of broadcasts) {
    const entry = audiences.get(row.audienceType) ?? { key: row.audienceType, broadcasts: 0, recipients: 0, read: 0 };
    entry.broadcasts += 1;
    entry.recipients += row.recipients;
    entry.read += row.read;
    audiences.set(row.audienceType, entry);
  }

  const [announcements] = await prisma.$queryRaw`
    SELECT count(*)::int AS posted,
      (SELECT count(*) FROM "announcement_reads" ar JOIN "announcements" x ON x."id" = ar."announcementId"
        WHERE x."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`x."postedAt"`)})::int AS reads,
      (SELECT count(DISTINCT ar."userId") FROM "announcement_reads" ar JOIN "announcements" x ON x."id" = ar."announcementId"
        WHERE x."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`x."postedAt"`)})::int AS readers
    FROM "announcements" a WHERE a."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`a."postedAt"`)}`;

  return {
    meta: { timezone: ctx.tz, from: ctx.from, to: ctx.to, days: ctx.days, role: ctx.role, today: ctx.today, includesToday: ctx.to === ctx.today, demo: meta(ctx).demo },
    // Which parts include the synthetic dataset while demo data is on.
    demoScope: ctx.demo ? ['notifications'] : [],
    totals: { sent: totals.sent, read: totals.read, readRate: ratio(totals.read, totals.sent), unread: totals.sent - totals.read, recipients: totals.recipients,
          averageMsToRead: totals.averageMsToRead, readWithinDayRate: ratio(totals.readWithinDay, totals.sent) },
    daily: daily.map((row) => ({ date: row.date, sent: row.sent, read: row.read })),
    bySource: await group(Prisma.sql`n."sourceType"`),
    byCategory: await group(Prisma.sql`n."category"`),
    byRole: roleRows,
    broadcasts: broadcastRows,
    byAudience: [...audiences.values()].map((row) => ({ ...row, readRate: ratio(row.read, row.recipients) })),
    courseAnnouncements: { posted: announcements.posted, reads: announcements.reads, readers: announcements.readers },
    // What the portal's records can and cannot say.
    capabilities: { channel: 'IN_APP', deliveryReceipts: false, acknowledgement: false },
  };
}

export async function integrationsReport(ctx) {
  const integrations = await prisma.integration.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { displayName: 'asc' } });
  const logs = await prisma.$queryRaw`
    SELECT l."integrationId" AS id, count(*)::int AS runs,
      count(*) FILTER (WHERE l."status" = 'SUCCESS')::int AS succeeded,
      count(*) FILTER (WHERE l."status" = 'FAILED')::int AS failed,
      count(*) FILTER (WHERE l."status" = 'PARTIAL')::int AS partial,
      avg(l."durationMs") FILTER (WHERE l."durationMs" IS NOT NULL)::float8 AS "averageDurationMs",
      max(l."startedAt") FILTER (WHERE l."status" = 'FAILED') AS "lastFailureAt"
    FROM "integration_sync_logs" l WHERE l."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`l."startedAt"`)} GROUP BY 1`;
  const failures = await prisma.$queryRaw`
    SELECT l."integrationId" AS id, COALESCE(l."outcome", 'ERROR') AS outcome, count(*)::int AS runs
    FROM "integration_sync_logs" l WHERE l."tenantId" = ${ctx.tenantId} AND l."status" IN ('FAILED', 'PARTIAL') AND ${window(ctx, Prisma.sql`l."startedAt"`)} GROUP BY 1, 2 ORDER BY 3 DESC`;
  const operations = await prisma.$queryRaw`
    SELECT o."integrationId" AS id, o."status", count(*)::int AS operations
    FROM "integration_operations" o WHERE o."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`o."createdAt"`)} GROUP BY 1, 2`;
  const daily = await prisma.$queryRaw`
    SELECT to_char(d, 'YYYY-MM-DD') AS date, COALESCE(s.succeeded, 0)::int AS succeeded, COALESCE(s.failed, 0)::int AS failed, COALESCE(s.partial, 0)::int AS partial
    FROM generate_series(${ctx.from}::date, ${ctx.to}::date, interval '1 day') d
    LEFT JOIN (SELECT ${localDateSql(Prisma.sql`l."startedAt"`, ctx.tz)} AS day,
        count(*) FILTER (WHERE l."status" = 'SUCCESS') AS succeeded, count(*) FILTER (WHERE l."status" = 'FAILED') AS failed, count(*) FILTER (WHERE l."status" = 'PARTIAL') AS partial
      FROM "integration_sync_logs" l WHERE l."tenantId" = ${ctx.tenantId} AND ${window(ctx, Prisma.sql`l."startedAt"`)} GROUP BY 1) s ON s.day = d::date
    ORDER BY d`;

  // Institutional sign-in: what the audit trail recorded (successful sign-ins and refusals), not a probe of the provider.
  const providers = await prisma.identityProvider.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, key: true, displayName: true, enabled: true }, orderBy: { displayName: 'asc' } });
  const [sso] = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE "action" = 'SSO_SIGN_IN')::int AS "signIns", count(*) FILTER (WHERE "action" = 'SSO_REFUSED')::int AS refused,
           max("createdAt") FILTER (WHERE "action" = 'SSO_SIGN_IN') AS "lastSignInAt", max("createdAt") FILTER (WHERE "action" = 'SSO_REFUSED') AS "lastRefusalAt"
    FROM "audit_logs" WHERE "tenantId" = ${ctx.tenantId} AND "action" IN ('SSO_SIGN_IN', 'SSO_REFUSED') AND ${window(ctx, Prisma.sql`"createdAt"`)}`;
  const ssoDaily = await prisma.$queryRaw`
    SELECT ${day(ctx, Prisma.sql`"createdAt"`)} AS date, count(*) FILTER (WHERE "action" = 'SSO_SIGN_IN')::int AS "signIns", count(*) FILTER (WHERE "action" = 'SSO_REFUSED')::int AS refused
    FROM "audit_logs" WHERE "tenantId" = ${ctx.tenantId} AND "action" IN ('SSO_SIGN_IN', 'SSO_REFUSED') AND ${window(ctx, Prisma.sql`"createdAt"`)} GROUP BY 1 ORDER BY 1`;
  const activeSessions = await prisma.ssoSession.count({ where: { tenantId: ctx.tenantId, endedAt: null, expiresAt: { gt: new Date() } } });

  return {
    meta: { timezone: ctx.tz, from: ctx.from, to: ctx.to, days: ctx.days, today: ctx.today, includesToday: ctx.to === ctx.today, demo: meta(ctx).demo },
    // How people use the connected services from the portal (usage: includes demo data while it is on). Everything
    // else in this report is the systems' real recorded status, which demo data never changes.
    usage: await connectedServiceUsage(ctx),
    integrations: integrations.map((integration) => {
      const stats = logs.find((row) => row.id === integration.id);
      const ops = operations.filter((row) => row.id === integration.id);
      return {
        id: integration.id, key: integration.key, provider: integration.provider, displayName: integration.displayName,
        mode: integration.mode, enabled: integration.enabled,
        // The status the integration itself last recorded from a real attempt.
        status: integration.status,
        lastAttemptAt: integration.lastAttemptAt, lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
        lastResponseTimeMs: integration.lastResponseTimeMs, lastErrorMessage: integration.lastErrorMessage,
        runs: stats?.runs ?? 0, succeeded: stats?.succeeded ?? 0, failed: stats?.failed ?? 0, partial: stats?.partial ?? 0,
        successRate: stats?.runs ? stats.succeeded / stats.runs : null,
        averageDurationMs: stats?.averageDurationMs ?? null, lastFailureAt: stats?.lastFailureAt ?? null,
        failureReasons: failures.filter((row) => row.id === integration.id).map((row) => ({ outcome: row.outcome, runs: row.runs })),
        operations: {
          total: ops.reduce((sum, row) => sum + row.operations, 0),
          succeeded: ops.find((row) => row.status === 'SUCCEEDED')?.operations ?? 0,
          failed: ops.find((row) => row.status === 'FAILED')?.operations ?? 0,
          needsAttention: ops.filter((row) => ['NEEDS_RECONCILIATION', 'BLOCKED', 'PENDING'].includes(row.status)).reduce((sum, row) => sum + row.operations, 0),
        },
      };
    }),
    daily,
    signIn: {
      providers,
      signIns: sso.signIns, refused: sso.refused, refusalRate: ratio(sso.refused, sso.signIns + sso.refused),
      lastSignInAt: sso.lastSignInAt, lastRefusalAt: sso.lastRefusalAt, activeSessions, daily: ssoDaily,
    },
    // Not monitored: nothing in the portal records the CMS's availability, so none is reported.
    notMonitored: ['Strapi CMS availability', 'Uptime of CampusCore, Moodle or the identity provider between sync attempts'],
  };
}

/** Opening Moodle and CampusCore from the portal, and institutional (SSO) sign-ins: usage, not system health. */
const SERVICE_FEATURES = FEATURES.filter((feature) => ['moodle.opened', 'campuscore.opened'].includes(feature.key));
async function connectedServiceUsage(ctx) {
  const scoped = { ...ctx, role: null, device: null };
  const rows = await prisma.$queryRaw`
    SELECT "fact", "subjectKey" AS key, sum("count")::float8 AS count FROM ${src(scoped, 'rollups')}
    WHERE "tenantId" = ${ctx.tenantId} AND "role" = 'ALL' AND "device" = 'ALL' AND ${Prisma.sql`"localDate" BETWEEN ${ctx.from}::date AND ${ctx.to}::date`}
      AND (("fact" = 'FEATURE' AND "subjectKey" IN (${Prisma.join(SERVICE_FEATURES.map((feature) => feature.key))})) OR ("fact" = 'NAV' AND "subjectKey" IN (${Prisma.join(Object.keys(NAV_EXTERNAL_TARGETS))})))
    GROUP BY 1, 2`;
  const users = await prisma.$queryRaw`
    SELECT "subjectKey" AS key, count(DISTINCT "userId")::int AS users FROM ${src(scoped, 'events')}
    WHERE "tenantId" = ${ctx.tenantId} AND "occurredAt" >= ${startOfLocalDate(ctx.from, ctx.tz)} AND "occurredAt" < ${startOfLocalDate(addDays(ctx.to, 1), ctx.tz)}
      AND (("name" = 'feature.use' AND "subjectKey" IN (${Prisma.join(SERVICE_FEATURES.map((feature) => feature.key))})) OR ("name" = 'nav.click' AND "subjectKey" IN (${Prisma.join(Object.keys(NAV_EXTERNAL_TARGETS))})))
    GROUP BY 1`;
  const count = (key) => rows.filter((row) => row.key === key).reduce((sum, row) => sum + row.count, 0);
  const people = (key) => users.find((row) => row.key === key)?.users ?? 0;
  const logins = await loginTotals(scoped);
  return {
    services: [
      ...SERVICE_FEATURES.map((feature) => ({ key: feature.key, label: feature.label, group: feature.group, uses: count(feature.key), users: people(feature.key) })),
      ...Object.entries(NAV_EXTERNAL_TARGETS).map(([key, label]) => ({ key, label: `Opened ${label} from the sidebar`, group: 'CampusCore', uses: count(key), users: people(key) })),
    ],
    signIns: { total: logins.total, sso: logins.sso, password: logins.password },
  };
}
