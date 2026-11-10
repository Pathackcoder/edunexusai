import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { startMoodleStub } from './helpers/moodleStub.js';
import { createMoodleClient, MoodleErrorKind, scrub, toFormBody } from '../src/integrations/moodle/moodleClient.js';
import { moodleConfig } from '../src/config/env.js';
import { clearMoodleCapabilityCache } from '../src/integrations/connectors/MoodleConnector.js';
import { mapContents, mapGradeItems, siteUrl } from '../src/integrations/mappers/moodleMapper.js';

/**
 * Moodle LMS integration. Every network call goes to an in-process stub (helpers/
 * moodleStub.js); the real MoodleCloud site is never contacted by this suite.
 */

const TOKEN = 'stub-token-0123456789abcdef0123';
const ENV_KEYS = ['MOODLE_BASE_URL', 'MOODLE_TOKEN', 'MOODLE_WRITES_ENABLED', 'MOODLE_STUDENT_ROLE_ID', 'MOODLE_DEFAULT_CATEGORY_ID', 'MOODLE_MAX_RETRIES', 'MOODLE_TIMEOUT_MS', 'MOODLE_ALLOW_COURSE_DELETE', 'MOODLE_SEED_ENABLED'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let stub;
let prisma;

const ADMIN = '/lms/admin/moodle';
const leaksToken = (body) => JSON.stringify(body).includes(TOKEN);

async function studentByEmail(adminToken, email) {
  const { body } = await api(`${ADMIN}/students?search=${encodeURIComponent(email)}`, { token: adminToken });
  return body.data.find((s) => s.email === email);
}

before(async () => {
  stub = await startMoodleStub({ token: TOKEN });
  Object.assign(process.env, {
    MOODLE_BASE_URL: stub.url,
    MOODLE_TOKEN: TOKEN,
    MOODLE_WRITES_ENABLED: 'true',
    MOODLE_STUDENT_ROLE_ID: '5',
    MOODLE_DEFAULT_CATEGORY_ID: '1',
    MOODLE_MAX_RETRIES: '1',
    MOODLE_TIMEOUT_MS: '1000',
    MOODLE_ALLOW_COURSE_DELETE: 'false',
  });
  ({ prisma } = await import('../src/db/prisma.js'));
  await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: stub.url, enabled: true, mode: 'LIVE' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE' } });
  await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
  clearMoodleCapabilityCache();
});

after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await stub?.close();
  await closeTestServer();
});

/* ------------------------------------------------------------- unit level */

describe('Moodle configuration and REST client', () => {
  it('validates configuration without failing the whole application', () => {
    const before = process.env.MOODLE_BASE_URL;
    try {
      process.env.MOODLE_BASE_URL = '';
      assert.ok(moodleConfig().problems.includes('MOODLE_BASE_URL is not set.'));
      process.env.MOODLE_BASE_URL = 'http://moodle.example.edu';
      assert.ok(moodleConfig().problems.includes('MOODLE_BASE_URL must use https.'));
      process.env.MOODLE_BASE_URL = 'not a url';
      assert.ok(moodleConfig().problems.includes('MOODLE_BASE_URL is not a valid URL.'));
      process.env.MOODLE_BASE_URL = 'https://moodle.example.edu/';
      assert.equal(moodleConfig().baseUrl, 'https://moodle.example.edu');
      assert.equal(moodleConfig().valid, true);
    } finally {
      process.env.MOODLE_BASE_URL = before;
    }
  });

  it('encodes nested parameters the way Moodle expects', () => {
    const form = toFormBody({ users: [{ username: 'a', suspended: true }], courseids: [3, 4] });
    assert.equal(form.toString(), 'users%5B0%5D%5Busername%5D=a&users%5B0%5D%5Bsuspended%5D=1&courseids%5B0%5D=3&courseids%5B1%5D=4');
  });

  const reply = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const client = (fetchImpl, extra = {}) => createMoodleClient({ baseUrl: 'https://moodle.test', token: TOKEN, timeoutMs: 50, maxRetries: 2, retryDelayMs: 1, fetchImpl, ...extra });

  it('returns the payload of a successful call and sends the token only in the body', async () => {
    let seen;
    const c = client(async (url, init) => {
      seen = { url, body: String(init.body) };
      return new Response('{"sitename":"X"}', { status: 200 });
    });
    const { payload } = await c.call('core_webservice_get_site_info', {}, { idempotent: true });
    assert.equal(payload.sitename, 'X');
    assert.ok(!seen.url.includes(TOKEN), 'the token must never be in the URL');
    assert.ok(seen.body.includes('moodlewsrestformat=json'));
  });

  it('classifies token rejection, missing functions and Moodle exceptions inside HTTP 200', async () => {
    await assert.rejects(client(reply(200, { exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'Invalid token' })).call('f'), (e) => e.details.kind === MoodleErrorKind.AUTH_FAILED && e.status === 502);
    await assert.rejects(client(reply(200, { exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' })).call('f'), (e) => e.details.kind === MoodleErrorKind.ACCESS_DENIED);
    await assert.rejects(client(reply(200, { exception: 'dml_missing_record_exception', errorcode: 'invalidrecordunknown', message: 'x', debuginfo: 'SELECT secret' })).call('f'), (e) => e.details.kind === MoodleErrorKind.NOT_FOUND && e.status === 404 && !JSON.stringify(e.details).includes('SELECT'));
  });

  it('scrubs the token from anything echoed back', async () => {
    await assert.rejects(client(reply(200, { exception: 'moodle_exception', errorcode: 'odd', message: `bad wstoken=${TOKEN}` })).call('f'), (e) => !e.message.includes(TOKEN));
    assert.equal(scrub(`a ${TOKEN} b`, TOKEN), 'a [redacted] b');
  });

  it('rejects responses that are not JSON', async () => {
    await assert.rejects(client(reply(200, '<html>login</html>')).call('f'), (e) => e.details.kind === MoodleErrorKind.MALFORMED_RESPONSE);
  });

  it('times out, retrying reads a bounded number of times but never writes', async () => {
    let calls = 0;
    const hang = (_url, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    };
    await assert.rejects(client(hang).call('core_course_get_courses', {}, { idempotent: true }), (e) => e.details.kind === MoodleErrorKind.TIMEOUT);
    assert.equal(calls, 3, 'one call plus two retries');
    calls = 0;
    await assert.rejects(client(hang).call('core_user_create_users', {}), (e) => e.details.kind === MoodleErrorKind.TIMEOUT);
    assert.equal(calls, 1, 'writes are attempted once');
  });

  it('retries a read after a transient 503 and then succeeds', async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      return calls === 1 ? new Response('busy', { status: 503 }) : new Response('[]', { status: 200 });
    };
    const { payload, attempts } = await client(flaky).call('core_course_get_courses', {}, { idempotent: true });
    assert.deepEqual(payload, []);
    assert.equal(attempts, 2);
  });

  it('maps only what a student could see', () => {
    const sections = mapContents(
      [
        { id: 1, name: 'Week 1', visible: 1, uservisible: true, modules: [{ id: 10, instance: 1, modname: 'assign', name: 'Essay', visible: 1, uservisible: true, url: 'https://moodle.test/mod/assign/view.php?id=10' }, { id: 11, instance: 2, modname: 'quiz', name: 'Hidden quiz', visible: 0, uservisible: false }, { id: 12, modname: 'url', name: 'Elsewhere', visible: 1, url: 'https://evil.example/x' }] },
        { id: 2, name: 'Hidden week', visible: 0, uservisible: false, modules: [{ id: 20, modname: 'page', name: 'Secret', visible: 1 }] },
      ],
      'https://moodle.test',
    );
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].activities.map((a) => a.cmid), [10, 12]);
    assert.equal(sections[0].activities[1].url, null, 'off-site links are dropped');
    assert.equal(siteUrl('https://moodle.test/x', 'https://moodle.test'), 'https://moodle.test/x');
    const grades = mapGradeItems({ usergrades: [{ gradeitems: [{ itemname: 'Essay', itemtype: 'mod', gradeformatted: '8.00', gradeishidden: false }, { itemname: 'Hidden', itemtype: 'mod', gradeformatted: '2.00', gradeishidden: true }] }] });
    assert.deepEqual(grades.items.map((g) => g.name), ['Essay']);
  });
});

/* ---------------------------------------------------------- through the API */

describe('Moodle administration', () => {
  it('is restricted to administrators', async () => {
    assert.equal((await api(`${ADMIN}/status`)).status, 401);
    assert.equal((await api(`${ADMIN}/status`, { token: await login('student') })).status, 403);
    assert.equal((await api(`${ADMIN}/status`, { token: await login('faculty') })).status, 403);
    assert.equal((await api(`${ADMIN}/students/00000000-0000-4000-8000-000000000000/provision`, { method: 'POST', token: await login('student'), body: {} })).status, 403);
  });

  it('tests the connection, lists capabilities and never returns the token', async () => {
    const token = await login('admin');
    const test = await api(`${ADMIN}/test`, { method: 'POST', token });
    assert.equal(test.status, 200);
    assert.equal(test.body.data.healthy, true);
    const status = await api(`${ADMIN}/status`, { token });
    assert.equal(status.status, 200);
    assert.equal(status.body.data.site.siteName, 'Stub Moodle');
    assert.ok(status.body.data.checklist.find((f) => f.name === 'core_user_create_users').enabled);
    assert.equal(status.body.data.configuration.tokenConfigured, true);
    assert.ok(!leaksToken(status.body) && !leaksToken(test.body));
  });

  it('explains exactly which function is missing', async () => {
    const token = await login('admin');
    stub.state.functions.delete('core_course_get_categories');
    clearMoodleCapabilityCache();
    const res = await api(`${ADMIN}/categories`, { token });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.details.kind, 'FUNCTION_NOT_ENABLED');
    assert.equal(res.body.error.details.wsfunction, 'core_course_get_categories');
    stub.state.functions.add('core_course_get_categories');
    clearMoodleCapabilityCache();
  });

  it('links an existing Moodle account only when it matches the student', async () => {
    const token = await login('admin');
    const amit = await studentByEmail(token, 'student@edunexus.ai');
    const maya = await studentByEmail(token, 'student.advanced@edunexus.ai');
    stub.state.users.set(7, { id: 7, username: 'amit', email: 'Student@EduNexus.ai', idnumber: amit.studentNumber, firstname: 'Amit', lastname: 'P', suspended: 0 });
    stub.state.users.set(8, { id: 8, username: 'stranger', email: 'someone.else@example.com', idnumber: '', firstname: 'S', lastname: 'X', suspended: 0 });

    const mismatch = await api(`${ADMIN}/students/${maya.studentProfileId}/link`, { method: 'POST', token, body: { moodleUserId: 8 } });
    assert.equal(mismatch.status, 409, 'an admin cannot attach someone else’s account');

    const linked = await api(`${ADMIN}/students/${amit.studentProfileId}/link`, { method: 'POST', token, body: {} });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.data.moodleUserId, 7);
    assert.equal(linked.body.data.linkMethod, 'IDNUMBER_MATCH');

    const again = await api(`${ADMIN}/students/${maya.studentProfileId}/link`, { method: 'POST', token, body: { moodleUserId: 7 } });
    assert.equal(again.status, 409, 'one Moodle account cannot belong to two students');
  });

  it('provisions an account once, even when asked twice, without returning a password', async () => {
    const token = await login('admin');
    const maya = await studentByEmail(token, 'student.advanced@edunexus.ai');
    const createsBefore = stub.callsOf('core_user_create_users');

    // Someone else already holds the username Moodle would use: refuse, create nothing.
    stub.state.users.set(9, { id: 9, username: maya.studentNumber.toLowerCase(), email: 'other@example.com', idnumber: 'X-1', firstname: 'O', lastname: 'T', suspended: 0 });
    const clash = await api(`${ADMIN}/students/${maya.studentProfileId}/provision`, { method: 'POST', token, body: {} });
    assert.equal(clash.status, 409);
    assert.equal(stub.callsOf('core_user_create_users'), createsBefore);
    stub.state.users.delete(9);

    const first = await api(`${ADMIN}/students/${maya.studentProfileId}/provision`, { method: 'POST', token, body: {} });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.result.action, 'CREATED');
    assert.equal(first.body.data.result.passwordDelivery, 'NONE_USE_FORGOTTEN_PASSWORD');
    assert.ok(!JSON.stringify(first.body).toLowerCase().includes('"password"'), 'no password in the response');
    const second = await api(`${ADMIN}/students/${maya.studentProfileId}/provision`, { method: 'POST', token, body: {} });
    assert.equal(second.status, 200);
    assert.equal(second.body.data.replayed, true);
    assert.equal(stub.callsOf('core_user_create_users'), createsBefore + 1, 'exactly one account was created');

    const op = await prisma.integrationOperation.findFirst({ where: { idempotencyKey: `USER.PROVISION:${maya.studentProfileId}@${new URL(stub.url).host}` } });
    assert.ok(!JSON.stringify(op.request).toLowerCase().includes('password":"'), 'no password stored with the operation');
  });

  it('keeps an earlier Moodle site\'s operations as history instead of reusing them', async () => {
    const token = await login('admin');
    const maya = await studentByEmail(token, 'student.advanced@edunexus.ai');
    const integration = await prisma.integration.findFirst({ where: { provider: 'MOODLE' } });
    // The same provisioning on the previous site (unscoped key, as written before the move), whose link is gone.
    const old = await prisma.integrationOperation.create({ data: { tenantId: integration.tenantId, integrationId: integration.id, operation: 'USER.PROVISION', idempotencyKey: `USER.PROVISION:${maya.studentProfileId}`, status: 'SUCCEEDED', entityType: 'STUDENT', internalId: maya.studentProfileId, externalId: '29', result: { action: 'CREATED', moodleUserId: 29 }, attempts: 1, correlationId: 'old-site' } });
    const unlinked = await api(`${ADMIN}/students/${maya.studentProfileId}/link`, { method: 'DELETE', token });
    assert.equal(unlinked.status, 200, JSON.stringify(unlinked.body));

    const res = await api(`${ADMIN}/students/${maya.studentProfileId}/provision`, { method: 'POST', token, body: {} });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.notEqual(res.body.data.result.moodleUserId, 29, 'nothing from the earlier site is replayed');
    const after = await prisma.integrationOperation.findUnique({ where: { id: old.id } });
    assert.deepEqual({ status: after.status, attempts: after.attempts, result: after.result, correlationId: after.correlationId }, { status: 'SUCCEEDED', attempts: 1, result: { action: 'CREATED', moodleUserId: 29 }, correlationId: 'old-site' });
  });

  it('recovers from an uncertain create by linking, not by creating again', async () => {
    const token = await login('admin');
    const { body } = await api(`${ADMIN}/students`, { token });
    const other = body.data.find((s) => !s.moodle && !['student@edunexus.ai', 'student.advanced@edunexus.ai'].includes(s.email));
    stub.state.inject.core_user_create_users = 'applyThenGarbage';

    const uncertain = await api(`${ADMIN}/students/${other.studentProfileId}/provision`, { method: 'POST', token, body: {} });
    assert.equal(uncertain.status, 502);
    assert.equal(uncertain.body.error.details.operationStatus, 'NEEDS_RECONCILIATION');
    const created = [...stub.state.users.values()].filter((u) => u.idnumber === other.studentNumber);
    assert.equal(created.length, 1, 'Moodle did create the account');

    const retry = await api(`${ADMIN}/operations/${uncertain.body.error.details.operationId}/retry`, { method: 'POST', token });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.result.action, 'LINKED_EXISTING');
    assert.equal([...stub.state.users.values()].filter((u) => u.idnumber === other.studentNumber).length, 1, 'still exactly one account');
  });

  it('refuses writes when they are switched off, without calling Moodle', async () => {
    const token = await login('admin');
    stub.state.courses.set(60, { id: 60, shortname: 'W-OFF', fullname: 'Writes off', idnumber: '', categoryid: 1, visible: 1 });
    process.env.MOODLE_WRITES_ENABLED = 'false';
    try {
      const updatesBefore = stub.callsOf('core_course_update_courses');
      const res = await api(`${ADMIN}/courses/60/hide`, { method: 'POST', token });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.details.reason, 'WRITES_DISABLED');
      assert.equal(stub.callsOf('core_course_update_courses'), updatesBefore);
    } finally {
      process.env.MOODLE_WRITES_ENABLED = 'true';
    }
  });

  let demoCourseId;

  it('creates a course once, refuses a duplicate short name, and links it to the local course', async () => {
    const token = await login('admin');
    stub.state.courses.set(50, { id: 50, shortname: 'TAKEN', fullname: 'Already here', idnumber: '', categoryid: 1, visible: 1 });
    const dup = await api(`${ADMIN}/courses`, { method: 'POST', token, body: { fullName: 'Another', shortName: 'TAKEN' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.details.moodleCourseId, 50);

    const listing = (await api(`${ADMIN}/courses`, { token })).body.data;
    const local = listing.localCourses.find((c) => c.code === 'CS 512');
    const body = { fullName: 'Distributed Systems (Moodle)', shortName: 'CS512-F26', idNumber: 'CS 512', localCourseId: local.id, startDate: '2026-09-01', endDate: '2026-12-20' };
    const created = await api(`${ADMIN}/courses`, { method: 'POST', token, body });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    demoCourseId = created.body.data.result.moodleCourseId;
    assert.ok(created.body.data.result.courseUrl.startsWith(`${stub.url}/course/view.php?id=`));

    const again = await api(`${ADMIN}/courses`, { method: 'POST', token, body: { ...body, localCourseId: undefined } });
    assert.equal(again.status, 201);
    assert.equal(again.body.data.replayed, true);
    assert.equal(stub.callsOf('core_course_create_courses'), 1);

    const after = (await api(`${ADMIN}/courses`, { token })).body.data.courses.find((c) => c.moodleCourseId === demoCourseId);
    assert.equal(after.localCourse.code, 'CS 512');
  });

  it('enrols a linked student once and blocks clearly when the course has no manual enrolment', async () => {
    const token = await login('admin');
    const amit = await studentByEmail(token, 'student@edunexus.ai');
    const ok = await api(`${ADMIN}/courses/${demoCourseId}/enrolments`, { method: 'POST', token, body: { studentProfileId: amit.studentProfileId } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.result.action, 'ENROLLED');
    const enrolCalls = stub.callsOf('enrol_manual_enrol_users');
    const twice = await api(`${ADMIN}/courses/${demoCourseId}/enrolments`, { method: 'POST', token, body: { studentProfileId: amit.studentProfileId } });
    assert.equal(twice.body.data.result.action, 'ALREADY_ENROLLED');
    assert.equal(stub.callsOf('enrol_manual_enrol_users'), enrolCalls, 'no duplicate enrolment call');

    stub.state.courses.set(70, { id: 70, shortname: 'NO-MANUAL', fullname: 'No manual enrolment', idnumber: '', categoryid: 1, visible: 1 });
    stub.state.noManualInstance.add(70);
    const blocked = await api(`${ADMIN}/courses/70/enrolments`, { method: 'POST', token, body: { studentProfileId: amit.studentProfileId } });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.details.operationStatus, 'BLOCKED');
    stub.state.noManualInstance.delete(70);
    const retried = await api(`${ADMIN}/operations/${blocked.body.error.details.operationId}/retry`, { method: 'POST', token });
    assert.equal(retried.status, 200);
    assert.equal(retried.body.data.result.action, 'ENROLLED');

    const unlinked = await studentByEmail(token, 'student.advanced@edunexus.ai');
    await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE', internalId: unlinked.studentProfileId } });
    const notLinked = await api(`${ADMIN}/courses/${demoCourseId}/enrolments`, { method: 'POST', token, body: { studentProfileId: unlinked.studentProfileId } });
    assert.equal(notLinked.status, 400, 'only linked students can be enrolled');

    const remove = await api(`${ADMIN}/courses/70/enrolments/end`, { method: 'POST', token, body: { studentProfileId: amit.studentProfileId, mode: 'REMOVE' } });
    assert.equal(remove.status, 400, 'removal needs explicit confirmation');
    const roster = await api(`${ADMIN}/courses/${demoCourseId}/enrolments`, { token });
    assert.equal(roster.body.data.participants.find((p) => p.moodleUserId === 7).student.studentProfileId, amit.studentProfileId);
  });

  it('recognises an enrolment Moodle saved before failing to send its welcome message', async () => {
    const token = await login('admin');
    const amit = await studentByEmail(token, 'student@edunexus.ai');
    stub.state.courses.set(71, { id: 71, shortname: 'WELCOME', fullname: 'Welcome message fails', idnumber: '', categoryid: 1, visible: 1 });
    stub.state.inject.enrol_manual_enrol_users = 'applyThenWelcomeError';
    const res = await api(`${ADMIN}/courses/71/enrolments`, { method: 'POST', token, body: { studentProfileId: amit.studentProfileId } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.result.action, 'ENROLLED_WITH_WARNING');
    assert.match(res.body.data.result.warning, /Message was not sent/);

    // Without the enrolment actually saved, the error is not swallowed.
    stub.state.courses.set(72, { id: 72, shortname: 'FAILS', fullname: 'Really fails', idnumber: '', categoryid: 1, visible: 1 });
    stub.state.inject.enrol_manual_enrol_users = { exception: 'moodle_exception', errorcode: 'Message was not sent.', message: 'error/Message was not sent.' };
    const failed = await api(`${ADMIN}/courses/72/enrolments`, { method: 'POST', token, body: { studentProfileId: amit.studentProfileId } });
    assert.equal(failed.status, 502);
  });

  it('suspends instead of deleting, and keeps enrolments', async () => {
    const token = await login('admin');
    const amit = await studentByEmail(token, 'student@edunexus.ai');
    const res = await api(`${ADMIN}/students/${amit.studentProfileId}/suspension`, { method: 'POST', token, body: { suspended: true } });
    assert.equal(res.status, 200);
    assert.equal(stub.state.users.get(7).suspended, 1);
    assert.ok(stub.state.enrolments.some((e) => e.userid === 7 && e.courseid === demoCourseId), 'enrolment preserved');
    const studentView = await api('/lms/me/moodle/courses', { token: await login('student') });
    assert.equal(studentView.body.data.status, 'SUSPENDED');
    const back = await api(`${ADMIN}/students/${amit.studentProfileId}/suspension`, { method: 'POST', token, body: { suspended: false } });
    assert.equal(back.status, 200);
    assert.equal(stub.state.users.get(7).suspended, 0);
  });

  it('guards irreversible course deletion behind a server flag and typed confirmation', async () => {
    const token = await login('admin');
    const off = await api(`${ADMIN}/courses/50`, { method: 'DELETE', token, body: { confirmShortName: 'TAKEN' } });
    assert.equal(off.status, 403);
    process.env.MOODLE_ALLOW_COURSE_DELETE = 'true';
    try {
      const wrong = await api(`${ADMIN}/courses/50`, { method: 'DELETE', token, body: { confirmShortName: 'taken' } });
      assert.equal(wrong.status, 400);
      assert.equal(stub.callsOf('core_course_delete_courses'), 0, 'nothing deleted without exact confirmation');
      const hidden = await api(`${ADMIN}/courses/50/hide`, { method: 'POST', token });
      assert.equal(hidden.status, 200);
      assert.equal(stub.state.courses.get(50).visible, 0, 'hiding is the reversible alternative');
    } finally {
      process.env.MOODLE_ALLOW_COURSE_DELETE = 'false';
    }
  });
});

describe('Moodle for students', () => {
  before(() => {
    // Content for the course Amit is enrolled in, including things a student must not see.
    stub.state.contents[200] = [
      { id: 1, name: 'Week 1', visible: 1, uservisible: true, modules: [
        { id: 31, instance: 1, modname: 'assign', modplural: 'Assignments', name: 'Design brief', visible: 1, uservisible: true, url: `${stub.url}/mod/assign/view.php?id=31` },
        { id: 32, instance: 2, modname: 'assign', modplural: 'Assignments', name: 'Hidden draft', visible: 0, uservisible: false },
      ] },
      { id: 2, name: 'Teacher notes', visible: 0, uservisible: false, modules: [{ id: 33, modname: 'page', name: 'Answers', visible: 1 }] },
    ];
    stub.state.assignments[200] = [
      { id: 1, cmid: 31, course: 200, name: 'Design brief', duedate: 1792000000, grade: 100 },
      { id: 2, cmid: 32, course: 200, name: 'Hidden draft', duedate: 1792000000, grade: 100 },
    ];
    stub.state.grades['200:7'] = [
      { itemname: 'Design brief', itemtype: 'mod', itemmodule: 'assign', cmid: 31, gradeformatted: '88.00', grademin: 0, grademax: 100, gradeishidden: false, feedback: '<p>Strong work</p>' },
      { itemname: 'Hidden draft', itemtype: 'mod', itemmodule: 'assign', cmid: 32, gradeformatted: '12.00', gradeishidden: true },
      { itemname: 'Not released', itemtype: 'mod', cmid: 31, gradeformatted: '40.00', gradeishidden: false, gradehiddenbydate: true },
      { itemname: null, itemtype: 'course', gradeformatted: '88.00', percentageformatted: '88.00 %', gradeishidden: false },
    ];
    stub.state.courses.set(80, { id: 80, shortname: 'HIDDEN', fullname: 'Hidden course', idnumber: '', categoryid: 1, visible: 0 });
    stub.state.enrolments.push({ userid: 7, courseid: 80, roleid: 5, suspended: false });
  });

  it('lists only the student’s own visible Moodle courses with real course links', async () => {
    const res = await api('/lms/me/moodle/courses', { token: await login('student') });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'CONNECTED');
    const ids = res.body.data.courses.map((c) => c.moodleCourseId);
    assert.ok(ids.includes(200));
    assert.ok(!ids.includes(80), 'hidden courses are not shown');
    assert.equal(res.body.data.courses.find((c) => c.moodleCourseId === 200).courseUrl, `${stub.url}/course/view.php?id=200`);
    assert.equal(res.body.data.courses.find((c) => c.moodleCourseId === 200).localCourse.code, 'CS 512');
    assert.ok(!leaksToken(res.body));
  });

  it('shows course content, assignments and released grades, filtered to what the student may see', async () => {
    const res = await api('/lms/me/moodle/courses/200', { token: await login('student') });
    assert.equal(res.status, 200);
    const { sections, assignments, grades } = res.body.data;
    assert.deepEqual(sections.map((s) => s.name), ['Week 1']);
    assert.deepEqual(sections[0].activities.map((a) => a.name), ['Design brief']);
    assert.deepEqual(assignments.items.map((a) => a.name), ['Design brief']);
    assert.equal(assignments.items[0].submission.submissionStatus, 'submitted');
    assert.ok(!JSON.stringify(assignments).includes('99.00'), 'unreleased assignment grades never reach the student');
    assert.deepEqual(grades.items.map((g) => g.name), ['Design brief']);
    assert.equal(grades.items[0].feedback, 'Strong work');
    assert.equal(grades.courseTotal.percentage, '88.00 %');
  });

  it('does not open a course the student is not enrolled in, or a hidden one, by changing the id', async () => {
    const student = await login('student');
    assert.equal((await api('/lms/me/moodle/courses/60', { token: student })).status, 404);
    assert.equal((await api('/lms/me/moodle/courses/80', { token: student })).status, 404);
    const maya = await login('advanced');
    assert.equal((await api('/lms/me/moodle/courses/200', { token: maya })).status, 404, 'another student’s course stays private');
    assert.equal((await api('/lms/me/moodle/courses/200', { token: await login('admin') })).status, 403, 'student routes are for students');
  });

  it('reports unsupported features instead of inventing data', async () => {
    stub.state.functions.delete('gradereport_user_get_grade_items');
    clearMoodleCapabilityCache();
    const res = await api('/lms/me/moodle/courses/200', { token: await login('student') });
    assert.deepEqual(res.body.data.grades, { available: false, reason: 'FUNCTION_NOT_ENABLED', function: 'gradereport_user_get_grade_items' });
    stub.state.functions.add('gradereport_user_get_grade_items');
    clearMoodleCapabilityCache();
  });

  it('keeps the portal working when Moodle is down', async () => {
    const token = await login('student');
    stub.state.inject.core_enrol_get_users_courses = 'http503';
    const realRetries = process.env.MOODLE_MAX_RETRIES;
    process.env.MOODLE_MAX_RETRIES = '0';
    try {
      const res = await api('/lms/me/moodle/courses', { token });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'UNAVAILABLE');
      assert.equal((await api('/academics/courses', { token })).status, 200, 'unrelated features are unaffected');
    } finally {
      process.env.MOODLE_MAX_RETRIES = realRetries;
    }
  });
});

describe('Moodle development seed', () => {
  // A fresh stub shaped like the real site: guest, admin (teacher of ADBMS), one student.
  let site;
  const DEMO_PASSWORD = 'Demo-Only-Pass1!';
  const writes = () => ['core_user_create_users', 'core_course_create_courses', 'enrol_manual_enrol_users', 'core_user_update_users', 'core_course_update_courses'].reduce((n, fn) => n + site.callsOf(fn), 0);

  before(async () => {
    site = await startMoodleStub({ token: TOKEN });
    site.state.users.set(1, { id: 1, username: 'guest', email: 'root@localhost', idnumber: '', firstname: 'Guest', lastname: 'User', suspended: 0, auth: 'manual' });
    site.state.users.set(2, { id: 2, username: 'admin', email: 'owner@example.com', idnumber: '', firstname: 'Amit', lastname: 'Admin', suspended: 0, auth: 'manual' });
    site.state.users.set(5, { id: 5, username: 'akash.pathak', email: 'someone@example.net', idnumber: '', firstname: 'Akash', lastname: 'Pathak', suspended: 0, auth: 'manual' });
    site.state.courses.set(9, { id: 9, shortname: 'ADBMS', fullname: 'Advanced Database Systems', idnumber: 'CS 501', categoryid: 1, visible: 1, timemodified: 1791700000 });
    site.state.enrolments.push({ userid: 2, courseid: 9, roleid: 3, suspended: false }, { userid: 5, courseid: 9, roleid: 5, suspended: false });
    Object.assign(process.env, {
      MOODLE_BASE_URL: site.url,
      MOODLE_STUDENT_ROLE_ID: '5',
      MOODLE_TEACHER_ROLE_ID: '3',
      MOODLE_DEFAULT_CATEGORY_ID: '1',
      MOODLE_SITE_USER_QUOTA: '50',
      MOODLE_DEMO_PASSWORD: DEMO_PASSWORD,
      MOODLE_SEED_ENABLED: 'true',
      MOODLE_WRITES_ENABLED: 'true',
    });
    await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: site.url } });
    await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE' } });
    await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
    clearMoodleCapabilityCache();
  });

  after(async () => {
    for (const key of ['MOODLE_TEACHER_ROLE_ID', 'MOODLE_SITE_USER_QUOTA', 'MOODLE_DEMO_PASSWORD']) delete process.env[key];
    await site.close();
  });

  const seed = () => import('../src/modules/lms/moodleSeed.js');

  it('refuses to apply without its explicit guards', async () => {
    const { seedGuards } = await seed();
    assert.equal(seedGuards({ ...process.env, MOODLE_SEED_ENABLED: '' }).ok, false);
    assert.equal(seedGuards({ ...process.env, NODE_ENV: 'production' }).ok, false);
  });

  it('plans exactly 1 instructor, 8 students, 3 courses and 16 enrolments without writing', async () => {
    const { preflight } = await seed();
    const check = await preflight({ tenantSlug: 'demo-university' });
    assert.deepEqual(check.blockers, []);
    assert.deepEqual(check.facts.roles, { editingteacher: 3, student: 5 });
    assert.equal(check.facts.users.total, 3);
    assert.equal(check.facts.users.newAccounts, 9);
    assert.deepEqual(check.plan.courses.map((c) => c.action), ['CREATE', 'CREATE', 'CREATE']);
    assert.equal(check.plan.people.filter((p) => p.kind === 'instructor').length, 1);
    assert.equal(check.plan.people.filter((p) => p.kind === 'student').length, 8);
    assert.ok(check.plan.people.every((p) => p.account.email.endsWith('@example.org') && p.account.idnumber.startsWith('ENX-DEMO-')));
    assert.equal(check.plan.enrolments.length, 16);
    assert.equal(check.plan.enrolments.filter((e) => e.role === 'editingteacher').length, 3);
    assert.equal(writes(), 0, 'a dry run writes nothing');
  });

  it('blocks on an unverifiable quota, a wrong role id, the demo cap, the site quota and duplicate identities', async () => {
    const { preflight } = await seed();
    const blockersWith = async (env, prepare = () => {}, undo = () => {}) => {
      const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
      Object.assign(process.env, env);
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
      prepare();
      try {
        return (await preflight({ tenantSlug: 'demo-university' })).blockers.join(' | ');
      } finally {
        for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
        undo();
      }
    };
    assert.match(await blockersWith({ MOODLE_SITE_USER_QUOTA: undefined }), /MOODLE_SITE_USER_QUOTA is not set/);
    assert.match(await blockersWith({ MOODLE_TEACHER_ROLE_ID: '5' }), /is the "student" role/);
    assert.match(await blockersWith({ MOODLE_SITE_USER_QUOTA: '10' }), /12 of 10 users/);
    const extra = Array.from({ length: 15 }, (_, i) => 300 + i);
    assert.match(
      await blockersWith({}, () => extra.forEach((id) => site.state.users.set(id, { id, username: `enx-demo-old-${id}`, email: `old${id}@example.org`, idnumber: `ENX-DEMO-OLD-${id}`, firstname: 'Old', lastname: 'Demo', suspended: 0 })), () => extra.forEach((id) => site.state.users.delete(id))),
      /15 demo account\(s\) exist; 9 more would exceed the cap of 20/,
    );
    assert.match(
      await blockersWith({}, () => site.state.users.set(40, { id: 40, username: 'amit.real', email: 'student@edunexus.ai', idnumber: '', firstname: 'A', lastname: 'P', suspended: 0 }), () => site.state.users.delete(40)),
      /ENX-984210: already has a Moodle account \(user 40\)/,
    );
    assert.equal(writes(), 0);
  });

  it('applies, recovers from an uncertain create without duplicates, and verifies the result', async () => {
    const { applySeed, verifySeed } = await seed();
    // The first account create reaches Moodle but the reply is lost.
    site.state.inject.core_user_create_users = 'applyThenGarbage';
    await assert.rejects(applySeed({ tenantSlug: 'demo-university' }), (e) => e.details?.operationStatus === 'NEEDS_RECONCILIATION');

    const applied = await applySeed({ tenantSlug: 'demo-university' });
    assert.equal(applied.applied, true, JSON.stringify(applied.blockers));
    const demoUsers = [...site.state.users.values()].filter((u) => u.idnumber?.startsWith('ENX-DEMO-'));
    assert.equal(demoUsers.length, 9, 'nine accounts, the uncertain one adopted rather than duplicated');
    assert.equal([...site.state.courses.values()].filter((c) => c.idnumber?.startsWith('ENX-DEMO-')).length, 3);
    assert.equal(site.state.receivedPasswords, 9, 'demo password supplied to Moodle for each new account');

    const verified = await verifySeed({ tenantSlug: 'demo-university', before: applied.before });
    assert.equal(verified.ok, true, verified.problems.join('\n'));

    const teacher = demoUsers.find((u) => u.idnumber === 'ENX-DEMO-FAC-20451');
    const teaching = site.state.enrolments.filter((e) => e.userid === teacher.id);
    assert.equal(teaching.length, 3);
    assert.ok(teaching.every((e) => e.roleid === 3), 'instructor holds editingteacher in each course');
    assert.ok(!site.state.enrolments.some((e) => e.userid === 2 && e.roleid === 5), 'admin is never a student');
    assert.deepEqual(site.state.enrolments.filter((e) => e.courseid === 9).map((e) => `${e.userid}:${e.roleid}`).sort(), ['2:3', '5:5'], 'ADBMS untouched');

    const links = await prisma.externalIdentity.groupBy({ by: ['entityType'], where: { provider: 'MOODLE' }, _count: true });
    assert.deepEqual(Object.fromEntries(links.map((l) => [l.entityType, l._count])), { FACULTY: 1, SEED_COURSE: 3, STUDENT: 8 });
    const ops = await prisma.integrationOperation.findMany({ where: { integration: { provider: 'MOODLE' } } });
    assert.ok(!JSON.stringify(ops).includes(DEMO_PASSWORD), 'the password is never stored');
  });

  it('is safe to re-run: the plan is all no-ops and nothing is written', async () => {
    const { preflight, applySeed } = await seed();
    const check = await preflight({ tenantSlug: 'demo-university' });
    assert.deepEqual(check.blockers, []);
    assert.ok(check.plan.courses.every((c) => c.action === 'EXISTS'));
    assert.ok(check.plan.people.every((p) => p.action === 'ALREADY_LINKED'));
    assert.ok(check.plan.enrolments.every((e) => e.action === 'ALREADY_ENROLLED'));
    const before = writes();
    const again = await applySeed({ tenantSlug: 'demo-university' });
    assert.equal(again.applied, true);
    assert.equal(writes(), before, 'a second apply makes no Moodle writes');
  });
});

describe('Moodle as LMS source of truth, onboarding and SIS boundary', () => {
  let site;
  const PASSWORD = 'Onboard-Pass-2026';
  let seq = 0;
  const newStudent = (extra = {}) => {
    seq += 1;
    return { email: `onboard.moodle.${Date.now()}.${seq}@feddrick.edu`, password: PASSWORD, firstName: 'Riley', lastName: `Tester${seq}`, roles: ['STUDENT'], ...extra };
  };
  const sisCounts = async () => ({
    courses: await prisma.course.count(),
    enrollments: await prisma.enrollment.count(),
    gradeComponents: await prisma.gradeComponent.count(),
    assignments: await prisma.assignment.count(),
  });
  let moodleIntegrationId;

  before(async () => {
    site = await startMoodleStub({ token: TOKEN });
    site.state.users.set(2, { id: 2, username: 'admin', email: 'owner@example.com', idnumber: '', firstname: 'Site', lastname: 'Admin', suspended: 0, auth: 'manual' });
    site.state.users.set(31, { id: 31, username: 'teacher', email: 't@example.org', idnumber: 'T-1', firstname: 'Tess', lastname: 'Teacher', suspended: 0 });
    site.state.users.set(32, { id: 32, username: 'amit.lms', email: 'student@edunexus.ai', idnumber: 'ENX-984210', firstname: 'Amit', lastname: 'Pathak', suspended: 0 });
    site.state.users.set(33, { id: 33, username: 'paused', email: 'paused@example.org', idnumber: 'P-1', firstname: 'Pat', lastname: 'Paused', suspended: 0 });
    for (const [id, shortname] of [[300, 'LMS-300'], [301, 'LMS-EMPTY'], [302, 'LMS-302'], [303, 'LMS-NO-MANUAL']]) {
      site.state.courses.set(id, { id, shortname, fullname: `Moodle course ${shortname}`, idnumber: shortname, categoryid: 1, visible: 1 });
    }
    site.state.noManualInstance.add(303);
    site.state.enrolments.push(
      { userid: 31, courseid: 300, roleid: 3, suspended: false },
      { userid: 32, courseid: 300, roleid: 5, suspended: false },
      { userid: 33, courseid: 300, roleid: 5, suspended: true },
    );
    Object.assign(process.env, { MOODLE_BASE_URL: site.url, MOODLE_WRITES_ENABLED: 'true', MOODLE_STUDENT_ROLE_ID: '5', MOODLE_DEMO_PASSWORD: 'Demo-Only-Pass1!' });
    await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: site.url } });
    moodleIntegrationId = (await prisma.integration.findFirst({ where: { provider: 'MOODLE' } })).id;
    await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE' } });
    await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
    clearMoodleCapabilityCache();
  });

  after(async () => {
    delete process.env.MOODLE_DEMO_PASSWORD;
    await site.close();
  });

  it('never lets Moodle serve SIS sync domains or run the SIS sync', async () => {
    const token = await login('admin');
    const edit = await api(`/admin/integrations/${moodleIntegrationId}`, { method: 'PATCH', token, body: { supportedDomains: ['COURSES', 'ENROLLMENTS'] } });
    assert.equal(edit.status, 400);
    await assert.rejects(prisma.integration.update({ where: { id: moodleIntegrationId }, data: { supportedDomains: ['COURSES'] } }), 'the database refuses it too');

    const before = await sisCounts();
    const logsBefore = await prisma.integrationSyncLog.count({ where: { integrationId: moodleIntegrationId } });
    const sync = await api(`/admin/integrations/${moodleIntegrationId}/sync`, { method: 'POST', token });
    assert.equal(sync.status, 409);
    assert.equal(sync.body.error.code, 'OPERATION_NOT_SUPPORTED');
    assert.equal(sync.body.error.details.reason, 'LMS_ONLY_PROVIDER');
    const { syncCourses, syncEnrollments } = await import('../src/integrations/syncService.js');
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
    await assert.rejects(syncCourses(tenant.id, { integrationKey: 'moodle-lms' }), (e) => e.code === 'OPERATION_NOT_SUPPORTED');
    await assert.rejects(syncEnrollments(tenant.id, { integrationKey: 'moodle-lms' }), (e) => e.code === 'OPERATION_NOT_SUPPORTED');
    assert.deepEqual(await sisCounts(), before, 'official SIS tables unchanged');
    assert.equal(await prisma.integrationSyncLog.count({ where: { integrationId: moodleIntegrationId } }), logsBefore, 'a refused sync is not logged as having run');
  });

  it('reports a missing connector method as not supported, not as an outage', async () => {
    const { BaseConnector } = await import('../src/integrations/connectors/BaseConnector.js');
    class Minimal extends BaseConnector {}
    const connector = new Minimal({ integration: { key: 'x', displayName: 'Minimal', provider: 'BANNER' } });
    await assert.rejects(connector.fetchEnrollments(), (e) => e.code === 'OPERATION_NOT_SUPPORTED' && e.status === 501 && e.details.reason === 'NOT_IMPLEMENTED');
  });

  it('reads Moodle rosters into canonical enrolments: empty is empty, roles and status are real', async () => {
    const token = await login('admin');
    const before = await sisCounts();
    const res = await api('/lms/admin/moodle/rosters/read', { method: 'POST', token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const byCourse = Object.fromEntries(res.body.data.courses.map((c) => [c.course.externalCourseId, c]));
    assert.equal(byCourse['301'].participantCount, 0, 'an empty course is a valid empty result');
    const rows = byCourse['300'].enrollments;
    assert.deepEqual(rows.map((r) => `${r.moodleUserId}:${r.roles.map((x) => x.shortName).join('+')}:${r.status}`).sort(), ['31:editingteacher:ACTIVE', '32:student:ACTIVE', '33:student:INACTIVE']);
    assert.ok(rows.every((r) => r.provider === 'MOODLE' && r.externalCourseId === '300'));
    assert.equal(res.body.data.enrollmentCount, 3);
    const log = await prisma.integrationSyncLog.findFirst({ where: { integrationId: moodleIntegrationId, operation: 'LMS.ROSTERS.READ' }, orderBy: { startedAt: 'desc' } });
    assert.equal(log.status, 'SUCCESS');
    assert.equal(log.recordsProcessed, 3);
    assert.deepEqual(await sisCounts(), before, 'reading rosters writes nothing to SIS tables');

    // With nobody enrolled anywhere, the read still succeeds with zero records.
    const saved = site.state.enrolments;
    site.state.enrolments = [];
    const empty = await api('/lms/admin/moodle/rosters/read', { method: 'POST', token });
    site.state.enrolments = saved;
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data.enrollmentCount, 0);
  });

  it('distinguishes a permission failure and a missing function from an empty result', async () => {
    const token = await login('admin');
    site.state.inject.core_enrol_get_enrolled_users = { exception: 'required_capability_exception', errorcode: 'nopermissions', message: 'Sorry, but you do not currently have permissions to do that.' };
    const denied = await api('/lms/admin/moodle/rosters/read', { method: 'POST', token });
    assert.equal(denied.status, 502);
    assert.equal(denied.body.error.details.kind, 'ACCESS_DENIED');
    const log = await prisma.integrationSyncLog.findFirst({ where: { integrationId: moodleIntegrationId, operation: 'LMS.ROSTERS.READ' }, orderBy: { startedAt: 'desc' } });
    assert.equal(log.status, 'FAILED');

    site.state.functions.delete('core_enrol_get_enrolled_users');
    clearMoodleCapabilityCache();
    const missing = await api('/lms/admin/moodle/rosters/read', { method: 'POST', token });
    assert.equal(missing.status, 409);
    assert.equal(missing.body.error.details.kind, 'FUNCTION_NOT_ENABLED');
    site.state.functions.add('core_enrol_get_enrolled_users');
    clearMoodleCapabilityCache();
  });

  it('shows a student only their own Moodle courses, never local academic courses, with no fallback', async () => {
    const admin = await login('admin');
    const amit = await studentByEmail(admin, 'student@edunexus.ai');
    const link = await api(`${ADMIN}/students/${amit.studentProfileId}/link`, { method: 'POST', token: admin, body: {} });
    assert.equal(link.status, 200, JSON.stringify(link.body));
    assert.equal(link.body.data.moodleUserId, 32);

    const student = await login('student');
    const mine = await api('/lms/me/moodle/courses', { token: student });
    assert.deepEqual(mine.body.data.courses.map((c) => c.externalCourseId), ['300']);
    const legacy = await api('/academics/lms', { token: student });
    assert.equal(legacy.body.data.provider, 'MOODLE');
    assert.deepEqual(legacy.body.data.courses.map((c) => c.externalCourseId), ['300']);
    const localNames = (await prisma.course.findMany({ select: { name: true } })).map((c) => c.name);
    assert.ok(!localNames.some((name) => JSON.stringify(legacy.body).includes(name)), 'no local SIS course appears as an LMS course');

    site.state.inject.core_enrol_get_users_courses = 'http503';
    const realRetries = process.env.MOODLE_MAX_RETRIES;
    process.env.MOODLE_MAX_RETRIES = '0';
    const down = await api('/lms/me/moodle/courses', { token: student });
    process.env.MOODLE_MAX_RETRIES = realRetries;
    assert.equal(down.body.data.status, 'UNAVAILABLE');
    assert.deepEqual(down.body.data.courses, [], 'no fallback to local data when Moodle fails');
  });

  it('verifies explicit links by ID number and email, and never by name', async () => {
    const admin = await login('admin');
    const maya = await studentByEmail(admin, 'student.advanced@edunexus.ai');
    site.state.users.set(40, { id: 40, username: 'maya.other', email: 'student.advanced@edunexus.ai', idnumber: 'SOMEONE-ELSE', firstname: 'Maya', lastname: 'Lin', suspended: 0 });
    const conflictRes = await api(`${ADMIN}/students/${maya.studentProfileId}/link`, { method: 'POST', token: admin, body: { moodleUserId: 40 } });
    assert.equal(conflictRes.status, 409, 'matching email but a different ID number is a conflict');
    site.state.users.delete(40);
    site.state.users.set(41, { id: 41, username: 'maya.newmail', email: 'maya.changed@example.org', idnumber: maya.studentNumber, firstname: 'M', lastname: 'L', suspended: 0 });
    const byId = await api(`${ADMIN}/students/${maya.studentProfileId}/link`, { method: 'POST', token: admin, body: { moodleUserId: 41 } });
    assert.equal(byId.status, 200, 'the stable ID number links even after an email change');
    assert.equal(byId.body.data.linkMethod, 'IDNUMBER_MATCH');
    await api(`${ADMIN}/students/${maya.studentProfileId}/link`, { method: 'DELETE', token: admin });
    site.state.users.delete(41);
    const adminLink = await api(`${ADMIN}/students/${maya.studentProfileId}/link`, { method: 'POST', token: admin, body: { moodleUserId: 2 } });
    assert.equal(adminLink.status, 409, 'the token’s administrator account is never linked to a student');
  });

  it('rejects invalid Moodle course ids and disabled writes before creating anything', async () => {
    const admin = await login('admin');
    const bad = newStudent({ moodle: { courseIds: [300, 999] } });
    const res = await api('/admin/users', { method: 'POST', token: admin, body: bad });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.invalid, [999]);
    assert.equal(await prisma.user.count({ where: { email: bad.email } }), 0, 'no local record for a rejected request');

    process.env.MOODLE_WRITES_ENABLED = 'false';
    const off = newStudent({ moodle: { courseIds: [300] } });
    const blocked = await api('/admin/users', { method: 'POST', token: admin, body: off });
    process.env.MOODLE_WRITES_ENABLED = 'true';
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.details.reason, 'WRITES_DISABLED');
    assert.equal(await prisma.user.count({ where: { email: off.email } }), 0);

    const faculty = await api('/admin/users', { method: 'POST', token: admin, body: newStudent({ roles: ['FACULTY'], moodle: { courseIds: [300] } }) });
    assert.equal(faculty.status, 400, 'Moodle enrolment on create is for students');
  });

  it('creates a student, their Moodle account and the selected enrolments with the student role', async () => {
    const admin = await login('admin');
    const body = newStudent({ moodle: { courseIds: [302, 300] } });
    const res = await api('/admin/users', { method: 'POST', token: admin, body });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { moodle } = res.body.data;
    assert.equal(moodle.status, 'SUCCEEDED');
    assert.equal(moodle.account.action, 'CREATED');
    // Onboarding never uses the shared development password: with no explicit credential
    // choice the account gets an unknown password (Forgotten password / one-time reset).
    assert.equal(moodle.account.passwordDelivery, 'NONE_USE_FORGOTTEN_PASSWORD');
    assert.deepEqual(moodle.enrolments.map((e) => `${e.moodleCourseId}:${e.status}`), ['300:ENROLLED', '302:ENROLLED']);
    const created = site.state.users.get(moodle.account.moodleUserId);
    assert.equal(created.email, body.email);
    assert.ok(site.state.enrolments.filter((e) => e.userid === created.id).every((e) => e.roleid === 5), 'student role only');
    const link = await prisma.externalIdentity.findFirst({ where: { provider: 'MOODLE', entityType: 'STUDENT', internalId: res.body.data.studentProfileId } });
    assert.equal(link.externalId, String(created.id), 'the Moodle user id is the persisted identifier');
    assert.ok(!JSON.stringify(res.body).includes('Demo-Only-Pass1!'), 'no password in the response');
  });

  it('keeps the local student when Moodle provisioning fails, and retries without a second local record', async () => {
    const admin = await login('admin');
    const body = newStudent({ moodle: { courseIds: [300] } });
    site.state.inject.core_user_create_users = { exception: 'moodle_exception', errorcode: 'cannotcreateuser', message: 'Cannot create user' };
    const res = await api('/admin/users', { method: 'POST', token: admin, body });
    assert.equal(res.status, 201, 'the local record is created and kept');
    assert.equal(res.body.data.moodle.status, 'FAILED');
    assert.equal(res.body.data.moodle.retryable, true);
    assert.deepEqual(res.body.data.moodle.enrolments, [{ moodleCourseId: 300, status: 'NOT_ATTEMPTED' }]);

    const retry = await api(`${ADMIN}/operations/${res.body.data.moodle.operationId}/retry`, { method: 'POST', token: admin });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.data.operation.status, 'SUCCEEDED');
    assert.equal(await prisma.user.count({ where: { email: body.email } }), 1, 'still one local student');
    assert.equal([...site.state.users.values()].filter((u) => u.email === body.email).length, 1, 'one Moodle account');
  });

  it('reports partial enrolment per course and retries only what is missing', async () => {
    const admin = await login('admin');
    const res = await api('/admin/users', { method: 'POST', token: admin, body: newStudent({ moodle: { courseIds: [300, 303] } }) });
    assert.equal(res.status, 201);
    const { moodle } = res.body.data;
    assert.equal(moodle.status, 'PARTIAL', 'not reported as a success');
    const outcome = Object.fromEntries(moodle.enrolments.map((e) => [e.moodleCourseId, e.status]));
    assert.equal(outcome[300], 'ENROLLED');
    assert.equal(outcome[303], 'BLOCKED');

    site.state.noManualInstance.delete(303);
    const enrolCalls = site.callsOf('enrol_manual_enrol_users');
    const retry = await api(`${ADMIN}/operations/${moodle.operationId}/retry`, { method: 'POST', token: admin });
    assert.equal(retry.body.data.operation.status, 'SUCCEEDED');
    assert.equal(site.callsOf('enrol_manual_enrol_users'), enrolCalls + 1, 'only the missing enrolment was sent');
    site.state.noManualInstance.add(303);
  });

  it('recovers an uncertain Moodle create by reconciling, and stops on ambiguous or name-only matches', async () => {
    const admin = await login('admin');
    site.state.inject.core_user_create_users = 'applyThenGarbage';
    const body = newStudent({ moodle: { courseIds: [] } });
    const res = await api('/admin/users', { method: 'POST', token: admin, body });
    assert.equal(res.body.data.moodle.status, 'NEEDS_RECONCILIATION');
    const retry = await api(`${ADMIN}/operations/${res.body.data.moodle.operationId}/retry`, { method: 'POST', token: admin });
    assert.equal(retry.body.data.operation.status, 'SUCCEEDED');
    assert.equal([...site.state.users.values()].filter((u) => u.email === body.email).length, 1, 'no duplicate Moodle user');

    // Two Moodle accounts already share the new student's email: stop, do not pick one.
    const dup = newStudent({ moodle: { courseIds: [] } });
    site.state.users.set(50, { id: 50, username: 'dup.one', email: dup.email, idnumber: '', firstname: 'A', lastname: 'B', suspended: 0 });
    site.state.users.set(51, { id: 51, username: 'dup.two', email: dup.email.toUpperCase(), idnumber: '', firstname: 'C', lastname: 'D', suspended: 0 });
    const ambiguous = await api('/admin/users', { method: 'POST', token: admin, body: dup });
    assert.equal(ambiguous.body.data.moodle.status, 'FAILED');
    assert.match(ambiguous.body.data.moodle.message, /More than one Moodle account/);

    // A Moodle user with the same name but another email is a different person.
    const namesake = newStudent({ firstName: 'Tess', lastName: 'Teacher', moodle: { courseIds: [] } });
    const res2 = await api('/admin/users', { method: 'POST', token: admin, body: namesake });
    assert.equal(res2.body.data.moodle.account.action, 'CREATED');
    assert.notEqual(res2.body.data.moodle.account.moodleUserId, 31);
  });
});

describe('Moodle assignments, grading, mapping status and Mathematics seed', () => {
  let site;
  let ids;
  const past = 1700000000;
  const configs = (feedback = true) => [
    { plugin: 'onlinetext', subtype: 'assignsubmission', name: 'enabled', value: '1' },
    { plugin: 'file', subtype: 'assignsubmission', name: 'enabled', value: '1' },
    { plugin: 'file', subtype: 'assignsubmission', name: 'maxfilesubmissions', value: '2' },
    { plugin: 'comments', subtype: 'assignfeedback', name: 'enabled', value: feedback ? '1' : '0' },
  ];
  const FAC = '/lms/faculty/moodle';

  before(async () => {
    site = await startMoodleStub({ token: TOKEN });
    const st = site.state;
    st.users.set(2, { id: 2, username: 'admin', email: 'owner@example.com', idnumber: '', firstname: 'Site', lastname: 'Admin', suspended: 0 });
    st.users.set(61, { id: 61, username: 'sarah', email: 'faculty@edunexus.ai', idnumber: 'FAC-20451', firstname: 'Sarah', lastname: 'Mitchell', suspended: 0 });
    st.users.set(62, { id: 62, username: 'amit', email: 'student@edunexus.ai', idnumber: 'ENX-984210', firstname: 'Amit', lastname: 'Pathak', suspended: 0 });
    st.users.set(63, { id: 63, username: 'maya', email: 'student.advanced@edunexus.ai', idnumber: 'ENX-984507', firstname: 'Maya', lastname: 'Lin', suspended: 0 });
    st.users.set(64, { id: 64, username: 'other.teacher', email: 'other@example.org', idnumber: 'T-64', firstname: 'Other', lastname: 'Teacher', suspended: 0 });
    st.courses.set(500, { id: 500, shortname: 'ALG', fullname: 'Algorithms', idnumber: 'CS 501', categoryid: 1, visible: 1 });
    st.courses.set(501, { id: 501, shortname: 'OTHER', fullname: 'Someone else’s course', idnumber: 'CS 512', categoryid: 1, visible: 1 });
    st.enrolments.push(
      { userid: 61, courseid: 500, roleid: 3, suspended: false },
      { userid: 62, courseid: 500, roleid: 5, suspended: false },
      { userid: 63, courseid: 500, roleid: 5, suspended: false },
      { userid: 64, courseid: 501, roleid: 3, suspended: false },
      { userid: 63, courseid: 501, roleid: 5, suspended: false },
    );
    st.contents[500] = [{ id: 1, name: 'Week 1', visible: 1, uservisible: true, modules: [
      { id: 71, instance: 801, modname: 'assign', name: 'Essay', visible: 1, uservisible: true },
      { id: 72, instance: 802, modname: 'assign', name: 'Hidden draft', visible: 0, uservisible: false },
      { id: 74, instance: 804, modname: 'assign', name: 'No feedback', visible: 1, uservisible: true },
    ] }];
    st.contents[501] = [{ id: 2, name: 'Week 1', visible: 1, uservisible: true, modules: [{ id: 73, instance: 803, modname: 'assign', name: 'Other', visible: 1, uservisible: true }] }];
    st.assignments[500] = [
      { id: 801, cmid: 71, course: 500, name: 'Essay', intro: '<p>Write 500 words.</p>', duedate: past, grade: 100, configs: configs() },
      { id: 802, cmid: 72, course: 500, name: 'Hidden draft', duedate: past, grade: 100, configs: configs() },
      { id: 804, cmid: 74, course: 500, name: 'No feedback', duedate: 0, grade: 10, configs: configs(false) },
    ];
    st.assignments[501] = [{ id: 803, cmid: 73, course: 501, name: 'Other', duedate: past, grade: 100, configs: configs() }];
    st.submissions[801] = { 62: { status: 'submitted', timemodified: 1791700000 } };
    st.submissions[804] = {};

    Object.assign(process.env, { MOODLE_BASE_URL: site.url, MOODLE_WRITES_ENABLED: 'true', MOODLE_STUDENT_ROLE_ID: '5', MOODLE_TEACHER_ROLE_ID: '3' });
    await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: site.url } });
    await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE' } });
    await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
    const amit = await prisma.studentProfile.findFirst({ where: { tenantId: tenant.id, studentNumber: 'ENX-984210' } });
    const maya = await prisma.studentProfile.findFirst({ where: { tenantId: tenant.id, studentNumber: 'ENX-984507' } });
    const sarah = await prisma.facultyProfile.findFirst({ where: { tenantId: tenant.id, employeeNumber: 'FAC-20451' } });
    const link = (entityType, internalId, externalId) => prisma.externalIdentity.create({ data: { tenantId: tenant.id, provider: 'MOODLE', entityType, internalId, exclusiveInternalId: internalId, externalId, linkMethod: 'IDNUMBER_MATCH' } });
    await link('STUDENT', amit.id, '62');
    await link('STUDENT', maya.id, '63');
    await link('FACULTY', sarah.id, '61');
    ids = { tenant, amit, maya, sarah };
    clearMoodleCapabilityCache();
  });

  after(async () => {
    delete process.env.MOODLE_TEACHER_ROLE_ID;
    await site.close();
  });

  it('lists a student’s Moodle assignments across courses Moodle would otherwise hide from the token', async () => {
    const res = await api('/lms/me/moodle/assignments', { token: await login('student') });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { assignments, capabilities } = res.body.data;
    assert.deepEqual(assignments.map((a) => a.assignmentId), [801, 804], 'visible assignments of own courses only (no hidden 802, no other course 803)');
    const essay = assignments[0];
    assert.equal(essay.state, 'SUBMITTED');
    assert.equal(essay.grade, null, 'ungraded is null, never zero');
    assert.equal(essay.instructions, 'Write 500 words.');
    assert.deepEqual(essay.submissionTypes, ['ONLINE_TEXT', 'FILE']);
    assert.equal(essay.course.moodleCourseId, 500);
    assert.equal(capabilities.submitInPortal, false, 'submission happens in Moodle (service token cannot submit for a student)');
    assert.ok(!JSON.stringify(res.body).includes('99.00'));
  });

  it('shows another student their own state: not submitted and overdue', async () => {
    const res = await api('/lms/me/moodle/assignments', { token: await login('advanced') });
    const essay = res.body.data.assignments.find((a) => a.assignmentId === 801);
    assert.equal(essay.state, 'NOT_SUBMITTED');
    assert.equal(essay.overdue, true);
    assert.ok(res.body.data.assignments.some((a) => a.assignmentId === 803), 'Maya also sees her other course');
  });

  it('lets faculty see only courses they teach in Moodle, with roster and all assignments', async () => {
    const token = await login('faculty');
    const mine = await api(`${FAC}/courses`, { token });
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.deepEqual(mine.body.data.courses.map((c) => c.moodleCourseId), [500]);
    assert.equal(mine.body.data.capabilities.createAssignment, false);
    assert.ok(mine.body.data.courses[0].addAssignmentUrl.endsWith('/course/modedit.php?add=assign&course=500&section=0'));
    assert.equal((await api(`${FAC}/courses/501`, { token })).status, 403, 'not their course');
    const detail = await api(`${FAC}/courses/500`, { token });
    assert.deepEqual(detail.body.data.students.map((s) => s.moodleUserId).sort(), [62, 63]);
    assert.equal(detail.body.data.assignments.find((a) => a.assignmentId === 802).visibleToStudents, false);
    assert.equal((await api(`${FAC}/courses`, { token: await login('student') })).status, 403, 'students cannot use faculty routes');
  });

  it('shows submissions and saves a verified grade with feedback that the student then sees', async () => {
    const token = await login('faculty');
    const subs = await api(`${FAC}/courses/500/assignments/801/submissions`, { token });
    assert.equal(subs.status, 200);
    const rows = Object.fromEntries(subs.body.data.students.map((r) => [r.moodleUserId, r]));
    assert.equal(rows[62].submission.status, 'submitted');
    assert.equal(rows[62].grade, null);
    assert.equal(rows[63].submission, null);

    const saved = await api(`${FAC}/courses/500/assignments/801/grades/62`, { method: 'PUT', token, body: { grade: 85, feedback: 'Good structure.' } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.result.verified, true, 'read back from Moodle');
    assert.equal(site.state.assignGrades[801][62].grade, 85);

    const student = await api('/lms/me/moodle/assignments', { token: await login('student') });
    const essay = student.body.data.assignments.find((a) => a.assignmentId === 801);
    assert.equal(essay.state, 'GRADED');
    assert.equal(essay.grade, '85.00');
    assert.equal(essay.feedback, 'Good structure.');
    const grades = await api('/lms/me/moodle/grades', { token: await login('student') });
    assert.equal(grades.body.data.courses[0].grades.items.find((i) => i.cmid === 71).grade, '85.00');
    const maya = await api('/lms/me/moodle/grades', { token: await login('advanced') });
    assert.ok(!JSON.stringify(maya.body).includes('85.00'), 'another student never sees it');
  });

  it('refuses invalid or unauthorised grading, and says exactly what is missing', async () => {
    const token = await login('faculty');
    const put = (path, body) => api(`${FAC}${path}`, { method: 'PUT', token, body });
    assert.equal((await put('/courses/500/assignments/801/grades/62', { grade: 150 })).status, 400, 'above the maximum');
    assert.equal((await put('/courses/500/assignments/801/grades/61', { grade: 5 })).status, 400, 'not a student in the course');
    assert.equal((await put('/courses/501/assignments/803/grades/63', { grade: 5 })).status, 403, 'course they do not teach');
    assert.equal((await put('/courses/500/assignments/803/grades/63', { grade: 5 })).status, 404, 'assignment from another course');
    assert.equal((await put('/courses/500/assignments/804/grades/62', { grade: 5, feedback: 'x' })).status, 400, 'feedback comments disabled');

    process.env.MOODLE_WRITES_ENABLED = 'false';
    const off = await put('/courses/500/assignments/801/grades/62', { grade: 70 });
    process.env.MOODLE_WRITES_ENABLED = 'true';
    assert.equal(off.status, 409);
    assert.equal(site.state.assignGrades[801][62].grade, 85, 'nothing changed in Moodle');

    site.state.functions.delete('mod_assign_save_grade');
    clearMoodleCapabilityCache();
    const missing = await put('/courses/500/assignments/801/grades/62', { grade: 70 });
    assert.equal(missing.status, 409);
    assert.equal(missing.body.error.details.wsfunction, 'mod_assign_save_grade');
    site.state.functions.add('mod_assign_save_grade');
    clearMoodleCapabilityCache();
  });

  it('reports canonical course mapping status: linked, unlinked, conflicted and missing', async () => {
    const admin = await login('admin');
    const local = Object.fromEntries((await prisma.course.findMany({ where: { tenantId: ids.tenant.id }, select: { id: true, code: true } })).map((c) => [c.code, c.id]));
    assert.equal((await api(`${ADMIN}/courses/500/link`, { method: 'PUT', token: admin, body: { courseId: local['CS 501'] } })).status, 200);
    await prisma.externalIdentity.create({ data: { tenantId: ids.tenant.id, provider: 'MOODLE', entityType: 'COURSE', internalId: local['CS 512'], exclusiveInternalId: local['CS 512'], externalId: '999', linkMethod: 'ADMIN_CONFIRMED' } });
    const list = (await api(`${ADMIN}/courses`, { token: admin })).body.data;
    const status = Object.fromEntries(list.courses.map((c) => [c.moodleCourseId, c.mappingStatus]));
    assert.equal(status[500], 'LINKED');
    assert.equal(status[501], 'CONFLICTED', 'its ID number names CS 512, which is mapped to another Moodle course');
    assert.deepEqual(list.missing.map((m) => [m.moodleCourseId, m.mappingStatus]), [[999, 'MISSING_IN_MOODLE']]);
    const again = await api(`${ADMIN}/courses/500/link`, { method: 'PUT', token: admin, body: { courseId: local['CS 501'] } });
    assert.equal(again.status, 409, 'no duplicate mapping');
    const mine = await api('/lms/me/moodle/courses', { token: await login('student') });
    assert.equal(mine.body.data.courses[0].localCourse.code, 'CS 501', 'the same canonical identity reaches the student view');
  });

  it('classifies sync log outcomes: records, empty and the kind of failure', async () => {
    const admin = await login('admin');
    const integrationId = (await prisma.integration.findFirst({ where: { provider: 'MOODLE' } })).id;
    const latest = () => prisma.integrationSyncLog.findFirst({ where: { integrationId }, orderBy: { startedAt: 'desc' } });
    await api('/lms/admin/moodle/rosters/read', { method: 'POST', token: admin });
    assert.equal((await latest()).outcome, 'RECORDS');
    const saved = site.state.enrolments;
    site.state.enrolments = [];
    await api('/lms/admin/moodle/rosters/read', { method: 'POST', token: admin });
    site.state.enrolments = saved;
    assert.equal((await latest()).outcome, 'EMPTY');
    site.state.inject.core_enrol_get_enrolled_users = { exception: 'required_capability_exception', errorcode: 'nopermissions', message: 'No.' };
    await api('/lms/admin/moodle/rosters/read', { method: 'POST', token: admin });
    assert.equal((await latest()).outcome, 'PERMISSION_DENIED');
    const { outcomeOfError } = await import('../src/integrations/integrationService.js');
    assert.equal(outcomeOfError({ code: 'OPERATION_NOT_SUPPORTED', details: { reason: 'NOT_IMPLEMENTED' } }), 'NOT_IMPLEMENTED');
    assert.equal(outcomeOfError({ code: 'OPERATION_NOT_SUPPORTED', details: { reason: 'LMS_ONLY_PROVIDER' } }), 'NOT_SUPPORTED');
    assert.equal(outcomeOfError({ code: 'INTEGRATION_ERROR', details: { kind: 'AUTH_FAILED' } }), 'AUTH_FAILED');
    assert.equal(outcomeOfError({ code: 'INTEGRATION_ERROR', details: { kind: 'TIMEOUT' } }), 'NETWORK');
    assert.equal(outcomeOfError({ code: 'INTEGRATION_NOT_CONFIGURED', details: { kind: 'FUNCTION_NOT_ENABLED' } }), 'FUNCTION_NOT_ENABLED');
  });

  it('seeds the Mathematics additions under MAT_001: identities without fake local courses, teachers, no duplicates', async () => {
    const { preflight, applySeed, verifySeed, MATH_FACULTY } = await import('../src/modules/lms/moodleSeed.js');
    Object.assign(process.env, { MOODLE_SITE_USER_QUOTA: '50', MOODLE_SEED_ENABLED: 'true', MOODLE_DEMO_PASSWORD: 'Demo-Only-Pass1!' });
    const cats = site.state.categories;

    site.state.categories = cats.filter((c) => c.idnumber !== 'MAT_001');
    assert.match((await preflight({ tenantSlug: 'demo-university', scope: 'math' })).blockers.join(' '), /No Moodle course category has ID number MAT_001/);
    site.state.categories = [...cats, { id: 9, name: 'Maths (copy)', idnumber: 'MAT_001', parent: 0 }];
    assert.match((await preflight({ tenantSlug: 'demo-university', scope: 'math' })).blockers.join(' '), /More than one Moodle category/);
    site.state.categories = cats;

    const plan = await preflight({ tenantSlug: 'demo-university', scope: 'math' });
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.facts.categoryId, 4);
    assert.deepEqual(plan.plan.people.map((p) => `${p.number}:${p.localAction}:${p.action}`), ['FAC-30101:CREATE_LOCAL_IDENTITY:CREATE', 'FAC-30102:CREATE_LOCAL_IDENTITY:CREATE']);
    const coursesBefore = await prisma.course.count();

    const applied = await applySeed({ tenantSlug: 'demo-university', scope: 'math' });
    assert.equal(applied.applied, true, JSON.stringify(applied.blockers));
    const verified = await verifySeed({ tenantSlug: 'demo-university', scope: 'math', before: applied.before });
    assert.equal(verified.ok, true, verified.problems.join('\n'));
    const mathCourses = [...site.state.courses.values()].filter((c) => c.idnumber?.startsWith('ENX-DEMO-MAT-'));
    assert.equal(mathCourses.length, 2);
    assert.ok(mathCourses.every((c) => c.categoryid === 4), 'created in the MAT_001 category');
    assert.equal(await prisma.course.count(), coursesBefore, 'no local course was invented for the new faculty');
    const faculty = await prisma.facultyProfile.findMany({ where: { employeeNumber: { in: MATH_FACULTY.map((f) => f.employeeNumber) } } });
    assert.equal(faculty.length, 2);
    const teacherIds = new Set((await prisma.externalIdentity.findMany({ where: { provider: 'MOODLE', entityType: 'FACULTY', internalId: { in: faculty.map((f) => f.id) } } })).map((l) => Number(l.externalId)));
    assert.equal(teacherIds.size, 2);
    assert.ok(site.state.enrolments.filter((e) => teacherIds.has(e.userid)).every((e) => e.roleid === 3));

    const writes = () => ['core_user_create_users', 'core_course_create_courses', 'enrol_manual_enrol_users'].reduce((n, fn) => n + site.callsOf(fn), 0);
    const before = writes();
    const rerun = await applySeed({ tenantSlug: 'demo-university', scope: 'math' });
    assert.equal(rerun.applied, true);
    assert.equal(writes(), before, 'rerun writes nothing');
    assert.equal(await prisma.facultyProfile.count({ where: { employeeNumber: { in: MATH_FACULTY.map((f) => f.employeeNumber) } } }), 2, 'no duplicate local faculty');
    delete process.env.MOODLE_DEMO_PASSWORD;
  });
});
