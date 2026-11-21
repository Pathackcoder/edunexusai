import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';
import { announcementOwner, dashboardCourse } from '../src/modules/faculty/teachingService.js';
import { VIEW_AS_HEADER } from '../src/modules/viewAs/viewAsPolicy.js';

/**
 * Faculty teaching from the systems that own it (Phase 1 of one announcement owner per section): CampusCore says
 * which sections a faculty member teaches; the administrator's section → Moodle course mapping says which system
 * owns each section's announcements. Read only: nothing here writes an announcement anywhere.
 */

const CLIENT_ID = 'cc_stubclient0001';
const CLIENT_SECRET = 'ccs_stub_secret_value_do_not_leak_0001';
const ENV_KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let sis;
let prisma;
let tenant;
let users;

const course = (id, code, title) => ({ id, code, title, credits: 3 });
const meeting = (day, startTime, endTime, room) => ({ day, dayOfWeek: 1, startTime, endTime, room });

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
  sis.state.scopes.push('announcements:read');
  // Terms that do not depend on today's date: one long past, one far ahead.
  sis.state.terms.push(
    { id: 'term-old', code: '2020FA', name: 'Fall 2020', startDate: '2020-08-24', endDate: '2020-12-18', isCurrent: false, status: 'COMPLETED' },
    { id: 'term-far', code: '2099SP', name: 'Spring 2099', startDate: '2099-01-10', endDate: '2099-05-10', isCurrent: false, status: 'UPCOMING' },
  );
  sis.state.sections.push(
    // fac-1 (Elena Vasquez) teaches t-cc (no Moodle course) and t-md (mapped to Moodle course 10), and taught t-old.
    { id: 't-cc', termCode: '2099SP', course: course('c10', 'CS 101', 'Intro to Programming'), sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [meeting('WED', '09:00', '09:50', 'Turing 158'), meeting('MON', '09:00', '09:50', 'Turing 158')], instructors: [{ facultyId: 'fac-1', name: 'Elena Vasquez', isPrimary: true }], facultyId: 'fac-1' },
    { id: 't-md', termCode: '2099SP', course: course('c11', 'CS 310', 'Database Systems'), sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [], instructors: [{ facultyId: 'fac-1', name: 'Elena Vasquez', isPrimary: true }], facultyId: 'fac-1' },
    { id: 't-old', termCode: '2020FA', course: course('c12', 'CS 199', 'Old Seminar'), sectionNumber: '01', status: 'CLOSED', capacity: 30, meetings: [], instructors: [{ facultyId: 'fac-1', name: 'Elena Vasquez', isPrimary: true }], facultyId: 'fac-1' },
    // Someone else's section, mapped to a Moodle course the faculty member may even be a teacher in.
    { id: 't-other', termCode: '2099SP', course: course('c13', 'MATH 241', 'Linear Algebra'), sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [], instructors: [{ facultyId: 'fac-2', name: 'Other Teacher', isPrimary: true }], facultyId: 'fac-2' },
  );
  sis.state.registrations.push({ id: 'reg-t1', studentId: 'stu-maya', sectionId: 't-cc', status: 'REGISTERED', credits: 3, waitlistPosition: null });
  sis.state.announcements.push(
    { id: 'ann-mine', sectionId: 't-cc', title: 'Lab this week: Python control flow', body: 'Bring a laptop.', author: 'Elena Vasquez', publishedAt: '2026-11-09T12:00:00Z' },
    { id: 'ann-later', sectionId: 't-cc', title: 'Quiz next month', body: 'Scheduled.', author: 'Elena Vasquez', publishedAt: '2099-01-01T00:00:00Z' },
    { id: 'ann-moodle-section', sectionId: 't-md', title: 'Older CampusCore post', body: 'Before the Moodle course existed.', author: 'Elena Vasquez', publishedAt: '2026-10-01T00:00:00Z', pinned: true },
    { id: 'ann-other', sectionId: 't-other', title: 'Not for Elena', body: 'Other teacher.', author: 'Other Teacher', publishedAt: '2026-11-01T00:00:00Z' },
  );

  ({ prisma } = await import('../src/db/prisma.js'));
  tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
  const byEmail = async (email) => prisma.user.findFirst({ where: { email }, select: { id: true } });
  users = { faculty: await byEmail('faculty@edunexus.ai'), student: await byEmail('student@edunexus.ai') };
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE' } });
  await prisma.sisSectionMoodleCourse.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.sisSectionMoodleCourse.createMany({
    data: [
      { tenantId: tenant.id, sisSectionId: 't-md', sisTermId: 'term-far', moodleCourseId: 10 },
      { tenantId: tenant.id, sisSectionId: 't-other', sisTermId: 'term-far', moodleCourseId: 11 },
    ],
  });
  sis.link(users.faculty.id, 'FACULTY', 'fac-1');
  sis.link(users.student.id, 'STUDENT', 'stu-maya');
  resetSisClient();
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetSisClient();
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE' } });
  await prisma.sisSectionMoodleCourse.deleteMany({ where: { tenantId: tenant.id } });
  await sis.close();
  await closeTestServer();
});

describe('announcement owner per section', () => {
  it('is Moodle exactly when an administrator mapped the section to a Moodle course, CampusCore otherwise', () => {
    assert.equal(announcementOwner({ moodleCourseId: 10 }), 'MOODLE');
    assert.equal(announcementOwner(null), 'CAMPUSCORE');
    assert.equal(announcementOwner(undefined), 'CAMPUSCORE');
  });
});

describe('faculty teaching assignments come from CampusCore', () => {
  it('lists the sections CampusCore assigns, in terms that have not ended, each with its announcement owner', async () => {
    const token = await login('faculty');
    const res = await api('/faculty/sections', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.state, 'OK');
    const byId = new Map(res.body.data.sections.map((s) => [s.source.id, s]));
    assert.ok(byId.has('t-cc') && byId.has('t-md'));
    assert.ok(!byId.has('t-old'), 'a term that has ended is not shown');
    assert.ok(!byId.has('t-other') && !byId.has('sec-2'), 'never another instructor’s section, even one mapped to Moodle');
    assert.equal(byId.get('t-cc').announcementOwner, 'CAMPUSCORE');
    assert.equal(byId.get('t-cc').moodleCourse, null);
    assert.equal(byId.get('t-md').announcementOwner, 'MOODLE');
    assert.equal(byId.get('t-md').moodleCourse.moodleCourseId, 10, 'the mapping as recorded');
  });

  it('says why there is nothing to show: an unlinked account, a CampusCore outage', async () => {
    const before = sis.state.links.find((l) => l.externalUserId === users.faculty.id);
    before.status = 'REVOKED';
    resetSisClient();
    const unlinked = await api('/faculty/sections', { token: await login('faculty') });
    assert.equal(unlinked.body.data.state, 'UNMAPPED');
    assert.deepEqual(unlinked.body.data.sections, []);
    const announcements = await api('/faculty/announcements', { token: await login('faculty') });
    assert.equal(announcements.body.data.state, 'UNMAPPED', 'not an empty "no announcements" list');
    before.status = 'ACTIVE';
    resetSisClient();

    sis.state.down = true;
    try {
      const down = await api('/faculty/sections', { token: await login('faculty') });
      assert.equal(down.status, 200);
      assert.equal(down.body.data.state, 'UNAVAILABLE');
    } finally {
      sis.state.down = false;
      resetSisClient();
    }
  });

  it('is for faculty only', async () => {
    const student = await login('student');
    assert.equal((await api('/faculty/sections', { token: student })).status, 403);
    assert.equal((await api('/faculty/announcements', { token: student })).status, 403);
  });
});

describe('faculty announcements are read from the owning system', () => {
  it('lists CampusCore class announcements on the faculty member’s own sections only, and says Moodle is not connected', async () => {
    const localBefore = await prisma.announcement.count();
    const res = await api('/faculty/announcements', { token: await login('faculty') });
    assert.equal(res.status, 200);
    const { state, items, sources } = res.body.data;
    assert.equal(state, 'OK');
    const ids = items.map((a) => a.id);
    assert.ok(ids.includes('ann-mine'));
    assert.ok(!ids.includes('ann-other'), 'never another instructor’s section');
    const mine = items.find((a) => a.id === 'ann-mine');
    assert.equal(mine.source, 'campuscore');
    assert.equal(mine.section.label, 'CS 101-01');
    assert.equal(mine.status, 'PUBLISHED');
    assert.equal(items.find((a) => a.id === 'ann-later').status, 'SCHEDULED');
    // An older CampusCore post on a section now delivered in Moodle stays visible, marked as such.
    assert.equal(items.find((a) => a.id === 'ann-moodle-section').sectionOwner, 'MOODLE');
    assert.equal(sources.campuscore.state, 'OK');
    assert.equal(sources.moodle.state, 'NOT_CONNECTED');
    assert.deepEqual(sources.moodle.sections.map((s) => s.sisSectionId), ['t-md']);
    assert.match(sources.moodle.message, /Moodle/);
    assert.equal(await prisma.announcement.count(), localBefore, 'reading writes nothing locally');
  });

  it('reports a CampusCore announcements failure as unavailable, not as an empty list', async () => {
    sis.state.scopes = sis.state.scopes.filter((s) => s !== 'announcements:read');
    try {
      const res = await api('/faculty/announcements', { token: await login('faculty') });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.state, 'OK', 'the teaching assignments still load');
      assert.equal(res.body.data.sources.campuscore.state, 'UNAVAILABLE');
      assert.deepEqual(res.body.data.items, []);
    } finally {
      sis.state.scopes.push('announcements:read');
    }
  });

  it('offers no local announcement write path while CampusCore is connected (students would never see it)', async () => {
    const token = await login('faculty');
    const local = await api('/faculty/courses', { token });
    const target = local.body.data.find((c) => c.code === 'CS 501');
    const before = await prisma.announcement.count();
    const res = await api(`/faculty/courses/${target.id}/announcements`, { method: 'POST', token, body: { title: 'Should not be stored', content: 'Nobody would read this.', tags: [] } });
    assert.ok([403, 404].includes(res.status), `status ${res.status}`);
    assert.equal(await prisma.announcement.count(), before);
  });
});

describe('faculty dashboard uses the SIS relationships', () => {
  it('shows CampusCore sections, registration counts and class announcements; local records only feed follow-ups', async () => {
    const res = await api('/faculty/dashboard', { token: await login('faculty') });
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.equal(d.sources.courses.system, 'CAMPUSCORE');
    assert.equal(d.sources.courses.state, 'OK');
    const codes = d.courses.map((c) => c.code);
    assert.ok(codes.includes('CS 101-01') && codes.includes('CS 310-01'));
    assert.ok(!codes.includes('CS 501'), 'no local demo course among the teaching assignments');
    assert.ok(!codes.includes('MATH 241-01') && !codes.includes('CS 199-01'));
    const cs101 = d.courses.find((c) => c.code === 'CS 101-01');
    assert.equal(cs101.href, '/faculty/courses', 'the roster opens from My Courses, not a local course page');
    assert.deepEqual(cs101.days, ['MON', 'WED']);
    assert.equal(cs101.enrolledCount, 1, 'CampusCore’s registration count');
    assert.equal(d.totals.courses, d.courses.length);
    assert.equal(d.totals.students, d.courses.reduce((sum, c) => sum + c.enrolledCount, 0));
    assert.ok(d.announcements.some((a) => a.id === 'ann-mine' && a.courseCode === 'CS 101-01'));
    assert.ok(!d.announcements.some((a) => a.id === 'ann-other'));
    assert.equal(d.sources.announcements.moodle, 'NOT_CONNECTED');
    assert.deepEqual(d.upcomingAssignments, []);
    assert.equal(d.sources.coursework.system, 'MOODLE');
    assert.ok(d.localCourses.some((c) => c.code === 'CS 501'), 'follow-ups still refer to local courses');
  });

  it('shapes a CampusCore section for the widgets', () => {
    const c = dashboardCourse({ source: { id: 's1' }, termCode: '2026FA', courseCode: 'CS 101', courseTitle: 'Intro', sectionCode: '01', credits: 4, meetings: [{ day: 'FRI', start: '10:00', end: '10:50', location: 'Lab 2' }, { day: 'MON', start: '10:00', end: '10:50', location: 'Lab 2' }], seats: { capacity: 30, enrolled: null }, announcementOwner: 'CAMPUSCORE', moodleCourse: null });
    assert.deepEqual([c.code, c.days, c.time, c.room, c.enrolledCount, c.href], ['CS 101-01', ['MON', 'FRI'], '10:00–10:50', 'Lab 2', 0, '/faculty/courses']);
  });
});

describe('the student announcement experience is unchanged', () => {
  it('a registered student still sees the instructor’s CampusCore class announcement on both surfaces', async () => {
    const token = await login('student');
    const list = await api('/announcements', { token });
    assert.equal(list.status, 200);
    const ids = list.body.data.map((a) => a.id);
    assert.ok(ids.includes('ann-mine'));
    assert.ok(!ids.includes('ann-later'), 'a scheduled announcement is not shown to students early');
    assert.ok(!ids.includes('ann-other'), 'not a section the student is registered in');
    assert.equal(list.body.data.find((a) => a.id === 'ann-mine').source, 'campuscore');
  });
});

/* ------------------------------------------------------------------ Phase 2: publishing to CampusCore */

describe('publishing a class announcement to a CampusCore-owned section', () => {
  const publish = (sectionId, body, token) => api(`/faculty/sections/${sectionId}/announcements`, { method: 'POST', token, body });
  const draft = (extra = {}) => ({ title: 'Room change for Thursday', body: 'We meet in Turing 210 this week.', idempotencyKey: randomUUID(), ...extra });
  const enable = () => {
    if (!sis.state.scopes.includes('announcements:write')) sis.state.scopes.push('announcements:write');
    sis.state.policies['announcement.write'] = true;
    resetSisClient(); // a new token carries the new scope
  };
  const disable = () => {
    sis.state.scopes = sis.state.scopes.filter((s) => s !== 'announcements:write');
    sis.state.policies['announcement.write'] = false;
    resetSisClient();
  };

  it('My Courses says per section whether it can take an announcement, and why not', async () => {
    disable();
    const off = await api('/faculty/sections', { token: await login('faculty') });
    assert.equal(off.body.data.publishing.campuscore.enabled, false);
    assert.match(off.body.data.publishing.campuscore.reason, /announcements:write/);
    enable();
    const on = (await api('/faculty/sections', { token: await login('faculty') })).body.data;
    const byId = new Map(on.sections.map((s) => [s.source.id, s]));
    assert.deepEqual(byId.get('t-cc').publish, { allowed: true, reason: null });
    assert.equal(byId.get('t-md').publish.allowed, false, 'Moodle-owned: never offered');
    assert.match(byId.get('t-md').publish.reason, /Moodle/);
    assert.equal(on.publishing.moodle.enabled, false);
  });

  it('publishes as the signed-in faculty member, audited, stored only in CampusCore, and the registered student sees it', async () => {
    enable();
    const token = await login('faculty');
    const localBefore = await prisma.announcement.count();
    const writesBefore = sis.state.announcementWrites.length;
    const body = draft({ pinned: true });
    const res = await publish('t-cc', body, token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.source, 'campuscore');
    assert.equal(res.body.data.author, 'Elena Vasquez');
    assert.equal(res.body.data.section.label, 'CS 101-01');
    assert.equal(res.body.data.pinned, true);
    const write = sis.state.announcementWrites.at(-1);
    assert.equal(sis.state.announcementWrites.length, writesBefore + 1);
    assert.equal(write.actingFacultyId, 'fac-1', 'the acting instructor comes from the verified link');
    assert.equal(write.actingUser, `edunexusai:${users.faculty.id}`);
    assert.equal(write.idempotencyKey, `ann:${users.faculty.id}:${body.idempotencyKey}`, 'keys are scoped to the user');
    assert.equal(await prisma.announcement.count(), localBefore, 'no local copy');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'SIS_ANNOUNCEMENT_PUBLISH', actorUserId: users.faculty.id, entityId: 't-cc' } }));

    const student = await api('/announcements', { token: await login('student') });
    assert.ok(student.body.data.some((a) => a.id === res.body.data.id && a.title === 'Room change for Thursday'));
    const mine = await api('/faculty/announcements', { token });
    assert.ok(mine.body.data.items.some((a) => a.id === res.body.data.id));
  });

  it('a retried publish (same key) replays instead of posting twice', async () => {
    enable();
    const token = await login('faculty');
    const body = draft({ title: 'Posted once only' });
    const first = await publish('t-cc', body, token);
    const again = await publish('t-cc', body, token);
    assert.equal(again.status, 201);
    assert.equal(again.body.data.id, first.body.data.id);
    assert.equal(sis.state.announcements.filter((a) => a.title === 'Posted once only').length, 1);
  });

  it('a Moodle-owned section goes to Moodle (not configured here, so refused): never posted to CampusCore instead', async () => {
    enable();
    const writes = sis.state.announcementWrites.length;
    const res = await publish('t-md', draft(), await login('faculty'));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INTEGRATION_NOT_CONFIGURED');
    assert.equal(res.body.error.details.reason, 'MOODLE_PUBLISHING_UNAVAILABLE');
    assert.equal(sis.state.announcementWrites.length, writes);
  });

  it('refuses another instructor’s section (even one mapped to Moodle), a past term and an unknown section', async () => {
    enable();
    const token = await login('faculty');
    const writes = sis.state.announcementWrites.length;
    for (const id of ['t-other', 'sec-2', 't-old', 'no-such-section']) {
      const res = await publish(id, draft(), token);
      assert.equal(res.status, 403, id);
    }
    assert.equal(sis.state.announcementWrites.length, writes);
  });

  it('validates the request strictly: no acting faculty, audience or author can be supplied, and a key is required', async () => {
    enable();
    const token = await login('faculty');
    for (const body of [draft({ actingFacultyId: 'fac-2' }), draft({ audience: 'ALL' }), draft({ author: 'Registrar' }), draft({ title: 'x' }), draft({ idempotencyKey: undefined }), draft({ idempotencyKey: 'not-a-uuid' })]) {
      const res = await publish('t-cc', body, token);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('is for faculty only: students and administrators are refused', async () => {
    enable();
    assert.equal((await publish('t-cc', draft(), await login('student'))).status, 403);
    assert.equal((await publish('t-cc', draft(), await login('admin'))).status, 403);
  });

  it('reports CampusCore’s refusal (policy off, scope missing) and audits the rejection', async () => {
    enable();
    sis.state.policies['announcement.write'] = false;
    const token = await login('faculty');
    const policy = await publish('t-cc', draft(), token);
    assert.equal(policy.status, 422);
    assert.equal(policy.body.error.details.sisCode, 'policy_disabled');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'SIS_ANNOUNCEMENT_PUBLISH_REJECTED', actorUserId: users.faculty.id } }));
    disable();
    const scope = await publish('t-cc', draft(), token);
    assert.equal(scope.status, 403);
    enable();
  });

  it('an unlinked account cannot publish; a CampusCore outage is a 503, not a silent failure', async () => {
    enable();
    const link = sis.state.links.find((l) => l.externalUserId === users.faculty.id && l.recordType === 'FACULTY');
    link.status = 'REVOKED';
    resetSisClient();
    try {
      assert.equal((await publish('t-cc', draft(), await login('faculty'))).status, 403);
    } finally {
      link.status = 'ACTIVE';
      resetSisClient();
    }
    sis.state.down = true;
    try {
      assert.equal((await publish('t-cc', draft(), await login('faculty'))).status, 503);
    } finally {
      sis.state.down = false;
      resetSisClient();
    }
  });

  it('a View-As session cannot publish on the faculty member’s behalf', async () => {
    enable();
    const admin = await login('admin');
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@edunexus.ai' } });
    const grant = { userId_permission: { userId: adminUser.id, permission: 'users.view_as' } };
    const hadGrant = Boolean(await prisma.userPermission.findUnique({ where: grant }));
    if (!hadGrant) await prisma.userPermission.create({ data: { tenantId: tenant.id, userId: adminUser.id, permission: 'users.view_as' } });
    const started = await api('/admin/view-as/sessions', { method: 'POST', token: admin, body: { userId: users.faculty.id, reason: 'Checking the faculty view' } });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const writes = sis.state.announcementWrites.length;
    try {
      const res = await api('/faculty/sections/t-cc/announcements', { method: 'POST', token: admin, body: draft(), headers: { [VIEW_AS_HEADER]: started.body.data.token } });
      assert.equal(res.status, 403);
      assert.equal(sis.state.announcementWrites.length, writes);
    } finally {
      await prisma.viewAsSession.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date(), endReason: 'TEST_RESET' } });
      if (!hadGrant) await prisma.userPermission.delete({ where: grant });
    }
  });
});
