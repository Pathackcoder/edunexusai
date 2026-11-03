import express, { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../db/prisma.js';
import { buildCurrentUser } from '../users/sessionService.js';
import { providerLogoutUrl } from './ssoLogout.js';
import { beginLogin, completeLogin, openTransaction, OidcError, safeReturnPath, sealTransaction, TRANSACTION_TTL_MS, verifyLogoutToken } from './oidcClient.js';
import { clientSecretFor, enabledProvider, enabledProviders, tenantBySlug } from './providerService.js';
import { exchangeHandoff, signInWithProvider, SsoRefusal } from './ssoService.js';
import { createHandoff, endSsoSessions } from './ssoSessions.js';
import { recordAudit } from '../audit/auditService.js';
import { TENANT_FALLBACK_SLUG } from '../auth/constants.js';

/**
 * Institutional sign-in (OpenID Connect), mounted at /api/v1/auth/oidc:
 *
 *   GET  /providers?tenant=slug           the institution's enabled sign-in options (key + name only)
 *   GET  /:tenant/:provider/start          sealed transaction cookie, then 302 to the provider
 *   GET  /callback                         verify, resolve the account and roles, 302 to the app
 *                                          with a single-use hand-off code in the URL fragment
 *   POST /exchange { code }                the same session payload as password sign-in
 *   GET  /logout-url                       the provider's end-session address for this session
 *   POST /backchannel-logout/:tenant/:provider   OIDC Back-Channel Logout: the provider ends sessions
 *
 * The browser reaches the API through the app's own origin (the dev proxy, or a same-origin
 * deployment), so the callback address is <app origin>/api/v1/auth/oidc/callback.
 */

export const ssoRoutes = Router();

const COOKIE = 'enx_oidc_tx';
const COOKIE_PATH = '/api/v1/auth/oidc';
const appBase = () => (process.env.OIDC_REDIRECT_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const callbackAddress = () => `${appBase()}${COOKIE_PATH}/callback`;
const secure = () => env.isProduction;
const transactionSecret = () => env.jwt.secret;

const setTxCookie = (res, value) =>
  res.append('Set-Cookie', `${COOKIE}=${value}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TRANSACTION_TTL_MS / 1000)}${secure() ? '; Secure' : ''}`);
const clearTxCookie = (res) => res.append('Set-Cookie', `${COOKIE}=; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0${secure() ? '; Secure' : ''}`);
const readTxCookie = (req) => {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
};

/** Every failure lands on the login page with a reason code; no identity detail is put in the URL. */
const failTo = (res, reason) => res.redirect(302, `${appBase()}/login?sso_error=${encodeURIComponent(reason)}`);

const limiter = rateLimit({ windowMs: 60_000, max: process.env.NODE_ENV === 'test' ? 1000 : 30, standardHeaders: true, legacyHeaders: false });

ssoRoutes.get(
  '/providers',
  validate({ query: z.object({ tenant: z.string().trim().max(80).optional() }) }),
  asyncHandler(async (req, res) => {
    try {
      return sendSuccess(res, await enabledProviders(req.validatedQuery.tenant || TENANT_FALLBACK_SLUG));
    } catch (error) {
      // Sign-in options are optional: if they cannot be read, password sign-in still works.
      logger.warn('Sign-in options unavailable', { code: error.code ?? error.name });
      return sendSuccess(res, []);
    }
  }),
);

ssoRoutes.get(
  '/:tenant/:provider/start',
  limiter,
  validate({ params: z.object({ tenant: z.string().trim().max(80), provider: z.string().trim().max(40) }), query: z.object({ returnTo: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const tenant = await tenantBySlug(req.params.tenant);
    const provider = tenant ? await enabledProvider(tenant.id, req.params.provider) : null;
    if (!provider) return failTo(res, 'UNKNOWN_PROVIDER');
    try {
      const { url, transaction } = await beginLogin(provider, { redirectUri: callbackAddress(), returnTo: safeReturnPath(req.validatedQuery.returnTo), clientSecret: clientSecretFor(provider) });
      setTxCookie(res, sealTransaction({ ...transaction, tenantId: tenant.id }, transactionSecret()));
      return res.redirect(302, url);
    } catch (error) {
      logger.warn('Institutional sign-in could not start', { provider: provider.key, code: error.code ?? error.name });
      return failTo(res, error instanceof OidcError ? 'PROVIDER_UNAVAILABLE' : 'SIGN_IN_FAILED');
    }
  }),
);

ssoRoutes.get(
  '/callback',
  limiter,
  asyncHandler(async (req, res) => {
    const sealed = readTxCookie(req);
    clearTxCookie(res);
    // The provider reports a cancelled or failed sign-in with ?error=; nothing to verify.
    if (req.query.error) return failTo(res, req.query.error === 'access_denied' ? 'CANCELLED' : 'PROVIDER_ERROR');
    let transaction;
    try {
      transaction = openTransaction(sealed, transactionSecret());
    } catch (error) {
      return failTo(res, error.code === 'EXPIRED_TRANSACTION' ? 'EXPIRED' : 'INVALID_REQUEST');
    }
    const provider = await enabledProvider(transaction.tenantId, transaction.providerKey);
    if (!provider) return failTo(res, 'UNKNOWN_PROVIDER');
    const tenant = await prisma.tenant.findUnique({ where: { id: transaction.tenantId } });
    try {
      const identity = await completeLogin(provider, { callbackUrl: `${appBase()}${req.originalUrl}`, transaction, clientSecret: clientSecretFor(provider) });
      const { userId, ssoSessionId } = await signInWithProvider({ tenant, provider, identity });
      const code = await createHandoff({ tenantId: tenant.id, userId, ssoSessionId, returnTo: transaction.returnTo });
      return res.redirect(302, `${appBase()}/auth/sso/complete#code=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(transaction.returnTo)}`);
    } catch (error) {
      if (error instanceof SsoRefusal) return failTo(res, error.reason);
      if (error instanceof OidcError) {
        logger.warn('Institutional sign-in rejected', { provider: provider.key, code: error.code });
        return failTo(res, 'VERIFICATION_FAILED');
      }
      logger.error('Institutional sign-in failed', { provider: provider.key, error: error.message });
      return failTo(res, 'SIGN_IN_FAILED');
    }
  }),
);

ssoRoutes.post(
  '/exchange',
  limiter,
  validate({ body: z.object({ code: z.string().trim().min(20).max(200) }).strict() }),
  asyncHandler(async (req, res) => {
    const session = await exchangeHandoff(req.body.code);
    if (!session) return res.status(401).json({ success: false, error: { code: 'INVALID_HANDOFF', message: 'This sign-in link has expired or was already used. Please sign in again.' } });
    res.set('Cache-Control', 'no-store');
    const user = await buildCurrentUser({ userId: session.userId, signIn: { method: 'SSO' } });
    return sendSuccess(res, { accessToken: session.accessToken, refreshToken: session.refreshToken, tokenType: session.tokenType, expiresIn: session.expiresIn, returnTo: session.returnTo, user });
  }),
);

ssoRoutes.get(
  '/logout-url',
  requireAuth,
  asyncHandler(async (req, res) => sendSuccess(res, { url: await providerLogoutUrl(req.auth).catch(() => null) })),
);

/**
 * OpenID Connect Back-Channel Logout 1.0. The provider POSTs a signed logout token (form field
 * `logout_token`) when the person signs out there or an administrator ends their session; every
 * EdunexusAI session started from that provider session (sid) or, without sid, that subject, ends.
 * Responses carry no detail (spec: 200 on success, 400 otherwise) and are never cached.
 */
ssoRoutes.post(
  '/backchannel-logout/:tenant/:provider',
  limiter,
  express.urlencoded({ extended: false, limit: '16kb' }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const tenant = await tenantBySlug(String(req.params.tenant).slice(0, 80));
    const provider = tenant ? await enabledProvider(tenant.id, String(req.params.provider).slice(0, 40)) : null;
    if (!provider || typeof req.body?.logout_token !== 'string') return res.status(400).json({ error: 'invalid_request' });
    let claims;
    try {
      claims = await verifyLogoutToken(provider, req.body.logout_token, { clientSecret: clientSecretFor(provider) });
    } catch (error) {
      logger.warn('Back-channel logout rejected', { provider: provider.key, code: error.code ?? error.name });
      return res.status(400).json({ error: 'invalid_request' });
    }
    const where = { tenantId: tenant.id, providerId: provider.id, ...(claims.sid ? { idpSessionId: claims.sid } : {}), ...(claims.subject ? { subject: claims.subject } : {}) };
    const ended = await endSsoSessions(where, 'PROVIDER_LOGOUT');
    if (ended) await recordAudit({ tenantId: tenant.id, action: 'SSO_BACKCHANNEL_LOGOUT', entityType: 'IdentityProvider', entityId: provider.id, summary: `${provider.displayName} ended ${ended} session(s)` }).catch(() => {});
    return res.status(200).end();
  }),
);
