import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeTestServer, getTestServer } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { createMultiRoleUser, removeMultiRoleUsers } from './helpers/multiRole.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';

/**
 * People Search is derived from portal accounts and their CampusCore person records: one entry per person with
 * every role, institutional name/title/programme from CampusCore, excluded people and entries without an account
 * never listed.
 */

const { prisma } = await import('../src/db/prisma.js');
const { refreshDirectoryEntry, rebuildDirectory } = await import('../src/modules/people/directorySync.js');
const CLIENT_ID = 'cc_stubclient0011';
const CLIENT_SECRET = 'ccs_stub_secret_value_do_not_leak_0011';
const ENV_KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let stub;
let both;
let excluded;
let otherTenant;

before(async () => {
  await getTestServer();
  stub = await startCampusCoreStub({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  Object.assign(process.env, { SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: stub.url, CAMPUSCORE_CLIENT_ID: CLIENT_ID, CAMPUSCORE_CLIENT_SECRET: CLIENT_SECRET, CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000' });
  resetSisClient();
  const S = stub.state;
  S.faculty.set('fac-dir', { id: 'fac-dir', personId: 'p-dir', employeeNumber: 'F8801', firstName: 'Dana', lastName: 'Both', email: 'dana.both@feddrick.edu', status: 'ACTIVE', title: 'Senior Lecturer', department: { id: 'dep-cs', code: 'CS', name: 'Computer Science' } });
  S.students.set('stu-dir', { ...S.students.get('stu-maya'), id: 'stu-dir', personId: 'p-dir', studentNumber: 'S8801', firstName: 'Dana', lastName: 'Both', email: 'dana.both@students.feddrick.edu' });
  S.students.set('stu-dir-x', { ...S.students.get('stu-maya'), id: 'stu-dir-x', studentNumber: 'S8802', firstName: 'Ex', lastName: 'Cluded', email: 'ex@students.feddrick.edu', identityExcluded: true });
  both = await createMultiRoleUser({ key: 'dir.both', firstName: 'Local', lastName: 'Name', roles: ['STUDENT', 'FACULTY'], student: { studentNumber: 'S8801', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'F8801' } });
  excluded = await createMultiRoleUser({ key: 'dir.excluded', firstName: 'Ex', roles: ['STUDENT'], student: { studentNumber: 'S8802', tierKey: 'STANDARD' } });
  await prisma.tenant.deleteMany({ where: { slug: 'dir-test-tenant' } });
  otherTenant = await prisma.tenant.create({ data: { slug: 'dir-test-tenant', name: 'Directory test tenant' } });
});

after(async () => {
  await prisma.directoryProfile.deleteMany({ where: { userId: { in: [both.user.id, excluded.user.id] } } });
  await prisma.tenant.deleteMany({ where: { slug: 'dir-test-tenant' } });
  await removeMultiRoleUsers();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  resetSisClient();
  await stub.close();
  await closeTestServer();
});

describe('People Search derived from accounts and CampusCore', () => {
  it('a person who teaches and studies is ONE entry with both roles, described by CampusCore', async () => {
    const entry = await refreshDirectoryEntry(both.tenantId, both.user.id);
    assert.deepEqual(entry.roles, ['faculty', 'student']);
    assert.equal(entry.type, 'faculty');
    assert.equal(entry.name, 'Dana Both', 'the institutional name, not the local account name');
    assert.equal(entry.email, 'dana.both@feddrick.edu', 'the person\'s primary email');
    assert.match(entry.role, /Senior Lecturer · Student/);
    assert.equal(entry.department, 'Computer Science');
    assert.match(entry.externalKey, /^person:P\d{7}$/, 'keyed by the CampusCore person, so one entry per person');
    assert.equal(await prisma.directoryProfile.count({ where: { userId: both.user.id } }), 1);
    // Refreshing again never creates a second entry.
    await refreshDirectoryEntry(both.tenantId, both.user.id);
    assert.equal(await prisma.directoryProfile.count({ where: { userId: both.user.id } }), 1);
    // An entry left behind by a deleted account (no userId) with the same key is replaced, not a blocker.
    await prisma.directoryProfile.update({ where: { userId: both.user.id }, data: { userId: null } });
    const again = await refreshDirectoryEntry(both.tenantId, both.user.id);
    assert.ok(again, 'refreshed despite the orphaned entry');
    assert.equal(await prisma.directoryProfile.count({ where: { tenantId: both.tenantId, externalKey: entry.externalKey } }), 1);
  });

  it('a person CampusCore excludes from identity provisioning is not listed', async () => {
    await prisma.directoryProfile.create({ data: { tenantId: excluded.tenantId, userId: excluded.user.id, externalKey: 'legacy-excluded', type: 'student', roles: ['student'], name: 'Old entry' } });
    assert.equal(await refreshDirectoryEntry(excluded.tenantId, excluded.user.id), null);
    assert.equal(await prisma.directoryProfile.count({ where: { userId: excluded.user.id } }), 0, 'its old entry is removed');
  });

  it('a rebuild removes entries without an account and lists each active account once', async () => {
    await prisma.directoryProfile.create({ data: { tenantId: otherTenant.id, externalKey: 'dir-fictional', type: 'faculty', roles: ['faculty'], name: 'Dr. Fictional' } });
    const { removedUnlinked, listed } = await rebuildDirectory(otherTenant.id);
    assert.equal(removedUnlinked, 1);
    assert.deepEqual(listed, []);
    assert.equal(await prisma.directoryProfile.count({ where: { tenantId: otherTenant.id } }), 0);
  });
});
