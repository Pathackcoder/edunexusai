import { BaseConnector } from './BaseConnector.js';
import { AppError, ErrorCode, integrationError } from '../../utils/errors.js';

/**
 * Canvas LMS connector (read-only).
 *
 * Implemented against the public Canvas REST API:
 *   GET /api/v1/users/self
 *   GET /api/v1/courses                      (active courses for the token's user)
 *   GET /api/v1/courses/:id/assignments
 *   GET /api/v1/courses/:id/enrollments
 * Auth is `Authorization: Bearer <token>` per the Canvas OAuth2 documentation, and list
 * endpoints are paginated through the RFC-5988 `Link` header (rel="next").
 *
 * TWO MODES, chosen by configuration — never by code changes:
 *
 *   mode = MOCK  (default)
 *     Talks to the local Mock University API's Canvas-compatible surface
 *     (/canvas/api/v1/...), which mirrors the real Canvas payload shapes. This exercises
 *     the full path — HTTP call, pagination handling, canonical mapping, error handling —
 *     without a Canvas tenant.
 *
 *   mode = LIVE
 *     Talks to a real Canvas instance at CANVAS_BASE_URL with CANVAS_API_TOKEN.
 *     No live token was available when this was built, so LIVE mode is implemented and
 *     configurable but UNVERIFIED against a production Canvas tenant. Activating it
 *     requires only configuration — see docs/integrations.md ("Activating live Canvas").
 *
 * Canvas issues no anonymous/public API access: every request needs a token belonging to
 * a real Canvas user, and tokens from developer keys issued after October 2015 expire
 * after one hour and must be refreshed. There is therefore no legitimate credential-free
 * public Canvas environment to point this at, which is why MOCK is the default.
 */
export class CanvasConnector extends BaseConnector {
  constructor(options) {
    super(options);
    this.mode = options.integration.mode; // MOCK | LIVE | DISABLED
    this.apiRoot = this.mode === 'LIVE' ? '/api/v1' : '/canvas/api/v1';
  }

  authHeaders() {
    return this.credential ? { Authorization: `Bearer ${this.credential}` } : {};
  }

  assertConfigured() {
    super.assertConfigured();
    if (this.mode === 'LIVE' && !this.credential) {
      throw new AppError(
        409,
        ErrorCode.INTEGRATION_NOT_CONFIGURED,
        'Canvas is set to LIVE mode but no API token is present. Set CANVAS_API_TOKEN in the backend environment (see docs/integrations.md).',
        { integrationKey: this.key, credentialRef: this.integration.credentialRef, mode: this.mode },
      );
    }
    if (this.mode === 'MOCK' && !this.credential) {
      // The mock Canvas surface still requires *some* bearer token, as Canvas does.
      this.credential = 'mock-canvas-token';
    }
  }

  /** Follow `Link: <...>; rel="next"` until exhausted, with a safety cap. */
  async requestAll(path, { query = {}, maxPages = 10 } = {}) {
    this.assertConfigured();
    const records = [];
    let url = new URL(`${this.baseUrl}${this.apiRoot}${path}`);
    for (const [key, value] of Object.entries({ per_page: 100, ...query })) {
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    let pages = 0;
    const startedAt = Date.now();

    while (url && pages < maxPages) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response;
      try {
        response = await fetch(url, {
          headers: { Accept: 'application/json', ...this.authHeaders() },
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        if (error.name === 'AbortError') {
          throw integrationError(`Canvas timed out after ${this.timeoutMs}ms.`, {
            integrationKey: this.key,
          });
        }
        throw integrationError('Canvas is unreachable.', {
          integrationKey: this.key,
          reason: error.code ?? error.message,
        });
      } finally {
        clearTimeout(timer);
      }

      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : [];
      } catch {
        payload = [];
      }

      if (!response.ok) {
        const providerMessage = payload?.errors?.[0]?.message ?? payload?.message ?? null;
        if (response.status === 401) {
          throw new AppError(
            502,
            ErrorCode.INTEGRATION_ERROR,
            'Canvas rejected the access token (401). The token may be expired — Canvas access tokens are short-lived and need refreshing.',
            { integrationKey: this.key, status: 401, providerMessage },
          );
        }
        throw integrationError(`Canvas responded ${response.status}.`, {
          integrationKey: this.key,
          status: response.status,
          providerMessage,
        });
      }

      if (Array.isArray(payload)) records.push(...payload);
      else return { records: [payload], durationMs: Date.now() - startedAt, pages: 1 };

      const next = parseNextLink(response.headers.get('link'));
      url = next ? new URL(next) : null;
      pages += 1;
    }

    return { records, durationMs: Date.now() - startedAt, pages };
  }

  async testConnection() {
    const startedAt = Date.now();
    const { payload } = await this.request(`${this.apiRoot}/users/self`);
    const { records } = await this.requestAll('/courses', {
      query: { enrollment_state: 'active' },
      maxPages: 1,
    });
    return {
      healthy: true,
      durationMs: Date.now() - startedAt,
      recordCount: records.length,
      details: {
        mode: this.mode,
        canvasUser: payload?.name ?? null,
        canvasUserId: payload?.id ?? null,
        courseCount: records.length,
        verifiedAgainstLiveCanvas: this.mode === 'LIVE',
      },
    };
  }

  async fetchCourses() {
    return this.requestAll('/courses', {
      query: { enrollment_state: 'active', 'include[]': ['total_students', 'teachers'] },
    });
  }

  async fetchAssignments({ externalCourseId }) {
    if (!externalCourseId) {
      throw integrationError('Canvas assignment lookup requires a Canvas course id.', {
        integrationKey: this.key,
      });
    }
    return this.requestAll(`/courses/${encodeURIComponent(externalCourseId)}/assignments`);
  }

  async fetchEnrollments({ externalCourseId }) {
    if (!externalCourseId) {
      throw integrationError('Canvas enrollment lookup requires a Canvas course id.', {
        integrationKey: this.key,
      });
    }
    return this.requestAll(`/courses/${encodeURIComponent(externalCourseId)}/enrollments`, {
      query: { 'type[]': ['StudentEnrollment'], 'include[]': ['user'] },
    });
  }
}

/** Extract the rel="next" URL from a Canvas Link header. */
export function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match) return match[1];
  }
  return null;
}
