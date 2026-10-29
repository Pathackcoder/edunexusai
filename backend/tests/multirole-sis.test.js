import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';

/**
 * One account linked to a CampusCore student record AND a faculty record of the same person
 * (in-process CampusCore stub with the per-record-type identity contract). Each role's requests use
 * that role's record; a record of a different person is refused; nothing is matched on email alone.
 */

const CLIENT_ID = 'cc_stubclient0002';
const CLIENT_SECRET = 'ccs_stub_secret_value_do_not_leak_0002';
const ENV_KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let stub;
let prisma;
let rahul;
let uma;
let adminToken;

before(async () => {
  stub = await startCampusCoreStub({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  Object.assign(process.env, {
    SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: stub.url, CAMPUSCORE_CLIENT_ID: CLIENT_ID, CAMPUSCORE_CLIENT_SECRET: CLIENT_SECRET,
    CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000',
  });
  resetSisClient();
  ({ prisma } = await import('../src/db/prisma.js'));

  rahul = await createMultiRoleUser({ key: 'sis.rahul', firstName: 'Rahul', lastName: 'Sharma', roles: [] });
  uma = await createMultiRoleUser({ key: 'sis.uma', firstName: 'Uma', lastName: 'Rao', roles: [] });
  // CampusCore: one person (p-rahul) with a faculty record and a student record; others are other people.
  const S = stub.state;
  S.faculty.set('fac-rahul', { id: 'fac-rahul', personId: 'p-rahul', employeeNumber: 'F9001', firstName: 'Rahul', lastName: 'Sharma', email: rahul.email, status: 'ACTIVE', title: 'Lecturer', department: { id: 'dep-cs', code: 'CS', name: 'Computer Science' } });
  S.students.set('stu-rahul', { ...S.students.get('stu-maya'), id: 'stu-rahul', personId: 'p-rahul', studentNumber: 'S9001', firstName: 'Rahul', lastName: 'Sharma', email: 'rahul.sharma@students.feddrick.edu', program: { id: 'prog-ds', code: 'MS-DS', name: 'Data Science', degreeType: 'MS' } });
  S.faculty.set('fac-uma', { id: 'fac-uma', personId: 'p-uma', employeeNumber: 'F9002', firstName: 'Uma', lastName: 'Rao', email: uma.email, status: 'ACTIVE', title: 'Lecturer', department: { id: 'dep-cs', code: 'CS', name: 'Computer Science' } });
  S.students.set('stu-stranger', { ...S.students.get('stu-maya'), id: 'stu-stranger', personId: 'p-stranger', studentNumber: 'S9003', email: 'stranger@students.feddrick.edu' });
  S.sections.push({ id: 'sec-rahul', termCode: '2026FA', course: { id: 'c9', code: 'CS 101', title: 'Programming', credits: 3 }, sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [], instructors: [{ facultyId: 'fac-rahul', name: 'Rahul Sharma', isPrimary: true }], facultyId: 'fac-rahul' });
  adminToken = await login('admin');
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetSisClient();
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE', internalId: { in: [rahul.user.id, uma.user.id] } } });
  await removeMultiRoleUsers();
  await stub.close();
  await closeTestServer();
});

const relate = (user, body) => api(`/admin/users/${user.user.id}/relationships`, { method: 'POST', token: adminToken, body });
const accessOf = async (user) => (await api(`/admin/users/${user.user.id}/access`, { token: adminToken })).body.data;

describe('one account, a student record and a faculty record', () => {
  it('links the faculty record: record, link and role in one step', async () => {
    const res = await relate(rahul, { recordType: 'FACULTY', sisRecordId: 'fac-rahul' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const faculty = res.body.data.access.roles.find((r) => r.key === 'FACULTY');
    assert.equal(faculty.status, 'ACTIVE');
    assert.equal(faculty.sisLink, 'LINKED');
    assert.equal(faculty.record.number, 'F9001');
    assert.deepEqual(faculty.sources.map((s) => s.source), ['SIS']);
  });

  it('links the same person’s student record to the SAME account (CampusCore confirms one person)', async () => {
    const res = await relate(rahul, { recordType: 'STUDENT', sisRecordId: 'stu-rahul' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.evidence.samePerson, 'CAMPUSCORE_USER');
    const roles = res.body.data.access.roles.map((r) => `${r.key}:${r.status}:${r.sisLink}`).sort();
    assert.deepEqual(roles, ['FACULTY:ACTIVE:LINKED', 'STUDENT:ACTIVE:LINKED']);
    assert.equal(await prisma.user.count({ where: { email: { contains: 'rahul' } } }), 1, 'still one account');
    const mirror = await prisma.externalIdentity.findMany({ where: { provider: 'CAMPUSCORE', internalId: rahul.user.id } });
    assert.deepEqual(mirror.map((m) => [m.entityType, m.externalId]).sort(), [['FACULTY', 'fac-rahul'], ['STUDENT', 'stu-rahul']]);
  });

  it('each role reads its own record: studying from the student record, teaching from the faculty record', async () => {
    const token = await loginFixture(rahul.email);
    const overview = await api('/sis/me/overview', { token });
    assert.equal(overview.status, 200);
    assert.equal(overview.body.data.identity.sisId, 'stu-rahul');
    const teaching = await api('/sis/faculty/teaching', { token });
    assert.equal(teaching.body.data.identity.sisId, 'fac-rahul');
    assert.deepEqual(teaching.body.data.sections.data.map((s) => s.source?.id ?? s.id), ['sec-rahul']);
    const roster = await api('/sis/faculty/sections/sec-1/roster', { token });
    assert.equal(roster.status, 403, 'his faculty role does not open another instructor’s roster');
    const profile = (await api('/sis/me/profile', { token })).body.data;
    assert.equal(profile.recordType, 'MULTIPLE');
    assert.equal(profile.student.studentNumber ?? profile.student.institutionalId, 'S9001');
    assert.equal(profile.faculty.employeeNumber ?? profile.faculty.institutionalId, 'F9001');
    // The Studying dashboard's academic panels read his student record, not "not a student".
    const panels = (await api('/dashboard/student', { token })).body.data.panels;
    for (const key of ['dashboard.progress', 'dashboard.degree_progress']) {
      if (!panels[key]) continue;
      assert.notEqual(panels[key].data?.state, 'NOT_A_STUDENT', key);
    }
    assert.equal(panels['dashboard.progress'].data.institutionalId, 'S9001');
  });

  it('refuses a student record of a different person, and leaves nothing half-created', async () => {
    assert.equal((await relate(uma, { recordType: 'FACULTY', sisRecordId: 'fac-uma' })).status, 201);
    const res = await relate(uma, { recordType: 'STUDENT', sisRecordId: 'stu-stranger', evidenceMismatchReason: 'admin is sure' });
    assert.equal(res.status, 422);
    const access = await accessOf(uma);
    assert.deepEqual(access.roles.map((r) => r.key), ['FACULTY'], 'no student role was granted');
    assert.equal(await prisma.studentProfile.count({ where: { userId: uma.user.id } }), 0, 'the local record was rolled back');
  });

  it('a second record of the same type is refused, and a record already linked elsewhere is refused', async () => {
    assert.equal((await relate(rahul, { recordType: 'STUDENT', sisRecordId: 'stu-maya' })).status, 409);
    assert.equal((await relate(uma, { recordType: 'STUDENT', sisRecordId: 'stu-rahul' })).status, 409);
  });

  it('Student/Faculty cannot be toggled on without the record link', async () => {
    const res = await api(`/admin/users/${uma.user.id}/roles`, { method: 'POST', token: adminToken, body: { role: 'STUDENT' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.details.reason, 'RECORD_REQUIRED');
    const patch = await api(`/admin/users/${uma.user.id}`, { method: 'PATCH', token: adminToken, body: { roles: ['FACULTY', 'STUDENT'] } });
    assert.equal(patch.status, 409, 'the legacy role-list update follows the same rule');
  });

  it('revoking one link removes only that relationship from the mirror', async () => {
    const link = stub.state.links.find((l) => l.externalUserId === rahul.user.id && l.recordType === 'STUDENT' && l.status === 'ACTIVE');
    const res = await api(`/sis/admin/identity/links/${link.id}/revoke`, { method: 'POST', token: adminToken, body: { reason: 'Test revocation of one link', userId: rahul.user.id } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const mirror = await prisma.externalIdentity.findMany({ where: { provider: 'CAMPUSCORE', internalId: rahul.user.id } });
    assert.deepEqual(mirror.map((m) => m.entityType), ['FACULTY']);
  });
});
