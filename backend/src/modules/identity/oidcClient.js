import * as oidc from 'openid-client';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * OpenID Connect relying-party protocol for institutional sign-in (Keycloak, or a university's own
 * OpenID provider). Authorisation code flow with PKCE (S256), `state` and `nonce`, using the
 * certified `openid-client` library, which also validates the ID token: issuer, audience, expiry and
 * nonce, and (non-repudiation checks enabled) its signature against the provider's JWKS. This module only proves WHO signed in; which account that is,
 * and which roles it holds, are decided by identityPolicy.js and EdunexusAI's own data.
 *
 * The sign-in transaction (state, nonce, PKCE verifier, return path) never leaves the server in
 * plain text: it is sealed with AES-256-GCM under a key derived from the server's JWT secret and
 * expires after ten minutes, so it can travel in an HttpOnly cookie without a database table.
 */

export class OidcError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OidcError';
    this.code = code;
  }
}

export const TRANSACTION_TTL_MS = 10 * 60_000;
const DISCOVERY_TTL_MS = 10 * 60_000;
const configurations = new Map();

/** Only same-site paths are accepted as "return to" targets (no open redirects). */
export const safeReturnPath = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value.length <= 300 ? value : '/dashboard';

function assertIssuerAllowed(provider, { production }) {
  let issuer;
  try {
    issuer = new URL(provider.issuer);
  } catch {
    throw new OidcError('INVALID_ISSUER', 'The identity provider issuer is not a valid URL.');
  }
  if (issuer.protocol === 'https:') return { issuer, insecure: false };
  if (issuer.protocol === 'http:' && provider.allowInsecureHttp && !production) return { issuer, insecure: true };
  throw new OidcError('INSECURE_ISSUER', 'The identity provider must use https (plain http is allowed only for a development provider that is explicitly marked as such).');
}

/** Discovered provider configuration, cached per issuer and client. */
export async function providerConfiguration(provider, { clientSecret = null, production = process.env.NODE_ENV === 'production', timeoutSeconds = 8 } = {}) {
  const { issuer, insecure } = assertIssuerAllowed(provider, { production });
  const cacheKey = `${issuer.href}|${provider.clientId}|${clientSecret ? 'confidential' : 'public'}`;
  const hit = configurations.get(cacheKey);
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.config;
  try {
    const config = await oidc.discovery(
      issuer,
      provider.clientId,
      clientSecret ?? undefined,
      clientSecret ? oidc.ClientSecretPost(clientSecret) : oidc.None(),
      // ID token signatures are always checked against the provider's published keys, not only
      // trusted because they came over TLS from the token endpoint (defence in depth; essential
      // for a plain-http development provider, where there is no TLS at all).
      { execute: [oidc.enableNonRepudiationChecks, ...(insecure ? [oidc.allowInsecureRequests] : [])], timeout: timeoutSeconds },
    );
    configurations.set(cacheKey, { at: Date.now(), config });
    return config;
  } catch (error) {
    throw new OidcError('DISCOVERY_FAILED', `The identity provider could not be reached or described itself incorrectly (${error.code ?? error.name}).`);
  }
}

export const clearProviderConfigurations = () => configurations.clear();

/** Start a sign-in: the provider URL to redirect to, and the transaction to seal into a cookie. */
export async function beginLogin(provider, { redirectUri, returnTo, clientSecret, production } = {}) {
  const config = await providerConfiguration(provider, { clientSecret, production });
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const transaction = {
    providerKey: provider.key,
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier,
    redirectUri,
    returnTo: safeReturnPath(returnTo),
    expiresAt: Date.now() + TRANSACTION_TTL_MS,
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: provider.scopes || 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state: transaction.state,
    nonce: transaction.nonce,
  });
  return { url: url.href, transaction };
}

/**
 * Finish a sign-in from the provider's redirect. Returns the verified identity:
 * { issuer, subject, claims, idToken }. Throws OidcError for anything that does not validate.
 */
export async function completeLogin(provider, { callbackUrl, transaction, clientSecret, production } = {}) {
  if (!transaction || transaction.providerKey !== provider.key) throw new OidcError('INVALID_TRANSACTION', 'This sign-in was not started here, or was started for another identity provider.');
  if (!(transaction.expiresAt > Date.now())) throw new OidcError('EXPIRED_TRANSACTION', 'This sign-in took too long. Please start again.');
  const callback = new URL(callbackUrl);
  if (`${callback.origin}${callback.pathname}` !== transaction.redirectUri) throw new OidcError('INVALID_CALLBACK', 'The sign-in response arrived at an unexpected address.');
  const config = await providerConfiguration(provider, { clientSecret, production });
  let tokens;
  try {
    tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
  } catch (error) {
    throw new OidcError('TOKEN_REJECTED', `The identity provider's response could not be verified (${error.code ?? error.error ?? error.name}).`);
  }
  const claims = tokens.claims();
  if (!claims?.sub) throw new OidcError('TOKEN_REJECTED', 'The identity provider did not identify the user.');
  return { issuer: claims.iss, subject: String(claims.sub), claims, idToken: tokens.id_token };
}

/** Where the provider should send the browser after it signs the person out (RP-initiated logout). */
// With the session's ID token as id_token_hint the provider ends its session without asking for confirmation.
export async function logoutUrl(provider, { postLogoutRedirectUri, idTokenHint = null, clientSecret, production } = {}) {
  const config = await providerConfiguration(provider, { clientSecret, production });
  if (!config.serverMetadata().end_session_endpoint) return null;
  return oidc.buildEndSessionUrl(config, { client_id: provider.clientId, post_logout_redirect_uri: postLogoutRedirectUri, ...(idTokenHint ? { id_token_hint: idTokenHint } : {}) }).href;
}

const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/**
 * Verify an OpenID Connect Back-Channel Logout token (OIDC Back-Channel Logout 1.0, section 2.6):
 * signature from the provider's JWKS, issuer, audience = this client, recent iat, the logout event,
 * no nonce, and a sub or sid. Returns { subject, sid }; throws OidcError otherwise.
 */
export async function verifyLogoutToken(provider, logoutToken, { clientSecret, production, maxAgeSeconds = 300 } = {}) {
  const config = await providerConfiguration(provider, { clientSecret, production });
  const { issuer, jwks_uri: jwksUri } = config.serverMetadata();
  if (!jwksUri) throw new OidcError('NO_JWKS', 'The identity provider publishes no signing keys.');
  let payload;
  try {
    const keys = jwksFor(jwksUri);
    ({ payload } = await jwtVerify(String(logoutToken ?? ''), keys, { issuer, audience: provider.clientId, maxTokenAge: `${maxAgeSeconds}s`, clockTolerance: 30 }));
  } catch (error) {
    throw new OidcError('LOGOUT_TOKEN_REJECTED', `The logout token could not be verified (${error.code ?? error.name}).`);
  }
  if (!payload.events || typeof payload.events !== 'object' || !(BACKCHANNEL_EVENT in payload.events)) throw new OidcError('LOGOUT_TOKEN_REJECTED', 'Not a logout token.');
  if ('nonce' in payload) throw new OidcError('LOGOUT_TOKEN_REJECTED', 'A logout token must not carry a nonce.');
  if (!payload.sub && !payload.sid) throw new OidcError('LOGOUT_TOKEN_REJECTED', 'The logout token names no subject or session.');
  return { subject: payload.sub ? String(payload.sub) : null, sid: payload.sid ? String(payload.sid) : null };
}

const keySets = new Map();
const jwksFor = (uri) => {
  if (!keySets.has(uri)) keySets.set(uri, createRemoteJWKSet(new URL(uri), { timeoutDuration: 5000 }));
  return keySets.get(uri);
};

/* ----------------------------------------------------- sealed sign-in transaction */

const keyFrom = (secret) => Buffer.from(hkdfSync('sha256', Buffer.from(String(secret)), Buffer.alloc(0), Buffer.from('edunexus-oidc-transaction-v1'), 32));

export function sealTransaction(transaction, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(transaction), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

export function openTransaction(sealed, secret) {
  try {
    const [iv, tag, body] = String(sealed ?? '').split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    const transaction = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
    if (!(transaction.expiresAt > Date.now())) throw new OidcError('EXPIRED_TRANSACTION', 'This sign-in took too long. Please start again.');
    return transaction;
  } catch (error) {
    if (error instanceof OidcError) throw error;
    throw new OidcError('INVALID_TRANSACTION', 'This sign-in was not started here or has been tampered with.');
  }
}
