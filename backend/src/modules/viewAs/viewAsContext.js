import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError, ErrorCode } from '../../utils/errors.js';

/**
 * The View-As request context, carried with the request's async work (AsyncLocalStorage) so the layers below the
 * route handlers (the Prisma client, the CampusCore / Moodle / CMS clients) can refuse writes without every service
 * having to be told. Set by requireAuth for a request that carries a valid View-As session; absent otherwise, so
 * normal requests, background workers and scripts are unaffected.
 *
 *   { sessionId, tenantId, actorUserId, subjectUserId, persona, mode: 'READ_ONLY' }
 */
const store = new AsyncLocalStorage();

export const currentViewAs = () => store.getStore() ?? null;

/** Run `fn` (and everything it awaits or schedules) as part of a View-As request. */
export const runWithViewAs = (context, fn) => store.run(context, fn);

/**
 * Run `fn` outside the View-As context. Only the View-As module itself uses this, for its own bookkeeping
 * (session last-seen, access log, audit rows): nothing a portal service does can opt out of the write guard.
 */
// Awaited inside the exited context: Prisma queries are lazy and run when awaited, which must happen out here.
export const outsideViewAs = (fn) => store.exit(async () => await fn());

export const viewAsReadOnlyError = (what) =>
  new AppError(403, ErrorCode.VIEW_AS_READ_ONLY, 'This is a read-only View-As session: actions are disabled.', { reason: 'VIEW_AS_READ_ONLY', blocked: what });

/** Throw when called inside a View-As request; used by the integration clients before any write. */
export function assertNotViewAs(what) {
  if (currentViewAs()) throw viewAsReadOnlyError(what);
}
