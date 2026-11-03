import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeTestServer, getTestServer } from './helpers/testEnv.js';
import { startMoodleStub } from './helpers/moodleStub.js';
import { createMultiRoleUser, removeMultiRoleUsers } from './helpers/multiRole.js';
import { clearMoodleCapabilityCache } from '../src/integrations/connectors/MoodleConnector.js';

/**
 * Moodle in the SSO-first flow: after an account is created at its first institutional sign-in, the person's
 * Moodle account follows (MOODLE_JIT_PROVISIONING), one account per person, signing in with the university
 * sign-in when MOODLE_ACCOUNT_AUTH=oauth2 (no Moodle password exists). In-process Moodle stub only.
 */

const TOKEN = 'stub-token-moodlesso-0123456789abc';
const ENV_KEYS = ['MOODLE_BASE_URL', 'MOODLE_TOKEN', 'MOODLE_WRITES_ENABLED', 'MOODLE_STUDENT_ROLE_ID', 'MOODLE_TEACHER_ROLE_ID', 'MOODLE_MAX_RETRIES', 'MOODLE_TIMEOUT_MS', 'MOODLE_ACCOUNT_AUTH', 'MOODLE_JIT_PROVISIONING'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let stub;
let prisma;
let followUp;
let person;

before(async () => {
  await getTestServer();
  stub = await startMoodleStub({ token: TOKEN });
  Object.assign(process.env, { MOODLE_BASE_URL: stub.url, MOODLE_TOKEN: TOKEN, MOODLE_WRITES_ENABLED: 'true', MOODLE_STUDENT_ROLE_ID: '5', MOODLE_TEACHER_ROLE_ID: '3', MOODLE_MAX_RETRIES: '1', MOODLE_TIMEOUT_MS: '1000' });
  delete process.env.MOODLE_ACCOUNT_AUTH;
  delete process.env.MOODLE_JIT_PROVISIONING;
  ({ prisma } = await import('../src/db/prisma.js'));
  followUp = await import('../src/modules/people/lmsFollowUp.js');
  await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: stub.url, enabled: true, mode: 'LIVE' } });
  clearMoodleCapabilityCache();
  person = await createMultiRoleUser({ key: 'moodlesso.ravi', firstName: 'Ravi', lastName: 'Both', roles: ['STUDENT', 'FACULTY'], student: { studentNumber: 'MS-S-0301', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'MS-F-0301' } });
});

after(async () => {
  await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE', internalId: { in: [person.studentProfile.id, person.facultyProfile.id] } } });
  await prisma.integrationOperation.deleteMany({ where: { internalId: { in: [person.studentProfile.id, person.facultyProfile.id] } } });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await removeMultiRoleUsers();
  await stub?.close();
  await closeTestServer();
});

describe('Moodle after the first institutional sign-in', () => {
  it('does nothing unless MOODLE_JIT_PROVISIONING is on', async () => {
    const before = stub.state.users.size;
    assert.deepEqual(await followUp.provisionLmsAfterSignIn({ tenantId: person.tenantId, userId: person.user.id }), { state: 'SKIPPED' });
    assert.equal(stub.state.users.size, before);
  });

  it('creates ONE Moodle account for a person who teaches and studies, signing in with the university sign-in', async () => {
    process.env.MOODLE_JIT_PROVISIONING = 'true';
    process.env.MOODLE_ACCOUNT_AUTH = 'oauth2';
    const before = stub.state.users.size;
    const result = await followUp.provisionLmsAfterSignIn({ tenantId: person.tenantId, userId: person.user.id });
    assert.equal(result.state, 'DONE');
    assert.equal(stub.state.users.size, before + 1, 'exactly one Moodle account');
    const account = [...stub.state.users.values()].find((u) => u.email === person.email);
    assert.equal(account.auth, 'oauth2');
    assert.deepEqual(stub.state.credentials.get(account.id), { password: null, emailed: false, forceChange: false }, 'no Moodle password exists');
    const links = await prisma.externalIdentity.findMany({ where: { provider: 'MOODLE', internalId: { in: [person.studentProfile.id, person.facultyProfile.id] } } });
    assert.deepEqual(links.map((l) => Number(l.externalId)), [account.id, account.id]);
    assert.ok(links.some((l) => l.linkMethod === 'SAME_PERSON'), 'the second profile reuses the first one\'s account');
    assert.ok(await prisma.auditLog.findFirst({ where: { entityId: person.user.id, action: 'MOODLE_JIT_FOLLOW_UP' } }));
  });
});
