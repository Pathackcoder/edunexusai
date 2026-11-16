/**
 * What a View-As request may do over HTTP. Pure: no database, no Express, so it is unit-tested directly.
 *
 * Default deny for anything that is not a read. GET and HEAD are reads in HTTP terms only; a read that still tries
 * to write is stopped below the routes by the Prisma and integration-client guards (viewAsContext.js).
 *
 * - The only state-changing call allowed is ending the View-As session itself (DELETE /api/v1/view-as/current).
 *   No POST-based query endpoint is allowlisted: none is needed to render a student or faculty portal.
 * - Some reads stay closed even though the person could see them: private one-to-one messages and Nexora AI
 *   conversations (an administrator has no other way to read these, and View-As must not silently grant it),
 *   sign-in flows, and administrative surfaces (the subject's persona never holds ADMIN, so these would fail anyway).
 */

export const VIEW_AS_HEADER = 'x-view-as-session';

const READ_METHODS = new Set(['GET', 'HEAD']);

const MUTATION_ALLOWLIST = [
  { method: 'DELETE', pattern: /^\/api\/v1\/view-as\/current$/i },
];

const READ_DENYLIST = [
  { pattern: /^\/api\/v1\/chat(\/|$)/i, reason: 'PRIVATE_MESSAGES', message: 'Private messages are not shown in a View-As session.' },
  { pattern: /^\/api\/v1\/nexora\/conversations(\/|$)/i, reason: 'PRIVATE_AI_CONVERSATIONS', message: 'Nexora conversations are private and are not shown in a View-As session.' },
  { pattern: /^\/api\/v1\/auth\/oidc(\/|$)/i, reason: 'SIGN_IN_FLOW', message: 'Sign-in is not available in a View-As session.' },
  { pattern: /^\/api\/v1\/(admin|studio)(\/|$)/i, reason: 'ADMIN_WORKSPACE', message: 'Administration is not available in a View-As session. Use your own tab.' },
];

/** The request path as routing sees it: no query string, decoded, duplicate and trailing slashes removed. */
export function normalisePath(originalUrl = '') {
  let path = String(originalUrl).split('?')[0].split('#')[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* malformed escapes: keep the raw path; routing will not match it either */
  }
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

/**
 * @returns {{ allowed: true } | { allowed: false, kind: 'MUTATION' | 'READ', reason: string, message: string }}
 */
export function evaluateViewAsRequest(method, originalUrl) {
  const verb = String(method ?? '').toUpperCase();
  const path = normalisePath(originalUrl);
  if (verb === 'OPTIONS') return { allowed: true };
  if (!READ_METHODS.has(verb)) {
    if (MUTATION_ALLOWLIST.some((rule) => rule.method === verb && rule.pattern.test(path))) return { allowed: true };
    return { allowed: false, kind: 'MUTATION', reason: 'VIEW_AS_READ_ONLY', message: 'This is a read-only View-As session: actions are disabled.' };
  }
  const denied = READ_DENYLIST.find((rule) => rule.pattern.test(path));
  if (denied) return { allowed: false, kind: 'READ', reason: denied.reason, message: denied.message };
  return { allowed: true };
}

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z]{1,6}\d{3,}[A-Za-z0-9-]*)$/i;

/**
 * Route template for the access log: identifiers (uuids, numbers, record numbers like S2400017) become :id, so the
 * log says which kind of page was read without recording whose records or which ones.
 */
export function routeTemplate(originalUrl) {
  const path = normalisePath(originalUrl);
  return path.split('/').map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment)).join('/').slice(0, 200);
}

/** First segment after /api/v1: academics, finance, lms, ... */
export function routeArea(originalUrl) {
  const [, , , area] = normalisePath(originalUrl).split('/');
  return (area || 'root').slice(0, 40);
}
