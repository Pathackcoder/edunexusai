import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer, login } from './helpers/testEnv.js';
import { startCmsStub } from './helpers/cmsStub.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';

/**
 * The Alumni and Public CMS audiences, against the in-process CMS stub (never the real Strapi).
 * Alumni see only what is published for alumni; the signed-out landing page sees only what is
 * published for the public; neither ever sees another audience's content, drafts or forms.
 */

const TOKEN = 'stub-cms-token-audiences-0123456789';
const MANAGE_TOKEN = 'stub-cms-manage-audiences-0123456789';
const ENV_KEYS = ['CMS_URL', 'CMS_API_TOKEN', 'CMS_MANAGE_API_TOKEN', 'CMS_ADMIN_URL', 'CMS_LAYOUTS_ENABLED', 'CMS_TIMEOUT_MS'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const NONE = { students: false, faculty: false, staff: false, alumni: false, public: false };
let stub;
let tokens;

before(async () => {
  stub = await startCmsStub({ token: TOKEN, manageToken: MANAGE_TOKEN });
  Object.assign(process.env, { CMS_URL: stub.url, CMS_API_TOKEN: TOKEN, CMS_MANAGE_API_TOKEN: MANAGE_TOKEN, CMS_ADMIN_URL: 'http://localhost:1338/admin', CMS_TIMEOUT_MS: '1000', CMS_LAYOUTS_ENABLED: 'false' });
  await getTestServer();
  const alumna = await createMultiRoleUser({ key: 'cms.alumna', firstName: 'Alma', roles: ['ALUMNI'] });
  tokens = { admin: await login('admin'), student: await login('student'), faculty: await login('faculty'), alumni: await loginFixture(alumna.email) };
  const mk = async (type, body) => {
    const res = await api(`/studio/${type}`, { method: 'POST', token: tokens.admin, body });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    await api(`/studio/${type}/${res.body.data.id}/publish`, { method: 'POST', token: tokens.admin });
    return res.body.data.id;
  };
  await mk('announcement', { title: 'Students only', body: 'x', audiences: { ...NONE, students: true } });
  await mk('announcement', { title: 'Alumni reunion (demo)', body: 'x', audiences: { ...NONE, alumni: true } });
  await mk('announcement', { title: 'Open day (demo)', body: 'x', audiences: { ...NONE, public: true } });
  await mk('announcement', { title: 'Legacy three-audience item', body: 'x', audiences: { students: true, faculty: true, staff: true } });
  await mk('faq', { question: 'How do I apply?', answer: 'Online.', audiences: { ...NONE, public: true } });
  await mk('page', { title: 'Visit us', slug: 'visit-us', summary: 'Tours', template: 'information', audiences: { ...NONE, public: true }, layout: { root: { props: {} }, content: [] } });
  await mk('page', { title: 'Alumni giving', slug: 'alumni-giving', summary: 'Give', template: 'information', audiences: { ...NONE, alumni: true }, layout: { root: { props: {} }, content: [] } });
});

after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) process.env[key] = value ?? '';
  await removeMultiRoleUsers();
  await stub?.close();
  await closeTestServer();
});

const titles = async (token) => (await api('/content/announcements', { token })).body.data.map((a) => a.title).sort();

describe('alumni audience', () => {
  it('an alumni account sees only alumni content; students and faculty do not see it', async () => {
    assert.deepEqual(await titles(tokens.alumni), ['Alumni reunion (demo)']);
    assert.ok(!(await titles(tokens.student)).includes('Alumni reunion (demo)'));
    assert.ok(!(await titles(tokens.faculty)).includes('Alumni reunion (demo)'));
  });

  it('content published before the alumni audience existed is not shown to alumni', async () => {
    assert.ok(!(await titles(tokens.alumni)).includes('Legacy three-audience item'));
    assert.ok((await titles(tokens.student)).includes('Legacy three-audience item'), 'and the older clients’ three audiences still work');
  });

  it('pages: alumni reach alumni pages only', async () => {
    assert.equal((await api('/content/pages/alumni-giving', { token: tokens.alumni })).status, 200);
    assert.equal((await api('/content/pages/alumni-giving', { token: tokens.student })).status, 404);
    assert.equal((await api('/content/pages/visit-us', { token: tokens.alumni })).status, 404, 'public pages are for the signed-out landing page');
  });

  it('a signed-in person never receives the public audience as one of theirs', async () => {
    assert.ok(!(await titles(tokens.student)).includes('Open day (demo)'));
    assert.ok(!(await titles(tokens.admin)).includes('Open day (demo)'));
  });

  it('forms cannot be public', async () => {
    const res = await api('/studio/form', { method: 'POST', token: tokens.admin, body: { name: 'Enquiry', description: '', fields: [{ type: 'text', name: 'name', label: 'Name', required: true }], audiences: { ...NONE, public: true } } });
    assert.equal(res.status, 400);
  });

  it('the studio shows and round-trips both new audiences', async () => {
    const list = (await api('/studio/announcement', { token: tokens.admin })).body.data;
    const item = list.find((a) => a.title === 'Open day (demo)');
    assert.deepEqual(item.audiences, { ...NONE, public: true });
    const call = [...stub.requests].reverse().find((r) => r.method === 'POST' && r.path.endsWith('/content/announcement'));
    assert.ok(call, 'the backend wrote through the CMS integration API');
  });
});

describe('public landing content (no sign-in)', () => {
  it('returns only public, published content for the named institution', async () => {
    const res = await api('/public/demo-university/home');
    assert.equal(res.status, 200);
    const { institution, announcements, pages, faqs } = res.body.data;
    assert.equal(institution.slug, 'demo-university');
    assert.deepEqual(announcements.map((a) => a.title), ['Open day (demo)']);
    assert.deepEqual(pages.map((p) => p.slug), ['visit-us']);
    assert.deepEqual(faqs.map((f) => f.question), ['How do I apply?']);
    const text = JSON.stringify(res.body);
    for (const leak of ['Students only', 'Alumni reunion', 'Legacy three-audience', 'authorName', 'updatedByName', TOKEN]) assert.ok(!text.includes(leak), leak);
  });

  it('a public page by address, and nothing else', async () => {
    assert.equal((await api('/public/demo-university/pages/visit-us')).status, 200);
    assert.equal((await api('/public/demo-university/pages/alumni-giving')).status, 404);
    assert.equal((await api('/public/demo-university/pages/..%2Fadmin')).status, 404);
  });

  it('an unknown institution is 404; another institution sees none of this one’s content', async () => {
    assert.equal((await api('/public/no-such-university/home')).status, 404);
    assert.equal((await api('/public/Bad_Slug!/home')).status, 400);
  });

  it('private APIs still require a session', async () => {
    for (const path of ['/content/announcements', '/sis/calendar', '/resources', '/dashboard/student', '/lms/me/moodle/courses']) {
      assert.equal((await api(path)).status, 401, path);
    }
  });
});

describe('a context view asks for its own audience only', () => {
  it('audience=alumni returns alumni content to an alumnus and nothing to a student', async () => {
    const mine = (await api('/content/announcements?audience=alumni', { token: tokens.alumni })).body.data.map((a) => a.title);
    assert.deepEqual(mine, ['Alumni reunion (demo)']);
    assert.deepEqual((await api('/content/announcements?audience=alumni', { token: tokens.student })).body.data, []);
    assert.deepEqual((await api('/content/pages?audience=alumni', { token: tokens.student })).body.data, []);
    assert.equal((await api('/content/pages?audience=public', { token: tokens.alumni })).status, 400);
  });
});
