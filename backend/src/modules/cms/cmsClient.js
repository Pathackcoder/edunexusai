import { cmsConfig } from '../../config/env.js';
import { AppError, ErrorCode } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * The only code that talks to the Feddrick CMS (Strapi). Calls its tenant-scoped
 * integration API (/api/edunexus/...) with the server-side token, with a timeout, and maps
 * failures to the backend's error codes. The token is never logged or returned.
 *
 *   400 from Strapi           -> 400 VALIDATION_ERROR (field messages kept)
 *   404 / 409                 -> same status
 *   401 / 403 (token)         -> 502 CMS_AUTH_FAILED
 *   unreachable / timeout     -> 503 CMS_UNAVAILABLE
 *   not configured            -> 503 CMS_NOT_CONFIGURED
 */
export class CmsError extends AppError {}

export function cmsReady() {
  return cmsConfig().valid;
}

/**
 * Reads use CMS_API_TOKEN (read actions only). Changes (Studio: create, update, publish, schedule, upload, delete) use
 * CMS_MANAGE_API_TOKEN, a separate token granted the write actions, so the token every page view uses cannot change
 * content. Without a management token, Studio is read-only and changes are refused here.
 */
const tokenFor = (method) => (method === 'GET' ? process.env.CMS_API_TOKEN : process.env.CMS_MANAGE_API_TOKEN);

export async function cmsRequest(method, path, { query, body, form } = {}) {
  const config = cmsConfig();
  if (!config.valid) throw new CmsError(503, 'CMS_NOT_CONFIGURED', `The CMS is not configured: ${config.problems.join(' ')}`);
  const token = tokenFor(method);
  if (!token) throw new CmsError(503, 'CMS_MANAGEMENT_NOT_CONFIGURED', 'Content changes are not enabled: the CMS management token (CMS_MANAGE_API_TOKEN) is not configured.');
  const url = new URL(`${config.url}/api/edunexus${path}`);
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (error) {
    logger.warn('CMS unreachable', { method, path, reason: error.name === 'AbortError' ? 'timeout' : error.message });
    throw new CmsError(503, 'CMS_UNAVAILABLE', error.name === 'AbortError' ? 'The CMS did not respond in time.' : 'The CMS is not reachable right now.');
  } finally {
    clearTimeout(timer);
  }
  const payload = await res.json().catch(() => null);
  if (res.ok) return payload?.data ?? null;
  const message = payload?.error?.message ?? `CMS request failed (${res.status}).`;
  if (res.status === 401 || res.status === 403) {
    logger.warn('CMS refused the integration token', { method, path, status: res.status });
    throw new CmsError(502, 'CMS_AUTH_FAILED', `The CMS refused the integration token. An administrator must check ${method === 'GET' ? 'CMS_API_TOKEN' : 'CMS_MANAGE_API_TOKEN'}.`);
  }
  if (res.status === 400) throw new CmsError(400, ErrorCode.VALIDATION_ERROR, message, { cms: payload?.error?.details ?? null });
  if (res.status === 404) throw new CmsError(404, ErrorCode.RESOURCE_NOT_FOUND, message);
  if (res.status === 409) throw new CmsError(409, ErrorCode.CONFLICT, message, payload?.error?.details ?? null);
  logger.warn('CMS error', { method, path, status: res.status });
  throw new CmsError(502, ErrorCode.INTEGRATION_ERROR, message);
}

/** Stream a public media file from the CMS (images only; path already validated). */
export async function cmsMedia(path) {
  const config = cmsConfig();
  if (!config.valid) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(`${config.url}/uploads/${path}`, { signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
