/**
 * Where closing Nexora returns to. The last portal location outside Nexora (path, query, hash, router state, the
 * history entry it lives in and the window scroll position) is remembered while the person works in Nexora, so
 * the header toggle can bring them back to exactly that page. It is kept in sessionStorage as well, so a reload
 * inside Nexora still knows the way back. Every read is validated: a stale or tampered value falls back to the
 * dashboard.
 */

export const NEXORA_PATH = '/nexora';
export const FALLBACK_PATH = '/dashboard';
const STORAGE_KEY = 'enx.nexora.returnTo';

export const isNexoraPath = (pathname) => pathname === NEXORA_PATH || String(pathname ?? '').startsWith(`${NEXORA_PATH}/`);

/** A same-origin portal path outside Nexora, or null. */
const safePath = (value) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !isNexoraPath(value) ? value : null);

/** The return target, normalised; null when the value is not a usable location. */
export function sanitizeReturn(value) {
  if (!value || typeof value !== 'object') return null;
  const pathname = safePath(value.pathname);
  if (!pathname) return null;
  return {
    pathname,
    search: typeof value.search === 'string' && value.search.startsWith('?') ? value.search : '',
    hash: typeof value.hash === 'string' && value.hash.startsWith('#') ? value.hash : '',
    state: value.state ?? null,
    key: typeof value.key === 'string' ? value.key : null,
    idx: Number.isInteger(value.idx) && value.idx >= 0 ? value.idx : null,
    scrollY: Number.isFinite(value.scrollY) && value.scrollY > 0 ? Math.round(value.scrollY) : 0,
  };
}

/** The target from a router location plus the history entry index and scroll position. */
export function returnFromLocation(location, idx, scrollY) {
  return sanitizeReturn({ ...location, idx, scrollY });
}

export const returnHref = (target) => (target ? `${target.pathname}${target.search}${target.hash}` : FALLBACK_PATH);

/**
 * How many history entries to step back to reach the target, or null to navigate to it instead. Going back keeps
 * the browser history clean (opening and closing Nexora repeatedly does not pile up entries); it is only used when
 * the target's entry is behind the current one in this tab's history. The caller verifies the landing entry's key.
 */
export function backDelta(target, currentIdx) {
  if (!target || target.idx === null || !target.key || !Number.isInteger(currentIdx)) return null;
  return currentIdx > target.idx ? target.idx - currentIdx : null;
}

export function readStoredReturn() {
  try {
    return sanitizeReturn(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

export function storeReturn(target) {
  try {
    if (!target) return;
    let state = target.state;
    try {
      JSON.stringify(state);
    } catch {
      state = null; // router state that cannot be serialised is kept in memory only
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...target, state }));
  } catch {
    /* convenience only */
  }
}
