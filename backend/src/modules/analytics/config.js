/**
 * Portal analytics settings, read from process.env on every call (not frozen at import) so the test suite and an
 * operator can change them without a rebuild. Kept in this module rather than config/env.js on purpose: analytics is
 * optional and everything about switching it on or off lives in one place.
 *
 *   ANALYTICS_ENABLED          master switch for the whole deployment. Off unless "true": nothing is collected and
 *                              the aggregation worker does not start. Turning it off again is the kill switch.
 *   ANALYTICS_ALLOW_USER_IDS   comma-separated account ids that are measured even while their institution's own
 *                              switch is off (a named test account during rollout). Needs ANALYTICS_ENABLED.
 *   ANALYTICS_RAW_RETENTION_DAYS (90), ANALYTICS_ROLLUP_INTERVAL_SECONDS (900)
 *
 * Collection for one person = master switch AND (their institution switched it on, or they are on the allow list)
 * AND the account is not excluded (users.analyticsExcludedAt).
 */
const toBool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
const toInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
};

export function analyticsConfig() {
  return {
    enabled: toBool(process.env.ANALYTICS_ENABLED),
    allowUserIds: String(process.env.ANALYTICS_ALLOW_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    rawRetentionDays: toInt(process.env.ANALYTICS_RAW_RETENTION_DAYS, 90, 7, 365),
    // Person-day rows: 13 months, so a term can be compared with the same term a year earlier.
    userDailyRetentionDays: 400,
    // Aggregates hold no person ids.
    rollupRetentionDays: 1100,
    rollupIntervalMs: toInt(process.env.ANALYTICS_ROLLUP_INTERVAL_SECONDS, 900, 30, 86_400) * 1000,
  };
}

/** A browser batch may describe at most the last day; older or future-dated events are refused. */
export const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_FUTURE_SKEW_MS = 60 * 1000;
export const MAX_BATCH_EVENTS = 50;
/** One page view never reports more visible time than this (a tab left open all day). */
export const PAGE_VISIBLE_CAP_MS = 4 * 60 * 60 * 1000;
export const VISIT_DURATION_CAP_MS = 12 * 60 * 60 * 1000;

/** Is this signed-in person's activity being measured? `auth` is the request context from requireAuth. */
export function isCollecting(auth) {
  const config = analyticsConfig();
  if (!config.enabled || !auth?.userId || auth.analytics?.excluded) return false;
  return Boolean(auth.analytics?.tenantEnabled) || config.allowUserIds.includes(auth.userId);
}
