import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeTestServer } from './helpers/testEnv.js';
import { startMoodleStub } from './helpers/moodleStub.js';
import { createMultiRoleUser, removeMultiRoleUsers } from './helpers/multiRole.js';
import { clearMoodleCapabilityCache } from '../src/integrations/connectors/MoodleConnector.js';

/**
 * Systems → Moodle: an administrator can see a profile's Moodle state and resolve it (link the existing account,
 * link an explicit one only on matching evidence, unlink a wrong one), and one Moodle account never belongs to two
 * people. Every call goes to the in-process Moodle stub.
 */

const TOKEN = 'stub-token-linkmgmt-0123456789abcd';
const ENV_KEYS = ['MOODLE_BASE_URL', 'MOODLE_TOKEN', 'MOODLE_WRITES_ENABLED', 'MOODLE_STUDENT_ROLE_ID', 'MOODLE_TEACHER_ROLE_ID', 'MOODLE_MAX_RETRIES', 'MOODLE_TIMEOUT_MS'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let stub;
let prisma;
let moodle;
let ana;
let teacher;
let other;
let adminAuth;

before(async () => {
  stub = await startMoodleStub({ token: TOKEN });
  Object.assign(process.env, { MOODLE_BASE_URL: stub.url, MOODLE_TOKEN: TOKEN, MOODLE_WRITES_ENABLED: 'true', MOODLE_STUDENT_ROLE_ID: '5', MOODLE_TEACHER_ROLE_ID: '3', MOODLE_MAX_RETRIES: '1', MOODLE_TIMEOUT_MS: '1000' });
  ({ prisma } = await import('../src/db/prisma.js'));
  moodle = await import('../src/modules/lms/moodleService.js');
  await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: stub.url, enabled: true, mode: 'LIVE' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE' } });
  clearMoodleCapabilityCache();
  ana = await createMultiRoleUser({ key: 'lm.ana', firstName: 'Ana', lastName: 'Link', roles: ['STUDENT'], student: { studentNumber: 'LM-S-01', tierKey: 'STANDARD' } });
  teacher = await createMultiRoleUser({ key: 'lm.teacher', firstName: 'Tess', lastName: 'Link', roles: ['FACULTY'], faculty: { employeeNumber: 'LM-F-01' } });
  other = await createMultiRoleUser({ key: 'lm.other', firstName: 'Otto', lastName: 'Link', roles: ['STUDENT'], student: { studentNumber: 'LM-S-02', tierKey: 'STANDARD' } });
  const admin = await prisma.user.findFirst({ where: { email: 'admin@edunexus.ai' } });
  adminAuth = { tenantId: ana.tenantId, userId: admin.id, roles: ['ADMIN'] };
  stub.state.users.set(701, { id: 701, username: 'lm-s-01', email: ana.email, idnumber: 'LM-S-01', firstname: 'Ana', lastname: 'Link', auth: 'manual', suspended: 0 });
  stub.state.users.set(702, { id: 702, username: 'lm-f-01', email: teacher.email, idnumber: '', firstname: 'Tess', lastname: 'Link', auth: 'manual', suspended: 0 });
  stub.state.users.set(703, { id: 703, username: 'someone', email: 'someone@example.org', idnumber: 'ZZ-999', firstname: 'Some', lastname: 'One', auth: 'manual', suspended: 0 });
  stub.state.courses.set(410, { id: 410, shortname: 'LM-101', fullname: 'Link management 101', idnumber: '', categoryid: 1, visible: 1 });
  stub.state.enrolments.push({ userid: 701, courseid: 410, roleid: 5, suspended: false });
});

after(async () => {
  await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE', internalId: { in: [ana.studentProfile.id, teacher.facultyProfile.id, other.studentProfile.id] } } });
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await removeMultiRoleUsers();
  await stub?.close();
  await closeTestServer();
});

describe('Moodle account management from Systems', () => {
  it('a not-linked student whose Moodle account exists: the state names it as the candidate', async () => {
    const state = await moodle.profileMoodleState(ana.tenantId, 'STUDENT', ana.studentProfile.id);
    assert.equal(state.state, 'NOT_LINKED');
    assert.equal(state.candidate.state, 'FOUND');
    assert.equal(state.candidate.account.moodleUserId, 701);
    assert.equal(state.matchedOn.institutionalId, 'LM-S-01');
  });

  it('a student with no Moodle account: NOT_FOUND with the proposed username and ID number', async () => {
    const state = await moodle.profileMoodleState(other.tenantId, 'STUDENT', other.studentProfile.id);
    assert.equal(state.candidate.state, 'NOT_FOUND');
    assert.deepEqual(state.candidate.proposed, { username: 'lm-s-02', idnumber: 'LM-S-02' });
  });

  it('linking the candidate shows account, courses and verification time', async () => {
    const linked = await moodle.linkStudent(adminAuth, ana.studentProfile.id, { moodleUserId: 701 });
    assert.equal(linked.linkMethod, 'IDNUMBER_MATCH');
    const state = await moodle.profileMoodleState(ana.tenantId, 'STUDENT', ana.studentProfile.id);
    assert.equal(state.state, 'LINKED');
    assert.equal(state.account.username, 'lm-s-01');
    assert.deepEqual(state.courses.map((c) => c.shortName), ['LM-101']);
    assert.ok(state.lastVerifiedAt);
  });

  it('an account already linked to another person is never linked to a second one', async () => {
    await assert.rejects(() => moodle.linkStudent(adminAuth, other.studentProfile.id, { moodleUserId: 701 }), (e) => e.statusCode === 409 || e.status === 409 || /already linked|different ID number/.test(e.message));
    await assert.rejects(() => moodle.linkFaculty(adminAuth, teacher.facultyProfile.id, { moodleUserId: 701 }), /already linked|different ID number|does not match/);
  });

  it('an explicit Moodle user id is linked only on matching evidence', async () => {
    await assert.rejects(() => moodle.linkFaculty(adminAuth, teacher.facultyProfile.id, { moodleUserId: 703 }), /different ID number/);
    const linked = await moodle.linkFaculty(adminAuth, teacher.facultyProfile.id, { moodleUserId: 702 });
    assert.equal(linked.linkMethod, 'VERIFIED_EMAIL');
    assert.equal((await moodle.profileMoodleState(teacher.tenantId, 'FACULTY', teacher.facultyProfile.id)).state, 'LINKED');
  });

  it('unlinking a wrong association removes only the EduNexusAI link', async () => {
    const out = await moodle.unlinkFaculty(adminAuth, teacher.facultyProfile.id);
    assert.equal(out.moodleUserId, 702);
    assert.ok(stub.state.users.has(702), 'the Moodle account is untouched');
    assert.equal((await moodle.profileMoodleState(teacher.tenantId, 'FACULTY', teacher.facultyProfile.id)).state, 'NOT_LINKED');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'MOODLE_ACCOUNT_UNLINKED', entityId: teacher.facultyProfile.id } }));
  });

  it('generated Moodle passwords respect a strict site policy (no 3 digits in a row, no character more than twice)', () => {
    assert.equal(moodle.meetsStrictPolicy('Xk9-_Qa2bT7mZaA1!'), true);
    assert.equal(moodle.meetsStrictPolicy('Xk123-_QbTmZaA!'), false, 'numeric sequence');
    assert.equal(moodle.meetsStrictPolicy('Xkkk-_Q9bTmZaA!'), false, 'repeated character');
  });
});
