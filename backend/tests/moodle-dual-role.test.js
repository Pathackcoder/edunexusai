import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { startMoodleStub } from './helpers/moodleStub.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';
import { clearMoodleCapabilityCache } from '../src/integrations/connectors/MoodleConnector.js';

/**
 * One person, one Moodle account. A faculty member who is also a student keeps a single Moodle
 * account for both profiles: the second profile reuses it (never a second account, never a
 * changed ID number), the student view never lists the courses they teach, the faculty view
 * never lists the courses they study, and the shared account cannot be suspended as "a student".
 * Every call goes to the in-process Moodle stub; the real MoodleCloud site is never contacted.
 */

const TOKEN = 'stub-token-dualrole-0123456789abcd';
const ENV_KEYS = ['MOODLE_BASE_URL', 'MOODLE_TOKEN', 'MOODLE_WRITES_ENABLED', 'MOODLE_STUDENT_ROLE_ID', 'MOODLE_TEACHER_ROLE_ID', 'MOODLE_MAX_RETRIES', 'MOODLE_TIMEOUT_MS'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let stub;
let prisma;
let moodle;
let rahul;
let token;
let adminAuth;
const MOODLE_RAHUL = 900;
const STUDYING = 300;
const TEACHING = 301;

before(async () => {
  stub = await startMoodleStub({ token: TOKEN });
  Object.assign(process.env, {
    MOODLE_BASE_URL: stub.url, MOODLE_TOKEN: TOKEN, MOODLE_WRITES_ENABLED: 'true',
    MOODLE_STUDENT_ROLE_ID: '5', MOODLE_TEACHER_ROLE_ID: '3', MOODLE_MAX_RETRIES: '1', MOODLE_TIMEOUT_MS: '1000',
  });
  ({ prisma } = await import('../src/db/prisma.js'));
  moodle = await import('../src/modules/lms/moodleService.js');
  await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: stub.url, enabled: true, mode: 'LIVE' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE' } });
  clearMoodleCapabilityCache();

  rahul = await createMultiRoleUser({
    key: 'moodle.rahul', firstName: 'Rahul', lastName: 'Sharma', roles: ['STUDENT', 'FACULTY'],
    student: { studentNumber: 'MR-S-0201', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'MR-F-0201' },
  });
  token = await loginFixture(rahul.email);
  const admin = await prisma.user.findFirst({ where: { email: 'admin@edunexus.ai' } });
  adminAuth = { tenantId: rahul.tenantId, userId: admin.id, roles: ['ADMIN'] };

  // The person's existing Moodle account (created when they enrolled as a student).
  stub.state.users.set(MOODLE_RAHUL, { id: MOODLE_RAHUL, username: 'mr-s-0201', email: rahul.email, idnumber: 'MR-S-0201', firstname: 'Rahul', lastname: 'Sharma', auth: 'manual', suspended: 0 });
  stub.state.courses.set(STUDYING, { id: STUDYING, shortname: 'PG-ML', fullname: 'Postgraduate Machine Learning', idnumber: '', categoryid: 1, visible: 1 });
  stub.state.courses.set(TEACHING, { id: TEACHING, shortname: 'UG-CS101', fullname: 'Undergraduate Programming', idnumber: '', categoryid: 1, visible: 1 });
  stub.state.enrolments.push({ userid: MOODLE_RAHUL, courseid: STUDYING, roleid: 5, suspended: false });
  stub.state.enrolments.push({ userid: MOODLE_RAHUL, courseid: TEACHING, roleid: 3, suspended: false });
});

after(async () => {
  await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE', internalId: { in: [rahul.studentProfile.id, rahul.facultyProfile.id] } } });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await removeMultiRoleUsers();
  await stub?.close();
  await closeTestServer();
});

describe('a faculty member who is also a student has one Moodle account', () => {
  it('links the student profile to the existing account by its ID number', async () => {
    const res = await api(`/lms/admin/moodle/students/${rahul.studentProfile.id}/link`, { method: 'POST', token: await login('admin'), body: {} });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.moodleUserId, MOODLE_RAHUL);
  });

  it('provisions the faculty profile by reusing that account: no second account, ID number unchanged', async () => {
    const usersBefore = stub.state.users.size;
    const result = await moodle.provisionFaculty(adminAuth, rahul.facultyProfile.id, {});
    assert.equal(result.result.action, 'LINKED_SAME_PERSON');
    assert.equal(result.result.moodleUserId, MOODLE_RAHUL);
    assert.equal(stub.state.users.size, usersBefore, 'no Moodle account was created');
    assert.ok(!stub.state.calls.includes('core_user_create_users'), 'core_user_create_users was never called');
    assert.equal(stub.state.users.get(MOODLE_RAHUL).idnumber, 'MR-S-0201', 'the Moodle ID number is untouched');
    const links = await prisma.externalIdentity.findMany({ where: { provider: 'MOODLE', internalId: { in: [rahul.studentProfile.id, rahul.facultyProfile.id] } } });
    assert.deepEqual(links.map((l) => [l.entityType, l.externalId]).sort(), [['FACULTY', String(MOODLE_RAHUL)], ['STUDENT', String(MOODLE_RAHUL)]]);
    assert.equal(links.find((l) => l.entityType === 'FACULTY').linkMethod, 'SAME_PERSON');
  });

  it('the student view lists the course he studies, never the course he teaches', async () => {
    const res = await api('/lms/me/moodle/courses', { token });
    assert.equal(res.status, 200);
    const ids = res.body.data.courses.map((c) => c.moodleCourseId);
    assert.ok(ids.includes(STUDYING));
    assert.ok(!ids.includes(TEACHING), 'a taught course must not appear as a student course');
    const opened = await api(`/lms/me/moodle/courses/${TEACHING}`, { token });
    assert.equal(opened.status, 404, 'a taught course cannot be opened from the student view');
  });

  it('the teaching view lists the course he teaches, never the course he studies', async () => {
    const res = await api('/lms/faculty/moodle/courses', { token });
    assert.equal(res.status, 200);
    const ids = res.body.data.courses.map((c) => c.moodleCourseId);
    assert.deepEqual(ids, [TEACHING]);
  });

  it('refuses to link the student profile to a different Moodle account', async () => {
    await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE', entityType: 'STUDENT', internalId: rahul.studentProfile.id } });
    stub.state.users.set(901, { id: 901, username: 'someone', email: 'someone@feddrick.edu', idnumber: 'X-1', firstname: 'Some', lastname: 'One', auth: 'manual', suspended: 0 });
    await assert.rejects(() => moodle.linkStudent(adminAuth, rahul.studentProfile.id, { moodleUserId: 901 }), (error) => error.statusCode === 409 || error.status === 409);
    const relinked = await moodle.linkStudent(adminAuth, rahul.studentProfile.id, {});
    assert.equal(relinked.moodleUserId, MOODLE_RAHUL, 'without an explicit id the same-person account is used');
  });

  it('does not suspend the shared account as a student, because that would end his teaching access', async () => {
    await assert.rejects(() => moodle.setStudentSuspended(adminAuth, rahul.studentProfile.id, { suspended: true }), (error) => error.statusCode === 409 || error.status === 409);
    assert.equal(stub.state.users.get(MOODLE_RAHUL).suspended, 0);
  });
});
