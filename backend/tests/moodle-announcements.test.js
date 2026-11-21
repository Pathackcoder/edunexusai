import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { FORUM_FUNCTIONS, startMoodleStub } from './helpers/moodleStub.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';
import { clearMoodleCapabilityCache } from '../src/integrations/connectors/MoodleConnector.js';
import { announcementHtml } from '../src/modules/lms/moodleService.js';

/**
 * Phase 3: announcements for sections whose owner is Moodle go to the mapped Moodle course's Announcements forum.
 * CampusCore (who teaches what) and Moodle (forums, roles) are in-process stubs; nothing real is contacted.
 *
 *   t-cc     CS 101-01   fac-1   no Moodle course            → CampusCore owns it
 *   t-md     CS 310-01   fac-1   Moodle course 610 (teacher)  → Moodle owns it; the faculty member may publish
 *   t-md2    MATH 241-01 fac-1   Moodle course 611 (student)  → Moodle owns it; Moodle does not list them as teacher
 *   t-other  ENGL 102-01 fac-2   Moodle course 612 (teacher)  → another instructor's section: CampusCore says no
 */

const CC = { id: 'cc_moodle_ann_stub', secret: 'ccs_moodle_ann_stub_secret_0001' };
const TOKEN = 'moodle-ann-stub-token-0123456789';
const KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS', 'MOODLE_BASE_URL', 'MOODLE_TOKEN', 'MOODLE_WRITES_ENABLED', 'MOODLE_STUDENT_ROLE_ID', 'MOODLE_TEACHER_ROLE_ID', 'MOODLE_MAX_RETRIES', 'MOODLE_TIMEOUT_MS'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let sis;
let site;
let prisma;
let tenant;
let users;

const course = (id, code, title) => ({ id, code, title, credits: 3 });
const section = (id, c, facultyId) => ({ id, termCode: '2099SP', course: c, sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [], instructors: [{ facultyId, name: 'x', isPrimary: true }], facultyId });

const setForumFunctions = (on) => {
  for (const fn of FORUM_FUNCTIONS) (on ? site.state.functions.add(fn) : site.state.functions.delete(fn));
  clearMoodleCapabilityCache();
};
const setWrites = (on) => { process.env.MOODLE_WRITES_ENABLED = on ? 'true' : 'false'; };
const publish = async (sectionId, body, token) => api(`/faculty/sections/${sectionId}/announcements`, { method: 'POST', token: token ?? (await login('faculty')), body });
const draft = (extra = {}) => ({ title: 'Lab moved to Thursday', body: 'Same room.\n\nBring your laptop.', idempotencyKey: randomUUID(), ...extra });
const moodlePosts = (forumId = 50) => site.state.discussions[forumId] ?? [];

before(async () => {
  sis = await startCampusCoreStub({ clientId: CC.id, clientSecret: CC.secret });
  site = await startMoodleStub({ token: TOKEN });
  sis.state.terms.push({ id: 'term-far', code: '2099SP', name: 'Spring 2099', startDate: '2099-01-10', endDate: '2099-05-10', isCurrent: false, status: 'UPCOMING' });
  sis.state.sections.push(
    section('t-cc', course('c10', 'CS 101', 'Intro to Programming'), 'fac-1'),
    section('t-md', course('c11', 'CS 310', 'Database Systems'), 'fac-1'),
    section('t-md2', course('c12', 'MATH 241', 'Linear Algebra'), 'fac-1'),
    section('t-other', course('c13', 'ENGL 102', 'Writing'), 'fac-2'),
  );
  sis.state.registrations.push({ id: 'reg-md', studentId: 'stu-maya', sectionId: 't-md', status: 'REGISTERED', credits: 3, waitlistPosition: null });
  sis.state.announcements.push({ id: 'ann-cc', sectionId: 't-md', title: 'Older CampusCore post', body: 'Before the Moodle course.', author: 'Elena Vasquez', publishedAt: '2026-10-01T00:00:00Z' });
  sis.state.scopes.push('announcements:read', 'announcements:write');
  sis.state.policies['announcement.write'] = true;

  for (const [id, shortname] of [[610, 'ADBMS'], [611, 'LA'], [612, 'WNR']]) site.state.courses.set(id, { id, shortname, fullname: `Moodle ${shortname}`, idnumber: '', categoryid: 1, visible: 1 });
  site.state.forums.push({ id: 50, course: 610, type: 'news', name: 'Announcements' }, { id: 51, course: 610, type: 'general', name: 'Discussion' }, { id: 52, course: 611, type: 'news', name: 'Announcements' }, { id: 53, course: 612, type: 'news', name: 'Announcements' });

  Object.assign(process.env, {
    SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: sis.url, CAMPUSCORE_CLIENT_ID: CC.id, CAMPUSCORE_CLIENT_SECRET: CC.secret, CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000',
    MOODLE_BASE_URL: site.url, MOODLE_TOKEN: TOKEN, MOODLE_WRITES_ENABLED: 'true', MOODLE_STUDENT_ROLE_ID: '5', MOODLE_TEACHER_ROLE_ID: '3', MOODLE_MAX_RETRIES: '1', MOODLE_TIMEOUT_MS: '1500',
  });
  resetSisClient();
  clearMoodleCapabilityCache();
  ({ prisma } = await import('../src/db/prisma.js'));
  tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
  await prisma.integration.updateMany({ where: { provider: 'MOODLE' }, data: { baseUrl: site.url, enabled: true, mode: 'LIVE' } });
  await prisma.externalIdentity.deleteMany({ where: { provider: { in: ['MOODLE', 'CAMPUSCORE'] } } });
  await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
  await prisma.sisSectionMoodleCourse.deleteMany({});
  await prisma.sisSectionMoodleCourse.createMany({ data: [['t-md', 610], ['t-md2', 611], ['t-other', 612]].map(([sisSectionId, moodleCourseId]) => ({ tenantId: tenant.id, sisSectionId, sisTermId: 'term-far', moodleCourseId })) });

  const by = (email) => prisma.user.findFirst({ where: { email }, include: { studentProfile: true, facultyProfile: true } });
  users = { student: await by('student@edunexus.ai'), faculty: await by('faculty@edunexus.ai') };
  sis.link(users.faculty.id, 'FACULTY', 'fac-1');
  sis.link(users.student.id, 'STUDENT', 'stu-maya');
  const linkMoodle = async (entityType, profileId, moodleUser) => {
    site.state.users.set(moodleUser.id, { auth: 'manual', suspended: 0, ...moodleUser });
    await prisma.externalIdentity.create({ data: { tenantId: tenant.id, provider: 'MOODLE', entityType, internalId: profileId, exclusiveInternalId: profileId, externalId: String(moodleUser.id), linkMethod: 'TEST' } });
  };
  await linkMoodle('FACULTY', users.faculty.facultyProfile.id, { id: 703, username: 'f1001', email: 'faculty@edunexus.ai', idnumber: 'F1001', firstname: 'E', lastname: 'V' });
  await linkMoodle('STUDENT', users.student.studentProfile.id, { id: 701, username: 's2400001', email: 'student@edunexus.ai', idnumber: 'S2400001', firstname: 'A', lastname: 'P' });
  site.state.enrolments.push(
    { userid: 703, courseid: 610, roleid: 3, suspended: false },
    { userid: 703, courseid: 611, roleid: 5, suspended: false },
    { userid: 703, courseid: 612, roleid: 3, suspended: false },
    { userid: 701, courseid: 610, roleid: 5, suspended: false },
  );
});

beforeEach(() => {
  setForumFunctions(true);
  setWrites(true);
  site.state.canAdd = {};
  site.state.forumsHiddenIn = new Set();
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetSisClient();
  clearMoodleCapabilityCache();
  await prisma.sisSectionMoodleCourse.deleteMany({});
  await prisma.externalIdentity.deleteMany({ where: { provider: { in: ['MOODLE', 'CAMPUSCORE'] } } });
  await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });
  await sis.close();
  await site.close();
  await closeTestServer();
});

describe('Moodle blockers are reported honestly and never routed to CampusCore', () => {
  it('without the forum web services: not offered, refused with the missing functions, nothing posted anywhere', async () => {
    setForumFunctions(false);
    const token = await login('faculty');
    const sections = (await api('/faculty/sections', { token })).body.data;
    const md = sections.sections.find((s) => s.source.id === 't-md');
    assert.equal(md.publish.allowed, false);
    assert.match(md.publish.reason, /mod_forum_get_forums_by_courses/);
    assert.equal(sections.publishing.moodle.enabled, false);

    const ccWrites = sis.state.announcementWrites.length;
    const res = await publish('t-md', draft(), token);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INTEGRATION_NOT_CONFIGURED');
    assert.match(res.body.error.message, /mod_forum_add_discussion/);
    assert.equal(sis.state.announcementWrites.length, ccWrites, 'never posted to CampusCore instead');
    assert.equal(site.callsOf('mod_forum_add_discussion'), 0);

    const mine = (await api('/faculty/announcements', { token })).body.data;
    assert.equal(mine.sources.moodle.state, 'NOT_CONNECTED');
    assert.match(mine.sources.moodle.reason, /mod_forum_get_forum_discussions/);
  });

  it('with Moodle writes switched off on the server: not offered and refused, even with the functions enabled', async () => {
    setWrites(false);
    const token = await login('faculty');
    const md = (await api('/faculty/sections', { token })).body.data.sections.find((s) => s.source.id === 't-md');
    assert.equal(md.publish.allowed, false);
    assert.match(md.publish.reason, /MOODLE_WRITES_ENABLED/);
    const res = await publish('t-md', draft(), token);
    assert.equal(res.status, 409);
    assert.equal(site.callsOf('mod_forum_add_discussion'), 0);
  });
});

describe('who may publish to a Moodle course', () => {
  it('per section: allowed where CampusCore assigns the section AND Moodle lists them as teacher; the Moodle author is named', async () => {
    const data = (await api('/faculty/sections', { token: await login('faculty') })).body.data;
    const byId = new Map(data.sections.map((s) => [s.source.id, s]));
    assert.deepEqual(byId.get('t-md').publish, { allowed: true, reason: null });
    assert.equal(byId.get('t-md2').publish.allowed, false);
    assert.match(byId.get('t-md2').publish.reason, /does not list you as a teacher/);
    assert.equal(byId.get('t-cc').announcementOwner, 'CAMPUSCORE');
    assert.equal(byId.get('t-cc').publish.allowed, true, 'CampusCore publishing unchanged');
    assert.ok(!byId.has('t-other'));
    assert.deepEqual(data.publishing.moodle, { enabled: true, reason: null, postsAs: 'EduNexus Integration' });
  });

  it('refuses a mapped course where Moodle does not list them as teacher, and another instructor’s section even where they teach the Moodle course', async () => {
    const token = await login('faculty');
    const notTeacher = await publish('t-md2', draft(), token);
    assert.equal(notTeacher.status, 403);
    assert.match(notTeacher.body.error.message, /do not teach this Moodle course/);
    const otherInstructor = await publish('t-other', draft(), token);
    assert.equal(otherInstructor.status, 403, 'CampusCore’s assignment decides first');
    assert.equal(site.callsOf('mod_forum_add_discussion'), 0);
  });

  it('refuses when Moodle does not let the integration account post or pin there', async () => {
    site.state.canAdd[50] = { status: false };
    const denied = await publish('t-md', draft());
    assert.equal(denied.status, 403);
    assert.match(denied.body.error.message, /mod\/forum:addnews/);
    site.state.canAdd[50] = { status: true, canpindiscussions: false };
    const pin = await publish('t-md', draft({ pinned: true }));
    assert.equal(pin.status, 400);
    assert.match(pin.body.error.message, /pin/);
    assert.equal(site.callsOf('mod_forum_add_discussion'), 0);
  });

  it('a course without an Announcements forum is reported, not posted to another forum', async () => {
    const news = site.state.forums.find((f) => f.id === 50);
    site.state.forums = site.state.forums.filter((f) => f.id !== 50);
    try {
      const res = await publish('t-md', draft());
      assert.equal(res.status, 404);
      assert.match(res.body.error.message, /no Announcements forum/);
      assert.equal(moodlePosts(51).length, 0, 'never the general discussion forum');
    } finally {
      site.state.forums.push(news);
    }
  });
});

describe('a forum Moodle hides from the integration account (as on the live site, 2026-11-20)', () => {
  // The course outline lists "Announcements", but mod_forum_get_forums_by_courses returns [] because the token's
  // account has no role granting mod/forum:viewdiscussion in the course.
  const hide = () => {
    site.state.forumsHiddenIn.add(610);
    site.state.contents[610] = [{ id: 1, section: 0, name: 'General', visible: 1, modules: [{ id: 1050, modname: 'forum', instance: 50, name: 'Announcements', visible: 1 }, { id: 1051, modname: 'forum', instance: 51, name: 'New Announcements', visible: 1 }] }];
  };

  it('is reported as a Moodle permission to grant, not as a missing forum, before and on publishing; nothing is posted', async () => {
    hide();
    const token = await login('faculty');
    const md = (await api('/faculty/sections', { token })).body.data.sections.find((s) => s.source.id === 't-md');
    assert.equal(md.publish.allowed, false);
    assert.match(md.publish.reason, /hides this course’s forums from the EduNexusAI integration account \(EduNexus Integration\).*mod\/forum:viewdiscussion/);
    const res = await publish('t-md', draft(), token);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INTEGRATION_NOT_CONFIGURED');
    assert.equal(res.body.error.details.reason, 'FORUM_HIDDEN_FROM_INTEGRATION');
    assert.doesNotMatch(res.body.error.message, /no Announcements forum/);
    assert.equal(site.callsOf('mod_forum_add_discussion'), 0);
    assert.equal(moodlePosts(51).length, 0, 'never another forum');
  });

  it('My Announcements says why that course cannot be read, while other Moodle courses still load', async () => {
    hide();
    const mine = (await api('/faculty/announcements', { token: await login('faculty') })).body.data;
    assert.equal(mine.sources.moodle.state, 'OK', 'course 611 is readable');
    assert.equal(mine.sources.moodle.warnings.length, 1);
    assert.match(mine.sources.moodle.warnings[0], /Moodle course 610 .*mod\/forum:viewdiscussion/);
    assert.ok(!mine.items.some((a) => a.source === 'moodle' && a.section.label === 'CS 310-01'), 'nothing invented for the hidden course');
  });

  it('a course whose outline has no forum at all really has no Announcements forum', async () => {
    const saved = site.state.forums;
    site.state.forums = saved.filter((f) => f.course !== 610);
    site.state.contents[610] = [{ id: 1, section: 0, name: 'General', visible: 1, modules: [] }];
    try {
      const res = await publish('t-md', draft());
      assert.equal(res.status, 404);
      assert.match(res.body.error.message, /no Announcements forum/);
    } finally {
      site.state.forums = saved;
      delete site.state.contents[610];
    }
  });
});

describe('publishing to the mapped Moodle course', () => {
  it('posts to that course’s Announcements forum, names the faculty member, stores no announcement locally', async () => {
    const before = { local: await prisma.announcement.count(), cc: sis.state.announcementWrites.length, posts: moodlePosts().length };
    const res = await publish('t-md', draft({ body: 'Room <b>204</b>.\nBring a laptop.' }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const name = `${users.faculty.firstName} ${users.faculty.lastName}`;
    assert.equal(res.body.data.source, 'moodle');
    assert.equal(res.body.data.author, 'EduNexus Integration', 'Moodle records the integration account as author');
    assert.equal(res.body.data.postedBy, name);
    assert.equal(res.body.data.section.label, 'CS 310-01');
    assert.match(res.body.data.url, /\/mod\/forum\/discuss\.php\?d=\d+$/);

    const post = moodlePosts()[0];
    assert.equal(moodlePosts().length, before.posts + 1);
    assert.equal(post.subject, 'Lab moved to Thursday');
    assert.equal(post.message, `<p>Room &lt;b&gt;204&lt;/b&gt;.<br>Bring a laptop.</p><p><em>Posted by ${name} for CS 310-01 via EduNexusAI.</em></p>`);
    assert.equal(moodlePosts(51).length, 0);
    assert.equal(await prisma.announcement.count(), before.local, 'no local copy');
    assert.equal(sis.state.announcementWrites.length, before.cc, 'nothing to CampusCore');

    const op = await prisma.integrationOperation.findFirst({ where: { operation: 'ANNOUNCEMENT.PUBLISH', externalId: String(post.id) } });
    assert.equal(op.status, 'SUCCEEDED');
    assert.deepEqual(op.request, { moodleCourseId: 610, forumId: 50 }, 'the ledger keeps ids, not the announcement');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'MOODLE_ANNOUNCEMENT_PUBLISHED', entityId: String(post.id), actorUserId: users.faculty.id } }));
  });

  it('pins when Moodle allows it', async () => {
    site.state.canAdd[50] = { status: true, canpindiscussions: true };
    const res = await publish('t-md', draft({ title: 'Pinned one', pinned: true }));
    assert.equal(res.status, 201);
    assert.equal(moodlePosts()[0].pinned, true);
  });

  it('a retried publish with the same key replays instead of posting twice', async () => {
    const body = draft({ title: 'Only once' });
    const first = await publish('t-md', body);
    const again = await publish('t-md', body);
    assert.equal(again.status, 201);
    assert.equal(again.body.data.id, first.body.data.id);
    assert.equal(again.body.data.replayed, true);
    assert.equal(moodlePosts().filter((d) => d.subject === 'Only once').length, 1);
  });

  it('an uncertain outcome (Moodle applied it, the reply was lost) is found in the forum on retry, not posted again', async () => {
    const body = draft({ title: 'Lost reply' });
    site.state.inject.mod_forum_add_discussion = 'applyThenGarbage';
    const lost = await publish('t-md', body);
    assert.ok(lost.status >= 500, `status ${lost.status}`);
    assert.equal(moodlePosts().filter((d) => d.subject === 'Lost reply').length, 1, 'Moodle did save it');
    const retry = await publish('t-md', body);
    assert.equal(retry.status, 201, JSON.stringify(retry.body));
    assert.equal(moodlePosts().filter((d) => d.subject === 'Lost reply').length, 1, 'no duplicate');
    assert.equal(retry.body.data.id, `moodle:${moodlePosts().find((d) => d.subject === 'Lost reply').id}`);
  });

  it('CampusCore-owned sections still publish to CampusCore exactly as before', async () => {
    const posts = moodlePosts().length;
    const res = await publish('t-cc', draft({ title: 'CampusCore post' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.source, 'campuscore');
    assert.equal(sis.state.announcementWrites.at(-1).sectionId, 't-cc');
    assert.equal(moodlePosts().length, posts);
  });
});

describe('reading Moodle announcements', () => {
  it('the faculty member sees their Moodle-owned sections’ announcements beside CampusCore ones', async () => {
    const mine = (await api('/faculty/announcements', { token: await login('faculty') })).body.data;
    assert.equal(mine.sources.moodle.state, 'OK');
    const moodleItem = mine.items.find((a) => a.source === 'moodle' && a.title === 'Lab moved to Thursday');
    assert.ok(moodleItem);
    assert.equal(moodleItem.section.label, 'CS 310-01');
    assert.equal(moodleItem.sectionOwner, 'MOODLE');
    assert.match(moodleItem.content, /Posted by .+ via EduNexusAI\./);
    assert.ok(mine.items.some((a) => a.source === 'campuscore' && a.id === 'ann-cc'), 'older CampusCore posts stay visible');
  });

  it('an enrolled student sees the Moodle announcement; a Moodle problem never hides CampusCore announcements', async () => {
    const token = await login('student');
    const list = (await api('/announcements', { token })).body.data;
    const item = list.find((a) => a.source === 'moodle' && a.title === 'Lab moved to Thursday');
    assert.ok(item, 'visible on /announcements');
    assert.equal(item.courseCode, 'ADBMS');
    assert.ok(list.some((a) => a.source === 'campuscore'));

    setForumFunctions(false);
    const degraded = (await api('/announcements', { token })).body.data;
    assert.ok(degraded.some((a) => a.source === 'campuscore'));
    assert.ok(!degraded.some((a) => a.source === 'moodle'));
  });
});

describe('message formatting', () => {
  it('escapes the faculty member’s text and keeps paragraphs', () => {
    assert.equal(announcementHtml({ body: 'A & B\n\n<script>x</script>', authorName: 'Dr "Q"', sectionLabel: 'CS 1-01' }), '<p>A &amp; B</p><p>&lt;script&gt;x&lt;/script&gt;</p><p><em>Posted by Dr &quot;Q&quot; for CS 1-01 via EduNexusAI.</em></p>');
  });
});
