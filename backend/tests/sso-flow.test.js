import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { api, closeTestServer, getTestServer, login } from './helpers/testEnv.js';
import { startOidcProvider } from './helpers/oidcProvider.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';
import { clearProviderConfigurations } from '../src/modules/identity/oidcClient.js';

/**
 * Institutional sign-in end to end through the real routes (start → provider → callback → exchange)
 * against an in-process OpenID provider. Covers first-login linking, verified records, the
 * institution's mapping rules, refusals, role withdrawal, staff policy, tenant isolation and logout.
 */

const { prisma } = await import('../src/db/prisma.js');
const SECRET_ENV = 'OIDC_CLIENT_SECRET_TESTSSO';
let idp;
let base;
let tenant;
let provider;
let other;
const people = {};

before(async () => {
  idp = await startOidcProvider({ clientId: 'edunexusai', clientSecret: 'sso-test-secret' });
  process.env[SECRET_ENV] = 'sso-test-secret';
  ({ baseUrl: base } = await getTestServer());
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  await prisma.identityProvider.deleteMany({ where: { key: 'test-sso' } });
  provider = await prisma.identityProvider.create({ data: { tenantId: tenant.id, key: 'test-sso', displayName: 'Feddrick ID (test)', issuer: idp.issuer, clientId: 'edunexusai', clientSecretEnv: SECRET_ENV, studentIdClaim: 'student_number', employeeIdClaim: 'employee_number', enabled: true, allowInsecureHttp: true } });
  for (const [value, role] of [['learner', 'STUDENT'], ['faculty', 'FACULTY'], ['employee', 'STAFF'], ['alumni', 'ALUMNI']]) {
    await prisma.identityRoleMapping.create({ data: { tenantId: tenant.id, providerId: provider.id, claim: 'realm_access.roles', externalValue: value, targetRole: role } });
  }
  people.rahul = await createMultiRoleUser({ key: 'sso.rahul', firstName: 'Rahul', roles: ['STUDENT', 'FACULTY'], student: { studentNumber: 'SSO-S-1', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'SSO-F-1' } });
  people.mira = await createMultiRoleUser({ key: 'sso.mira', firstName: 'Mira', roles: ['STUDENT'], student: { studentNumber: 'SSO-S-2', tierKey: 'STANDARD' } });
  people.nina = await createMultiRoleUser({ key: 'sso.nina', firstName: 'Nina', roles: [], student: { studentNumber: 'SSO-S-3', tierKey: 'STANDARD' } });
  people.sam = await createMultiRoleUser({ key: 'sso.sam', firstName: 'Sam', roles: ['STUDENT'], student: { studentNumber: 'SSO-S-4', tierKey: 'STANDARD' } });
  people.otto = await createMultiRoleUser({ key: 'sso.otto', firstName: 'Otto', roles: ['FACULTY'], faculty: { employeeNumber: 'SSO-F-5' } });
  // Another institution with a provider of the same key: it must never reach this tenant's accounts.
  await prisma.tenant.deleteMany({ where: { slug: 'mr-test-sso-other' } });
  other = await prisma.tenant.create({ data: { slug: 'mr-test-sso-other', name: 'Other University (test)' } });
  await prisma.identityProvider.create({ data: { tenantId: other.id, key: 'test-sso', displayName: 'Other ID', issuer: idp.issuer, clientId: 'edunexusai', clientSecretEnv: SECRET_ENV, studentIdClaim: 'student_number', enabled: true, allowInsecureHttp: true } });
});

after(async () => {
  await prisma.identityProvider.deleteMany({ where: { key: 'test-sso' } });
  await prisma.tenant.deleteMany({ where: { slug: 'mr-test-sso-other' } });
  await removeMultiRoleUsers();
  delete process.env[SECRET_ENV];
  clearProviderConfigurations();
  await idp.close();
  await closeTestServer();
});

/** The browser's journey: start (cookie + redirect), sign in at the provider, callback, exchange. */
async function ssoSignIn(claims, { tenantSlug = 'demo-university', key = 'test-sso', mutateCookie, providerError } = {}) {
  const start = await fetch(`${base}/auth/oidc/${tenantSlug}/${key}/start?returnTo=${encodeURIComponent('/dashboard?view=student')}`, { redirect: 'manual' });
  const location = new URL(start.headers.get('location'));
  if (location.pathname === '/login') return { error: location.searchParams.get('sso_error') };
  let cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
  if (mutateCookie) cookie = mutateCookie(cookie);
  const callback = new URL(idp.issueCode(location.href, { claims }));
  if (providerError) callback.search = `?error=${providerError}&state=${callback.searchParams.get('state')}`;
  const cb = await fetch(`${base}/auth/oidc/callback${callback.search}`, { redirect: 'manual', headers: { cookie } });
  const dest = new URL(cb.headers.get('location'));
  if (dest.pathname === '/login') return { error: dest.searchParams.get('sso_error') };
  const fragment = new URLSearchParams(dest.hash.slice(1));
  const exchanged = await api('/auth/oidc/exchange', { method: 'POST', body: { code: fragment.get('code') } });
  return { status: exchanged.status, session: exchanged.body?.data, code: fragment.get('code'), returnTo: fragment.get('returnTo'), dest };
}

const claimsFor = (person, extra = {}) => ({ sub: `kc-${person.user.id}`, email: person.email, email_verified: true, ...extra });
const rolesOf = async (person) => (await prisma.userRole.findMany({ where: { userId: person.user.id }, include: { role: true } })).map((r) => r.role.key).sort();

describe('sign-in options', () => {
  it('lists only the institution’s enabled providers, without secrets', async () => {
    const res = await api('/auth/oidc/providers?tenant=demo-university');
    assert.deepEqual(res.body.data.filter((p) => p.key === 'test-sso'), [{ key: 'test-sso', displayName: 'Feddrick ID (test)', tenant: 'demo-university' }]);
    assert.ok(!JSON.stringify(res.body).includes('sso-test-secret'));
  });
});

describe('first sign-in and session', () => {
  it('links the account on its verified institutional numbers and issues the normal session', async () => {
    const result = await ssoSignIn(claimsFor(people.rahul, { student_number: 'SSO-S-1', employee_number: 'SSO-F-1', realm_access: { roles: ['learner', 'faculty'] } }));
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.dest.pathname, '/auth/sso/complete');
    assert.equal(result.returnTo, '/dashboard?view=student');
    const payload = jwt.decode(result.session.accessToken);
    assert.deepEqual(payload.amr, ['oidc']);
    assert.equal(payload.idp, 'test-sso');
    assert.deepEqual(result.session.user.contexts.map((c) => `${c.key}:${c.status}`), ['faculty:ACTIVE', 'student:ACTIVE']);
    const link = await prisma.federatedIdentity.findFirst({ where: { userId: people.rahul.user.id } });
    assert.equal(link.linkMethod, 'INSTITUTIONAL_ID');
    assert.deepEqual(link.lastEvaluation.granted.sort(), ['FACULTY', 'STUDENT']);
    const sources = await prisma.roleAssignmentSource.findMany({ where: { userId: people.rahul.user.id, source: 'IDP' } });
    assert.deepEqual(sources.map((s) => s.roleKey).sort(), ['FACULTY', 'STUDENT']);
    assert.ok(sources.every((s) => s.createdRole === false), 'roles he already held were confirmed, not re-created');
    assert.equal(await prisma.user.count({ where: { email: people.rahul.email } }), 1, 'no duplicate account');
  });

  it('a later sign-in uses the stable issuer + subject link', async () => {
    const result = await ssoSignIn(claimsFor(people.rahul, { realm_access: { roles: ['learner', 'faculty'] } }));
    assert.equal(result.status, 200);
  });

  it('the hand-off code works once', async () => {
    const result = await ssoSignIn(claimsFor(people.rahul, { realm_access: { roles: ['learner', 'faculty'] } }));
    const again = await api('/auth/oidc/exchange', { method: 'POST', body: { code: result.code } });
    assert.equal(again.status, 401);
  });

  it('password sign-in keeps working for the same account', async () => {
    assert.ok(await loginFixture(people.rahul.email));
  });

  it('logout ends the session at once and hands the provider the ID token (no confirmation page)', async () => {
    const result = await ssoSignIn(claimsFor(people.rahul, { realm_access: { roles: ['learner', 'faculty'] } }));
    const sid = jwt.decode(result.session.accessToken).sid;
    assert.ok(sid);
    const out = await api('/auth/logout', { method: 'POST', token: result.session.accessToken, body: { refreshToken: result.session.refreshToken } });
    assert.equal(out.status, 200);
    const url = new URL(out.body.data.providerLogoutUrl);
    assert.equal(`${url.origin}${url.pathname}`, `${idp.issuer}/logout`);
    assert.equal(jwt.decode(url.searchParams.get('id_token_hint')).sub, `kc-${people.rahul.user.id}`, 'id_token_hint is the session’s own ID token');
    assert.ok(url.searchParams.get('post_logout_redirect_uri').endsWith('/login'));
    assert.equal((await api('/auth/refresh', { method: 'POST', body: { refreshToken: result.session.refreshToken } })).status, 401);
    assert.equal((await api('/auth/me', { token: result.session.accessToken })).status, 401, 'the access token stops working before it expires');
    const row = await prisma.ssoSession.findUnique({ where: { id: sid } });
    assert.equal(row.endedReason, 'PORTAL_LOGOUT');
    assert.equal(row.idTokenSealed, null, 'the ID token is not kept after logout');
  });
});

describe('sign out of EdunexusAI only (the university sign-in stays open for other apps)', () => {
  it('ends this session, sends nothing to the provider, records a local logout', async () => {
    const result = await ssoSignIn(claimsFor(people.rahul, { realm_access: { roles: ['learner', 'faculty'] } }));
    const sid = jwt.decode(result.session.accessToken).sid;
    const out = await api('/auth/logout', { method: 'POST', token: result.session.accessToken, body: { refreshToken: result.session.refreshToken, everywhere: false } });
    assert.equal(out.status, 200);
    assert.equal(out.body.data.providerLogoutUrl, null);
    assert.equal((await api('/auth/me', { token: result.session.accessToken })).status, 401);
    assert.equal((await api('/auth/refresh', { method: 'POST', body: { refreshToken: result.session.refreshToken } })).status, 401);
    assert.equal((await prisma.ssoSession.findUnique({ where: { id: sid } })).endedReason, 'PORTAL_LOGOUT_LOCAL');
  });
});

describe('the single-use hand-off store (shared, atomic, expiring)', () => {
  const rahulClaims = () => claimsFor(people.rahul, { realm_access: { roles: ['learner', 'faculty'] } });
  /** The callback only; returns the hand-off code without exchanging it. */
  async function callbackCode() {
    const start = await fetch(`${base}/auth/oidc/demo-university/test-sso/start`, { redirect: 'manual' });
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
    const callback = new URL(idp.issueCode(start.headers.get('location'), { claims: rahulClaims() }));
    const cb = await fetch(`${base}/auth/oidc/callback${callback.search}`, { redirect: 'manual', headers: { cookie } });
    return new URLSearchParams(new URL(cb.headers.get('location')).hash.slice(1)).get('code');
  }

  it('stores only a hash of the code and no tokens', async () => {
    const code = await callbackCode();
    assert.equal(await prisma.ssoHandoff.count({ where: { codeHash: code } }), 0);
    const row = await prisma.ssoHandoff.findFirst({ orderBy: { createdAt: 'desc' } });
    assert.equal(row.codeHash.length, 64);
    assert.ok(!JSON.stringify(row).includes('eyJ'), 'no JWT in the hand-off row');
  });

  it('two concurrent exchanges of one code: exactly one session', async () => {
    const code = await callbackCode();
    const results = await Promise.all(Array.from({ length: 5 }, () => api('/auth/oidc/exchange', { method: 'POST', body: { code } })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401, 401, 401, 401]);
  });

  it('an expired code is refused', async () => {
    const code = await callbackCode();
    await prisma.ssoHandoff.updateMany({ where: { consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await api('/auth/oidc/exchange', { method: 'POST', body: { code } })).status, 401);
  });

  it('a code whose sign-in session has ended is refused', async () => {
    const code = await callbackCode();
    await prisma.ssoSession.updateMany({ where: { userId: people.rahul.user.id, endedAt: null }, data: { endedAt: new Date(), endedReason: 'TEST' } });
    assert.equal((await api('/auth/oidc/exchange', { method: 'POST', body: { code } })).status, 401);
  });
});

describe('revocation: an ended institutional sign-in keeps no access', () => {
  const sign = () => ssoSignIn(claimsFor(people.rahul, { realm_access: { roles: ['learner', 'faculty'] } }));
  const backchannel = (body, slug = 'demo-university', key = 'test-sso') =>
    fetch(`${base}/auth/oidc/backchannel-logout/${slug}/${key}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  const stillWorks = async (session) => (await api('/auth/me', { token: session.accessToken })).status === 200;

  it('back-channel logout by the provider’s session id ends that session only', async () => {
    const a = await ssoSignIn(claimsFor(people.rahul, { sid: 'kc-session-A', realm_access: { roles: ['learner', 'faculty'] } }));
    const b = await ssoSignIn(claimsFor(people.rahul, { sid: 'kc-session-B', realm_access: { roles: ['learner', 'faculty'] } }));
    const res = await backchannel({ logout_token: idp.logoutToken({ sid: 'kc-session-A' }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(await stillWorks(a.session), false);
    assert.equal((await api('/auth/refresh', { method: 'POST', body: { refreshToken: a.session.refreshToken } })).status, 401);
    assert.equal(await stillWorks(b.session), true);
  });

  it('back-channel logout by subject ends every session of that person from this provider', async () => {
    const a = await sign();
    const res = await backchannel({ logout_token: idp.logoutToken({ sub: `kc-${people.rahul.user.id}` }) });
    assert.equal(res.status, 200);
    assert.equal(await stillWorks(a.session), false);
  });

  it('forged or malformed logout tokens are rejected and end nothing', async () => {
    const a = await sign();
    const sub = `kc-${people.rahul.user.id}`;
    for (const body of [
      { logout_token: idp.logoutToken({ sub }, { signWithRogueKey: true }) },
      { logout_token: idp.logoutToken({ sub }, { override: { aud: 'another-client' } }) },
      { logout_token: idp.logoutToken({ sub }, { override: { iss: 'http://evil.example' } }) },
      { logout_token: idp.logoutToken({ sub }, { override: { events: {} } }) },
      { logout_token: idp.logoutToken({ sub, nonce: 'n' }) },
      { logout_token: idp.logoutToken({}) },
      { logout_token: idp.logoutToken({ sub }, { override: { iat: Math.floor(Date.now() / 1000) - 3600 } }) },
      { logout_token: 'not-a-jwt' },
      {},
    ]) assert.equal((await backchannel(body)).status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal((await backchannel({ logout_token: idp.logoutToken({ sub }) }, 'mr-test-sso-other')).status, 200, 'another institution’s endpoint');
    assert.equal(await stillWorks(a.session), true, 'nothing here ended this institution’s session');
  });

  it('a disabled provider ends its sessions', async () => {
    const a = await sign();
    await prisma.identityProvider.update({ where: { id: provider.id }, data: { enabled: false } });
    try {
      assert.equal(await stillWorks(a.session), false);
      assert.equal((await api('/auth/refresh', { method: 'POST', body: { refreshToken: a.session.refreshToken } })).status, 401);
    } finally {
      await prisma.identityProvider.update({ where: { id: provider.id }, data: { enabled: true } });
    }
  });

  it('a suspended account loses its SSO session', async () => {
    const a = await sign();
    await prisma.user.update({ where: { id: people.rahul.user.id }, data: { status: 'SUSPENDED' } });
    try {
      assert.equal(await stillWorks(a.session), false);
    } finally {
      await prisma.user.update({ where: { id: people.rahul.user.id }, data: { status: 'ACTIVE' } });
    }
  });

  it('a token claiming an SSO session without a live session row is refused', async () => {
    const a = await sign();
    const { iat, exp, ...claims } = jwt.decode(a.session.accessToken);
    assert.ok(iat && exp);
    const { env } = await import('../src/config/env.js');
    const forgedSid = jwt.sign({ ...claims, sid: '00000000-0000-0000-0000-000000000000' }, env.jwt.secret, { expiresIn: '5m' });
    const noSid = jwt.sign({ ...claims, sid: undefined }, env.jwt.secret, { expiresIn: '5m' });
    assert.equal((await api('/auth/me', { token: forgedSid })).status, 401);
    assert.equal((await api('/auth/me', { token: noSid })).status, 401, 'an SSO token from before sessions were tracked');
  });

  it('unlinking the sign-in identity ends its sessions', async () => {
    const a = await ssoSignIn(claimsFor(people.otto, { employee_number: 'SSO-F-5', realm_access: { roles: ['faculty'] } }));
    assert.equal(await stillWorks(a.session), true);
    const link = await prisma.federatedIdentity.findFirst({ where: { userId: people.otto.user.id } });
    const res = await api(`/admin/users/${people.otto.user.id}/sign-in-identities/${link.id}`, { method: 'DELETE', token: await login('admin') });
    assert.equal(res.status, 200);
    assert.equal(await stillWorks(a.session), false);
    assert.equal((await prisma.ssoSession.findFirst({ where: { userId: people.otto.user.id }, orderBy: { createdAt: 'desc' } })).endedReason, 'IDENTITY_UNLINKED');
  });
});

describe('refusals (nothing linked, no session)', () => {
  const refusal = async (claims, reason) => {
    const result = await ssoSignIn(claims);
    assert.equal(result.error, reason);
  };
  it('email alone is never enough', () => refusal({ sub: 'kc-x1', email: people.mira.email, email_verified: true, realm_access: { roles: ['learner'] } }, 'NO_INSTITUTIONAL_ID'));
  it('numbers of two different accounts', () => refusal({ sub: 'kc-x2', email: people.mira.email, email_verified: true, student_number: 'SSO-S-2', employee_number: 'SSO-F-5' }, 'AMBIGUOUS_RECORDS'));
  it('a verified email that does not belong to the matched account', () => refusal({ sub: 'kc-x3', email: 'someone.else@feddrick.edu', email_verified: true, student_number: 'SSO-S-2' }, 'EVIDENCE_MISMATCH'));
  it('an unverified email', () => refusal({ sub: 'kc-x4', email: people.mira.email, email_verified: false, student_number: 'SSO-S-2' }, 'EMAIL_NOT_VERIFIED'));
  it('no matching record', () => refusal({ sub: 'kc-x5', email: 'nobody@feddrick.edu', email_verified: true, student_number: 'NOPE-1' }, 'NO_MATCHING_RECORD'));
  it('a disabled account', async () => {
    assert.equal((await ssoSignIn(claimsFor(people.otto, { employee_number: 'SSO-F-5', realm_access: { roles: ['faculty'] } }))).status, 200);
    await prisma.user.update({ where: { id: people.otto.user.id }, data: { status: 'SUSPENDED' } });
    try {
      await refusal(claimsFor(people.otto, { realm_access: { roles: ['faculty'] } }), 'ACCOUNT_DISABLED');
    } finally {
      await prisma.user.update({ where: { id: people.otto.user.id }, data: { status: 'ACTIVE' } });
    }
  });
  it('a tampered or missing transaction cookie, and a cancelled sign-in', async () => {
    // Flip one character inside the encrypted body (AES-GCM authentication must fail).
    const flip = (c) => { const i = c.lastIndexOf('.') + 5; return `${c.slice(0, i)}${c[i] === 'A' ? 'B' : 'A'}${c.slice(i + 1)}`; };
    assert.equal((await ssoSignIn(claimsFor(people.mira, { student_number: 'SSO-S-2' }), { mutateCookie: flip })).error, 'INVALID_REQUEST');
    assert.equal((await ssoSignIn(claimsFor(people.mira, { student_number: 'SSO-S-2' }), { mutateCookie: () => '' })).error, 'INVALID_REQUEST');
    assert.equal((await ssoSignIn(claimsFor(people.mira, { student_number: 'SSO-S-2' }), { providerError: 'access_denied' })).error, 'CANCELLED');
  });
  it('an unknown provider', async () => {
    assert.equal((await ssoSignIn({}, { key: 'nope' })).error, 'UNKNOWN_PROVIDER');
  });
  it('another institution’s provider never reaches this institution’s accounts', async () => {
    const result = await ssoSignIn({ sub: 'kc-other', email: people.mira.email, email_verified: true, student_number: 'SSO-S-2' }, { tenantSlug: 'mr-test-sso-other' });
    assert.equal(result.error, 'NO_MATCHING_RECORD');
    assert.equal(await prisma.federatedIdentity.count({ where: { userId: people.mira.user.id, tenantId: other.id } }), 0);
  });
});

describe('the institution’s mapping rules decide community roles; never administrative ones', () => {
  it('an unknown IdP role grants nothing (no ADMIN from "it-admins")', async () => {
    const result = await ssoSignIn(claimsFor(people.mira, { student_number: 'SSO-S-2', realm_access: { roles: ['learner', 'it-admins'] } }));
    assert.equal(result.status, 200);
    assert.deepEqual(await rolesOf(people.mira), ['STUDENT']);
    assert.equal((await api('/admin/users', { token: result.session.accessToken })).status, 403);
    const link = await prisma.federatedIdentity.findFirst({ where: { userId: people.mira.user.id } });
    assert.ok(link.lastEvaluation.unknown.includes('realm_access.roles=it-admins'));
  });

  it('a role is withheld without its verified record', async () => {
    await ssoSignIn(claimsFor(people.mira, { realm_access: { roles: ['learner', 'faculty'] } }));
    assert.deepEqual(await rolesOf(people.mira), ['STUDENT']);
    const link = await prisma.federatedIdentity.findFirst({ where: { userId: people.mira.user.id } });
    assert.deepEqual(link.lastEvaluation.withheld, [{ role: 'FACULTY', reason: 'NO_FACULTY_RECORD' }]);
  });

  it('an administrator cannot map anything to ADMIN (API and database)', async () => {
    const res = await api(`/admin/identity-providers/${provider.id}/mappings`, { method: 'POST', token: await login('admin'), body: { claim: 'realm_access.roles', externalValue: 'it-admins', targetRole: 'ADMIN' } });
    assert.equal(res.status, 400);
    await assert.rejects(() => prisma.identityRoleMapping.create({ data: { tenantId: tenant.id, providerId: provider.id, claim: 'groups', externalValue: 'root', targetRole: 'ADMIN' } }));
  });

  it('roles the provider created are withdrawn when it stops asserting them; others stay', async () => {
    const first = await ssoSignIn(claimsFor(people.nina, { student_number: 'SSO-S-3', realm_access: { roles: ['learner'] } }));
    assert.equal(first.status, 200);
    assert.deepEqual(await rolesOf(people.nina), ['STUDENT']);
    const second = await ssoSignIn(claimsFor(people.nina, { realm_access: { roles: ['alumni'] } }));
    assert.equal(second.status, 200);
    assert.deepEqual(await rolesOf(people.nina), ['ALUMNI'], 'STUDENT (created by the provider) went; ALUMNI arrived');
    assert.deepEqual(second.session.user.contexts.map((c) => c.key), ['alumni']);
    const third = await ssoSignIn(claimsFor(people.nina, { realm_access: { roles: [] } }));
    assert.equal(third.error, 'NO_ACCESS', 'an account left with no role gets no session');
  });

  it('a role assigned in the portal is never removed by a sign-in', async () => {
    await ssoSignIn(claimsFor(people.rahul, { realm_access: { roles: [] } }));
    assert.deepEqual(await rolesOf(people.rahul), ['FACULTY', 'STUDENT']);
  });

  it('STAFF needs a staff record, or the institution’s policy that the employee number establishes one', async () => {
    const claims = claimsFor(people.sam, { student_number: 'SSO-S-4', employee_number: 'SSO-E-44', realm_access: { roles: ['learner', 'employee'] } });
    await ssoSignIn(claims);
    assert.deepEqual(await rolesOf(people.sam), ['STUDENT']);
    await prisma.identityProvider.update({ where: { id: provider.id }, data: { employeeIdEstablishesStaff: true } });
    try {
      const result = await ssoSignIn(claims);
      assert.deepEqual(await rolesOf(people.sam), ['STAFF', 'STUDENT']);
      assert.equal((await prisma.staffProfile.findFirst({ where: { userId: people.sam.user.id } })).employeeNumber, 'SSO-E-44');
      assert.deepEqual(result.session.user.contexts.map((c) => `${c.key}:${c.status}`), ['student:ACTIVE', 'staff:ACTIVE']);
    } finally {
      await prisma.identityProvider.update({ where: { id: provider.id }, data: { employeeIdEstablishesStaff: false } });
    }
  });

  it('a pending local password change does not block an SSO session', async () => {
    await prisma.user.update({ where: { id: people.mira.user.id }, data: { passwordChangeRequired: true } });
    const result = await ssoSignIn(claimsFor(people.mira, { realm_access: { roles: ['learner'] } }));
    assert.equal(result.session.user.passwordChangeRequired, false, 'the app is not asked to force a password change');
    assert.equal(result.session.user.signInMethod, 'SSO');
    const me = (await api('/auth/me', { token: result.session.accessToken })).body.data.user;
    assert.equal(me.passwordChangeRequired, false);
    assert.equal((await api('/dashboard/student', { token: result.session.accessToken })).status, 200);
    const local = (await api('/auth/login', { method: 'POST', body: { email: people.mira.email, password: 'MultiRole#Test2026' } })).body.data.user;
    assert.equal(local.passwordChangeRequired, true, 'a password session still has to change it');
    await prisma.user.update({ where: { id: people.mira.user.id }, data: { passwordChangeRequired: false } });
  });
});

describe('alumni: an administrator-verified link, roles from the mapping rules', () => {
  let alma;
  let admin;
  const almaClaims = (extra = {}) => ({ sub: 'kc-alumna-1', email: alma.email, email_verified: true, realm_access: { roles: ['alumni'] }, ...extra });
  before(async () => {
    alma = await createMultiRoleUser({ key: 'sso.alma', firstName: 'Alma', roles: ['ALUMNI'] });
    admin = await login('admin');
  });
  const link = (body, userId = alma.user.id) => api(`/admin/users/${userId}/sign-in-identities`, { method: 'POST', token: admin, body });

  it('without a link, a verified email alone never signs her in', async () => {
    assert.equal((await ssoSignIn(almaClaims())).error, 'NO_INSTITUTIONAL_ID');
    assert.equal(await prisma.federatedIdentity.count({ where: { userId: alma.user.id } }), 0);
  });

  it('the link needs a provider of this institution, a subject and a verification note', async () => {
    assert.equal((await link({ providerId: provider.id, subject: 'kc-alumna-1' })).status, 400, 'no note');
    assert.equal((await link({ providerId: provider.id, subject: 'kc alumna', verificationNote: 'Checked the ID card in person.' })).status, 400, 'no spaces in a subject');
    const otherProvider = await prisma.identityProvider.findFirst({ where: { tenantId: other.id } });
    assert.equal((await link({ providerId: otherProvider.id, subject: 'kc-alumna-1', verificationNote: 'Checked the ID card in person.' })).status, 404, 'another institution’s provider');
    assert.equal((await api(`/admin/users/${alma.user.id}/sign-in-identities`, { method: 'POST', token: await loginFixture(people.mira.email), body: { providerId: provider.id, subject: 'kc-alumna-1', verificationNote: 'Checked the ID card in person.' } })).status, 403, 'administrators only');
  });

  it('links on the administrator’s verification (audited), grants no role by itself', async () => {
    const before = await rolesOf(alma);
    const res = await link({ providerId: provider.id, subject: 'kc-alumna-1', verificationNote: 'Checked the ID card in person.' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.signInIdentities[0].linkMethod, 'ADMIN_VERIFIED');
    assert.deepEqual(await rolesOf(alma), before);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: alma.user.id, action: 'SSO_IDENTITY_LINKED' }, orderBy: { createdAt: 'desc' } });
    assert.match(audit.summary, /administrator verified: Checked the ID card in person\./);
    assert.equal((await link({ providerId: provider.id, subject: 'kc-alumna-2', verificationNote: 'Checked the ID card in person.' })).status, 409, 'one sign-in per provider');
    assert.equal((await link({ providerId: provider.id, subject: 'kc-alumna-1', verificationNote: 'Checked the ID card in person.' }, people.sam.user.id)).status, 409, 'a subject belongs to one account');
  });

  it('she signs in; the provider’s "alumni" value grants ALUMNI and nothing academic', async () => {
    const result = await ssoSignIn(almaClaims({ realm_access: { roles: ['alumni', 'learner', 'faculty', 'it-admins'] } }));
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.deepEqual(await rolesOf(alma), ['ALUMNI']);
    assert.deepEqual(result.session.user.contexts.map((c) => `${c.key}:${c.status}`), ['alumni:ACTIVE']);
    const evaluation = (await prisma.federatedIdentity.findFirst({ where: { userId: alma.user.id } })).lastEvaluation;
    assert.deepEqual(evaluation.withheld.map((w) => `${w.role}:${w.reason}`).sort(), ['FACULTY:NO_FACULTY_RECORD', 'STUDENT:NO_STUDENT_RECORD']);
    assert.ok(evaluation.unknown.includes('realm_access.roles=it-admins'));
    const sources = await prisma.roleAssignmentSource.findMany({ where: { userId: alma.user.id, roleKey: 'ALUMNI' } });
    assert.ok(sources.some((s) => s.source === 'IDP' && s.providerId === provider.id), 'the provider now also asserts ALUMNI');
    for (const path of ['/dashboard/student', '/sis/me/overview', '/faculty/dashboard', '/lms/me/moodle/courses', '/admin/users']) {
      assert.equal((await api(path, { token: result.session.accessToken })).status, 403, path);
    }
  });
});
