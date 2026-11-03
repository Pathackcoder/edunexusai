import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login, signInFirstTime } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';

/**
 * CampusCore SIS integration (EduNexusAI side). Every call goes to an in-process stub of
 * the CampusCore API (helpers/campuscoreStub.js); the real SIS is never contacted here.
 */

const CLIENT_ID = 'cc_stubclient0001';
const CLIENT_SECRET = 'ccs_stub_secret_value_do_not_leak_0001';
const ENV_KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let sis;
let prisma;
let users;
const leaks = (body) => {
  const text = JSON.stringify(body);
  return text.includes(CLIENT_SECRET) || /tok-\d+/.test(text);
};

before(async () => {
  sis = await startCampusCoreStub({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  Object.assign(process.env, {
    SIS_PROVIDER: 'campuscore',
    CAMPUSCORE_BASE_URL: sis.url,
    CAMPUSCORE_CLIENT_ID: CLIENT_ID,
    CAMPUSCORE_CLIENT_SECRET: CLIENT_SECRET,
    CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick',
    SIS_TENANT_KEY: 'demo-university',
    CAMPUSCORE_TIMEOUT_MS: '2000',
  });
  resetSisClient();
  ({ prisma } = await import('../src/db/prisma.js'));
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE' } });
  const byEmail = async (email) => prisma.user.findFirst({ where: { email }, select: { id: true, email: true } });
  users = {
    amit: await byEmail('student@edunexus.ai'),
    maya: await byEmail('student.advanced@edunexus.ai'),
    faculty: await byEmail('faculty@edunexus.ai'),
    admin: await byEmail('admin@edunexus.ai'),
  };
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetSisClient();
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE' } });
  await sis.close();
  await closeTestServer();
});

describe('CampusCore connection', () => {
  it('obtains, caches and reuses a token, and verifies the institution', async () => {
    const admin = await login('admin');
    const before = sis.state.tokenRequests;
    const health = await api('/sis/admin/health', { token: admin });
    assert.equal(health.status, 200);
    assert.equal(health.body.data.state, 'CONNECTED');
    assert.equal(health.body.data.institution.slug, 'feddrick');
    assert.equal(health.body.data.institutionVerified, true);
    await api('/sis/admin/capabilities', { token: admin });
    await api('/sis/admin/students', { token: admin });
    assert.equal(sis.state.tokenRequests - before, 1, 'one token serves several requests');
    assert.ok(!leaks(health.body), 'no secret or token in the health result');
    assert.equal(health.body.data.clientSecretConfigured, true);
  });

  it('refreshes an expired token and recovers from revocation without manual steps', async () => {
    const admin = await login('admin');
    sis.state.expiresIn = 31; // the connector refreshes 30 s before expiry
    resetSisClient();
    await api('/sis/admin/capabilities', { token: admin });
    const afterFirst = sis.state.tokenRequests;
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal((await api('/sis/admin/capabilities', { token: admin })).status, 200);
    assert.equal(sis.state.tokenRequests, afterFirst + 1, 'refreshed automatically before expiry');
    sis.state.expiresIn = 900;

    sis.revokeAllTokens();
    const res = await api('/sis/admin/capabilities', { token: admin });
    assert.equal(res.status, 200, 'a revoked token is replaced and the request retried once');
    assert.equal(sis.state.tokenRequests, afterFirst + 2);
  });

  it('reports invalid credentials and the wrong institution as unhealthy, never as data', async () => {
    const admin = await login('admin');
    process.env.CAMPUSCORE_CLIENT_SECRET = 'wrong-secret';
    resetSisClient();
    const bad = await api('/sis/admin/health', { token: admin });
    assert.equal(bad.body.data.ok, false);
    assert.equal(bad.body.data.state, 'AUTH_FAILED');
    const student = await api('/sis/me/overview', { token: await login('student') });
    assert.equal(student.status, 502);
    assert.equal(student.body.error.code, 'SIS_AUTH_FAILED');
    assert.ok(!leaks(bad.body) && !JSON.stringify(bad.body).includes('wrong-secret'));
    process.env.CAMPUSCORE_CLIENT_SECRET = CLIENT_SECRET;

    process.env.CAMPUSCORE_EXPECTED_INSTITUTION = 'lakeshore';
    resetSisClient();
    const mismatch = await api('/sis/admin/health', { token: admin });
    assert.equal(mismatch.body.data.state, 'INSTITUTION_MISMATCH');
    assert.equal((await api('/sis/admin/students', { token: admin })).body.error.code, 'SIS_INSTITUTION_MISMATCH');
    process.env.CAMPUSCORE_EXPECTED_INSTITUTION = 'feddrick';
    resetSisClient();
  });
});

describe('CampusCore identity and student data', () => {
  it('shows an unmapped student an explicit state and no one else’s data', async () => {
    const res = await api('/sis/me/overview', { token: await login('student') });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.state, 'UNMAPPED');
    assert.ok(!JSON.stringify(res.body).includes('Maya Chen'));
  });

  it('gives a mapped student their own record, which request parameters cannot change', async () => {
    sis.link(users.amit.id, 'STUDENT', 'stu-maya');
    sis.link(users.maya.id, 'STUDENT', 'stu-jordan');
    resetSisClient();
    const token = await login('student');
    const res = await api('/sis/me/overview?studentId=stu-jordan&sisId=stu-jordan', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.state, 'OK');
    assert.equal(res.body.data.identity.sisId, 'stu-maya');
    assert.equal(res.body.data.profile.data.institutionalId, 'S2400001');
    assert.equal(res.body.data.academic.data.gpa, 3.62);
    assert.equal(res.body.data.schedule.data.items[0].courseCode, 'CS 301');
    assert.ok(!JSON.stringify(res.body).includes('S2400002'), 'never the other student’s record');
    const other = await api('/sis/me/overview', { token: await login('advanced') });
    assert.equal(other.body.data.identity.sisId, 'stu-jordan');
    const mirror = await prisma.externalIdentity.findFirst({ where: { provider: 'CAMPUSCORE', internalId: users.amit.id } });
    assert.equal(mirror.externalId, 'stu-maya', 'local mirror follows the CampusCore link');
  });

  it('keeps faculty to the sections CampusCore says they teach', async () => {
    sis.link(users.faculty.id, 'FACULTY', 'fac-1');
    resetSisClient();
    const token = await login('faculty');
    const teaching = await api('/sis/faculty/teaching', { token });
    assert.equal(teaching.body.data.state, 'OK');
    assert.deepEqual(teaching.body.data.sections.data.map((s) => s.source.id), ['sec-1']);
    const roster = await api('/sis/faculty/sections/sec-1/roster', { token });
    assert.equal(roster.status, 200);
    assert.equal(roster.body.data[0].student.institutionalId, 'S2400001');
    const other = await api('/sis/faculty/sections/sec-2/roster', { token });
    assert.equal(other.status, 403);
    assert.equal(other.body.error.details.sisCode, 'not_section_instructor');
    assert.equal((await api('/sis/faculty/teaching', { token: await login('student') })).status, 403);
  });

  it('reports a CampusCore outage as unavailable, never as stale data', async () => {
    sis.state.down = true;
    resetSisClient();
    const res = await api('/sis/me/overview', { token: await login('student') });
    assert.equal(res.body.data.state, 'UNAVAILABLE');
    assert.equal((await api('/sis/admin/students', { token: await login('admin') })).status, 503);
    sis.state.down = false;
    resetSisClient();
  });
});

describe('Student timetable from CampusCore registrations', () => {
  it('shows the classes of the term the student is registered in, with their meeting times', async () => {
    // Spring term: registration open, not current. stu-maya registers there in two sections,
    // one of which has no meeting times yet.
    sis.state.terms.push({ id: 'term-sp', code: '2027SP', name: 'Spring 2027', startDate: '2027-01-11', endDate: '2027-05-07', isCurrent: false, status: 'REGISTRATION_OPEN' });
    sis.state.sections.push(
      { id: 'sec-sp1', termCode: '2027SP', course: { id: 'c3', code: 'CS 101', title: 'Intro to Programming', credits: 4 }, sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [{ day: 'MON', dayOfWeek: 1, startTime: '11:00', endTime: '11:50', room: 'Turing 158' }, { day: 'SAT', dayOfWeek: 6, startTime: '09:00', endTime: '10:15', room: 'Lab 2' }], instructors: [{ facultyId: 'fac-1', name: 'Elena Vasquez', isPrimary: true }], facultyId: 'fac-1' },
      { id: 'sec-sp2', termCode: '2027SP', course: { id: 'c4', code: 'MATH 151', title: 'Calculus I', credits: 4 }, sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [], instructors: [], facultyId: null },
    );
    sis.state.registrations.push({ id: 'reg-sp1', studentId: 'stu-maya', sectionId: 'sec-sp1', status: 'REGISTERED', credits: 4, waitlistPosition: null }, { id: 'reg-sp2', studentId: 'stu-maya', sectionId: 'sec-sp2', status: 'REGISTERED', credits: 4, waitlistPosition: null });
    sis.state.links = sis.state.links.filter((l) => l.externalUserId !== users.amit.id);
    sis.link(users.amit.id, 'STUDENT', 'stu-maya');
    resetSisClient();
    const token = await login('student');

    const current = await api('/sis/me/overview', { token });
    assert.equal(current.body.data.schedule.data.term.code, '2026FA', 'CampusCore default: the current term');
    const spring = current.body.data.terms.find((t) => t.code === '2027SP');
    assert.deepEqual([spring.registered, spring.isCurrent], [2, false]);
    assert.ok(current.body.data.classTermIds.includes('term-sp'));

    const next = await api('/sis/me/overview?termId=term-sp', { token });
    const items = next.body.data.schedule.data.items;
    assert.deepEqual(items.map((i) => i.courseCode).sort(), ['CS 101', 'MATH 151'], 'exactly the registered sections, not the catalogue');
    const cs = items.find((i) => i.courseCode === 'CS 101');
    assert.deepEqual(cs.meetings.map((m) => [m.day, m.start, m.end, m.location]), [['MON', '11:00', '11:50', 'Turing 158'], ['SAT', '09:00', '10:15', 'Lab 2']]);
    assert.deepEqual(cs.instructors, ['Elena Vasquez']);
    assert.equal(items.find((i) => i.courseCode === 'MATH 151').meetings.length, 0, 'no meeting times are invented');

    // A change in CampusCore shows on the next read (no local copy).
    sis.state.sections.find((x) => x.id === 'sec-sp2').meetings.push({ day: 'TUE', dayOfWeek: 2, startTime: '09:30', endTime: '10:45', room: 'Noether 353' });
    sis.state.registrations.find((r) => r.id === 'reg-sp1').status = 'DROPPED';
    resetSisClient();
    const after = (await api('/sis/me/overview?termId=term-sp', { token })).body.data.schedule.data.items;
    assert.deepEqual(after.map((i) => [i.courseCode, i.meetings.length]), [['MATH 151', 1]]);

    // The term choice never widens access: another student's registrations stay out of reach.
    const other = await api('/sis/me/overview?termId=term-sp', { token: await login('advanced') });
    assert.ok(!JSON.stringify(other.body).includes('MATH 151'));
    sis.state.registrations = sis.state.registrations.filter((r) => !r.id.startsWith('reg-sp'));
  });
});

describe('CampusCore administration', () => {
  it('is for administrators only, even when called directly', async () => {
    for (const persona of ['student', 'faculty']) {
      const token = await login(persona);
      assert.equal((await api('/sis/admin/students', { token })).status, 403);
      assert.equal((await api('/sis/admin/students', { method: 'POST', token, body: {} })).status, 403);
    }
  });

  it('searches the student directory and shows mapping status', async () => {
    const res = await api('/sis/admin/students?search=chen', { token: await login('admin') });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items[0].institutionalId, 'S2400001');
    assert.equal(res.body.data.items[0].portalAccount.userId, users.amit.id);
  });

  it('creates a student exactly once per idempotency key, attributed to the admin', async () => {
    const admin = await login('admin');
    const body = { idempotencyKey: '3b241101-e2bb-4255-8caf-4136c566a962', student: { firstName: 'Test', lastName: 'Created', email: 'test.created@example.org', programId: 'prog-cs' } };
    const first = await api('/sis/admin/students', { method: 'POST', token: admin, body });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const again = await api('/sis/admin/students', { method: 'POST', token: admin, body });
    assert.equal(again.status, 201);
    assert.equal(again.body.data.replayed, true);
    assert.equal([...sis.state.students.values()].filter((s) => s.email === 'test.created@example.org').length, 1);
    assert.equal(sis.state.writes.at(-1).actingUser, `edunexusai:${users.admin.id}`);
    assert.equal(await prisma.user.count({ where: { email: 'test.created@example.org' } }), 0, 'no local account is created automatically');
    const dup = await api('/sis/admin/students', { method: 'POST', token: admin, body: { ...body, idempotencyKey: '8a3f0a4e-7d6a-4a5f-9a3e-2b1c0d9e8f71' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.details.sisCode, 'duplicate_student');
  });

  it('edits with optimistic concurrency and shows per-field refusals', async () => {
    const admin = await login('admin');
    const detail = await api('/sis/admin/students/stu-jordan', { token: admin });
    const etag = detail.body.data.etag;
    const ok = await api('/sis/admin/students/stu-jordan', { method: 'PATCH', token: admin, body: { etag, changes: { phone: '555-0100' } } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.data.changedFields, ['phone']);
    const stale = await api('/sis/admin/students/stu-jordan', { method: 'PATCH', token: admin, body: { etag, changes: { phone: '555-0199' } } });
    assert.equal(stale.status, 412, 'stale ETag');
    assert.equal(stale.body.error.details.sisCode, 'precondition_failed');
    const field = await api('/sis/admin/students/stu-jordan', { method: 'PATCH', token: admin, body: { changes: { programId: 'prog-x' } } });
    assert.equal(field.status, 403);
    assert.equal(field.body.error.details.sisDetails[0].field, 'programId');
  });

  it('deactivates without deleting, and refuses writes disabled by policy or preference', async () => {
    const admin = await login('admin');
    const res = await api('/sis/admin/students/stu-jordan/deactivate', { method: 'POST', token: admin, body: { reason: 'Withdrew from the university' } });
    assert.equal(res.status, 200);
    assert.equal(sis.state.students.get('stu-jordan').status, 'WITHDRAWN');
    assert.ok(sis.state.students.has('stu-jordan'), 'record retained');

    const prefs = await api('/sis/admin/write-preferences', { method: 'PUT', token: admin, body: { disabledOperations: ['student.create'] } });
    assert.equal(prefs.status, 200);
    const writesBefore = sis.state.writes.length;
    const blocked = await api('/sis/admin/students', { method: 'POST', token: admin, body: { idempotencyKey: '0e7a2a66-3f1d-4f5b-9b8e-0a1b2c3d4e5f', student: { firstName: 'No', lastName: 'Way', email: 'no.way@example.org', programId: 'prog-cs' } } });
    assert.equal(blocked.status, 403);
    assert.equal(sis.state.writes.length, writesBefore, 'nothing reached CampusCore');
    await api('/sis/admin/write-preferences', { method: 'PUT', token: admin, body: { disabledOperations: [] } });

    sis.state.policies['student.deactivate'] = false;
    const off = await api('/sis/admin/students/stu-maya/deactivate', { method: 'POST', token: admin, body: { reason: 'Policy test' } });
    assert.equal(off.status, 403);
    sis.state.policies['student.deactivate'] = true;
    const audit = await prisma.auditLog.findFirst({ where: { action: 'SIS_STUDENT_DEACTIVATE_REJECTED' }, orderBy: { createdAt: 'desc' } });
    assert.ok(audit, 'rejected writes are audited locally');
  });

  it('reconciles, links with evidence, prevents duplicates and revokes with a reason', async () => {
    const admin = await login('admin');
    sis.state.links = [];
    resetSisClient();
    await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE' } });
    const rec = await api('/sis/admin/identity/reconcile', { method: 'POST', token: admin, body: { recordType: 'STUDENT' } });
    assert.equal(rec.status, 200);
    assert.ok(rec.body.data.results.every((r) => r.status === 'UNMATCHED'), 'portal emails do not exist in the SIS, and names are never used');

    const mismatch = await api('/sis/admin/identity/links', { method: 'POST', token: admin, body: { userId: users.amit.id, recordType: 'STUDENT', sisRecordId: 'stu-maya' } });
    assert.equal(mismatch.status, 422);
    assert.equal(mismatch.body.error.details.sisCode, 'identity_evidence_mismatch');
    const linked = await api('/sis/admin/identity/links', { method: 'POST', token: admin, body: { userId: users.amit.id, recordType: 'STUDENT', sisRecordId: 'stu-maya', evidenceMismatchReason: 'Verified student ID card in person' } });
    assert.equal(linked.status, 201, JSON.stringify(linked.body));
    assert.equal((await prisma.externalIdentity.findFirst({ where: { provider: 'CAMPUSCORE', internalId: users.amit.id } })).externalId, 'stu-maya');
    const dup = await api('/sis/admin/identity/links', { method: 'POST', token: admin, body: { userId: users.maya.id, recordType: 'STUDENT', sisRecordId: 'stu-maya', evidenceMismatchReason: 'Trying a second account' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.details.sisCode, 'record_already_linked');

    const revoked = await api(`/sis/admin/identity/links/${linked.body.data.id}/revoke`, { method: 'POST', token: admin, body: { reason: 'Linked to the wrong record', userId: users.amit.id } });
    assert.equal(revoked.status, 200);
    assert.equal(await prisma.externalIdentity.count({ where: { provider: 'CAMPUSCORE', internalId: users.amit.id } }), 0);
    const cross = await api('/sis/admin/identity/links', { method: 'POST', token: admin, body: { userId: '00000000-0000-4000-8000-000000000000', recordType: 'STUDENT', sisRecordId: 'stu-maya', evidenceMismatchReason: 'Unknown account test' } });
    assert.equal(cross.status, 400, 'only accounts of this institution can be linked');

    sis.state.policies['identity.link'] = false;
    const policyOff = await api('/sis/admin/identity/links', { method: 'POST', token: admin, body: { userId: users.amit.id, recordType: 'STUDENT', sisRecordId: 'stu-maya', evidenceMismatchReason: 'Verified student ID card in person' } });
    assert.equal(policyOff.status, 422);
    assert.equal(policyOff.body.error.details.sisCode, 'policy_disabled');
    sis.state.policies['identity.link'] = true;
  });
});

describe('Pages and assistant read CampusCore, never local academic rows', () => {
  it('returns the signed-in user’s own CampusCore record on /sis/me/profile', async () => {
    sis.state.links = [];
    sis.link(users.amit.id, 'STUDENT', 'stu-maya');
    sis.link(users.faculty.id, 'FACULTY', 'fac-1');
    resetSisClient();
    const mine = await api('/sis/me/profile?sisId=stu-jordan', { token: await login('student') });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.state, 'OK');
    assert.equal(mine.body.data.student.institutionalId, 'S2400001');
    assert.equal(mine.body.data.student.program.requiredCredits, 120);
    assert.equal(mine.body.data.academic.gpa, 3.62);
    assert.ok(!JSON.stringify(mine.body).includes('S2400002'), 'query parameters cannot select another record');
    const fac = await api('/sis/me/profile', { token: await login('faculty') });
    assert.equal(fac.body.data.recordType, 'FACULTY');
    assert.equal(fac.body.data.faculty.institutionalId, 'F1001');
    const unmapped = await api('/sis/me/profile', { token: await login('advanced') });
    assert.equal(unmapped.body.data.state, 'UNMAPPED');
    assert.equal(unmapped.body.data.student, undefined);
  });

  it('fills the dashboard’s academic panels from CampusCore, and says so when it cannot', async () => {
    const local = await prisma.studentProfile.findFirst({ where: { userId: users.amit.id }, select: { cumulativeGpa: true } });
    const linked = await api('/dashboard', { token: await login('student') });
    const panel = (body, key) => body.data.panels[key];
    const progress = panel(linked.body, 'dashboard.progress');
    if (progress) {
      assert.equal(progress.data.source, 'campuscore');
      assert.equal(progress.data.state, 'OK');
      assert.equal(progress.data.cumulativeGpa, 3.62);
      assert.equal(progress.data.institutionalId, 'S2400001');
    }
    const degree = panel(linked.body, 'dashboard.degree_progress');
    if (degree) assert.deepEqual([degree.data.completedCredits, degree.data.totalRequired], [64, 120]);
    const cal = panel(linked.body, 'dashboard.calendar');
    if (cal) assert.equal(cal.status === 'ok' ? cal.data.every((e) => e.source === 'campuscore') : true, true);

    const unmapped = await api('/dashboard', { token: await login('advanced') });
    const p2 = panel(unmapped.body, 'dashboard.progress');
    assert.ok(p2, 'the advanced persona sees the progress panel');
    assert.equal(p2.data.state, 'UNMAPPED');
    assert.equal(p2.data.cumulativeGpa, undefined, 'no GPA of any kind for an unlinked account');

    sis.state.down = true;
    resetSisClient();
    const down = await api('/dashboard', { token: await login('student') });
    const p3 = panel(down.body, 'dashboard.progress');
    if (p3) {
      assert.notEqual(p3.data.state, 'OK');
      assert.equal(p3.data.cumulativeGpa, undefined, 'an outage never shows local values');
    }
    if (local?.cumulativeGpa != null) assert.ok(!JSON.stringify(panel(down.body, 'dashboard.progress') ?? {}).includes(String(local.cumulativeGpa)));
    sis.state.down = false;
    resetSisClient();
  });

  it('answers GPA and schedule questions from CampusCore only', async () => {
    const ask = async (persona, message) => (await api('/assistant/messages', { method: 'POST', token: await login(persona), body: { message } })).body.data.messages[1].content;
    const gpa = await ask('student', 'What is my GPA?');
    assert.match(gpa, /3\.62/);
    assert.match(gpa, /CampusCore/);
    const unlinked = await ask('advanced', 'What is my GPA?');
    assert.match(unlinked, /isn't linked/);
    const local = await prisma.studentProfile.findFirst({ where: { userId: users.maya.id }, select: { cumulativeGpa: true } });
    if (local?.cumulativeGpa != null) assert.ok(!unlinked.includes(Number(local.cumulativeGpa).toFixed(2)), 'never the local demo GPA');
    const schedule = await ask('student', 'What classes do I have today?');
    assert.match(schedule, /CampusCore|CS 301/);
  });
});

describe('Portal account provisioning for existing CampusCore records', () => {
  const PASSWORD = 'Provisioned#2026';
  const created = [];
  after(async () => {
    // Test database only: remove the accounts these tests provisioned.
    if (created.length) await prisma.user.deleteMany({ where: { email: { in: created } } });
  });

  it('creates a login for a CampusCore student, linked to that record, with no local academics', async () => {
    sis.state.links = [];
    resetSisClient();
    const rec = { id: 'stu-priya', studentNumber: 'S2400010', firstName: 'Priya', lastName: 'Nair', preferredName: null, email: 'priya.nair@students.feddrick.edu', phone: null, status: 'ACTIVE', classLevel: 'SOPHOMORE', academicStanding: 'GOOD_STANDING', program: { id: 'prog-cs', code: 'BS-CS', name: 'Computer Science', degreeType: 'BS' }, hasRegistrationHold: false, version: 1 };
    sis.state.students.set(rec.id, rec);
    await prisma.user.deleteMany({ where: { email: rec.email } });
    const admin = await login('admin');

    const res = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'STUDENT', sisRecordId: 'stu-priya', password: PASSWORD } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(rec.email);
    assert.equal(res.body.data.user.email, rec.email);
    assert.ok(!JSON.stringify(res.body).includes(PASSWORD), 'the password is never echoed back');
    const userId = res.body.data.user.id;

    const link = sis.state.links.find((l) => l.externalUserId === userId && l.status === 'ACTIVE');
    assert.equal(link?.sisId, 'stu-priya', 'linked in CampusCore to exactly this record');
    assert.equal(link.actingUser, `edunexusai:${users.admin.id}`);
    const profile = await prisma.studentProfile.findFirst({ where: { userId } });
    assert.equal(profile.studentNumber, 'S2400010');
    assert.deepEqual([profile.cumulativeGpa, profile.academicStanding, profile.degree, profile.currentTerm, profile.creditsCompleted], [null, null, null, null, 0], 'no academic copy');
    assert.equal(await prisma.enrollment.count({ where: { studentProfileId: profile.id } }), 0);
    assert.equal(await prisma.transcriptTerm.count({ where: { studentProfileId: profile.id } }), 0);
    const stored = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    assert.match(stored.passwordHash, /^\$2[aby]\$/, 'stored only as a bcrypt hash');

    const overview = await api('/sis/me/overview', { token: await signInFirstTime(rec.email, PASSWORD) });
    assert.equal(overview.body.data.state, 'OK');
    assert.equal(overview.body.data.profile.data.institutionalId, 'S2400010', 'the new login sees its own record');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'SIS_ACCOUNT_PROVISIONED', entityId: userId } }));
  });

  it('refuses a record that is already linked, an email that already has an account, and inactive records', async () => {
    const admin = await login('admin');
    const again = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'STUDENT', sisRecordId: 'stu-priya', password: PASSWORD } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.details.sisCode, 'record_already_linked');

    // A CampusCore record whose email already belongs to a portal account is never auto-linked.
    sis.state.students.set('stu-clash', { id: 'stu-clash', studentNumber: 'S2400011', firstName: 'Clash', lastName: 'Case', email: users.maya.email, status: 'ACTIVE', classLevel: 'JUNIOR', academicStanding: 'GOOD_STANDING', program: null, version: 1 });
    const linksBefore = sis.state.links.length;
    const clash = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'STUDENT', sisRecordId: 'stu-clash', password: PASSWORD } });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.details.reason, 'EMAIL_IN_USE');
    assert.equal(sis.state.links.length, linksBefore, 'nothing linked');

    sis.state.students.set('stu-gone', { id: 'stu-gone', studentNumber: 'S2400012', firstName: 'Gone', lastName: 'Away', email: 'gone.away@students.feddrick.edu', status: 'WITHDRAWN', classLevel: 'SENIOR', academicStanding: 'GOOD_STANDING', program: null, version: 1 });
    const gone = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'STUDENT', sisRecordId: 'stu-gone', password: PASSWORD } });
    assert.equal(gone.status, 400);
    assert.equal(await prisma.user.count({ where: { email: 'gone.away@students.feddrick.edu' } }), 0);

    for (const persona of ['student', 'faculty']) {
      const denied = await api('/sis/admin/accounts', { method: 'POST', token: await login(persona), body: { recordType: 'STUDENT', sisRecordId: 'stu-gone', password: PASSWORD } });
      assert.equal(denied.status, 403, `${persona} cannot provision`);
    }
    sis.state.policies['identity.link'] = false;
    sis.state.students.set('stu-new', { id: 'stu-new', studentNumber: 'S2400013', firstName: 'New', lastName: 'Person', email: 'new.person@students.feddrick.edu', status: 'ADMITTED', classLevel: 'FRESHMAN', academicStanding: 'GOOD_STANDING', program: null, version: 1 });
    const policyOff = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'STUDENT', sisRecordId: 'stu-new', password: PASSWORD } });
    assert.equal(policyOff.status, 403, 'CampusCore policy also governs provisioning');
    assert.equal(await prisma.user.count({ where: { email: 'new.person@students.feddrick.edu' } }), 0);
    sis.state.policies['identity.link'] = true;
  });

  it('rolls the account back when CampusCore cannot link it, and a retried link is not duplicated', async () => {
    const admin = await login('admin');
    sis.state.failLinks = 10;
    resetSisClient();
    const failed = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'STUDENT', sisRecordId: 'stu-new', password: PASSWORD } });
    assert.equal(failed.status, 503);
    assert.equal(await prisma.user.count({ where: { email: 'new.person@students.feddrick.edu' } }), 0, 'no half-provisioned account');
    assert.equal(sis.state.links.filter((l) => l.sisId === 'stu-new' && l.status === 'ACTIVE').length, 0);
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'SIS_ACCOUNT_PROVISION_REJECTED', entityId: 'stu-new' } }));

    sis.state.failLinks = 1; // one transient failure, then the idempotent retry succeeds
    resetSisClient();
    const ok = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'STUDENT', sisRecordId: 'stu-new', password: PASSWORD } });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    created.push('new.person@students.feddrick.edu');
    assert.equal(sis.state.links.filter((l) => l.sisId === 'stu-new' && l.status === 'ACTIVE').length, 1, 'exactly one link');
    assert.equal(await prisma.user.count({ where: { email: 'new.person@students.feddrick.edu' } }), 1, 'exactly one account');
  });

  it('provisions faculty, who then see only the sections CampusCore assigns them', async () => {
    const admin = await login('admin');
    const dir = await api('/sis/admin/faculty?search=teacher', { token: admin });
    assert.equal(dir.status, 200);
    assert.equal(dir.body.data.items[0].institutionalId, 'F1002');
    assert.equal(dir.body.data.items[0].portalAccount, null);
    await prisma.user.deleteMany({ where: { email: 'other.teacher@feddrick.edu' } });
    const res = await api('/sis/admin/accounts', { method: 'POST', token: admin, body: { recordType: 'FACULTY', sisRecordId: 'fac-2', password: PASSWORD } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push('other.teacher@feddrick.edu');
    const fp = await prisma.facultyProfile.findFirst({ where: { userId: res.body.data.user.id } });
    assert.equal(fp.employeeNumber, 'F1002');
    assert.equal(await prisma.course.count({ where: { instructorUserId: res.body.data.user.id } }), 0, 'no demo teaching section');
    const token = await signInFirstTime('other.teacher@feddrick.edu', PASSWORD);
    const teaching = await api('/sis/faculty/teaching', { token });
    assert.deepEqual(teaching.body.data.sections.data.map((x) => x.source.id), ['sec-2']);
    assert.equal((await api('/sis/faculty/sections/sec-1/roster', { token })).status, 403);
  });
});

describe('Data ownership', () => {
  it('leaves local academic tables untouched and Moodle routes on Moodle', async () => {
    const counts = async () => ({ courses: await prisma.course.count(), enrollments: await prisma.enrollment.count(), assignments: await prisma.assignment.count(), grades: await prisma.gradeComponent.count() });
    const before = await counts();
    sis.link(users.amit.id, 'STUDENT', 'stu-maya');
    resetSisClient();
    await api('/sis/me/overview', { token: await login('student') });
    await api('/sis/admin/students', { token: await login('admin') });
    assert.deepEqual(await counts(), before);
    const moodle = await api('/lms/me/moodle/assignments', { token: await login('student') });
    assert.equal(moodle.status, 200);
    assert.ok(!JSON.stringify(moodle.body).includes('CS 301'), 'SIS sections never appear as Moodle assignments');
    const sync = await api('/admin/integrations', { token: await login('admin') });
    const row = sync.body.data.find((i) => i.provider === 'CAMPUSCORE');
    assert.deepEqual(row.supportedDomains, []);
    const refused = await api(`/admin/integrations/${row.id}/sync`, { method: 'POST', token: await login('admin') });
    assert.equal(refused.status, 409, 'CampusCore is never bulk-copied into local tables');
    assert.equal(refused.body.error.details.reason, 'LIVE_READ_PROVIDER');
  });
});
