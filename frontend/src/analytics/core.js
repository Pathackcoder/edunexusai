import { ANALYTICS_SCHEMA_VERSION } from '../../../shared/analyticsCatalog.js';

/**
 * The portal usage tracker: pure logic, no React and no browser globals (everything it needs is passed in),
 * so the rules below are unit-tested with a fake clock.
 *
 * What it records is fixed by shared/analyticsCatalog.js: page keys (never URLs), catalogue keys, enums and a
 * visible-time counter. It never reads what a person types, clicks coordinates, page text or the address bar.
 *
 * Rules:
 *  - A visit is activity in this browser with no gap longer than 30 minutes, shared by all tabs (the id lives in
 *    localStorage). It is not the sign-in session.
 *  - Visible time accrues only while the tab is visible AND there was input in the last 5 minutes. A hidden tab,
 *    an idle screen or a sleeping laptop adds nothing. The counter is cumulative, so a lost or repeated heartbeat
 *    cannot double-count.
 *  - Sending never refreshes the sign-in: an expired token just pauses sending. Nothing here can sign a person
 *    out, delay a page or show an error.
 *  - If the server says collection is off, the tracker stops and forgets its queue.
 */
export const VISIT_IDLE_MS = 30 * 60 * 1000;
export const INPUT_IDLE_MS = 5 * 60 * 1000;
export const HEARTBEAT_MS = 60 * 1000;
export const TICK_MS = 15 * 1000;
export const BATCH_SIZE = 40;
export const FLUSH_AT = 20;
export const MAX_QUEUE = 200;
export const SPOOL_TTL_MS = 24 * 60 * 60 * 1000;
const VISIT_KEY = 'edunexus.analytics.visit';
const spoolKey = (userId) => `edunexus.analytics.spool.${userId}`;

/** Device class from two facts only (pointer type and the shorter screen side). The user agent is never read. */
export function classifyDevice({ coarsePointer, shortSide }) {
  if (coarsePointer && shortSide < 600) return 'MOBILE';
  if (coarsePointer) return 'TABLET';
  return 'DESKTOP';
}

const readJson = (storage, key) => {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};
const writeJson = (storage, key, value) => {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the visit lives for this tab only */
  }
};

/** The current visit for this browser and person; a new one after 30 idle minutes or for a different person. */
export function resolveVisit(storage, userId, now, uuid, memory = null) {
  const stored = readJson(storage, VISIT_KEY) ?? memory;
  const live = stored && stored.userId === userId && now - stored.lastActivityAt <= VISIT_IDLE_MS;
  const visit = live ? { ...stored, lastActivityAt: now } : { id: uuid(), userId, startedAt: now, lastActivityAt: now };
  writeJson(storage, VISIT_KEY, visit);
  return visit;
}

export function createTracker({ userId, now, uuid, storage, send, isVisible, deviceClass }) {
  let enabled = true;
  let queue = [];
  let page = null;
  let visit = null;
  let lastInputAt = now();
  let sending = false;
  let failures = 0;
  let nextAttemptAt = 0;
  let widgetsPaused = false;
  const seenWidgets = new Set();

  // Events left over from a tab that closed before it could send (same person, at most a day old).
  const spooled = readJson(storage, spoolKey(userId));
  if (spooled && Array.isArray(spooled.events) && now() - spooled.savedAt <= SPOOL_TTL_MS) queue = spooled.events.slice(-MAX_QUEUE);
  writeJson(storage, spoolKey(userId), null);

  const iso = (ms) => new Date(ms).toISOString();

  function currentVisit() {
    const next = resolveVisit(storage, userId, now(), uuid, visit);
    const changed = visit && next.id !== visit.id;
    visit = next;
    // Back after a long break on the same page: that is a new visit, and a new view of the page.
    if (changed && page) {
      page = { ...page, id: uuid(), visibleMs: 0, reportedMs: 0, viewSent: false, lastAdvance: now() };
      seenWidgets.clear();
      if (isVisible()) sendView();
    }
    return visit;
  }

  function push(event) {
    if (!enabled) return;
    const active = currentVisit();
    queue.push({ visitId: active.id, visitStartedAt: iso(active.startedAt), event: { eventId: uuid(), at: iso(now()), ...event } });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= FLUSH_AT) flush();
  }

  function advance() {
    const time = now();
    if (page) {
      const delta = time - page.lastAdvance;
      // A gap much longer than the timer means the device slept: that time was not spent on the page.
      if (page.counting && delta > 0 && delta <= TICK_MS * 2 + 1000) page.visibleMs += delta;
      page.lastAdvance = time;
      page.counting = page.viewSent && isVisible() && time - lastInputAt < INPUT_IDLE_MS;
    }
  }

  function sendView() {
    if (!page || page.viewSent) return;
    page.viewSent = true;
    page.lastAdvance = now();
    page.counting = isVisible() && now() - lastInputAt < INPUT_IDLE_MS;
    push({ name: 'page.view', pageViewId: page.id, pageKey: page.key, ...(page.view ? { view: page.view } : {}) });
  }

  function reportTime(name) {
    if (!page || !page.viewSent) return;
    const visibleMs = Math.round(page.visibleMs);
    if (name === 'page.ping' && visibleMs <= page.reportedMs) return;
    page.reportedMs = visibleMs;
    push({ name, pageViewId: page.id, pageKey: page.key, visibleMs, ...(page.view ? { view: page.view } : {}) });
  }

  async function flush() {
    if (!enabled || sending || !queue.length || now() < nextAttemptAt) return;
    sending = true;
    // One batch belongs to one visit.
    const first = queue[0];
    const batch = queue.filter((item) => item.visitId === first.visitId).slice(0, BATCH_SIZE);
    let outcome = 'error';
    try {
      outcome = await send({
        schemaVersion: ANALYTICS_SCHEMA_VERSION, sentAt: iso(now()), visitId: first.visitId, visitStartedAt: first.visitStartedAt,
        deviceClass: deviceClass(), events: batch.map((item) => item.event),
      });
    } catch {
      outcome = 'error';
    }
    sending = false;
    if (outcome === 'ok' || outcome === 'invalid') {
      // 'invalid': the server refused the batch outright; resending the same content can never succeed.
      const sent = new Set(batch);
      queue = queue.filter((item) => !sent.has(item));
      failures = 0;
      if (readJson(storage, spoolKey(userId))) writeJson(storage, spoolKey(userId), queue.length ? { savedAt: now(), events: queue } : null);
      if (queue.length) flush();
    } else if (outcome === 'disabled') {
      stop();
    } else if (outcome === 'auth') {
      // The sign-in expired. Wait for the app's own next request to renew it; never renew it from here.
      nextAttemptAt = now() + 60_000;
    } else {
      failures += 1;
      nextAttemptAt = now() + Math.min(5_000 * 2 ** failures, 5 * 60_000);
    }
  }

  function stop() {
    enabled = false;
    queue = [];
    page = null;
    writeJson(storage, spoolKey(userId), null);
  }

  return {
    get enabled() { return enabled; },
    get queueLength() { return queue.length; },
    get pageViewId() { return page?.viewSent ? page.id : null; },
    get pageKey() { return page?.key ?? null; },

    /** The person moved the pointer, pressed a key, scrolled or touched: they are here. (No detail is kept.) */
    input() {
      if (!enabled) return;
      advance();
      lastInputAt = now();
      if (page) page.counting = page.viewSent && isVisible();
    },

    /** The route changed. `key` is a catalogue page key, or null for a route that is not tracked. */
    setPage(key, view = null) {
      if (!enabled) return;
      if (page && page.key === key && page.view === view) return;
      advance();
      reportTime('page.exit');
      seenWidgets.clear();
      lastInputAt = now();
      page = key ? { id: uuid(), key, view, visibleMs: 0, reportedMs: 0, viewSent: false, counting: false, lastAdvance: now() } : null;
      // A tab opened in the background has not been seen yet: the view is recorded when it first becomes visible.
      if (page && isVisible()) sendView();
    },

    /** The tab became visible or hidden. */
    visibilityChanged() {
      if (!enabled) return;
      advance();
      if (isVisible()) {
        lastInputAt = now();
        currentVisit();
        sendView();
        if (page) page.counting = page.viewSent;
      } else {
        reportTime('page.exit');
        if (page) page.counting = false;
        flush();
      }
    },

    /** Called every TICK_MS. Sends a heartbeat when visible time has grown since the last one. */
    tick(heartbeat = false) {
      if (!enabled) return;
      advance();
      if (heartbeat) {
        reportTime('page.ping');
        flush();
      }
    },

    /** The page is being closed: keep the queue for the next load in case this send does not complete. */
    closing() {
      if (!enabled) return;
      advance();
      reportTime('page.exit');
      if (queue.length) writeJson(storage, spoolKey(userId), { savedAt: now(), events: queue });
      flush();
    },

    nav(targetKey, source) {
      push({ name: 'nav.click', targetKey, source, ...(page?.viewSent ? { pageKey: page.key } : {}) });
    },
    feature(featureKey, action = null) {
      push({ name: 'feature.use', featureKey, ...(action ? { action } : {}), ...(page?.viewSent ? { pageKey: page.key } : {}) });
    },
    pauseWidgets(paused) { widgetsPaused = paused; },
    widgetImpression(widgetKey) {
      if (widgetsPaused || !page?.viewSent || seenWidgets.has(widgetKey)) return;
      seenWidgets.add(widgetKey);
      push({ name: 'widget.impression', pageViewId: page.id, pageKey: page.key, widgetKey });
    },
    widgetInteract(widgetKey, action) {
      if (widgetsPaused || !page?.viewSent) return;
      push({ name: 'widget.interact', pageViewId: page.id, pageKey: page.key, widgetKey, action });
    },

    flush,
    stop,
  };
}
