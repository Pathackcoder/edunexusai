import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login, signInFirstTime } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { startMoodleStub } from './helpers/moodleStub.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';
import { clearMoodleCapabilityCache } from '../src/integrations/connectors/MoodleConnector.js';

/**
 * CampusCore registrations → Moodle enrolments (courseAlignmentService). CampusCore and Moodle
 * are in-process stubs; nothing real is contacted. Stub data: sec-1 = CS 301-01 (taught by
 * fac-1, stu-maya registered), sec-2 = MATH 201-01 (stu-jordan registered).
 */

const CC = { id: 'cc_align_stub', secret: 'ccs_align_stub_secret_0001' };
const TOKEN = 'align-stub-token-0123456789abcdef';
const TEMP = 'Temporary#Pass2026';
const KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS', 'MOODLE_BASE_URL', 'MOODLE_TOKEN', 'MOODLE_WRITES_ENABLED', 'MOODLE_STUDENT_ROLE_ID', 'MOODLE_TEACHER_ROLE_ID', 'MOODLE_MAX_RETRIES', 'MOODLE_TIMEOUT_MS'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const ADMIN = '/lms/admin/moodle';
const CREATED_EMAILS = ['nina.reg@students.feddrick.edu'];
let sis;
let site;
let prisma;
let admin;
let users;

async function linkMoodle(entityType, profileId, moodleUser) {
  site.state.users.set(moodleUser.id, { auth: 'manual', suspended: 0, ...moodleUser });
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
  await prisma.externalIdentity.create({ data: { tenantId: tenant.id, provider: 'MOODLE', entityType, internalId: profileId, exclusiveInternalId: profileId, externalId: String(moodleUser.id), linkMethod: 'TEST' } });
}

before(async () => {
  sis = await startCampusCoreStub({ clientId: CC.id, clientSecret: CC.secret });
  site = await startMoodleStub({ token: TOKEN });
  for (const [id, shortname, idnumber] of [[601, 'CS301-FA26', 'CS 301-01'], [602, 'ORIENTATION', 'ORIENT'], [603, 'CS301-LAB', 'LAB']]) site.state.courses.set(id, { id, shortname, fullname: `Moodle ${shortname}`, idnumber, categoryid: 1, visible: 1 });
  Object.assign(process.env, {
    SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: sis.url, CAMPUSCORE_CLIENT_ID: CC.id, CAMPUSCORE_CLIENT_SECRET: CC.secret, CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000',
    MOODLE_BASE_URL: site.url, MOODLE_TOKEN: TOKEN, MOODLE_WRITES_ENABLED: 'true', MOODLE_STUDENT_ROLE_ID: '5', MOODLE_TEACHER_ROLE_ID: '3', MOODLE_MAX_RETRIES: '1', MOODLE_TIMEOUT_MS: '1500',
  });
  resetSisClient();
  clearMoodleCapabilityCache();
  ({ prisma } = await import('../src/db/prisma.js'));
  await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: site.url, enabled: true, mode: 'LIVE' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: { in: ['MOODLE', 'CAMPUSCORE'] } } });
  await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
  await prisma.sisSectionMoodleCourse.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { in: CREATED_EMAILS } } });
  const by = (email) => prisma.user.findFirst({ where: { email }, include: { studentProfile: true, facultyProfile: true } });
  users = { amit: await by('student@edunexus.ai'), maya: await by('student.advanced@edunexus.ai'), faculty: await by('faculty@edunexus.ai') };
  // amit ↔ stu-maya (registered in sec-1), maya ↔ stu-jordan (registered in sec-2), faculty ↔ fac-1 (teaches sec-1)
  sis.link(users.amit.id, 'STUDENT', 'stu-maya');
  sis.link(users.maya.id, 'STUDENT', 'stu-jordan');
  sis.link(users.faculty.id, 'FACULTY', 'fac-1');
  await linkMoodle('STUDENT', users.amit.studentProfile.id, { id: 701, username: 's2400001', email: 'student@edunexus.ai', idnumber: 'S2400001', firstname: 'A', lastname: 'P' });
  await linkMoodle('STUDENT', users.maya.studentProfile.id, { id: 702, username: 's2400002', email: 'student.advanced@edunexus.ai', idnumber: 'S2400002', firstname: 'M', lastname: 'C' });
  await linkMoodle('FACULTY', users.faculty.facultyProfile.id, { id: 703, username: 'f1001', email: 'faculty@edunexus.ai', idnumber: 'F1001', firstname: 'E', lastname: 'V' });
  admin = await login('admin');
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetSisClient();
  await prisma.sisSectionMoodleCourse.deleteMany({});
  await prisma.externalIdentity.deleteMany({ where: { provider: { in: ['MOODLE', 'CAMPUSCORE'] } } });
  await prisma.user.deleteMany({ where: { email: { in: CREATED_EMAILS } } });
  await sis.close();
  await site.close();
  await closeTestServer();
});

const plan = async (userId) => (await api(`${ADMIN}/people/${userId}/sis-plan`, { token: admin })).body.data.plan;

describe('Mapping CampusCore sections to Moodle courses', () => {
  it('lists a term’s sections with a suggestion, and maps only when an administrator confirms', async () => {
    const res = await api(`${ADMIN}/sis-sections`, { token: admin });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const cs = res.body.data.items.find((i) => i.sisSectionId === 'sec-1');
    assert.equal(cs.mappingState, 'NO_MOODLE_COURSE');
    assert.equal(cs.suggestion.moodleCourseId, 601, 'suggested from the Moodle ID number "CS 301-01"');
    assert.equal(await prisma.sisSectionMoodleCourse.count(), 0, 'a suggestion is never applied by itself');

    const linked = await api(`${ADMIN}/sis-sections/sec-1`, { method: 'PUT', token: admin, body: { moodleCourseId: 601 } });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    const again = await api(`${ADMIN}/sis-sections`, { token: admin });
    assert.equal(again.body.data.items.find((i) => i.sisSectionId === 'sec-1').mappingState, 'MAPPED');
    assert.equal(again.body.data.items.find((i) => i.sisSectionId === 'sec-2').mappingState, 'NO_MOODLE_COURSE');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'SIS_SECTION_MOODLE_LINKED', entityId: 'sec-1' } }));

    assert.equal((await api(`${ADMIN}/sis-sections/sec-1`, { method: 'PUT', token: admin, body: { moodleCourseId: 9999 } })).status, 404, 'unknown Moodle course');
    assert.equal((await api(`${ADMIN}/sis-sections/sec-404`, { method: 'PUT', token: admin, body: { moodleCourseId: 601 } })).status, 404, 'unknown CampusCore section');
    assert.equal((await api(`${ADMIN}/sis-sections`, { token: await login('student') })).status, 403);
  });
});

describe('Moodle enrolments derived from CampusCore registrations', () => {
  it('a student registered in a mapped section is enrolled once, with the student role', async () => {
    const before = await plan(users.amit.id);
    assert.equal(before.state, 'OK');
    assert.deepEqual(before.classes.map((c) => [c.courseCode, c.status]), [['CS 301', 'TO_ENROL']]);
    const applied = await api(`${ADMIN}/people/${users.amit.id}/sis-plan/apply`, { method: 'POST', token: admin });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.data.results[0].status, 'DONE');
    assert.ok(site.state.enrolments.some((e) => e.userid === 701 && e.courseid === 601 && e.roleid === 5));
    assert.equal(applied.body.data.plan.classes[0].status, 'ENROLLED');
    const twice = await api(`${ADMIN}/people/${users.amit.id}/sis-plan/apply`, { method: 'POST', token: admin });
    assert.equal(twice.body.data.results.length, 0, 'nothing left to do');
    assert.equal(site.state.enrolments.filter((e) => e.userid === 701 && e.courseid === 601).length, 1, 'no duplicate enrolment');
  });

  it('a section with no Moodle course is reported as such and enrols nothing', async () => {
    const p = await plan(users.maya.id);
    assert.deepEqual(p.classes.map((c) => [c.courseCode, c.status]), [['MATH 201', 'NO_MOODLE_COURSE']]);
    const enrolBefore = site.state.enrolments.length;
    await api(`${ADMIN}/people/${users.maya.id}/sis-plan/apply`, { method: 'POST', token: admin });
    assert.equal(site.state.enrolments.length, enrolBefore);
  });

  it('a waitlisted student is not enrolled until registered', async () => {
    sis.state.registrations.push({ id: 'reg-wait', studentId: 'stu-jordan', sectionId: 'sec-1', status: 'WAITLISTED', credits: 3, waitlistPosition: 1 });
    const p = await plan(users.maya.id);
    assert.equal(p.classes.find((c) => c.courseCode === 'CS 301').status, 'WAITLISTED');
    await api(`${ADMIN}/people/${users.maya.id}/sis-plan/apply`, { method: 'POST', token: admin });
    assert.ok(!site.state.enrolments.some((e) => e.userid === 702 && e.courseid === 601));
    sis.state.registrations = sis.state.registrations.filter((r) => r.id !== 'reg-wait');
  });

  it('flags a Moodle enrolment with no matching registration for review, and removes nothing', async () => {
    site.state.enrolments.push({ userid: 702, courseid: 601, roleid: 5, suspended: false });
    const p = await plan(users.maya.id);
    assert.equal(p.review.length, 1);
    assert.equal(p.review[0].moodleCourse.moodleCourseId, 601);
    await api(`${ADMIN}/people/${users.maya.id}/sis-plan/apply`, { method: 'POST', token: admin });
    assert.ok(site.state.enrolments.some((e) => e.userid === 702 && e.courseid === 601), 'still enrolled: unenrolment is a human decision');
    site.state.enrolments = site.state.enrolments.filter((e) => !(e.userid === 702 && e.courseid === 601));
  });

  it('a faculty member teaching a mapped section becomes its editing teacher', async () => {
    const p = await plan(users.faculty.id);
    assert.deepEqual(p.classes.map((c) => [c.courseCode, c.status]), [['CS 301', 'TO_ENROL']]);
    await api(`${ADMIN}/people/${users.faculty.id}/sis-plan/apply`, { method: 'POST', token: admin });
    assert.ok(site.state.enrolments.some((e) => e.userid === 703 && e.courseid === 601 && e.roleid === 3));
    assert.equal((await plan(users.faculty.id)).classes[0].status, 'TEACHING');
  });

  it('compares a section’s CampusCore roster with its Moodle course', async () => {
    const res = await api(`${ADMIN}/sis-sections/sec-1/plan`, { token: admin });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.students.map((s) => [s.institutionalId, s.status]), [['S2400001', 'ENROLLED']]);
  });

  it('lets students see only their own classes and Moodle status', async () => {
    const mine = await api('/lms/me/sis-classes?userId=' + users.maya.id, { token: await login('student') });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.data.classes.map((c) => [c.courseCode, c.status, c.moodleCourse?.moodleCourseId]), [['CS 301', 'ENROLLED', 601]]);
    assert.ok(!JSON.stringify(mine.body).includes('MATH 201'), 'never another student’s classes');
    const fac = await api('/lms/faculty/moodle/sis-classes', { token: await login('faculty') });
    assert.equal(fac.body.data.classes[0].status, 'TEACHING');
    assert.equal((await api(`${ADMIN}/people/${users.amit.id}/sis-plan`, { token: await login('student') })).status, 403);
  });

  it('unmapping a section changes the plan but leaves Moodle enrolments alone', async () => {
    assert.equal((await api(`${ADMIN}/sis-sections/sec-1`, { method: 'DELETE', token: admin })).status, 200);
    assert.equal((await plan(users.amit.id)).classes[0].status, 'NO_MOODLE_COURSE');
    assert.ok(site.state.enrolments.some((e) => e.userid === 701 && e.courseid === 601), 'enrolment kept');
    await api(`${ADMIN}/sis-sections/sec-1`, { method: 'PUT', token: admin, body: { moodleCourseId: 601 } });
  });
});

describe('Onboarding follows CampusCore registrations', () => {
  it('enrols in mapped registered sections, reports unmapped ones, and handles a program with no registrations', async () => {
    sis.state.students.set('stu-nina', { id: 'stu-nina', studentNumber: 'S2400020', firstName: 'Nina', lastName: 'Reg', preferredName: null, email: 'nina.reg@students.feddrick.edu', phone: null, status: 'ACTIVE', classLevel: 'FRESHMAN', academicStanding: 'GOOD_STANDING', program: { id: 'prog-cs', code: 'BS-CS', name: 'Computer Science', degreeType: 'BS' }, hasRegistrationHold: false, version: 1 });
    // A program, but no registrations yet.
    const first = await api('/admin/people', { method: 'POST', token: admin, body: { role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-nina' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, fromSis: true, courseIds: [602], credentials: 'NONE' } } });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const fromSis = first.body.data.steps.moodleEnrolments.filter((e) => e.source === 'CAMPUSCORE');
    assert.equal(fromSis.length, 1);
    assert.equal(fromSis[0].status, 'SKIPPED');
    assert.match(fromSis[0].message, /No current or upcoming CampusCore registrations/);
    const extra = first.body.data.steps.moodleEnrolments.find((e) => e.source === 'ADDITIONAL');
    assert.equal(extra.moodleCourseId, 602, 'an additional (non-SIS) course is still possible');
    assert.equal(first.body.data.outcome, 'COMPLETED');

    // The registrar registers her in CS 301-01 (mapped) and MATH 201-01 (no Moodle course).
    sis.state.registrations.push({ id: 'reg-n1', studentId: 'stu-nina', sectionId: 'sec-1', status: 'REGISTERED', credits: 3, waitlistPosition: null }, { id: 'reg-n2', studentId: 'stu-nina', sectionId: 'sec-2', status: 'REGISTERED', credits: 4, waitlistPosition: null });
    const again = await api('/admin/people', { method: 'POST', token: admin, body: { role: 'STUDENT', sis: { mode: 'EXISTING', sisRecordId: 'stu-nina' }, login: { mode: 'NEW', password: TEMP }, moodle: { enabled: true, fromSis: true, courseIds: [], credentials: 'NONE' } } });
    const steps = again.body.data.steps.moodleEnrolments;
    assert.equal(steps.find((e) => e.moodleCourseId === 601).status, 'DONE');
    assert.match(steps.find((e) => e.sisSectionId === 'sec-2').message, /no Moodle course/);
    const nina = [...site.state.users.values()].find((u) => u.idnumber === 'S2400020');
    assert.ok(site.state.enrolments.some((e) => e.userid === nina.id && e.courseid === 601 && e.roleid === 5));

    const token = await signInFirstTime('nina.reg@students.feddrick.edu', TEMP);
    const mine = await api('/lms/me/sis-classes', { token });
    assert.deepEqual(mine.body.data.classes.map((c) => [c.courseCode, c.status]).sort(), [['CS 301', 'ENROLLED'], ['MATH 201', 'NO_MOODLE_COURSE']]);
  });
});

describe('one person who studies and teaches, with one Moodle account', () => {
  let dual;
  before(async () => {
    const { createMultiRoleUser } = await import('./helpers/multiRole.js');
    dual = await createMultiRoleUser({ key: 'align.dual', firstName: 'Dana', roles: ['STUDENT', 'FACULTY'], student: { studentNumber: 'S2499001', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'F2499001' } });
    // Studies MATH 201-01 (sec-2, no Moodle course); teaches CS 301-01 (sec-1 → Moodle 601).
    sis.link(dual.user.id, 'STUDENT', 'stu-jordan');
    sis.link(dual.user.id, 'FACULTY', 'fac-1');
    await linkMoodle('FACULTY', dual.facultyProfile.id, { id: 704, username: 'f2499001', email: dual.email, idnumber: 'F2499001', firstname: 'D', lastname: 'F' });
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
    await prisma.externalIdentity.create({ data: { tenantId: tenant.id, provider: 'MOODLE', entityType: 'STUDENT', internalId: dual.studentProfile.id, exclusiveInternalId: dual.studentProfile.id, externalId: '704', linkMethod: 'SAME_PERSON' } });
    site.state.enrolments.push({ userid: 704, courseid: 601, roleid: 3, suspended: false });
  });
  after(async () => {
    site.state.enrolments = site.state.enrolments.filter((e) => e.userid !== 704);
    const { removeMultiRoleUsers } = await import('./helpers/multiRole.js');
    await removeMultiRoleUsers();
  });

  it('the person plan has both relationships, each from its own CampusCore record', async () => {
    const res = await api(`${ADMIN}/people/${dual.user.id}/sis-plan`, { token: admin });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.kind, 'STUDENT_AND_FACULTY');
    assert.deepEqual(res.body.data.student.plan.classes.map((c) => [c.courseCode, c.status]), [['MATH 201', 'NO_MOODLE_COURSE']]);
    assert.deepEqual(res.body.data.faculty.plan.classes.map((c) => c.courseCode), ['CS 301']);
  });

  it('the course taught on the shared account is never flagged as a stray student enrolment', async () => {
    const res = await api(`${ADMIN}/people/${dual.user.id}/sis-plan`, { token: admin });
    assert.deepEqual(res.body.data.student.plan.review, []);
    const applied = await api(`${ADMIN}/people/${dual.user.id}/sis-plan/apply`, { method: 'POST', token: admin });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.ok(!site.state.enrolments.some((e) => e.userid === 704 && e.courseid === 601 && e.roleid === 5), 'never enrolled as a student in the course they teach');
  });
});
