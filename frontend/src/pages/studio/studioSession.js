/**
 * Where Studio resumes. The last editing target (an editable portal route) is kept
 * per administrator in this browser, and the portal page the administrator came from is
 * kept for "Exit Studio". Both are conveniences: storage can be unavailable (private mode),
 * and every read is validated, so a stale or tampered value just falls back to the start page.
 */

const TARGET_KEY = (userId) => `edunexus.studio.lastTarget.${userId}`;
const RETURN_KEY = 'edunexus.studio.returnTo';
// Portal routes edited in place (/pages/:slug, /faculty, /admin, /dashboard) and the
// Student dashboard's dedicated editor route.
const TARGET = /^(?:\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*|\/faculty|\/admin|\/dashboard|\/studio\/dashboards\/student\/edit)$/;

export function rememberTarget(userId, path, label) {
  if (!userId || !TARGET.test(path)) return;
  try {
    window.localStorage.setItem(TARGET_KEY(userId), JSON.stringify({ path, label: String(label ?? '').slice(0, 120), at: Date.now() }));
  } catch {
    /* convenience only */
  }
}

export function lastTarget(userId) {
  if (!userId) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(TARGET_KEY(userId)) ?? 'null');
    return value && TARGET.test(value.path) ? value : null;
  } catch {
    return null;
  }
}

export function forgetTarget(userId, path) {
  try {
    const current = lastTarget(userId);
    if (current && (!path || current.path === path)) window.localStorage.removeItem(TARGET_KEY(userId));
  } catch {
    /* convenience only */
  }
}

export function rememberReturnPath(path) {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/studio')) return;
  try {
    window.sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* convenience only */
  }
}

export function returnPath() {
  try {
    const value = window.sessionStorage.getItem(RETURN_KEY);
    return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/studio') ? value : '/dashboard';
  } catch {
    return '/dashboard';
  }
}
