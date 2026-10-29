import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer, login, signInFirstTime } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { startMoodleStub } from './helpers/moodleStub.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';
import { clearMoodleCapabilityCache } from '../src/integrations/connectors/MoodleConnector.js';

/**
 * Person onboarding across EduNexusAI, CampusCore and Moodle (/admin/people). Both external
 * systems are in-process stubs (helpers/campuscoreStub.js, helpers/moodleStub.js); no real
 * CampusCore or Moodle is contacted by this file.
 */

const CC = { id: 'cc_people_stub', secret: 'ccs_people_stub_secret_0001' };
const MOODLE_TOKEN = 'people-stub-token-0123456789abcdef';
const TEMP = 'Temporary#Pass2026';
const KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS', 'MOODLE_BASE_URL', 'MOODLE_TOKEN', 'MOODLE_WRITES_ENABLED', 'MOODLE_STUDENT_ROLE_ID', 'MOODLE_TEACHER_ROLE_ID', 'MOODLE_MAX_RETRIES', 'MOODLE_TIMEOUT_MS'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const EMAILS = [];
let sis;
let moodle;
let prisma;
let admin;

const student = (id, number, first, last, extra = {}) => ({ id, studentNumber: number, firstName: first, lastName: last, preferredName: null, email: `${first}.${last}@students.feddrick.edu`.toLowerCase(), phone: null, status: 'ACTIVE', classLevel: 'JUNIOR', academicStanding: 'GOOD_STANDING', program: { id: 'prog-cs', code: 'BS-CS', name: 'Computer Science', degreeType: 'BS' }, hasRegistrationHold: false, version: 1, ...extra });
const onboard = (body, token = admin) => api('/admin/people', { method: 'POST', token, body });
const lookup = (body, token = admin) => api('/admin/people/lookup', { method: 'POST', token, body });

before(async () => {
  sis = await startCampusCoreStub({ clientId: CC.id, clientSecret: CC.secret });
  moodle = await startMoodleStub({ token: MOODLE_TOKEN });
  for (const [id, shortname] of [[501, 'PEOPLE-101'], [502, 'PEOPLE-102']]) moodle.state.courses.set(id, { id, shortname, fullname: `Moodle course ${shortname}`, idnumber: shortname, categoryid: 1, visible: 1 });
  Object.assign(process.env, {
    SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: sis.url, CAMPUSCORE_CLIENT_ID: CC.id, CAMPUSCORE_CLIENT_SECRET: CC.secret, CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000',
    MOODLE_BASE_URL: moodle.url, MOODLE_TOKEN, MOODLE_WRITES_ENABLED: 'true', MOODLE_STUDENT_ROLE_ID: '5', MOODLE_TEACHER_ROLE_ID: '3', MOODLE_MAX_RETRIES: '1', MOODLE_TIMEOUT_MS: '1500',
  });
  resetSisClient();
  clearMoodleCapabilityCache();
  ({ prisma } = await import('../src/db/prisma.js'));
  await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: moodle.url, enabled: true, mode: 'LIVE' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: { in: ['MOODLE', 'CAMPUSCORE'] } } });
  await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
  for (const s of [student('stu-ana', 'S2500001', 'Ana', 'Lopez'), student('stu-ben', 'S2500002', 'Ben', 'Okoro'), student('stu-cara', 'S2500003', 'Cara', 'Diaz'), student('stu-dev', 'S2500004', 'Dev', 'Rao'), student('stu-eli', 'S2500005', 'Eli', 'Moss')]) {
    sis.state.students.set(s.id, s);
    EMAILS.push(s.email);
  }
  EMAILS.push('other.teacher@feddrick.edu', 'new.admin.people@feddrick.edu', 'fresh.student@students.feddrick.edu');
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  admin = await login('admin');
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetSisClient();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.externalIdentity.deleteMany({ where: { provider: { in: ['MOODLE', 'CAMPUSCORE'] } } });
  await sis.close();
  await moodle.close();
  await closeTestServer();
});

describe('Person onboarding: one workflow across the three systems', () => {
  it('previews what exists in each system without changing anything', async () => {
    const before = { users: await prisma.user.count(), links: sis.state.links.length, moodleUsers: moodle.state.users.size };
    const res = await lookup({ role: 'STUDENT', email: 'ana.lopez@students.feddrick.edu' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.recommendation.action, 'PROVISION_FROM_SIS');
    assert.equal(res.body.data.sis.records[0].institutionalId, 'S2500001');
    assert.equal(res.body.data.moodle.state, 'NOT_FOUND');
    assert.deepEqual(res.body.data.moodle.proposed, { username: 's2500001', idnumber: 'S2500001' });
    assert.deepEqual({ users: await prisma.user.count(), links: sis.state.links.length, moodleUsers: moodle.state.users.size }, before, 'read-only');
    const byNumber = await lookup({ role: 'STUDENT', institutionalId: 'S2500001' });
    assert.equal(byNumber.body.data.sis.records[0].sisId, 'stu-ana');
  });

  it('onboards a CampusCore student: login + link, Moodle account with a one-time password, and enrolment', async () => {
    const res = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-ana' }, login: { mode: 'NEW', password: TEMP }, tierKey: 'STANDARD', moodle: { enabled: true, courseIds: [501], credentials: 'ONE_TIME' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const d = res.body.data;
    assert.equal(d.outcome, 'COMPLETED');
    assert.deepEqual([d.steps.sisRecord.status, d.steps.login.status, d.steps.moodleAccount.status, d.steps.moodleEnrolments.find((e) => e.moodleCourseId === 501).status], ['ALREADY', 'DONE', 'DONE', 'DONE']);
    const userId = d.user.id;
    assert.equal(sis.state.links.find((l) => l.externalUserId === userId && l.status === 'ACTIVE')?.sisId, 'stu-ana');

    // Moodle: username and ID number are the CampusCore institutional ID; a forced change.
    const mUser = [...moodle.state.users.values()].find((u) => u.idnumber === 'S2500001');
    assert.equal(mUser.username, 's2500001');
    assert.equal(mUser.email, 'ana.lopez@students.feddrick.edu');
    const cred = moodle.state.credentials.get(mUser.id);
    assert.equal(cred.forceChange, true);
    assert.equal(d.oneTimeCredential.password, cred.password, 'the one-time password handed over is the one Moodle has');
    assert.equal(d.oneTimeCredential.username, 's2500001');
    assert.notEqual(cred.password, TEMP, 'the Moodle password is not the EduNexusAI password');
    assert.ok(moodle.state.enrolments.some((e) => e.userid === mUser.id && e.courseid === 501 && e.roleid === 5));

    // The one-time password exists only in that response: not in the DB, the audit log or operations.
    const ops = await prisma.integrationOperation.findMany({ where: { internalId: (await prisma.studentProfile.findFirst({ where: { userId } })).id } });
    assert.ok(ops.length > 0);
    assert.ok(!JSON.stringify(ops).includes(cred.password), 'not persisted in operations');
    const audits = await prisma.auditLog.findMany({ where: { createdAt: { gte: new Date(Date.now() - 60_000) } } });
    assert.ok(!JSON.stringify(audits).includes(cred.password), 'not in the audit log');
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, passwordChangeRequired: true } });
    assert.match(row.passwordHash, /^\$2[aby]\$/);
    assert.equal(row.passwordChangeRequired, true);

    // The new student signs in (changing the temporary password) and sees their own SIS record.
    const token = await signInFirstTime('ana.lopez@students.feddrick.edu', TEMP);
    const overview = await api('/sis/me/overview', { token });
    assert.equal(overview.body.data.profile.data.institutionalId, 'S2500001');
  });

  it('marks a response carrying a one-time password as not cacheable', async () => {
    const res = await fetch(`${(await getTestServer()).baseUrl}/admin/people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-eli' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, courseIds: [], credentials: 'ONE_TIME' } }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('resumes instead of duplicating when the same onboarding is submitted again', async () => {
    const counts = async () => ({ users: await prisma.user.count({ where: { email: 'ana.lopez@students.feddrick.edu' } }), links: sis.state.links.filter((l) => l.sisId === 'stu-ana' && l.status === 'ACTIVE').length, moodle: [...moodle.state.users.values()].filter((u) => u.idnumber === 'S2500001').length, enrol: moodle.state.enrolments.filter((e) => e.courseid === 501).length });
    const before = await counts();
    const again = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-ana' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, courseIds: [501], credentials: 'ONE_TIME' } });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.deepEqual([again.body.data.steps.login.status, again.body.data.steps.moodleAccount.status, again.body.data.steps.moodleEnrolments.find((e) => e.moodleCourseId === 501).status], ['ALREADY', 'ALREADY', 'ALREADY']);
    assert.equal(again.body.data.oneTimeCredential, undefined, 'no new password for an existing account');
    assert.deepEqual(await counts(), before);
  });

  it('links an existing Moodle account instead of creating one, and leaves its password alone', async () => {
    moodle.state.users.set(900, { id: 900, username: 'ben-own', email: 'ben.okoro@students.feddrick.edu', idnumber: 'S2500002', firstname: 'Ben', lastname: 'Okoro', auth: 'manual', suspended: 0 });
    const received = moodle.state.receivedPasswords;
    const preview = await lookup({ role: 'STUDENT', email: 'ben.okoro@students.feddrick.edu' });
    assert.equal(preview.body.data.moodle.state, 'FOUND');
    const res = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-ben' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, courseIds: [], credentials: 'ONE_TIME' } });
    assert.equal(res.body.data.steps.moodleAccount.status, 'ALREADY');
    assert.equal(res.body.data.steps.moodleAccount.moodleUserId, 900);
    assert.equal(res.body.data.steps.moodleAccount.passwordDelivery, 'EXISTING_MOODLE_PASSWORD');
    assert.equal(res.body.data.oneTimeCredential, undefined);
    assert.equal(moodle.state.receivedPasswords, received, 'no password sent to Moodle');
    assert.equal(moodle.state.credentials.has(900), false);
  });

  it('links an existing EduNexusAI login instead of creating a second one', async () => {
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
    const role = await prisma.role.findUnique({ where: { key: 'STUDENT' } });
    const existing = await prisma.user.create({ data: { tenantId: tenant.id, email: 'cara.diaz@students.feddrick.edu', passwordHash: '$2a$04$abcdefghijklmnopqrstuuJ1sJx2iQX9U0tC4z5vYwG7mHk0p6Wf2', firstName: 'Cara', lastName: 'Diaz', userRoles: { create: [{ roleId: role.id }] }, studentProfile: { create: { tenantId: tenant.id, studentNumber: 'ENX-LEGACY-1' } } } });
    const preview = await lookup({ role: 'STUDENT', email: 'cara.diaz@students.feddrick.edu' });
    assert.equal(preview.body.data.recommendation.action, 'LINK_EXISTING_LOGIN');
    assert.equal(preview.body.data.recommendation.userId, existing.id);

    const dup = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-cara' }, login: { mode: 'NEW', password: TEMP } });
    assert.equal(dup.body.data.steps.login.status, 'BLOCKED');
    assert.equal(dup.body.data.steps.login.existingUserId, existing.id);
    assert.equal(await prisma.user.count({ where: { email: 'cara.diaz@students.feddrick.edu' } }), 1, 'no second login');

    const linked = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-cara' }, login: { mode: 'LINK_EXISTING', userId: existing.id }, moodle: { enabled: true, courseIds: [], credentials: 'NONE' } });
    assert.equal(linked.body.data.steps.login.status, 'DONE', JSON.stringify(linked.body));
    assert.equal(sis.state.links.find((l) => l.externalUserId === existing.id && l.status === 'ACTIVE')?.sisId, 'stu-cara');
    const m = [...moodle.state.users.values()].find((u) => u.email === 'cara.diaz@students.feddrick.edu');
    assert.equal(m.idnumber, 'S2500003', 'the Moodle ID number is CampusCore’s, not the legacy local number');
    assert.equal(moodle.state.credentials.get(m.id).password.length > 12, true, 'NONE: an unknown random password');
    assert.equal(linked.body.data.oneTimeCredential, undefined);
  });

  it('stops before creating anything when CampusCore policy forbids creating the student', async () => {
    sis.state.policies['student.create'] = false;
    const before = { users: await prisma.user.count(), students: sis.state.students.size, moodleUsers: moodle.state.users.size };
    const preview = await lookup({ role: 'STUDENT', email: 'fresh.student@students.feddrick.edu' });
    assert.equal(preview.body.data.recommendation.action, 'BLOCKED');
    assert.match(preview.body.data.recommendation.message, /registrar|enable/i);
    const body = { role: 'STUDENT', sis: { mode: 'CREATE', idempotencyKey: '6f0d7c4e-2b1a-4c3d-9e8f-0a1b2c3d4e5f', record: { firstName: 'Fresh', lastName: 'Student', email: 'fresh.student@students.feddrick.edu', programId: 'prog-cs' } }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, courseIds: [501], credentials: 'EMAIL' } };
    const blocked = await onboard(body);
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.data.outcome, 'BLOCKED');
    assert.equal(blocked.body.data.steps.sisRecord.status, 'BLOCKED');
    assert.equal(blocked.body.data.steps.login, null);
    assert.ok(blocked.body.data.requiredActions[0].includes('CampusCore'));
    assert.deepEqual({ users: await prisma.user.count(), students: sis.state.students.size, moodleUsers: moodle.state.users.size }, before, 'nothing created in any system');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'PERSON_ONBOARDING_BLOCKED' } }));

    // With the policy on, the same form creates the record once, and a retry replays it.
    sis.state.policies['student.create'] = true;
    const created = await onboard(body);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.steps.sisRecord.status, 'DONE');
    assert.equal(created.body.data.steps.moodleAccount.passwordDelivery, 'EMAILED_BY_MOODLE');
    const m = [...moodle.state.users.values()].find((u) => u.email === 'fresh.student@students.feddrick.edu');
    assert.equal(moodle.state.credentials.get(m.id).emailed, true);
    assert.equal(created.body.data.oneTimeCredential, undefined, 'EMAIL: no password returned');
    const retry = await onboard(body);
    assert.equal(retry.body.data.steps.sisRecord.status, 'ALREADY');
    assert.equal(retry.body.data.steps.login.status, 'ALREADY');
    assert.equal([...sis.state.students.values()].filter((s) => s.email === 'fresh.student@students.feddrick.edu').length, 1);
    assert.equal(await prisma.user.count({ where: { email: 'fresh.student@students.feddrick.edu' } }), 1);
  });

  it('keeps the login when Moodle fails, reports PARTIAL, and completes on the next attempt', async () => {
    moodle.state.inject.core_user_create_users = 'http503';
    const first = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-dev' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, courseIds: [502], credentials: 'NONE' } });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.outcome, 'PARTIAL');
    assert.equal(first.body.data.steps.login.status, 'DONE');
    assert.ok(['FAILED', 'BLOCKED'].includes(first.body.data.steps.moodleAccount.status));
    assert.equal(first.body.data.steps.moodleEnrolments[0].status, 'SKIPPED');
    assert.ok(first.body.data.requiredActions.some((a) => a.includes('Moodle')));
    const second = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-dev' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, courseIds: [502], credentials: 'NONE' } });
    assert.equal(second.body.data.outcome, 'COMPLETED', JSON.stringify(second.body.data.steps));
    assert.equal(second.body.data.steps.login.status, 'ALREADY');
    assert.equal([...moodle.state.users.values()].filter((u) => u.idnumber === 'S2500004').length, 1, 'one Moodle account');
    assert.equal(await prisma.user.count({ where: { email: 'dev.rao@students.feddrick.edu' } }), 1, 'one login');
  });

  it('onboards faculty from CampusCore with a teacher enrolment, and refuses faculty CampusCore does not have', async () => {
    const missing = await lookup({ role: 'FACULTY', email: 'nobody@feddrick.edu' });
    assert.equal(missing.body.data.recommendation.action, 'BLOCKED');
    assert.match(missing.body.data.recommendation.message, /cannot create faculty/);
    const res = await onboard({ role: 'FACULTY', sis: { mode: 'EXISTING', sisRecordId: 'fac-2' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, courseIds: [502], credentials: 'ONE_TIME' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.outcome, 'COMPLETED', JSON.stringify(res.body.data.steps));
    const m = [...moodle.state.users.values()].find((u) => u.idnumber === 'F1002');
    assert.ok(moodle.state.enrolments.some((e) => e.userid === m.id && e.courseid === 502 && e.roleid === 3), 'editing teacher in the course only');
    const createFaculty = await onboard({ role: 'FACULTY', sis: { mode: 'CREATE', idempotencyKey: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', record: { firstName: 'X', lastName: 'Y', email: 'x.y@feddrick.edu', programId: 'prog-cs' } }, login: { mode: 'NEW', password: TEMP } });
    assert.equal(createFaculty.status, 400);
  });

  it('picks up a scope added in CampusCore after the current token was issued, and says where to fix a missing one', async () => {
    sis.state.students.set('stu-fay', student('stu-fay', 'S2500006', 'Fay', 'Nguyen'));
    EMAILS.push('fay.nguyen@students.feddrick.edu');
    sis.state.scopes = sis.state.scopes.filter((x) => x !== 'identity:write');
    resetSisClient();
    const refused = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-fay' }, login: { mode: 'NEW', password: TEMP } });
    assert.equal(refused.body.data.steps.login.status, 'BLOCKED');
    assert.match(refused.body.data.steps.login.message, /add the identity:write scope/);
    assert.equal(await prisma.user.count({ where: { email: 'fay.nguyen@students.feddrick.edu' } }), 0);
    // A CampusCore admin adds the scope; EduNexusAI still holds the older token.
    sis.state.scopes.push('identity:write');
    const ok = await onboard({ role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-fay' }, login: { mode: 'NEW', password: TEMP } });
    assert.equal(ok.body.data.steps.login.status, 'DONE', JSON.stringify(ok.body.data.steps.login));
  });

  it('creates administrators as portal-only logins, and keeps the legacy local path closed for students', async () => {
    const res = await onboard({ role: 'ADMIN', account: { email: 'new.admin.people@feddrick.edu', firstName: 'New', lastName: 'Admin', password: TEMP } });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.data.steps.sisRecord.status, res.body.data.steps.login.status, res.body.data.steps.moodleAccount.status], ['SKIPPED', 'DONE', 'SKIPPED']);
    const legacy = await api('/admin/users', { method: 'POST', token: admin, body: { email: 'legacy.student@feddrick.edu', password: TEMP, firstName: 'L', lastName: 'S', roles: ['STUDENT'] } });
    assert.equal(legacy.status, 409);
    assert.equal(legacy.body.error.details.reason, 'USE_PERSON_ONBOARDING');
    assert.equal(await prisma.user.count({ where: { email: 'legacy.student@feddrick.edu' } }), 0);
  });

  it('is for administrators only', async () => {
    for (const persona of ['student', 'faculty']) {
      const token = await login(persona);
      assert.equal((await lookup({ role: 'STUDENT', email: 'ana.lopez@students.feddrick.edu' }, token)).status, 403);
      assert.equal((await onboard({ role: 'ADMIN', account: { email: 'x@feddrick.edu', firstName: 'X', lastName: 'Y', password: TEMP } }, token)).status, 403);
      assert.equal((await api(`${'/lms/admin/moodle'}/people/STUDENT/00000000-0000-4000-8000-000000000000/one-time-password`, { method: 'POST', token })).status, 403);
    }
  });
});

describe('Identity mapping across systems', () => {
  it('shows one person in every system and flags a Moodle account that belongs to another identity', async () => {
    const ana = await prisma.user.findFirst({ where: { email: 'ana.lopez@students.feddrick.edu' } });
    const ok = await api(`/admin/people/${ana.id}/systems`, { token: admin });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.campuscore.state, 'LINKED');
    assert.equal(ok.body.data.campuscore.institutionalId, 'S2500001');
    assert.equal(ok.body.data.moodle.state, 'LINKED');
    assert.equal(ok.body.data.moodle.account.idnumber, 'S2500001');
    assert.deepEqual(ok.body.data.warnings, []);

    const mUser = [...moodle.state.users.values()].find((u) => u.idnumber === 'S2500001');
    mUser.idnumber = 'S9999999';
    const bad = await api(`/admin/people/${ana.id}/systems`, { token: admin });
    assert.ok(bad.body.data.warnings.some((w) => w.includes('S9999999')), 'mismatch reported');
    mUser.idnumber = 'S2500001';
  });

  it('issues a one-time Moodle password once, forcing a change, without storing it', async () => {
    const ana = await prisma.studentProfile.findFirst({ where: { user: { email: 'ana.lopez@students.feddrick.edu' } } });
    const res = await api(`/lms/admin/moodle/people/STUDENT/${ana.id}/one-time-password`, { method: 'POST', token: admin });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const mUser = [...moodle.state.users.values()].find((u) => u.idnumber === 'S2500001');
    const cred = moodle.state.credentials.get(mUser.id);
    assert.equal(res.body.data.oneTimeCredential.password, cred.password);
    assert.equal(cred.forceChange, true);
    const op = await prisma.integrationOperation.findFirst({ where: { operation: 'USER.PASSWORD_RESET', internalId: ana.id }, orderBy: { createdAt: 'desc' } });
    assert.equal(op.status, 'SUCCEEDED');
    assert.ok(!JSON.stringify(op).includes(cred.password));
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'MOODLE_PASSWORD_RESET', entityId: ana.id } }));
  });

  it('a mapping change takes effect at once: the previous record is no longer reachable', async () => {
    const eli = await prisma.user.findFirst({ where: { email: 'eli.moss@students.feddrick.edu' } });
    const token = await signInFirstTime('eli.moss@students.feddrick.edu', TEMP);
    assert.equal((await api('/sis/me/overview', { token })).body.data.identity.sisId, 'stu-eli');
    const link = sis.state.links.find((l) => l.externalUserId === eli.id && l.status === 'ACTIVE');
    const revoked = await api(`/sis/admin/identity/links/${link.id}/revoke`, { method: 'POST', token: admin, body: { reason: 'Linked to the wrong record (test)', userId: eli.id } });
    assert.equal(revoked.status, 200);
    const after = await api('/sis/me/overview', { token });
    assert.equal(after.body.data.state, 'UNMAPPED', 'no cached access to the old record');
    assert.ok(!JSON.stringify(after.body).includes('S2500005'));
  });
});
