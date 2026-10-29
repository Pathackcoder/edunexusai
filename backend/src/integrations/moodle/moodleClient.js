import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Moodle REST web-service client: transport only.
 *
 *   POST {baseUrl}/webservice/rest/server.php
 *   form fields: wstoken, wsfunction, moodlewsrestformat=json, ...function parameters
 *
 * Moodle reports most failures inside an HTTP 200 body ({ exception, errorcode, message }),
 * so success is decided from the payload, not the status code. Every failure becomes an
 * AppError whose `details.kind` is one of MoodleErrorKind, so callers branch on a stable
 * value rather than on Moodle's message text.
 *
 * The token is only ever placed in the request body. It is never logged, never put in a
 * URL, and is scrubbed from any text that is echoed back into an error.
 */

export const MoodleErrorKind = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH_FAILED: 'AUTH_FAILED',
  FUNCTION_NOT_ENABLED: 'FUNCTION_NOT_ENABLED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  CONFLICT: 'CONFLICT',
  NO_MANUAL_ENROLMENT: 'NO_MANUAL_ENROLMENT',
  TIMEOUT: 'TIMEOUT',
  UNREACHABLE: 'UNREACHABLE',
  HTTP_ERROR: 'HTTP_ERROR',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  UNAVAILABLE: 'UNAVAILABLE',
  MOODLE_EXCEPTION: 'MOODLE_EXCEPTION',
};

/** Failures where the request may or may not have reached Moodle and been applied. */
export const AMBIGUOUS_KINDS = new Set([
  MoodleErrorKind.TIMEOUT,
  MoodleErrorKind.UNREACHABLE,
  MoodleErrorKind.MALFORMED_RESPONSE,
  MoodleErrorKind.HTTP_ERROR,
]);

const TRANSIENT_KINDS = new Set([
  MoodleErrorKind.TIMEOUT,
  MoodleErrorKind.UNREACHABLE,
  MoodleErrorKind.UNAVAILABLE,
]);

const ERRORCODE_KIND = {
  invalidtoken: MoodleErrorKind.AUTH_FAILED,
  accessexception: MoodleErrorKind.ACCESS_DENIED,
  nopermissions: MoodleErrorKind.ACCESS_DENIED,
  requireloginerror: MoodleErrorKind.ACCESS_DENIED,
  invalidparameter: MoodleErrorKind.INVALID_PARAMETER,
  invalidresponse: MoodleErrorKind.MALFORMED_RESPONSE,
  invalidrecord: MoodleErrorKind.NOT_FOUND,
  invalidrecordunknown: MoodleErrorKind.NOT_FOUND,
  invalidcourseid: MoodleErrorKind.NOT_FOUND,
  invaliduser: MoodleErrorKind.NOT_FOUND,
  invaliduserid: MoodleErrorKind.NOT_FOUND,
  shortnametaken: MoodleErrorKind.CONFLICT,
  idnumbertaken: MoodleErrorKind.CONFLICT,
  courseidnumbertaken: MoodleErrorKind.CONFLICT,
  usernameexists: MoodleErrorKind.CONFLICT,
  wsnoinstance: MoodleErrorKind.NO_MANUAL_ENROLMENT,
  sitemaintenance: MoodleErrorKind.UNAVAILABLE,
};

const KIND_STATUS = {
  [MoodleErrorKind.NOT_CONFIGURED]: [409, ErrorCode.INTEGRATION_NOT_CONFIGURED],
  [MoodleErrorKind.FUNCTION_NOT_ENABLED]: [409, ErrorCode.INTEGRATION_NOT_CONFIGURED],
  [MoodleErrorKind.NOT_FOUND]: [404, ErrorCode.RESOURCE_NOT_FOUND],
  [MoodleErrorKind.INVALID_PARAMETER]: [400, ErrorCode.VALIDATION_ERROR],
  [MoodleErrorKind.CONFLICT]: [409, ErrorCode.CONFLICT],
  [MoodleErrorKind.NO_MANUAL_ENROLMENT]: [409, ErrorCode.INTEGRATION_NOT_CONFIGURED],
};

/** Build the normalised error. `message` must already be safe to show an administrator. */
export function moodleError(kind, message, extra = {}) {
  const [status, code] = KIND_STATUS[kind] ?? [502, ErrorCode.INTEGRATION_ERROR];
  return new AppError(status, code, message, { provider: 'MOODLE', kind, ...extra });
}

export const isMoodleError = (error, kind) =>
  error instanceof AppError && error.details?.provider === 'MOODLE' && (!kind || error.details.kind === kind);

/**
 * Flatten nested parameters into Moodle's PHP-style form keys:
 *   { users: [{ username: 'a' }] } -> users[0][username]=a
 */
export function toFormBody(params, prefix = '', form = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === 'object') toFormBody(item, `${name}[${index}]`, form);
        else if (item !== undefined && item !== null) form.append(`${name}[${index}]`, scalar(item));
      });
    } else if (typeof value === 'object') {
      toFormBody(value, name, form);
    } else {
      form.append(name, scalar(value));
    }
  }
  return form;
}

const scalar = (value) => (typeof value === 'boolean' ? (value ? '1' : '0') : String(value));

/** Remove the token (and anything token-shaped after `wstoken=`) from free text. */
export function scrub(text, token) {
  let out = String(text ?? '');
  if (token) out = out.split(token).join('[redacted]');
  return out.replace(/(wstoken=)[^&\s"]+/gi, '$1[redacted]').slice(0, 300);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object}   options
 * @param {string}   options.baseUrl     validated site URL, no trailing slash
 * @param {string}   options.token       web-service token (kept in this closure)
 * @param {number}  [options.timeoutMs]
 * @param {number}  [options.maxRetries] retries for read calls only
 * @param {Function}[options.fetchImpl]  injectable for unit tests
 */
export function createMoodleClient({ baseUrl, token, timeoutMs = 10000, maxRetries = 2, retryDelayMs = 250, fetchImpl = fetch }) {
  const endpoint = `${baseUrl}/webservice/rest/server.php`;

  async function once(wsfunction, params, correlationId) {
    const body = toFormBody({ wstoken: token, wsfunction, moodlewsrestformat: 'json', ...params });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError';
      throw moodleError(
        timedOut ? MoodleErrorKind.TIMEOUT : MoodleErrorKind.UNREACHABLE,
        timedOut ? `Moodle did not respond within ${timeoutMs}ms.` : 'Moodle could not be reached.',
        { wsfunction, correlationId, reason: timedOut ? 'timeout' : scrub(error?.cause?.code ?? error?.code ?? error?.message, token) },
      );
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - startedAt;
    let text;
    try {
      text = await response.text();
    } catch {
      throw moodleError(MoodleErrorKind.MALFORMED_RESPONSE, 'Moodle closed the connection before the response was complete.', { wsfunction, correlationId });
    }

    if (!response.ok) {
      const kind = [502, 503, 504].includes(response.status) ? MoodleErrorKind.UNAVAILABLE : MoodleErrorKind.HTTP_ERROR;
      throw moodleError(kind, `Moodle responded with HTTP ${response.status}.`, { wsfunction, correlationId, status: response.status });
    }

    let payload;
    try {
      // Moodle returns the literal `null` for void functions such as enrol_manual_enrol_users.
      payload = text.trim() === '' ? null : JSON.parse(text);
    } catch {
      throw moodleError(MoodleErrorKind.MALFORMED_RESPONSE, 'Moodle returned a response that is not JSON. Check that the REST protocol is enabled.', { wsfunction, correlationId });
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.exception) {
      const errorcode = String(payload.errorcode ?? '');
      const kind = ERRORCODE_KIND[errorcode] ?? MoodleErrorKind.MOODLE_EXCEPTION;
      const message =
        kind === MoodleErrorKind.AUTH_FAILED
          ? 'Moodle rejected the web-service token.'
          : kind === MoodleErrorKind.ACCESS_DENIED
            ? `Moodle denied access to ${wsfunction}. The function may not be enabled for this service, or the service user lacks a capability.`
            : `Moodle: ${scrub(payload.message, token)}`;
      // debuginfo can contain SQL and internal paths; it is never passed on.
      throw moodleError(kind, message, { wsfunction, correlationId, moodleErrorCode: errorcode || null });
    }

    return { payload, durationMs };
  }

  /**
   * Call a web-service function.
   * @param {object} [options]
   * @param {boolean}[options.idempotent=false] reads pass true and may be retried on
   *   transient failures. Writes are attempted exactly once: a timed-out create is
   *   resolved by looking the object up, never by sending it again.
   */
  async function call(wsfunction, params = {}, { idempotent = false, correlationId = randomUUID() } = {}) {
    if (!baseUrl || !token) {
      throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Moodle is not configured on the server.', { wsfunction, correlationId });
    }
    const attempts = idempotent ? maxRetries + 1 : 1;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await once(wsfunction, params, correlationId);
        return { ...result, attempts: attempt, correlationId };
      } catch (error) {
        lastError = error;
        const retryable = TRANSIENT_KINDS.has(error.details?.kind) && attempt < attempts;
        logger.warn('Moodle call failed', {
          wsfunction,
          correlationId,
          kind: error.details?.kind,
          moodleErrorCode: error.details?.moodleErrorCode ?? null,
          attempt,
          willRetry: retryable,
        });
        if (!retryable) break;
        await sleep(retryDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }

  return { call, endpoint: `${new URL(baseUrl || 'http://unset').origin}` };
}
