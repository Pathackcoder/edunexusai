import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer } from './helpers/testEnv.js';
import { startOidcProvider } from './helpers/oidcProvider.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { removeMultiRoleUsers } from './helpers/multiRole.js';
import { clearProviderConfigurations } from '../src/modules/identity/oidcClient.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';

/**
 * SSO-first: at the first institutional sign-in of someone with no portal account, the account is created from
 * the CampusCore person behind the token's verified institutional numbers (provider switch "jitProvisioning").
 * Real routes (start → provider → callback → exchange), an in-process OpenID provider and a CampusCore stub
 * with the person registry.
 */

const { prisma } = await import('../src/db/prisma.js');
const SECRET_ENV = 'OIDC_CLIENT_SECRET_TESTJIT';
const CLIENT_ID = 'cc_stubclient0009';
const CLIENT_SECRET = 'ccs_stub_secret_value_do_not_leak_0009';
const ENV_KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let idp;
let stub;
let base;
let tenant;
let provider;

// Fixture addresses start with "multirole." so the shared cleanup removes any account created here.
const mail = (local, domain = 'students.feddrick.edu') => `multirole.jit-${local}@${domain}`;

before(async () => {
  idp = await startOidcProvider({ clientId: 'edunexusai', clientSecret: 'jit-test-secret' });
  process.env[SECRET_ENV] = 'jit-test-secret';
  stub = await startCampusCoreStub({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  Object.assign(process.env, { SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: stub.url, CAMPUSCORE_CLIENT_ID: CLIENT_ID, CAMPUSCORE_CLIENT_SECRET: CLIENT_SECRET, CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000' });
  resetSisClient();
  ({ baseUrl: base } = await getTestServer());
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  await prisma.identityProvider.deleteMany({ where: { key: 'test-jit' } });
  provider = await prisma.identityProvider.create({ data: { tenantId: tenant.id, key: 'test-jit', displayName: 'Feddrick ID (JIT test)', issuer: idp.issuer, clientId: 'edunexusai', clientSecretEnv: SECRET_ENV, studentIdClaim: 'student_number', employeeIdClaim: 'employee_number', enabled: true, allowInsecureHttp: true } });
  for (const [value, role] of [['learner', 'STUDENT'], ['faculty', 'FACULTY']]) {
    await prisma.identityRoleMapping.create({ data: { tenantId: tenant.id, providerId: provider.id, claim: 'realm_access.roles', externalValue: value, targetRole: role } });
  }
  const S = stub.state;
  const student = (id, number, email, extra = {}) => S.students.set(id, { ...S.students.get('stu-maya'), id, studentNumber: number, firstName: 'Jit', lastName: id, email, status: 'ACTIVE', ...extra });
  student('stu-ana', 'S7001', mail('ana'));
  // One person who teaches and studies: two records, two addresses, one personId.
  S.faculty.set('fac-ravi', { id: 'fac-ravi', personId: 'p-ravi', employeeNumber: 'F7002', firstName: 'Ravi', lastName: 'Both', email: mail('ravi', 'feddrick.edu'), status: 'ACTIVE', title: 'Lecturer', department: { id: 'dep-cs', code: 'CS', name: 'Computer Science' } });
  student('stu-ravi', 'S7002', mail('ravi'), { personId: 'p-ravi', firstName: 'Ravi', lastName: 'Both' });
  student('stu-ben', 'S7003', mail('ben'));
  student('stu-cy', 'S7004', mail('cy'));
  student('stu-gone', 'S7005', mail('gone'), { status: 'WITHDRAWN' });
  student('stu-taken', 'S7006', mail('taken'));
  student('stu-linked', 'S7007', mail('linked'));
  stub.link('someone-else', 'STUDENT', 'stu-linked');
  student('stu-flaky', 'S7008', mail('flaky'));
  // A person CampusCore excludes from identity provisioning (records kept, never offered to integrations).
  student('stu-excluded', 'S7009', mail('excluded'), { identityExcluded: true });
});

after(async () => {
  await prisma.identityProvider.deleteMany({ where: { key: 'test-jit' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE', internalId: { in: (await prisma.user.findMany({ where: { email: { startsWith: 'multirole.jit-' } }, select: { id: true } })).map((u) => u.id) } } });
  await removeMultiRoleUsers();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  delete process.env[SECRET_ENV];
  resetSisClient();
  clearProviderConfigurations();
  await idp.close();
  await stub.close();
  await closeTestServer();
});

async function ssoSignIn(claims) {
  const start = await fetch(`${base}/auth/oidc/demo-university/test-jit/start?returnTo=%2Fdashboard`, { redirect: 'manual' });
  const location = new URL(start.headers.get('location'));
  const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
  const callback = new URL(idp.issueCode(location.href, { claims }));
  const cb = await fetch(`${base}/auth/oidc/callback${callback.search}`, { redirect: 'manual', headers: { cookie } });
  const dest = new URL(cb.headers.get('location'));
  if (dest.pathname === '/login') return { error: dest.searchParams.get('sso_error') };
  const exchanged = await api('/auth/oidc/exchange', { method: 'POST', body: { code: new URLSearchParams(dest.hash.slice(1)).get('code') } });
  return { status: exchanged.status, session: exchanged.body?.data };
}
const setJit = (on) => prisma.identityProvider.update({ where: { id: provider.id }, data: { jitProvisioning: on } });
const accounts = (email) => prisma.user.count({ where: { tenantId: tenant.id, email } });

describe('first sign-in without a portal account', () => {
  it('switch off (the default): refused as before, nothing created', async () => {
    assert.equal((await prisma.identityProvider.findUnique({ where: { id: provider.id } })).jitProvisioning, false);
    const r = await ssoSignIn({ sub: 'kc-ana', email: mail('ana'), email_verified: true, student_number: 'S7001' });
    assert.equal(r.error, 'NO_MATCHING_RECORD');
    assert.equal(await accounts(mail('ana')), 0);
  });

  it('switch on: one account from the CampusCore person, no portal password, linked in CampusCore and to the sign-in', async () => {
    await setJit(true);
    const r = await ssoSignIn({ sub: 'kc-ana', email: mail('ana'), email_verified: true, student_number: 'S7001', realm_access: { roles: ['learner'] } });
    assert.equal(r.status, 200, JSON.stringify(r));
    const user = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: mail('ana') }, include: { studentProfile: true, userRoles: { include: { role: true } } } });
    assert.equal(user.passwordHash, null);
    assert.equal(user.passwordChangeRequired, false);
    assert.equal(user.studentProfile.studentNumber, 'S7001');
    assert.deepEqual(user.userRoles.map((x) => x.role.key), ['STUDENT']);
    const sources = await prisma.roleAssignmentSource.findMany({ where: { userId: user.id }, orderBy: { source: 'asc' } });
    assert.deepEqual(sources.map((x) => x.source).sort(), ['IDP', 'SIS']);
    assert.equal(sources.find((x) => x.source === 'SIS').evidence.via, 'JIT_SIGN_IN');
    const link = await prisma.federatedIdentity.findFirst({ where: { userId: user.id } });
    assert.equal(link.linkMethod, 'JIT_PROVISIONED');
    const cc = stub.state.links.filter((l) => l.externalUserId === user.id && l.status === 'ACTIVE');
    assert.deepEqual(cc.map((l) => [l.recordType, l.sisId, l.actingUser]), [['STUDENT', 'stu-ana', 'edunexusai:jit-sign-in']]);
    assert.equal(await prisma.externalIdentity.count({ where: { provider: 'CAMPUSCORE', internalId: user.id, entityType: 'STUDENT', externalId: 'stu-ana' } }), 1);
    assert.equal(r.session.user.hasPassword, false);
    assert.ok(await prisma.auditLog.findFirst({ where: { entityId: user.id, action: 'SIS_ACCOUNT_PROVISIONED' } }));
    // The account cannot set a password through the password-change route, and has no password sign-in.
    const pw = await api('/auth/password', { method: 'POST', token: r.session.accessToken, body: { currentPassword: 'x', newPassword: 'Another#Pass2026' } });
    assert.equal(pw.status, 409);
    assert.equal((await api('/auth/login', { method: 'POST', body: { email: mail('ana'), password: '' } })).status === 200, false);
  });

  it('the next sign-in uses the link; still one account', async () => {
    const r = await ssoSignIn({ sub: 'kc-ana', email: mail('ana'), email_verified: true, student_number: 'S7001' });
    assert.equal(r.status, 200);
    assert.equal(await accounts(mail('ana')), 1);
  });

  it('a person who teaches and studies gets ONE account with both relationships', async () => {
    const r = await ssoSignIn({ sub: 'kc-ravi', email: mail('ravi', 'feddrick.edu'), email_verified: true, student_number: 'S7002', employee_number: 'F7002', realm_access: { roles: ['learner', 'faculty'] } });
    assert.equal(r.status, 200, JSON.stringify(r));
    const user = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: mail('ravi', 'feddrick.edu') }, include: { studentProfile: true, facultyProfile: true, userRoles: { include: { role: true } } } });
    assert.deepEqual([user.studentProfile.studentNumber, user.facultyProfile.employeeNumber], ['S7002', 'F7002']);
    assert.deepEqual(user.userRoles.map((x) => x.role.key).sort(), ['FACULTY', 'STUDENT']);
    // The record carrying the sign-in address is linked first; CampusCore accepts the other as the same person.
    const cc = stub.state.links.filter((l) => l.externalUserId === user.id);
    assert.deepEqual(cc.map((l) => l.recordType), ['FACULTY', 'STUDENT']);
    assert.equal(cc[1].evidence.samePerson, 'CAMPUSCORE_PERSON');
    assert.deepEqual(r.session.user.contexts.map((c) => `${c.key}:${c.status}`), ['faculty:ACTIVE', 'student:ACTIVE']);
    assert.equal(await accounts(mail('ravi')), 0, 'no second account for the student address');
  });
});

describe('never on a guess', () => {
  const refused = async (claims, reason) => {
    const r = await ssoSignIn({ email_verified: true, ...claims });
    assert.equal(r.error, reason, JSON.stringify(r));
  };

  it('numbers of two different people, a foreign or unverified email: refused, nothing created', async () => {
    await refused({ sub: 'kc-x1', email: mail('ben'), student_number: ['S7003', 'S7004'] }, 'AMBIGUOUS_RECORDS');
    await refused({ sub: 'kc-x2', email: mail('cy'), student_number: 'S7003' }, 'EVIDENCE_MISMATCH');
    await refused({ sub: 'kc-x3', email: mail('ben'), student_number: 'S7003', email_verified: false }, 'EMAIL_NOT_VERIFIED');
    await refused({ sub: 'kc-x4', email: mail('ben'), student_number: 'S7003', employee_number: 'F9999' }, 'AMBIGUOUS_RECORDS');
    assert.equal(await accounts(mail('ben')), 0);
    assert.equal(await accounts(mail('cy')), 0);
  });

  it('no current relationship, an address or record someone already has: refused for an administrator to resolve', async () => {
    await refused({ sub: 'kc-x5', email: mail('gone'), student_number: 'S7005' }, 'NO_ELIGIBLE_RECORD');
    const existing = await prisma.user.create({ data: { tenantId: tenant.id, email: mail('taken'), passwordHash: null, firstName: 'Already', lastName: 'Here' } });
    await refused({ sub: 'kc-x6', email: mail('taken'), student_number: 'S7006' }, 'EMAIL_IN_USE');
    assert.equal(await prisma.studentProfile.count({ where: { userId: existing.id } }), 0);
    await refused({ sub: 'kc-x7', email: mail('linked'), student_number: 'S7007' }, 'RECORD_ALREADY_LINKED');
    assert.equal(await accounts(mail('linked')), 0);
  });

  it('a person CampusCore excludes from identity provisioning: no account at sign-in, and an administrator cannot link one', async () => {
    await refused({ sub: 'kc-x11', email: mail('excluded'), student_number: 'S7009' }, 'NO_MATCHING_RECORD');
    assert.equal(await accounts(mail('excluded')), 0);
    const { login } = await import('./helpers/testEnv.js');
    const res = await api('/admin/people', { method: 'POST', token: await login('admin'), body: { role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-excluded' }, login: { mode: 'NEW', password: 'Excluded#Pass2026' } } });
    assert.notEqual(res.body?.data?.outcome, 'COMPLETED', JSON.stringify(res.body));
    assert.equal(await accounts(mail('excluded')), 0, 'nothing created');
    assert.equal(stub.state.links.filter((l) => l.sisId === 'stu-excluded').length, 0);
  });

  it('CampusCore withholds the person registry, is down, or fails mid-way: refused, nothing left behind', async () => {
    const scopes = stub.state.scopes;
    stub.state.scopes = scopes.filter((s) => s !== 'people:read');
    stub.revokeAllTokens();
    try {
      await refused({ sub: 'kc-x8', email: mail('ben'), student_number: 'S7003' }, 'JIT_NOT_PERMITTED');
    } finally {
      stub.state.scopes = scopes;
      stub.revokeAllTokens();
    }
    stub.state.down = true;
    try {
      await refused({ sub: 'kc-x9', email: mail('ben'), student_number: 'S7003' }, 'SIS_UNAVAILABLE');
    } finally { stub.state.down = false; }
    // More failures than the connector's bounded retries of an idempotent link request.
    stub.state.failLinks = 10;
    const r = await ssoSignIn({ sub: 'kc-x10', email: mail('flaky'), email_verified: true, student_number: 'S7008' });
    stub.state.failLinks = 0;
    assert.equal(r.error, 'SIS_UNAVAILABLE');
    assert.equal(await accounts(mail('flaky')), 0, 'the account was rolled back');
    assert.equal(stub.state.links.filter((l) => l.sisId === 'stu-flaky' && l.status === 'ACTIVE').length, 0);
    assert.equal(await accounts(mail('ben')), 0);
  });
});
