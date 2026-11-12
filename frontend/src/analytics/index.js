import { featureByKey, isNavTarget, pageKeyForPath, widgetByKey } from '../../../shared/analyticsCatalog.js';

/**
 * What the rest of the app calls. Every function is a silent no-op unless a tracker is running (collection is on
 * for this person), so a call site never needs to know whether analytics is enabled, and can never fail because
 * of it. Only catalogue keys pass through: an unknown key is dropped here, before anything is queued.
 */
let tracker = null;
export const setTracker = (next) => { tracker = next; };
export const getTracker = () => tracker;

const safely = (run) => {
  try {
    if (tracker?.enabled) run(tracker);
  } catch {
    /* analytics must never break the page */
  }
};

/** A navigation click. `to` is the portal path being opened (only its page key is kept) or an external target key. */
export function trackNav(to, source) {
  const target = String(to).startsWith('/') ? pageKeyForPath(to) : to;
  if (target && isNavTarget(target)) safely((t) => t.nav(target, source));
}

/** A named feature was opened or used in the UI (features completed on the server are recorded by the API). */
export function trackFeature(featureKey, action = null) {
  const feature = featureByKey(featureKey);
  if (!feature || feature.origin !== 'BROWSER') return;
  if (action && !feature.actions?.includes(action)) return;
  safely((t) => t.feature(featureKey, action));
}

export function trackWidgetImpression(widgetKey) {
  if (widgetByKey(widgetKey)) safely((t) => t.widgetImpression(widgetKey));
}
export function trackWidgetInteraction(widgetKey, action) {
  if (widgetByKey(widgetKey)) safely((t) => t.widgetInteract(widgetKey, action));
}
export const isTrackedWidget = (widgetKey) => Boolean(widgetByKey(widgetKey));

/** Send what is queued now (before sign-out, while the token still works). Resolves when done or after 1.5 s. */
export function flushAnalytics() {
  if (!tracker?.enabled) return Promise.resolve();
  tracker.tick(true);
  return Promise.race([Promise.resolve(tracker.flush()).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1500))]);
}
