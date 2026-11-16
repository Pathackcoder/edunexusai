import { currentViewAs, viewAsReadOnlyError } from './viewAsContext.js';

/**
 * A fetch for integration clients that refuses any non-read request made during a View-As request. Used where the
 * client itself must not be edited (the vendored CampusCore connector takes it as `fetchImpl`). Obtaining the
 * integration's own OAuth access token is not a data write and stays allowed, so the shared token cache keeps working.
 */
export function viewAsGuardedFetch(system, fetchImpl = (...args) => globalThis.fetch(...args)) {
  return (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    if (currentViewAs() && method !== 'GET' && method !== 'HEAD') {
      const { pathname } = new URL(String(url));
      if (!/\/oauth\/token$/.test(pathname)) return Promise.reject(viewAsReadOnlyError(`${system} ${method} ${pathname}`));
    }
    return fetchImpl(url, init);
  };
}
