import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer, login } from './helpers/testEnv.js';
import { startCmsStub } from './helpers/cmsStub.js';
import { validateLayout } from '../../shared/cmsBlocks.js';

/**
 * Feddrick CMS integration (Studio + content delivery). Every CMS call goes to an
 * in-process stub of the CMS integration API (helpers/cmsStub.js); the real Strapi is never
 * contacted, and nothing here writes to the EduNexusAI database.
 */

const TOKEN = 'stub-cms-token-0123456789abcdef';
const ENV_KEYS = ['CMS_URL', 'CMS_API_TOKEN', 'CMS_ADMIN_URL', 'CMS_LAYOUTS_ENABLED', 'CMS_TIMEOUT_MS'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const ALL = { students: true, faculty: true, staff: true };
let stub;
let tokens;
let tenant;
let prisma;
let rowCounts;

const leaksToken = (body) => JSON.stringify(body ?? null).includes(TOKEN);
const pageBody = (over = {}) => ({
  title: 'Library hours',
  slug: 'library-hours',
  summary: 'When the library is open',
  template: 'information',
  audiences: ALL,
  showInNav: true,
  navLabel: 'Library',
  layout: { root: { props: {} }, content: [{ type: 'Heading', props: { id: 'h1', text: 'Opening times' } }] },
  ...over,
});
const lastCall = (pred) => [...stub.requests].reverse().find(pred);

async function countRows() {
  const [users, tenants, widgets, layouts, announcements, faqs] = await Promise.all([prisma.user.count(), prisma.tenant.count(), prisma.widgetDefinition.count(), prisma.dashboardLayout.count(), prisma.announcement.count(), prisma.faqItem.count()]);
  return { users, tenants, widgets, layouts, announcements, faqs };
}

before(async () => {
  await getTestServer();
  ({ prisma } = await import('../src/db/prisma.js'));
  tokens = { admin: await login('admin'), student: await login('student'), faculty: await login('faculty') };
  const me = await prisma.user.findFirst({ where: { email: 'admin@edunexus.ai' }, select: { tenant: { select: { slug: true } } } });
  tenant = me.tenant.slug;
  rowCounts = await countRows();
});

after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) process.env[key] = value ?? '';
  await stub?.close();
  await closeTestServer();
});

const useStub = () => Object.assign(process.env, { CMS_URL: stub.url, CMS_API_TOKEN: TOKEN, CMS_ADMIN_URL: 'http://localhost:1338/admin', CMS_TIMEOUT_MS: '1000', CMS_LAYOUTS_ENABLED: 'false' });

describe('CMS not configured', () => {
  it('the portal keeps working: Studio reports the CMS as unavailable and dashboards use their built-in layout', async () => {
    const meta = await api('/studio/meta', { token: tokens.admin });
    assert.equal(meta.status, 200);
    assert.equal(meta.body.data.configured, false);
    assert.equal(meta.body.data.available, false);
    const layout = await api('/content/dashboard-layouts/student', { token: tokens.student });
    assert.equal(layout.status, 200);
    assert.equal(layout.body.data.layout, null);
    const list = await api('/studio/page', { token: tokens.admin });
    assert.equal(list.status, 503);
    assert.equal(list.body.error.code, 'CMS_NOT_CONFIGURED');
    const dash = await api('/dashboard', { token: tokens.student });
    assert.equal(dash.status, 200, 'existing dashboard API is unaffected');
  });
});

describe('Studio access control', () => {
  before(async () => {
    stub = await startCmsStub({ token: TOKEN });
    useStub();
  });

  it('requires a signed-in administrator for every Studio endpoint', async () => {
    for (const [method, path] of [['GET', '/studio/meta'], ['GET', '/studio/page'], ['POST', '/studio/page'], ['GET', '/studio/dashboards/student'], ['PUT', '/studio/dashboards/student'], ['GET', '/studio/media'], ['GET', '/studio/audit']]) {
      const anon = await api(path, { method, body: method === 'GET' ? undefined : {} });
      assert.equal(anon.status, 401, `${method} ${path} anonymous`);
      for (const who of ['student', 'faculty']) {
        const res = await api(path, { method, token: tokens[who], body: method === 'GET' ? undefined : {} });
        assert.equal(res.status, 403, `${method} ${path} as ${who}`);
      }
    }
    const before = stub.requests.length;
    await api('/studio/page', { method: 'POST', token: tokens.student, body: pageBody() });
    assert.equal(stub.requests.length, before, 'a refused request never reaches the CMS');
  });

  it('reports the CMS as connected without exposing the token', async () => {
    const meta = await api('/studio/meta', { token: tokens.admin });
    assert.equal(meta.status, 200);
    assert.equal(meta.body.data.available, true);
    assert.equal(meta.body.data.layoutsEnabled, false);
    assert.ok(!leaksToken(meta.body));
    assert.equal(lastCall(() => true).authorization, `Bearer ${TOKEN}`, 'the backend authenticates to the CMS with the server-side token');
  });

  it('delivery endpoints require sign-in', async () => {
    for (const path of ['/content/pages', '/content/pages/x', '/content/announcements', '/content/faqs', '/content/dashboard-layouts/student']) {
      assert.equal((await api(path)).status, 401, path);
    }
  });
});

describe('Pages: validation, publication and delivery', () => {
  let pageId;

  it('rejects unknown blocks, unsafe links and invalid settings before anything reaches the CMS', async () => {
    const calls = stub.requests.length;
    const bad = [
      pageBody({ layout: { root: { props: {} }, content: [{ type: 'ScriptEmbed', props: { id: 'x', html: '<script>alert(1)</script>' } }] } }),
      pageBody({ layout: { root: { props: {} }, content: [{ type: 'ButtonLink', props: { id: 'b', label: 'Go', url: 'javascript:alert(1)' } }] } }),
      pageBody({ layout: { root: { props: {} }, content: [{ type: 'Image', props: { id: 'i', src: 'http://evil.example/x.png', alt: 'x' } }] } }),
      pageBody({ layout: { root: { props: {} }, content: [{ type: 'DashboardWidget', props: { id: 'w', widgetKey: 'x' } }] } }),
      pageBody({ slug: 'Bad Slug!' }),
      pageBody({ audiences: { students: false, faculty: false, staff: false } }),
      pageBody({ title: '' }),
    ];
    for (const body of bad) {
      const res = await api('/studio/page', { method: 'POST', token: tokens.admin, body });
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 120));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(stub.requests.length, calls);
  });

  it('enforces limits on layout size and nesting', () => {
    let deep = { type: 'Section', props: { id: 's0', content: [] } };
    const rootBlock = deep;
    for (let i = 1; i < 10; i += 1) {
      const next = { type: 'Section', props: { id: `s${i}`, content: [] } };
      deep.props.content.push(next);
      deep = next;
    }
    assert.equal(validateLayout({ root: { props: {} }, content: [rootBlock] }, { context: 'page' }).ok, false);
    const many = Array.from({ length: 301 }, (_, i) => ({ type: 'Divider', props: { id: `d${i}` } }));
    assert.equal(validateLayout({ root: { props: {} }, content: many }, { context: 'page' }).ok, false);
    const stripped = validateLayout({ root: { props: {} }, content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', onClick: 'x', style: { color: 'red' } } }] }, { context: 'page' });
    assert.equal(stripped.ok, true);
    const kept = stripped.layout.content[0].props;
    assert.equal('onClick' in kept, false);
    assert.equal('style' in kept, false);
    assert.deepEqual([kept.text, kept.level, kept.boxWidth], ['Hi', 'h2', 100]);
  });

  it('validates box sizes and column ratios on the server and stores them', async () => {
    const tooWide = await api('/studio/page', { method: 'POST', token: tokens.admin, body: pageBody({ slug: 'sizing', layout: { root: { props: {} }, content: [{ type: 'Image', props: { id: 'i', boxWidth: 150 } }] } }) });
    assert.equal(tooWide.status, 400);
    const tooTall = await api('/studio/page', { method: 'POST', token: tokens.admin, body: pageBody({ slug: 'sizing', layout: { root: { props: {} }, content: [{ type: 'Banner', props: { id: 'b', heightPx: 99999 } }] } }) });
    assert.equal(tooTall.status, 400);
    const ok = await api('/studio/page', { method: 'POST', token: tokens.admin, body: pageBody({ slug: 'sizing', layout: { root: { props: { showTitle: false } }, content: [
      { type: 'Image', props: { id: 'i', boxWidth: 60, boxAlign: 'center', heightPx: 320, aspectRatio: '16:9' } },
      { type: 'Columns', props: { id: 'c', layout: '1-1-1-1', col1Width: 40, col2Width: 20, col3Width: 20, col4Width: 20, column4: [{ type: 'Quote', props: { id: 'q', quote: 'Hi' } }] } },
    ] } }) });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const stored = lastCall((r) => r.method === 'POST' && r.path === '/api/edunexus/content/page').body.data.layout;
    assert.deepEqual([stored.content[0].props.boxWidth, stored.content[0].props.heightPx, stored.content[0].props.boxAlign], [60, 320, 'center']);
    assert.equal(stored.content[1].props.col4Width, 20);
    assert.equal(stored.root.props.showTitle, false);
    assert.equal((await api(`/studio/page/${ok.body.data.id}`, { method: 'DELETE', token: tokens.admin })).status, 200);
  });

  it('creates a draft for the session tenant only, ignoring any tenant in the request', async () => {
    const res = await api('/studio/page', { method: 'POST', token: tokens.admin, body: { ...pageBody(), tenant: 'another-university' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.state, 'draft');
    pageId = res.body.data.id;
    const call = lastCall((r) => r.method === 'POST' && r.path === '/api/edunexus/content/page');
    assert.equal(call.body.tenant, tenant);
    assert.equal(call.body.data.tenant, undefined);
    assert.ok(!leaksToken(res.body));
    const dup = await api('/studio/page', { method: 'POST', token: tokens.admin, body: pageBody({ title: 'Other' }) });
    assert.equal(dup.status, 409);
  });

  it('never delivers drafts to students or faculty', async () => {
    assert.equal((await api('/content/pages/library-hours', { token: tokens.student })).status, 404);
    assert.deepEqual((await api('/content/pages', { token: tokens.student })).body.data, []);
    const preview = await api(`/studio/page/${pageId}`, { token: tokens.admin });
    assert.equal(preview.status, 200, 'administrators can preview the draft in Studio');
    assert.equal(preview.body.data.title, 'Library hours');
  });

  it('publishes, keeps the published version while the draft is edited, and unpublishes', async () => {
    const pub = await api(`/studio/page/${pageId}/publish`, { method: 'POST', token: tokens.admin });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.state, 'published');
    const live = await api('/content/pages/library-hours', { token: tokens.student });
    assert.equal(live.status, 200);
    assert.equal(live.body.data.title, 'Library hours');
    assert.equal(live.body.data.layout.content[0].props.text, 'Opening times');
    const nav = await api('/content/pages', { token: tokens.faculty });
    assert.deepEqual(nav.body.data.map((p) => p.slug), ['library-hours']);

    const edit = await api(`/studio/page/${pageId}`, { method: 'PUT', token: tokens.admin, body: pageBody({ title: 'Library hours (draft change)' }) });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.data.state, 'modified');
    assert.equal((await api('/content/pages/library-hours', { token: tokens.student })).body.data.title, 'Library hours', 'unpublished edits do not leak');

    const discard = await api(`/studio/page/${pageId}/discard`, { method: 'POST', token: tokens.admin });
    assert.equal(discard.body.data.state, 'published');
    assert.equal(discard.body.data.title, 'Library hours');

    const unpub = await api(`/studio/page/${pageId}/unpublish`, { method: 'POST', token: tokens.admin });
    assert.equal(unpub.body.data.state, 'draft');
    assert.equal((await api('/content/pages/library-hours', { token: tokens.student })).status, 404);
  });

  it('delivers a page only to the audiences it was published for', async () => {
    await api(`/studio/page/${pageId}`, { method: 'PUT', token: tokens.admin, body: pageBody({ audiences: { students: false, faculty: true, staff: false } }) });
    await api(`/studio/page/${pageId}/publish`, { method: 'POST', token: tokens.admin });
    assert.equal((await api('/content/pages/library-hours', { token: tokens.student })).status, 404);
    assert.equal((await api('/content/pages/library-hours', { token: tokens.faculty })).status, 200);
    assert.deepEqual((await api('/content/pages', { token: tokens.student })).body.data, []);
  });

  it('isolates tenants: another tenant’s documents behave as if they do not exist', async () => {
    const foreign = stub.seed('page', 'another-university', { title: 'Foreign', slug: 'foreign', audienceStudents: true, audienceFaculty: true, audienceStaff: true, layout: { root: { props: {} }, content: [] } });
    assert.equal((await api(`/studio/page/${foreign}`, { token: tokens.admin })).status, 404);
    assert.equal((await api(`/studio/page/${foreign}/publish`, { method: 'POST', token: tokens.admin })).status, 404);
    assert.equal((await api(`/studio/page/${foreign}`, { method: 'DELETE', token: tokens.admin })).status, 404);
    assert.equal((await api('/content/pages/foreign', { token: tokens.student })).status, 404);
    assert.ok(!(await api('/studio/page', { token: tokens.admin })).body.data.some((p) => p.id === foreign));
    assert.ok(stub.docs.has(foreign), 'the other tenant’s document is untouched');
  });

  it('deletes the page and records every change in the audit log', async () => {
    const del = await api(`/studio/page/${pageId}`, { method: 'DELETE', token: tokens.admin });
    assert.equal(del.status, 200);
    assert.equal((await api('/content/pages/library-hours', { token: tokens.faculty })).status, 404);
    const audit = await api('/studio/audit', { token: tokens.admin });
    const actions = audit.body.data.filter((a) => a.targetId === pageId).map((a) => a.action);
    for (const action of ['create', 'publish', 'update', 'discard', 'unpublish', 'delete']) assert.ok(actions.includes(action), action);
    assert.ok(audit.body.data.every((a) => a.actorName !== undefined));
  });
});

describe('News and help articles', () => {
  it('validates links and delivers only live, published items for the reader’s audience', async () => {
    const unsafe = await api('/studio/announcement', { method: 'POST', token: tokens.admin, body: { title: 'x', ctaLabel: 'Go', ctaUrl: 'javascript:alert(1)', audiences: ALL } });
    assert.equal(unsafe.status, 400);

    const mk = async (body, publish = true) => {
      const res = await api('/studio/announcement', { method: 'POST', token: tokens.admin, body: { body: 'Text', ...body } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      if (publish) await api(`/studio/announcement/${res.body.data.id}/publish`, { method: 'POST', token: tokens.admin });
      return res.body.data.id;
    };
    await mk({ title: 'Everyone', audiences: ALL });
    await mk({ title: 'Students only', audiences: { students: true, faculty: false, staff: false } });
    await mk({ title: 'Draft only', audiences: ALL }, false);
    await mk({ title: 'Expired', audiences: ALL, expiresAt: '2020-01-01T00:00:00.000Z' });

    const student = (await api('/content/announcements', { token: tokens.student })).body.data.map((a) => a.title).sort();
    assert.deepEqual(student, ['Everyone', 'Students only']);
    const faculty = (await api('/content/announcements', { token: tokens.faculty })).body.data.map((a) => a.title);
    assert.deepEqual(faculty, ['Everyone']);
    assert.ok(!(await api('/content/announcements', { token: tokens.student })).body.data.some((a) => 'audiences' in a));
  });

  it('delivers published help articles without touching the existing Help Centre FAQs', async () => {
    const before = await api('/help', { token: tokens.student });
    const res = await api('/studio/faq', { method: 'POST', token: tokens.admin, body: { question: 'How do I reset my password?', answer: 'Use **Forgot password**.', audiences: ALL } });
    assert.equal(res.status, 201);
    assert.deepEqual((await api('/content/faqs', { token: tokens.student })).body.data, []);
    await api(`/studio/faq/${res.body.data.id}/publish`, { method: 'POST', token: tokens.admin });
    assert.equal((await api('/content/faqs', { token: tokens.student })).body.data[0].question, 'How do I reset my password?');
    const afterHelp = await api('/help', { token: tokens.student });
    assert.equal(afterHelp.status, before.status);
    assert.deepEqual(afterHelp.body, before.body);
  });
});

describe('Dashboard layouts', () => {
  let catalogue;

  it('offers the existing widgets of each dashboard and validates layouts against them', async () => {
    const res = await api('/studio/dashboards/student', { token: tokens.admin });
    assert.equal(res.status, 200);
    catalogue = res.body.data.catalogue.map((w) => w.key);
    assert.ok(catalogue.length > 0);
    assert.equal(res.body.data.document, null);
    const admin = await api('/studio/dashboards/admin', { token: tokens.admin });
    assert.ok(admin.body.data.catalogue.some((w) => w.key === 'admin.hero'));
    const faculty = await api('/studio/dashboards/faculty', { token: tokens.admin });
    assert.ok(faculty.body.data.catalogue.length > 0);

    const unknown = await api('/studio/dashboards/student', { method: 'PUT', token: tokens.admin, body: { layout: { root: { props: {} }, content: [{ type: 'DashboardWidget', props: { id: 'w', widgetKey: 'not.a.widget' } }] } } });
    assert.equal(unknown.status, 400);
    const twice = await api('/studio/dashboards/student', { method: 'PUT', token: tokens.admin, body: { layout: { root: { props: {} }, content: [0, 1].map((i) => ({ type: 'DashboardWidget', props: { id: `w${i}`, widgetKey: catalogue[0] } })) } } });
    assert.equal(twice.status, 400);
    const pageOnly = await api('/studio/dashboards/student', { method: 'PUT', token: tokens.admin, body: { layout: { root: { props: {} }, content: [{ type: 'ButtonLink', props: { id: 'b' } }] } } });
    assert.equal(pageOnly.status, 400);
    assert.equal((await api('/studio/dashboards/registrar', { token: tokens.admin })).status, 400);
  });

  it('applies a published layout only when CMS_LAYOUTS_ENABLED is on, and only for the matching role', async () => {
    const layout = {
      root: { props: { hidden: [catalogue[catalogue.length - 1], 'not.a.widget'] } },
      content: [
        { type: 'DashboardWidget', props: { id: 'w0', widgetKey: catalogue[0], title: 'My courses this term', size: 'large' } },
        { type: 'AnnouncementsFeed', props: { id: 'news', title: 'Campus news' } },
      ],
    };
    const saved = await api('/studio/dashboards/student', { method: 'PUT', token: tokens.admin, body: { layout } });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.data.layout.root.props.hidden, [catalogue[catalogue.length - 1]], 'hidden keys are limited to the catalogue');

    const draft = await api('/content/dashboard-layouts/student', { token: tokens.student });
    assert.equal(draft.body.data.layout, null, 'flag off');
    process.env.CMS_LAYOUTS_ENABLED = 'true';
    assert.equal((await api('/content/dashboard-layouts/student', { token: tokens.student })).body.data.layout, null, 'a draft is never delivered');

    const pub = await api('/studio/dashboards/student/publish', { method: 'POST', token: tokens.admin });
    assert.equal(pub.body.data.state, 'published');
    const live = await api('/content/dashboard-layouts/student', { token: tokens.student });
    assert.equal(live.status, 200);
    assert.equal(live.body.data.layout.content[0].props.title, 'My courses this term');

    assert.equal((await api('/content/dashboard-layouts/student', { token: tokens.faculty })).status, 403);
    assert.equal((await api('/content/dashboard-layouts/admin', { token: tokens.student })).status, 403);
    assert.equal((await api('/content/dashboard-layouts/faculty', { token: tokens.faculty })).body.data.layout, null, 'no faculty layout: built-in dashboard');

    const dash = await api('/dashboard', { token: tokens.student });
    assert.equal(dash.status, 200, 'the dashboard data API still serves the student’s entitled widgets');
  });

  it('falls back to the built-in dashboard when the CMS is down or the stored layout is invalid', async () => {
    const [entry] = [...stub.docs.values()].filter((d) => d.type === 'dashboard-layout');
    const good = entry.published;
    entry.published = { ...good, layout: { root: { props: {} }, content: [{ type: 'ScriptEmbed', props: { id: 'x' } }] } };
    const invalid = await api('/content/dashboard-layouts/student', { token: tokens.student });
    assert.equal(invalid.status, 200);
    assert.equal(invalid.body.data.layout, null);
    entry.published = good;

    const url = process.env.CMS_URL;
    process.env.CMS_URL = 'http://127.0.0.1:9';
    const down = await api('/content/dashboard-layouts/student', { token: tokens.student });
    assert.equal(down.status, 200);
    assert.equal(down.body.data.layout, null);
    assert.equal((await api('/studio/page', { token: tokens.admin })).status, 503);
    assert.equal((await api('/dashboard', { token: tokens.student })).status, 200);
    process.env.CMS_URL = url;
  });

  it('a rejected CMS token is reported as a server problem without leaking it', async () => {
    process.env.CMS_API_TOKEN = 'wrong-token';
    const res = await api('/studio/page', { token: tokens.admin });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'CMS_AUTH_FAILED');
    assert.ok(!JSON.stringify(res.body).includes('wrong-token'));
    process.env.CMS_API_TOKEN = TOKEN;
  });

  it('unpublishing or deleting the layout restores the built-in dashboard', async () => {
    await api('/studio/dashboards/student/unpublish', { method: 'POST', token: tokens.admin });
    assert.equal((await api('/content/dashboard-layouts/student', { token: tokens.student })).body.data.layout, null);
    const del = await api('/studio/dashboards/student', { method: 'DELETE', token: tokens.admin });
    assert.equal(del.body.data.deleted, true);
    assert.equal((await api('/studio/dashboards/student', { token: tokens.admin })).body.data.document, null);
    process.env.CMS_LAYOUTS_ENABLED = 'false';
  });
});

describe('Media', () => {
  it('accepts only real raster images and serves them as images', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    assert.equal((await api('/studio/media', { method: 'POST', token: tokens.admin, body: { fileName: 'x.svg', mime: 'image/svg+xml', dataBase64: svg } })).status, 400);
    assert.equal((await api('/studio/media', { method: 'POST', token: tokens.admin, body: { fileName: 'x.png', mime: 'image/png', dataBase64: svg } })).status, 400, 'content must match the declared type');
    assert.equal((await api('/studio/media', { method: 'POST', token: tokens.student, body: { fileName: 'x.png', mime: 'image/png', dataBase64: stub.png.toString('base64') } })).status, 403);

    const ok = await api('/studio/media', { method: 'POST', token: tokens.admin, body: { fileName: 'campus map.png', mime: 'image/png', dataBase64: stub.png.toString('base64'), alternativeText: 'Campus map' } });
    assert.equal(ok.status, 201);
    assert.match(ok.body.data.url, /^\/api\/v1\/content\/media\/[A-Za-z0-9._-]+$/);
    assert.equal(stub.media.at(-1).tenant, tenant);
    assert.equal((await api('/studio/media', { token: tokens.admin })).body.data.length, 1);

    const { baseUrl } = await getTestServer();
    const img = await fetch(`${baseUrl.replace(/\/api\/v1$/, '')}${ok.body.data.url}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(`${baseUrl}/content/media/..%2F.env`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/content/media/missing.png`)).status, 404);
  });
});

describe('Data safety', () => {
  it('leaves the EduNexusAI database untouched', async () => {
    assert.deepEqual(await countRows(), rowCounts);
  });
});
