import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import {
  ANALYTICS_SCHEMA_VERSION, DASHBOARD_VIEW_ROLES, DEVICE_CLASSES, FEATURES, NAV_SOURCES, PAGE_KEYS, WIDGETS, WIDGET_ACTIONS,
  featureByKey, isNavTarget, resolveContextRole,
} from '../../../../shared/analyticsCatalog.js';
import { MAX_BATCH_EVENTS, MAX_EVENT_AGE_MS, MAX_FUTURE_SKEW_MS, PAGE_VISIBLE_CAP_MS } from './config.js';
import { utcTimestamp } from './rollupService.js';

/**
 * Event ingestion.
 *
 * What the browser sends is only ever: ids it generated, catalogue keys, enums, timestamps and a visible-time
 * counter. Every schema is strict, so an unknown property (a URL, text, anything) rejects that event. The person,
 * the institution, the roles and the workspace a page belongs to are taken from the authenticated request.
 *
 * Idempotent by construction: a visit and a page view are upserts whose counters only grow (GREATEST), and discrete
 * events are inserted by their own id, so sending the same batch twice changes nothing.
 */

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const pageKey = z.enum(PAGE_KEYS);
const view = z.enum(Object.keys(DASHBOARD_VIEW_ROLES));
const base = { eventId: uuid, at: instant };
const BROWSER_FEATURES = FEATURES.filter((feature) => feature.origin === 'BROWSER').map((feature) => feature.key);
const pageTime = { ...base, pageViewId: uuid, pageKey, view: view.optional(), visibleMs: z.number().int().min(0).max(24 * 60 * 60 * 1000) };

const eventSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('page.view'), ...base, pageViewId: uuid, pageKey, view: view.optional() }).strict(),
  z.object({ name: z.literal('page.ping'), ...pageTime }).strict(),
  z.object({ name: z.literal('page.exit'), ...pageTime }).strict(),
  z.object({ name: z.literal('nav.click'), ...base, targetKey: z.string().max(64).refine(isNavTarget), source: z.enum(NAV_SOURCES), pageKey: pageKey.optional() }).strict(),
  z.object({ name: z.literal('widget.impression'), ...base, pageViewId: uuid, pageKey, widgetKey: z.enum(WIDGETS.map((w) => w.key)) }).strict(),
  z.object({ name: z.literal('widget.interact'), ...base, pageViewId: uuid, pageKey, widgetKey: z.enum(WIDGETS.map((w) => w.key)), action: z.enum(WIDGET_ACTIONS) }).strict(),
  z.object({ name: z.literal('feature.use'), ...base, featureKey: z.enum(BROWSER_FEATURES), action: z.string().max(32).optional(), pageKey: pageKey.optional() }).strict(),
]);

/** The batch envelope. Its events are validated one by one, so a single bad event never discards the others. */
export const envelopeSchema = z.object({
  schemaVersion: z.literal(ANALYTICS_SCHEMA_VERSION),
  sentAt: instant,
  visitId: uuid,
  visitStartedAt: instant,
  deviceClass: z.enum(DEVICE_CLASSES),
  events: z.array(z.unknown()).min(1).max(MAX_BATCH_EVENTS),
}).strict();

/** Rejections since this process started, by reason code (Data health). Never the rejected content. */
export const rejectionCounters = { INVALID: 0, STALE: 0, NOT_PERMITTED: 0, FOREIGN_ID: 0 };

export async function ingest(auth, envelope, { now = new Date() } = {}) {
  const nowMs = now.getTime();
  // The browser's clock may be wrong; its own send time tells us by how much.
  const skew = nowMs - Date.parse(envelope.sentAt);
  const corrected = (iso) => Date.parse(iso) + skew;
  const inWindow = (ms) => ms >= nowMs - MAX_EVENT_AGE_MS && ms <= nowMs + MAX_FUTURE_SKEW_MS;
  const rolesHeld = auth.roles ?? [];
  const result = { accepted: 0, duplicates: 0, rejected: 0 };
  const reject = (reason, count = 1) => { result.rejected += count; rejectionCounters[reason] += count; };

  const pageViews = new Map();
  const discrete = [];
  let entryPageKey = null;
  let lastSeen = 0;

  for (const raw of envelope.events) {
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) { reject('INVALID'); continue; }
    const event = parsed.data;
    if (event.name === 'feature.use') {
      // A feature's sub-type must be one of its own listed actions (and absent when it has none).
      const actions = featureByKey(event.featureKey).actions;
      if (actions ? event.action !== undefined && !actions.includes(event.action) : event.action !== undefined) { reject('INVALID'); continue; }
    }
    const at = corrected(event.at);
    if (!inWindow(at)) { reject('STALE'); continue; }

    if (event.name.startsWith('page.')) {
      const contextRole = resolveContextRole(event.pageKey, { rolesHeld, view: event.view ?? null });
      // A page this account's roles cannot open: the event is not believable.
      if (!contextRole) { reject('NOT_PERMITTED'); continue; }
      const visibleMs = Math.min(event.visibleMs ?? 0, PAGE_VISIBLE_CAP_MS);
      const existing = pageViews.get(event.pageViewId);
      if (existing && existing.pageKey !== event.pageKey) { reject('INVALID'); continue; }
      const merged = existing ?? { id: event.pageViewId, pageKey: event.pageKey, contextRole, viewAt: null, impliedStart: Infinity, lastSeenAt: at, visibleMs: 0, events: 0 };
      // The view's own start time wins. A heartbeat whose page.view was lost still creates the row: it began
      // about `visibleMs` earlier.
      if (event.name === 'page.view') merged.viewAt = Math.min(merged.viewAt ?? at, at);
      else merged.impliedStart = Math.min(merged.impliedStart, at - visibleMs);
      merged.lastSeenAt = Math.max(merged.lastSeenAt, at);
      merged.visibleMs = Math.max(merged.visibleMs, visibleMs);
      merged.events += 1;
      pageViews.set(event.pageViewId, merged);
      if (event.name === 'page.view' && !entryPageKey) entryPageKey = event.pageKey;
    } else {
      // Where the event happened must also be a page this account can open.
      if (event.pageKey && !resolveContextRole(event.pageKey, { rolesHeld })) { reject('NOT_PERMITTED'); continue; }
      discrete.push({
        id: event.eventId,
        name: event.name,
        pageKey: event.pageKey ?? null,
        pageViewId: event.pageViewId ?? null,
        subjectKey: event.targetKey ?? event.widgetKey ?? event.featureKey,
        action: event.action ?? null,
        source: event.source ?? null,
        occurredAt: new Date(at),
      });
    }
    lastSeen = Math.max(lastSeen, at);
  }

  if (!pageViews.size && !discrete.length) return result;

  // The visit: created on first sight, afterwards only its last-seen time moves forward. A visit id that already
  // belongs to another person or institution is refused (RETURNING is empty), and with it the whole batch.
  const visitStartedAt = new Date(Math.min(Math.max(corrected(envelope.visitStartedAt), nowMs - MAX_EVENT_AGE_MS), lastSeen));
  const owned = await prisma.$queryRaw`
    INSERT INTO "analytics_visits" AS v ("id", "tenantId", "userId", "rolesHeld", "authMethod", "deviceClass", "entryPageKey", "startedAt", "lastSeenAt")
    VALUES (${envelope.visitId}::uuid, ${auth.tenantId}, ${auth.userId}, ${rolesHeld}::"RoleKey"[], ${auth.signIn?.method === 'SSO' ? 'SSO' : 'PASSWORD'},
            ${envelope.deviceClass}::"AnalyticsDevice", ${entryPageKey}, ${utcTimestamp(visitStartedAt)}, ${utcTimestamp(new Date(lastSeen))})
    ON CONFLICT ("id") DO UPDATE SET "lastSeenAt" = GREATEST(v."lastSeenAt", EXCLUDED."lastSeenAt")
    WHERE v."userId" = EXCLUDED."userId" AND v."tenantId" = EXCLUDED."tenantId"
    RETURNING v."id"`;
  if (!owned.length) {
    reject('FOREIGN_ID', [...pageViews.values()].reduce((sum, pv) => sum + pv.events, 0) + discrete.length);
    return result;
  }

  for (const pv of pageViews.values()) {
    pv.startedAt = pv.viewAt ?? pv.impliedStart;
    // Visible time can never exceed the time the view has existed (plus a small allowance for timer drift).
    const saved = await prisma.$queryRaw`
      INSERT INTO "analytics_page_views" AS p ("id", "tenantId", "userId", "visitId", "pageKey", "rolesHeld", "contextRole", "deviceClass", "startedAt", "lastSeenAt", "visibleMs")
      VALUES (${pv.id}::uuid, ${auth.tenantId}, ${auth.userId}, ${envelope.visitId}::uuid, ${pv.pageKey}, ${rolesHeld}::"RoleKey"[], ${pv.contextRole},
              ${envelope.deviceClass}::"AnalyticsDevice", ${utcTimestamp(new Date(pv.startedAt))}, ${utcTimestamp(new Date(pv.lastSeenAt))},
              ${Math.min(pv.visibleMs, pv.lastSeenAt - pv.startedAt + 5000)})
      ON CONFLICT ("id") DO UPDATE SET
        "lastSeenAt" = GREATEST(p."lastSeenAt", EXCLUDED."lastSeenAt"),
        "visibleMs" = LEAST(GREATEST(p."visibleMs", EXCLUDED."visibleMs"),
                            (EXTRACT(EPOCH FROM (GREATEST(p."lastSeenAt", EXCLUDED."lastSeenAt") - p."startedAt")) * 1000)::int + 5000,
                            ${PAGE_VISIBLE_CAP_MS})
      WHERE p."userId" = EXCLUDED."userId" AND p."tenantId" = EXCLUDED."tenantId" AND p."pageKey" = EXCLUDED."pageKey"
      RETURNING p."id"`;
    if (saved.length) result.accepted += pv.events;
    else reject('FOREIGN_ID', pv.events);
  }

  if (discrete.length) {
    const { count } = await prisma.analyticsEvent.createMany({
      data: discrete.map((event) => ({ ...event, tenantId: auth.tenantId, userId: auth.userId, visitId: envelope.visitId, rolesHeld, deviceClass: envelope.deviceClass })),
      skipDuplicates: true,
    });
    result.accepted += count;
    result.duplicates += discrete.length - count;
  }
  return result;
}
