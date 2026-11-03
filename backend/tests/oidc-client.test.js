import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startOidcProvider } from './helpers/oidcProvider.js';
import {
  beginLogin,
  clearProviderConfigurations,
  completeLogin,
  logoutUrl,
  OidcError,
  openTransaction,
  safeReturnPath,
  sealTransaction,
} from '../src/modules/identity/oidcClient.js';
import { decideAccountLink, mapExternalValues, readClaim } from '../src/modules/identity/identityPolicy.js';

/**
 * OpenID Connect relying party: PKCE, state, nonce, issuer, audience, signature, expiry and the
 * sealed sign-in transaction, against an in-process provider (no network, no real IdP).
 */

let idp;
let provider;
const REDIRECT = 'http://localhost:5173/api/v1/auth/oidc/callback';
const SECRET = 'unit-test-jwt-secret-0123456789abcdef';
const opts = () => ({ clientSecret: idp.clientSecret, production: false });

before(async () => {
  idp = await startOidcProvider();
  provider = { key: 'feddrick-sso', issuer: idp.issuer, clientId: idp.clientId, allowInsecureHttp: true, scopes: 'openid email profile' };
});
after(async () => { clearProviderConfigurations(); await idp.close(); });

const start = () => beginLogin(provider, { redirectUri: REDIRECT, returnTo: '/dashboard?view=student', ...opts() });
const rejects = (promise, code) => assert.rejects(promise, (error) => error instanceof OidcError && error.code === code);

describe('authorisation request', () => {
  it('uses the code flow with PKCE S256, a state and a nonce', async () => {
    const { url, transaction } = await start();
    const params = new URL(url).searchParams;
    assert.equal(params.get('response_type'), 'code');
    assert.equal(params.get('code_challenge_method'), 'S256');
    assert.ok(params.get('code_challenge') && params.get('code_challenge') !== transaction.codeVerifier, 'only the challenge is sent, never the verifier');
    assert.equal(params.get('state'), transaction.state);
    assert.equal(params.get('nonce'), transaction.nonce);
    assert.equal(params.get('redirect_uri'), REDIRECT);
    assert.equal(transaction.returnTo, '/dashboard?view=student');
  });
});

describe('callback validation', () => {
  it('accepts a valid response and returns the verified identity', async () => {
    const { url, transaction } = await start();
    const callbackUrl = idp.issueCode(url, { claims: { sub: 'kc-rahul', email: 'rahul@feddrick.edu', email_verified: true, student_number: 'S-55821', realm_access: { roles: ['learner', 'employee'] } } });
    const identity = await completeLogin(provider, { callbackUrl, transaction, ...opts() });
    assert.equal(identity.issuer, idp.issuer);
    assert.equal(identity.subject, 'kc-rahul');
    assert.deepEqual(readClaim(identity.claims, 'realm_access.roles'), ['learner', 'employee']);
  });

  it('rejects a forged state', async () => {
    const { url, transaction } = await start();
    await rejects(completeLogin(provider, { callbackUrl: idp.issueCode(url, { claims: { sub: 'x' }, state: 'forged' }), transaction, ...opts() }), 'TOKEN_REJECTED');
  });

  it('rejects an ID token for another nonce (replay of an older sign-in)', async () => {
    const { url, transaction } = await start();
    await rejects(completeLogin(provider, { callbackUrl: idp.issueCode(url, { claims: { sub: 'x' }, override: { nonce: 'other' } }), transaction, ...opts() }), 'TOKEN_REJECTED');
  });

  it('rejects another issuer, another audience, an expired token and a token signed with another key', async () => {
    for (const bend of [{ override: { iss: 'https://evil.example' } }, { override: { aud: 'another-client' } }, { override: { exp: Math.floor(Date.now() / 1000) - 600, iat: Math.floor(Date.now() / 1000) - 900 } }, { signWithRogueKey: true }]) {
      const { url, transaction } = await start();
      await rejects(completeLogin(provider, { callbackUrl: idp.issueCode(url, { claims: { sub: 'x' }, ...bend }), transaction, ...opts() }), 'TOKEN_REJECTED');
    }
  });

  it('rejects a code redeemed with the wrong PKCE verifier, and a code used twice', async () => {
    const { url, transaction } = await start();
    const callbackUrl = idp.issueCode(url, { claims: { sub: 'x' } });
    await rejects(completeLogin(provider, { callbackUrl, transaction: { ...transaction, codeVerifier: 'x'.repeat(64) }, ...opts() }), 'TOKEN_REJECTED');
    await rejects(completeLogin(provider, { callbackUrl, transaction, ...opts() }), 'TOKEN_REJECTED');
  });

  it('rejects a response for another provider, an expired transaction and a foreign callback address', async () => {
    const { url, transaction } = await start();
    const callbackUrl = idp.issueCode(url, { claims: { sub: 'x' } });
    await rejects(completeLogin(provider, { callbackUrl, transaction: { ...transaction, providerKey: 'other' }, ...opts() }), 'INVALID_TRANSACTION');
    await rejects(completeLogin(provider, { callbackUrl, transaction: { ...transaction, expiresAt: Date.now() - 1 }, ...opts() }), 'EXPIRED_TRANSACTION');
    await rejects(completeLogin(provider, { callbackUrl: callbackUrl.replace('localhost:5173', 'evil.example'), transaction, ...opts() }), 'INVALID_CALLBACK');
  });

  it('refuses a plain-http provider in production, or one not marked as a development provider', async () => {
    await rejects(beginLogin(provider, { redirectUri: REDIRECT, ...opts(), production: true }), 'INSECURE_ISSUER');
    await rejects(beginLogin({ ...provider, allowInsecureHttp: false }, { redirectUri: REDIRECT, ...opts() }), 'INSECURE_ISSUER');
  });

  it('builds the provider logout address (RP-initiated logout)', async () => {
    const href = await logoutUrl(provider, { postLogoutRedirectUri: 'http://localhost:5173/login', ...opts() });
    assert.ok(href.startsWith(`${idp.issuer}/logout?`));
    assert.equal(new URL(href).searchParams.get('client_id'), idp.clientId);
  });
});

describe('sealed sign-in transaction', () => {
  it('round-trips, and cannot be read, altered or reused after expiry', async () => {
    const { transaction } = await start();
    const sealed = sealTransaction(transaction, SECRET);
    assert.ok(!sealed.includes(transaction.codeVerifier), 'the PKCE verifier is not readable in the cookie');
    assert.deepEqual(openTransaction(sealed, SECRET), transaction);
    const [iv, tag, body] = sealed.split('.');
    const altered = [iv, tag, Buffer.from(body, 'base64url').map((b, i) => (i === 0 ? b ^ 1 : b)).toString('base64url')].join('.');
    assert.throws(() => openTransaction(altered, SECRET), (e) => e.code === 'INVALID_TRANSACTION');
    assert.throws(() => openTransaction(sealed, 'another-secret'), (e) => e.code === 'INVALID_TRANSACTION');
    assert.throws(() => openTransaction(sealTransaction({ ...transaction, expiresAt: Date.now() - 1 }, SECRET), SECRET), (e) => e.code === 'EXPIRED_TRANSACTION');
  });

  it('only returns to same-site paths', () => {
    assert.equal(safeReturnPath('/academics/grades'), '/academics/grades');
    for (const bad of ['https://evil.example/', '//evil.example', '/\\evil', 'javascript:alert(1)', null]) assert.equal(safeReturnPath(bad), '/dashboard');
  });
});

describe('verified claims feed the identity policy (never email alone)', () => {
  it('a learner/employee at one university maps through that university’s own rules', async () => {
    const { url, transaction } = await start();
    const identity = await completeLogin(provider, { callbackUrl: idp.issueCode(url, { claims: { sub: 'kc-2', email: 'a@feddrick.edu', email_verified: true, realm_access: { roles: ['learner', 'cms-editor'] } } }), transaction, ...opts() });
    const { mapped, unknown } = mapExternalValues(readClaim(identity.claims, 'realm_access.roles'), [{ externalValue: 'learner', targetRole: 'STUDENT' }]);
    assert.deepEqual([...mapped.keys()], ['STUDENT']);
    assert.deepEqual(unknown, ['cms-editor'], 'a portal-only role name from the IdP grants nothing');
    const decision = decideAccountLink({ existing: null, claims: { email: identity.claims.email, emailVerified: identity.claims.email_verified, studentIds: [], employeeIds: [] }, matches: [] });
    assert.equal(decision.reason, 'NO_INSTITUTIONAL_ID');
  });
});
