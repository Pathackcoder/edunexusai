/**
 * The single HTTP client for the whole frontend.
 *
 * Everything the app knows about talking to the backend lives here: the base URL, the
 * Authorization header, token refresh, and turning a failure response into one error
 * shape. No component calls `fetch` directly, so there is exactly one place to change
 * when auth, versioning or error handling changes.
 */

const BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

/**
 * Demo-only latency. Local APIs answer in a few milliseconds, which hides the loading
 * experience during demos. Requests that opt in (`demoLatency: true`, used by dashboard
 * widgets) wait a little in development only. Production builds always use 0.
 * Disable in development with VITE_DEMO_LATENCY_MS=0.
 */
const DEMO_LATENCY_MS = import.meta.env?.PROD ? 0 : Number(import.meta.env?.VITE_DEMO_LATENCY_MS ?? 900);
const demoPause = (startedAt) => {
  if (!DEMO_LATENCY_MS) return Promise.resolve();
  // Randomised (up to +600ms) so widgets resolve progressively rather than all at once.
  const target = DEMO_LATENCY_MS + Math.random() * 600;
  const remaining = target - (performance.now() - startedAt);
  return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
};

const ACCESS_TOKEN_KEY = 'edunexus.accessToken';
const REFRESH_TOKEN_KEY = 'edunexus.refreshToken';

/**
 * Token storage.
 *
 * Tokens live in localStorage so a page reload keeps the session. That is a deliberate
 * prototype trade-off and is documented as such: it is readable by any script on the
 * origin, so it is not what a production deployment should do. Production should use the
 * institution's identity provider and a httpOnly, SameSite cookie for the session.
 *
 * What is NOT stored here, ever: course data, grades, balances, notifications or any
 * other business data. Those always come from the API.
 */
export const tokenStore = {
  getAccessToken() {
    try {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  getRefreshToken() {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set({ accessToken, refreshToken }) {
    try {
      if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch {
      /* private browsing: the session simply will not survive a reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
  hasSession() {
    return Boolean(this.getAccessToken());
  },
};

/**
 * View-As (read-only administrator support access). A View-As tab keeps the administrator's own tokens above and adds
 * the session secret it was handed when it opened. The secret is kept in sessionStorage, so it belongs to this one tab:
 * the administrator's original tab (and any other tab) never sends it, and closing the tab forgets it. It is never
 * put in a URL. Every request from the tab carries it; the server then serves the viewed person's portal, read-only.
 */
const VIEW_AS_KEY = 'edunexus.viewAs';
export const VIEW_AS_HEADER = 'X-View-As-Session';
export const VIEW_AS_READ_ONLY_MESSAGE = 'This is a read-only View-As session: actions are disabled.';
export const viewAsStore = {
  get() {
    try {
      return sessionStorage.getItem(VIEW_AS_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      sessionStorage.setItem(VIEW_AS_KEY, token);
    } catch {
      /* without sessionStorage there is no tab-scoped place to keep it: the tab simply stays the administrator's */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(VIEW_AS_KEY);
    } catch {
      /* ignore */
    }
  },
  active() {
    return Boolean(this.get());
  },
};

/** View-As events for the shell: an action was refused (show why), or the session is over (leave the portal). */
const viewAsListeners = { blocked: new Set(), ended: new Set() };
export const onViewAsEvent = (type, listener) => {
  viewAsListeners[type].add(listener);
  return () => viewAsListeners[type].delete(listener);
};
const emitViewAs = (type, detail) => viewAsListeners[type].forEach((listener) => {
  try {
    listener(detail);
  } catch {
    /* a bad listener must not break the request path */
  }
});
const VIEW_AS_ENDED_CODES = new Set(['VIEW_AS_SESSION_ENDED', 'VIEW_AS_SESSION_INVALID']);
const isReadMethod = (method) => method === 'GET' || method === 'HEAD';

/** Read-only View-As: refuse a state-changing request in the browser too, before anything is sent. */
export function assertViewAsAllows(method, path) {
  if (!viewAsStore.active() || isReadMethod(method) || (method === 'DELETE' && path === '/view-as/current')) return;
  emitViewAs('blocked', { method, path });
  throw new ApiError({ message: VIEW_AS_READ_ONLY_MESSAGE, code: 'VIEW_AS_READ_ONLY', status: 403 });
}

/** Authorization (and, in a View-As tab, the session secret) for callers that use fetch directly. */
export function authHeaders() {
  const headers = {};
  const token = tokenStore.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const viewAs = viewAsStore.get();
  if (viewAs) headers[VIEW_AS_HEADER] = viewAs;
  return headers;
}

/** One error type for every failure, so screens can branch on `code`. */
export class ApiError extends Error {
  constructor({ message, code, status, details }) {
    super(message);
    this.name = 'ApiError';
    this.code = code ?? 'UNKNOWN_ERROR';
    this.status = status ?? 0;
    this.details = details;
  }

  get isAuthError() {
    return this.status === 401 || this.code === 'TOKEN_EXPIRED' || this.code === 'UNAUTHENTICATED';
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isIntegrationError() {
    return this.code === 'INTEGRATION_ERROR' || this.code === 'INTEGRATION_NOT_CONFIGURED';
  }

  /** Field-level messages from server-side validation, keyed by field name. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return this.details.reduce((acc, item) => {
      if (item?.field) acc[item.field] = item.message;
      return acc;
    }, {});
  }
}

/** Listeners notified when the session ends, so AuthContext can redirect to login. */
const sessionListeners = new Set();
export const onSessionExpired = (listener) => {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
};
const announceSessionExpired = () => {
  tokenStore.clear();
  sessionListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* a bad listener must not break the request path */
    }
  });
};

/** Concurrent 401s share one refresh attempt rather than starting a stampede. */
let refreshInFlight = null;

async function refreshSession() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const body = await response.json();
      if (!body?.success || !body.data?.accessToken) return false;
      tokenStore.set(body.data);
      return true;
    } catch {
      return false;
    } finally {
      // Release the shared attempt on the next tick so queued callers see the result.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

/**
 * Refresh the access token for a non-REST caller (the realtime chat socket), sharing the same single
 * in-flight attempt. When it cannot be refreshed the session has ended, exactly as for a REST call.
 */
export async function refreshAccessToken() {
  const refreshed = await refreshSession();
  if (!refreshed) announceSessionExpired();
  return refreshed;
}

/**
 * Origin of the realtime socket (/socket.io): the API's origin. When REST calls reach the API through the app's own
 * origin by a rewrite that cannot carry WebSockets (Vercel), VITE_REALTIME_ORIGIN names the API host directly
 * (e.g. https://api.example.edu); the socket authenticates with the access token, not cookies.
 */
const REALTIME_ORIGIN = (import.meta.env?.VITE_REALTIME_ORIGIN ?? '').replace(/\/$/, '');
export const apiOrigin = () => REALTIME_ORIGIN || new URL(BASE_URL, window.location.origin).origin;

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function send(path, { method = 'GET', body, query, signal, auth = true, retry = true, demoLatency = false } = {}) {
  const startedAt = performance.now();
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    assertViewAsAllows(method, path);
    Object.assign(headers, authHeaders());
  }

  let response;
  try {
    response = await fetch(url.toString().replace(window.location.origin, ''), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError({
      message: 'Cannot reach the EduNexusAI API. Check that the backend is running.',
      code: 'NETWORK_ERROR',
      status: 0,
    });
  }

  // An expired access token is refreshed once and the request replayed, so the user
  // is not bounced to the login screen mid-session.
  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return send(path, { method, body, query, signal, auth, retry: false, demoLatency });
    }
    announceSessionExpired();
  }

  const payload = await parseBody(response);
  if (demoLatency) await demoPause(startedAt);

  if (!response.ok || payload?.success === false) {
    const code = payload?.error?.code;
    if (viewAsStore.active() && VIEW_AS_ENDED_CODES.has(code)) emitViewAs('ended', { code, reason: payload?.error?.details?.reason ?? null });
    if (code === 'VIEW_AS_READ_ONLY') emitViewAs('blocked', { method, path });
    throw new ApiError({
      message: payload?.error?.message ?? `Request failed with status ${response.status}.`,
      code: payload?.error?.code,
      status: response.status,
      details: payload?.error?.details,
    });
  }

  // Unwrap the standard envelope; `meta` is attached non-enumerably so callers that
  // spread or map over `data` are unaffected.
  const data = payload?.data ?? null;
  if (payload?.meta && data && typeof data === 'object') {
    Object.defineProperty(data, '__meta', { value: payload.meta, enumerable: false });
  }
  return data;
}

export const apiClient = {
  get: (path, options) => send(path, { ...options, method: 'GET' }),
  post: (path, body, options) => send(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => send(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => send(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => send(path, { ...options, method: 'DELETE' }),
  baseUrl: BASE_URL,
};

/** Read the `meta` block that accompanied a response, if any. */
export const metaOf = (data) => data?.__meta ?? {};
