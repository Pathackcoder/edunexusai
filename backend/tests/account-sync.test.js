import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeTestServer, getTestServer } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { removeMultiRoleUsers } from './helpers/multiRole.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';

/**
 * Registry sync (CampusCore → EdunexusAI): a person created in CampusCore gets a portal account without anyone
 * importing them; one account per person (both roles for someone who teaches and studies); nobody already linked,
 * holding the address or without a current record is touched; re-running creates nothing. CampusCore is the stub.
 */

const { prisma } = await import('../src/db/prisma.js');
const { runAccountSync } = await import('../src/modules/sis/accountSync.js');
const CLIENT_ID = 'cc_stubclient0013';
const CLIENT_SECRET = 'ccs_stub_secret_value_do_not_leak_0013';
const ENV_KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS', 'CAMPUSCORE_ACCOUNT_SYNC_SINCE'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const mail = (local, domain = 'students.feddrick.edu') => `multirole.sync-${local}@${domain}`;
const FIXTURE_RECORDS = ['stu-new', 'fac-both', 'stu-both', 'stu-linked', 'stu-taken', 'stu-gone', 'stu-excluded', 'stu-later'];
let stub;
let tenant;
let integration;
let createdIntegration = false;

before(async () => {
  await getTestServer();
  stub = await startCampusCoreStub({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  Object.assign(process.env, { SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: stub.url, CAMPUSCORE_CLIENT_ID: CLIENT_ID, CAMPUSCORE_CLIENT_SECRET: CLIENT_SECRET, CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000' });
  delete process.env.CAMPUSCORE_ACCOUNT_SYNC_SINCE;
  resetSisClient();
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  integration = await prisma.integration.findFirst({ where: { tenantId: tenant.id, provider: 'CAMPUSCORE' } });
  if (!integration) {
    integration = await prisma.integration.create({ data: { tenantId: tenant.id, key: 'campuscore-sync-test', provider: 'CAMPUSCORE', displayName: 'CampusCore (sync test)', mode: 'LIVE' } });
    createdIntegration = true;
  }
  await prisma.integrationSyncLog.deleteMany({ where: { integrationId: integration.id, operation: 'ACCOUNT_SYNC' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE', externalId: { in: FIXTURE_RECORDS } } });
  const S = stub.state;
  S.students.clear();
  S.faculty.clear();
  const student = (id, number, email, extra = {}) => S.students.set(id, { id, studentNumber: number, firstName: 'Sync', lastName: id, preferredName: null, email, status: 'ACTIVE', classLevel: 'JUNIOR', program: { id: 'p1', code: 'BS-CS', name: 'Computer Science' }, ...extra });
  student('stu-new', 'S8101', mail('new'));
  S.faculty.set('fac-both', { id: 'fac-both', personId: 'p-both', employeeNumber: 'F8102', firstName: 'Both', lastName: 'Roles', email: mail('both', 'feddrick.edu'), status: 'ACTIVE', title: 'Lecturer', department: { id: 'dep-cs', code: 'CS', name: 'Computer Science' } });
  student('stu-both', 'S8102', mail('both'), { personId: 'p-both', firstName: 'Both', lastName: 'Roles' });
  student('stu-linked', 'S8103', mail('linked'));
  stub.link('someone-else', 'STUDENT', 'stu-linked');
  student('stu-taken', 'S8104', mail('taken'));
  student('stu-gone', 'S8105', mail('gone'), { status: 'WITHDRAWN' });
  student('stu-excluded', 'S8106', mail('excluded'), { identityExcluded: true });
  await prisma.user.create({ data: { tenantId: tenant.id, email: mail('taken'), firstName: 'Already', lastName: 'Here', status: 'ACTIVE' } });
});

after(async () => {
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE', externalId: { in: FIXTURE_RECORDS } } });
  await prisma.integrationSyncLog.deleteMany({ where: { integrationId: integration.id, operation: 'ACCOUNT_SYNC' } });
  if (createdIntegration) await prisma.integration.delete({ where: { id: integration.id } });
  await removeMultiRoleUsers();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  resetSisClient();
  await stub.close();
  await closeTestServer();
});

describe('CampusCore registry → EdunexusAI accounts', () => {
  it('the first pass without a starting point only sets the cursor (the historical registry is never swept)', async () => {
    const { results } = await runAccountSync();
    assert.deepEqual(results, []);
    assert.equal(await prisma.user.count({ where: { email: mail('new') } }), 0);
  });

  it('a new CampusCore person gets one portal account, linked in CampusCore, without a password', async () => {
    const { results } = await runAccountSync();
    const byNumber = Object.fromEntries(results.map((r) => [r.personNumber, r]));
    const created = results.filter((r) => r.outcome === 'CREATED');
    assert.equal(created.length, 2, JSON.stringify(results));
    const user = await prisma.user.findFirst({ where: { email: mail('new') }, include: { userRoles: { include: { role: true } }, studentProfile: true, roleSources: true } });
    assert.ok(user, 'account created');
    assert.equal(user.passwordHash, null, 'university sign-in only');
    assert.deepEqual(user.userRoles.map((r) => r.role.key), ['STUDENT']);
    assert.equal(user.studentProfile.studentNumber, 'S8101');
    assert.ok(user.roleSources.every((s) => s.source === 'SIS'));
    assert.ok(stub.state.links.some((l) => l.externalUserId === user.id && l.sisId === 'stu-new' && l.status === 'ACTIVE'), 'CampusCore link made');
    assert.equal(Object.values(byNumber).filter((r) => r.reason === 'ALREADY_LINKED').length, 1);
    assert.equal(Object.values(byNumber).filter((r) => r.reason === 'EMAIL_IN_USE').length, 1);
    assert.equal(Object.values(byNumber).filter((r) => r.reason === 'NO_ELIGIBLE_RECORD').length, 1);
    assert.ok(!results.some((r) => r.outcome === 'FAILED'));
  });

  it('a person who teaches and studies gets ONE account with both records, addressed by the primary email', async () => {
    const user = await prisma.user.findFirst({ where: { email: mail('both', 'feddrick.edu') }, include: { userRoles: { include: { role: true } }, studentProfile: true, facultyProfile: true } });
    assert.ok(user);
    assert.deepEqual(user.userRoles.map((r) => r.role.key).sort(), ['FACULTY', 'STUDENT']);
    assert.equal(user.studentProfile.studentNumber, 'S8102');
    assert.equal(user.facultyProfile.employeeNumber, 'F8102');
    assert.equal(await prisma.user.count({ where: { email: mail('both') } }), 0, 'no second account for the student address');
  });

  it('the excluded person is never offered, the address holder is untouched, and re-running creates nothing', async () => {
    assert.equal(await prisma.user.count({ where: { email: mail('excluded') } }), 0);
    const taken = await prisma.user.findFirst({ where: { email: mail('taken') }, include: { studentProfile: true } });
    assert.equal(taken.studentProfile, null);
    const before = await prisma.user.count({ where: { email: { startsWith: 'multirole.sync-' } } });
    const again = await runAccountSync();
    assert.ok(!again.results.some((r) => r.outcome === 'CREATED'));
    assert.equal(await prisma.user.count({ where: { email: { startsWith: 'multirole.sync-' } } }), before);
  });

  it('a person refused by CampusCore (identity-link policy off) is reported and retried, never half-created', async () => {
    stub.state.policies['identity.link'] = false;
    stub.state.students.set('stu-later', { ...stub.state.students.get('stu-new'), id: 'stu-later', studentNumber: 'S8107', email: mail('later') });
    const { results } = await runAccountSync();
    const r = results.find((x) => x.outcome === 'FAILED');
    assert.ok(r, JSON.stringify(results));
    assert.equal(await prisma.user.count({ where: { email: mail('later') } }), 0, 'rolled back');
    stub.state.policies['identity.link'] = true;
    const retry = await runAccountSync();
    assert.ok(retry.results.some((x) => x.outcome === 'CREATED'), 'retried on the next pass');
    assert.equal(await prisma.user.count({ where: { email: mail('later') } }), 1);
  });
});
