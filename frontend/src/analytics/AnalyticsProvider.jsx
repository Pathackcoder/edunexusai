import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isMultiRole, resolveView, viewStorageKey } from '../context/roleContexts';
import { pageKeyForPath } from '../../../shared/analyticsCatalog.js';
import { tokenStore, apiClient } from '../services/api';
import { useStudioMode } from '../pages/studio/studioMode';
import { HEARTBEAT_MS, TICK_MS, classifyDevice, createTracker } from './core.js';
import { setTracker } from './index.js';

// Random ids only (never derived from the person or the device).
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

const deviceClass = () => classifyDevice({
  coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  shortSide: Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight),
});

/**
 * The one request the tracker makes. It deliberately does not go through the API client: an expired sign-in must
 * NOT be refreshed from here (a hidden tab renewing tokens could end another tab's session), and a failure must
 * never reach the "session expired" handling. `keepalive` lets the last batch leave while the page closes.
 */
async function send(envelope) {
  const token = tokenStore.getAccessToken();
  if (!token) return 'auth';
  const response = await fetch(`${apiClient.baseUrl}/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(envelope),
    keepalive: true,
  });
  if (response.status === 401) return 'auth';
  if (response.status === 400) return 'invalid';
  if (!response.ok) return 'error';
  const body = await response.json().catch(() => null);
  return body?.data?.enabled === false ? 'disabled' : 'ok';
}

const INPUT_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'pointermove', 'wheel'];

/** The running tracker, one per signed-in person; it outlives a component remount. */
let session = null;
function endSession() {
  if (!session) return;
  clearTimeout(session.pendingEnd);
  session.tracker.closing();
  session.tracker.stop();
  setTracker(null);
  session = null;
}

/**
 * Mounted once inside the signed-in shell (AppLayout), so the login page, the public site and the sign-in
 * hand-off are never measured. It runs a tracker only while the session says collection is on for this person.
 */
export function AnalyticsProvider() {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const studio = useStudioMode();
  const collecting = Boolean(user?.analytics?.collecting);
  const userId = user?.id ?? null;
  const trackerRef = useRef(null);

  useEffect(() => {
    if (!collecting || !userId) {
      endSession();
      return undefined;
    }
    let tracker = session?.userId === userId ? session.tracker : null;
    if (!tracker) {
      endSession();
      tracker = createTracker({ userId, now: () => Date.now(), uuid, storage: window.localStorage, send, isVisible: () => document.visibilityState === 'visible', deviceClass });
      session = { userId, tracker, pendingEnd: null };
      setTracker(tracker);
    }
    clearTimeout(session.pendingEnd);
    trackerRef.current = tracker;

    // Input only says "someone is here": no target, position or key is read. Throttled to once a second.
    let lastInput = 0;
    const onInput = () => {
      const time = Date.now();
      if (time - lastInput < 1000) return;
      lastInput = time;
      tracker.input();
    };
    const onVisibility = () => tracker.visibilityChanged();
    const onClose = () => tracker.closing();
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      tracker.tick(ticks % Math.round(HEARTBEAT_MS / TICK_MS) === 0);
    }, TICK_MS);
    INPUT_EVENTS.forEach((name) => window.addEventListener(name, onInput, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onClose);
    return () => {
      clearInterval(timer);
      INPUT_EVENTS.forEach((name) => window.removeEventListener(name, onInput, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onClose);
      trackerRef.current = null;
      // React StrictMode (development) unmounts and at once remounts every component. The tracker survives that, so
      // one page load is one page view in development exactly as in production. A real unmount (sign-out, leaving
      // the signed-in shell) is not followed by a remount, and ends the tracker on the next tick.
      if (session?.tracker === tracker) session.pendingEnd = setTimeout(() => { if (session?.tracker === tracker) endSession(); }, 0);
    };
  }, [collecting, userId]);

  // The page: its catalogue key only. The single thing read from the query string is the dashboard tab of a
  // multi-role account, and only after resolveView has reduced it to one of that account's own views.
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    const key = pageKeyForPath(pathname);
    let view = null;
    if (key === 'dashboard' && isMultiRole(user)) {
      let remembered = null;
      try { remembered = window.localStorage.getItem(viewStorageKey(user.id)); } catch { /* ignore */ }
      view = resolveView(user, { requested: new URLSearchParams(search).get('view'), remembered });
    }
    tracker.setPage(key, view);
  }, [pathname, search, user, collecting]);

  // Widgets shown inside the Studio editor are being edited, not used.
  useEffect(() => {
    trackerRef.current?.pauseWidgets(Boolean(studio?.editing) || pathname.startsWith('/studio'));
  }, [studio?.editing, pathname, collecting]);

  return null;
}

export default AnalyticsProvider;
