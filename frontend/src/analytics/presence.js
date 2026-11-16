/**
 * Live-users heartbeat: pure logic, no React and no browser globals (passed in), unit-tested with a fake clock.
 *
 * While a person's portal is open and in use, the server is told "I am here" (POST /analytics/presence, empty body:
 * who is here comes from the access token). The server keeps one row per person, so this only needs to keep that
 * row fresh:
 *  - at once when the portal opens, and when a tab becomes visible again;
 *  - then every HEARTBEAT_MS while the tab is visible and there was input in the last INPUT_IDLE_MS;
 *  - never from a hidden tab or an idle screen, so a person who walks away drops out after the server's presence
 *    window (2 minutes by default);
 *  - the person's tabs share one clock (localStorage): a tab skips its beat when another tab sent one recently, so
 *    ten open tabs still send about two heartbeats a minute.
 * Sign-out removes the person on the server immediately. Like the tracker, this never refreshes a token and can
 * never show an error; if the server says collection is off, it stops.
 */
export const PRESENCE_HEARTBEAT_MS = 30 * 1000;
export const PRESENCE_SHARED_MS = 20 * 1000;
export const PRESENCE_INPUT_IDLE_MS = 5 * 60 * 1000;
const sharedKey = (userId) => `edunexus.analytics.presence.${userId}`;

const readNumber = (storage, key) => {
  try {
    return Number(storage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};
const writeNumber = (storage, key, value) => {
  try {
    storage.setItem(key, String(value));
  } catch {
    /* storage unavailable: this tab keeps its own clock */
  }
};

export function createPresence({ userId, now, storage, send, isVisible }) {
  let enabled = true;
  let lastInputAt = now();
  let lastSentHere = 0;
  let sending = false;
  let retryAt = 0;

  async function beat({ force = false } = {}) {
    if (!enabled || sending || !isVisible()) return false;
    const time = now();
    if (time < retryAt) return false;
    if (!force && time - lastInputAt >= PRESENCE_INPUT_IDLE_MS) return false;
    const shared = Math.max(readNumber(storage, sharedKey(userId)), lastSentHere);
    if (time - shared < (force ? 5_000 : PRESENCE_SHARED_MS)) return false;
    sending = true;
    lastSentHere = time;
    writeNumber(storage, sharedKey(userId), time);
    let outcome = 'error';
    try {
      outcome = await send();
    } catch {
      outcome = 'error';
    }
    sending = false;
    if (outcome === 'disabled') enabled = false;
    else if (outcome === 'auth') retryAt = now() + 60_000;
    else if (outcome === 'error') retryAt = now() + PRESENCE_HEARTBEAT_MS;
    return outcome === 'ok';
  }

  return {
    get enabled() { return enabled; },
    /** The portal opened in this tab. */
    start: () => beat({ force: true }),
    /** Someone moved the pointer, typed, scrolled or touched (no detail is kept). */
    input() { lastInputAt = now(); },
    visibilityChanged() {
      if (isVisible()) {
        lastInputAt = now();
        return beat({ force: true });
      }
      return Promise.resolve(false);
    },
    /** Called every PRESENCE_HEARTBEAT_MS. */
    tick: () => beat(),
    stop() { enabled = false; },
  };
}
