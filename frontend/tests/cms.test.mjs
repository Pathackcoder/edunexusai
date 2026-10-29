import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKS, BOX_LIMITS, isSafeUrl, isSafeImage, validateLayout } from '../../shared/cmsBlocks.js';

/**
 * Studio / CMS guard rails in the frontend source: the browser only talks to the EduNexusAI
 * API, Studio is admin-only, CMS content is rendered without raw HTML, and the dashboards
 * keep their built-in layout when there is no published CMS layout.
 */
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (path) => readFileSync(join(SRC, path), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : /\.(jsx?|mjs)$/.test(name) ? [full] : [];
});

describe('CMS boundary in the frontend', () => {
  it('no source file contacts the CMS directly or references its token', () => {
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /CMS_API_TOKEN|VITE_CMS|:1338|\/api\/edunexus|\/uploads\//, file);
    }
  });

  it('Studio is lazily loaded behind the ADMIN role', () => {
    const app = read('App.jsx');
    assert.match(app, /lazy\(\(\) => import\('\.\/pages\/studio\/StudioApp'\)\)/);
    // Studio lives inside the protected portal shell (AppLayout), behind the ADMIN role gate.
    const shell = app.slice(app.indexOf('<AppLayout />'));
    assert.match(shell, /path="studio\/\*"\s*element=\{\s*<RoleRoute allow=\{\['ADMIN'\]\}>/);
    assert.match(read('layouts/AppLayout.jsx'), /const inStudio = isAdmin && pathname\.startsWith\('\/studio'\)/);
    assert.match(read('layouts/Header.jsx'), /Studio/);
  });

  it('CMS text is rendered as Markdown without raw HTML', () => {
    for (const file of walk(join(SRC, 'components/cms')).concat(walk(join(SRC, 'pages/studio')), walk(join(SRC, 'pages/cms')))) {
      const source = readFileSync(file, 'utf8');
      // Reading innerHTML from an inert DOMParser document is fine; writing markup into the page is not.
      assert.doesNotMatch(source, /dangerouslySetInnerHTML|rehype-raw|\.innerHTML\s*=(?!=)|outerHTML\s*=(?!=)|insertAdjacentHTML/, file);
    }
    assert.match(read('components/cms/Markdown.jsx'), /urlTransform=/);
  });

  it('dashboards fall back to their built-in layout when there is no CMS layout', () => {
    assert.match(read('components/cms/dashboardLayout.jsx'), /if \(!layout \|\| !Array\.isArray\(layout\.content\)\) return items;/);
    for (const [file, persona] of [['pages/dashboard/StudentDashboard.jsx', 'student'], ['pages/faculty/FacultyDashboardPage.jsx', 'faculty'], ['pages/admin/AdminDashboardPage.jsx', 'admin']]) {
      const source = read(file);
      assert.match(source, new RegExp(`useCmsDashboardLayout\\('${persona}'\\)`), file);
      assert.match(source, /applyCmsLayout\(/, file);
    }
  });
});

describe('shared block registry', () => {
  it('every block declares where it may be used', () => {
    for (const [name, def] of Object.entries(BLOCKS)) {
      assert.ok(def.contexts.length > 0, name);
      assert.ok(def.contexts.every((c) => c === 'page' || c === 'dashboard'), name);
    }
  });

  it('accepts only safe links and images', () => {
    for (const url of ['https://example.edu', '/help', 'mailto:a@b.edu', 'tel:+15551234']) assert.equal(isSafeUrl(url), true, url);
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'vbscript:x', ' javascript:x']) assert.equal(isSafeUrl(url), false, url);
    assert.equal(isSafeImage('/api/v1/content/media/a.png'), true);
    assert.equal(isSafeImage('http://insecure.example/a.png'), false);
  });

  it('builds the same layout the backend stores (unknown props removed, defaults filled)', () => {
    const checked = validateLayout({ root: { props: {} }, content: [{ type: 'Columns', props: { id: 'c', layout: '2-1', column1: [{ type: 'Heading', props: { id: 'h', text: 'Hi', evil: 1 } }] } }] }, { context: 'page' });
    assert.equal(checked.ok, true);
    assert.equal(checked.layout.content[0].props.column1[0].props.evil, undefined);
    assert.equal(checked.layout.content[0].props.column1[0].props.level, 'h2');
  });
});

describe('layout sizing', () => {
  it('existing layouts stay valid and gain default sizes', () => {
    const old = { root: { props: { width: 'normal' } }, content: [
      { type: 'Image', props: { id: 'Image-1', src: '/api/v1/content/media/a.jpeg', alt: '', fit: 'cover', height: 'auto', rounded: true, link: '', caption: '', size: 'large' } },
      { type: 'Columns', props: { id: 'c', layout: '1-1', gap: 'md', column1: [{ type: 'Section', props: { id: 's', title: 'x', content: [] } }], column2: [], column3: [] } },
    ] };
    const checked = validateLayout(old, { context: 'page' });
    assert.equal(checked.ok, true);
    assert.equal(checked.layout.content[0].props.boxWidth, 100);
    assert.equal(checked.layout.content[0].props.heightPx, 0);
    assert.equal(checked.layout.content[1].props.col1Width, 0);
    assert.equal(checked.layout.root.props.showTitle, true);
  });

  it('rejects out-of-range widths, heights and column ratios', () => {
    for (const props of [{ boxWidth: 5 }, { boxWidth: 140 }, { heightPx: 5000 }, { heightPx: -1 }, { boxAlign: 'diagonal' }]) {
      assert.equal(validateLayout({ root: { props: {} }, content: [{ type: 'Image', props: { id: 'i', ...props } }] }, { context: 'page' }).ok, false, JSON.stringify(props));
    }
    assert.equal(validateLayout({ root: { props: {} }, content: [{ type: 'Columns', props: { id: 'c', col1Width: 95 } }] }, { context: 'page' }).ok, false);
    const ok = validateLayout({ root: { props: {} }, content: [{ type: 'Columns', props: { id: 'c', layout: '1-1-1-1', col1Width: 40, col2Width: 20, col3Width: 20, col4Width: 20, column4: [] } }] }, { context: 'page' });
    assert.equal(ok.ok, true);
    assert.equal(ok.layout.content[0].props.col4Width, 20);
    assert.ok(BOX_LIMITS.minWidth >= 20 && BOX_LIMITS.phoneMaxHeight <= 600);
  });

  it('page-only box fields are dropped from dashboard layouts', () => {
    const d = validateLayout({ root: { props: { hidden: [] } }, content: [{ type: 'Banner', props: { id: 'b', boxWidth: 50, heightPx: 300, size: 'compact' } }] }, { context: 'dashboard', widgetKeys: [] });
    assert.equal(d.ok, true);
    assert.equal('boxWidth' in d.layout.content[0].props, false);
    assert.equal('heightPx' in d.layout.content[0].props, false);
    assert.equal(d.layout.content[0].props.size, 'compact');
  });

  it('resize handles write validated properties through Puck state', () => {
    const overlay = read('components/cms/editor/CmsOverlay.jsx');
    assert.match(overlay, /type: 'replace'/);
    for (const prop of ['boxWidth', 'heightPx', 'col1Width', 'size']) assert.match(overlay, new RegExp(prop));
    assert.match(overlay, /ArrowLeft/);
  });
});

describe('Studio resume target', () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, sessionStorage: { getItem: (k) => store.get(`s:${k}`) ?? null, setItem: (k, v) => store.set(`s:${k}`, String(v)) } };

  it('remembers only editor routes, per administrator, and validates what it reads back', async () => {
    const { rememberTarget, lastTarget, forgetTarget, rememberReturnPath, returnPath } = await import('../src/pages/studio/studioSession.js');
    rememberTarget('u1', '/pages/student-resources', 'Page');
    rememberTarget('u1', '/studio/media', 'ignored');
    rememberTarget('u1', '/academics', 'ignored');
    assert.equal(lastTarget('u1').path, '/pages/student-resources');
    rememberTarget('u1', '/faculty', 'Faculty');
    assert.equal(lastTarget('u1').path, '/faculty');
    assert.equal(lastTarget('u2'), null);
    store.set('edunexus.studio.lastTarget.u3', JSON.stringify({ path: 'https://evil.example/' }));
    assert.equal(lastTarget('u3'), null);
    forgetTarget('u1', '/faculty');
    assert.equal(lastTarget('u1'), null);
    rememberReturnPath('/academics');
    assert.equal(returnPath(), '/academics');
    rememberReturnPath('//evil.example');
    assert.equal(returnPath(), '/academics');
  });
});

describe('Studio edits the page being viewed', () => {
  it('edit mode is only ever on for administrators', () => {
    assert.match(read('pages/studio/studioMode.jsx'), /const editing = Boolean\(isAdmin && on\)/);
  });

  it('route → editor mapping (source)', () => {
    const source = read('pages/studio/studioMode.jsx');
    assert.match(source, /\/\^\\\/pages\\\/\(\[a-z0-9\]\+/);
    assert.match(source, /persona: 'admin'/);
    assert.match(source, /persona: 'faculty'/);
    const layout = read('layouts/AppLayout.jsx');
    assert.match(layout, /editableTarget\(pathname\)/);
    assert.match(layout, /<InPlaceEditor target=\{target\} \/>/);
    assert.match(layout, /this page can&apos;t be edited/);
    const header = read('layouts/Header.jsx');
    assert.match(header, /studio\.editing \? 'Exit Studio' : 'Studio'/);
    assert.doesNotMatch(header, /to="\/studio"/, 'the Studio menu item no longer navigates away');
  });

  it('in-place editing never creates a page', () => {
    const source = read('pages/studio/InPlaceEditor.jsx');
    assert.doesNotMatch(source, /studioApi\.create|saveDashboard/);
  });
});

describe('Admin dashboard in Studio uses the real dashboard', () => {
  const sections = read('components/admin/adminDashboardSections.jsx');
  it('one shared implementation of every section, fed by one dashboard query', () => {
    assert.equal((sections.match(/adminApi\.getDashboard\(\)/g) ?? []).length, 1);
    for (const key of ['admin.hero', 'admin.communications', 'admin.tiers', 'admin.integrations', 'admin.operations', 'admin.audit', 'admin.sync']) assert.match(sections, new RegExp(`case '${key.replace('.', '\\.')}'`));
    for (const widget of ['AdminCommunicationAnalyticsWidget', 'AdminEmergencyBroadcastWidget', 'AdminApprovalsWidget', 'AdminSupportHelpdeskWidget', 'AdminFormsSurveysWidget', 'AdminDocumentsWidget', 'AdminInterventionsWidget', 'AdminAuditActivityWidget']) assert.match(sections, new RegExp(`<${widget}`));
  });
  it('the live page and the Studio canvas both render AdminDashboardSection', () => {
    const page = read('pages/admin/AdminDashboardPage.jsx');
    assert.match(page, /useAdminDashboardModel\(\)/);
    assert.match(page, /<AdminDashboardSection /);
    assert.doesNotMatch(page, /adminApi\./, 'the page no longer queries separately');
    const studio = read('pages/studio/StudioDashboards.jsx');
    assert.match(studio, /if \(persona === 'admin'\) return <AdminDashboardEditor \/>/);
    assert.match(studio, /renderWidget: \(\{ widgetKey, presentation \}\) => <AdminDashboardSection/);
  });
  it('Student and Faculty canvases keep their stand-ins', () => {
    const config = read('components/cms/puckConfig.jsx');
    assert.match(config, /else if \(type === 'DashboardWidget'\) render = \(props\) => <WidgetPlaceholder/);
  });
});

describe('Studio UI refinements', () => {
  it('every Add page option builds a layout the server accepts', async () => {
    const { TEMPLATES } = await import('../src/components/cms/templates.js');
    const keys = TEMPLATES.map((t) => t.key);
    for (const key of ['hub', 'link', 'office', 'services', 'team', 'contact', 'gallery', 'blank-1', 'blank-2', 'blank-70-30', 'blank-30-70', 'blank-3']) assert.ok(keys.includes(key), key);
    for (const t of TEMPLATES) assert.equal(validateLayout(t.build(), { context: 'page' }).ok, true, t.key);
    const seventy = validateLayout(TEMPLATES.find((t) => t.key === 'blank-70-30').build(), { context: 'page' }).layout.content[0].props;
    assert.deepEqual([seventy.col1Width, seventy.col2Width], [70, 30]);
  });

  it('the Add page dialog guards against duplicate submits and has no saved-templates section', () => {
    const dialog = read('pages/studio/AddPageDialog.jsx');
    assert.match(dialog, /if \(inFlight\.current\) return;/);
    assert.doesNotMatch(dialog, /Saved templates/i);
  });

  it('the Studio rail shows public/logo_icon.png and Sites & Pages opens a panel', () => {
    const rail = read('layouts/StudioRail.jsx');
    assert.match(rail, /src="\/logo_icon\.png"/);
    assert.match(rail, /label: 'Sites & Pages'.*panel: 'sites'/);
    for (const option of ['Create Page', 'Manage Pages', 'View Templates']) assert.match(rail, new RegExp(`label: '${option}'`));
  });

  it('theme presets: Royal Purple offered, Indigo & Light Gray retired but still renderable', async () => {
    const presets = await import('../../shared/appearancePresets.js');
    assert.ok(presets.THEME_KEYS.includes('royal-purple'));
    assert.equal(presets.findTheme('royal-purple').palette.primary.main, '#704D93');
    assert.ok(!presets.THEME_KEYS.includes('indigo-gray'));
    assert.ok(presets.RENDERABLE_THEME_KEYS.includes('indigo-gray'));
    assert.equal(presets.findTheme('indigo-gray').key, 'indigo-gray');
    assert.equal(presets.findTheme('unknown').key, presets.DEFAULT_THEME_KEY);
    assert.match(read('context/AppearanceContext.jsx'), /RENDERABLE_THEME_KEYS\.includes/);
  });
});

describe('forms, video and rich text (shared rules)', () => {
  it('video embeds are built only from a parsed id on approved player hosts', async () => {
    const { parseVideoUrl, videoEmbedUrl, VIDEO_PLAYER_HOSTS } = await import('../../shared/video.js');
    assert.deepEqual(VIDEO_PLAYER_HOSTS, ['https://www.youtube-nocookie.com', 'https://player.vimeo.com']);
    assert.match(videoEmbedUrl(parseVideoUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ')), /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?/);
    for (const bad of ['https://evil.example/watch?v=aqz-KE-bpKQ', 'javascript:alert(1)', '<iframe>', 'https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ']) assert.equal(parseVideoUrl(bad), null, bad);
    const block = read('components/cms/blocks/CmsBlocks.jsx');
    assert.match(block, /const src = videoEmbedUrl\(video\);/);
    assert.match(block, /sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"/);
  });

  it('rich HTML policy helpers', async () => {
    const { alignFromStyle, safeHref, safeImageSrc } = await import('../../shared/richHtml.js');
    assert.equal(alignFromStyle('text-align: center; color: red'), 'center');
    assert.equal(alignFromStyle('color: red'), null);
    assert.equal(safeHref('javascript:alert(1)'), null);
    assert.equal(safeHref('/help'), '/help');
    assert.equal(safeImageSrc('http://insecure.example/a.png'), null);
  });

  it('client form validation matches the server rules', async () => {
    const { validateFormDefinition, validateSubmission } = await import('../../shared/forms.js');
    const def = validateFormDefinition({ name: 'Student Resource Request', fields: [{ type: 'text', label: 'Full Name', name: 'full_name', required: true }, { type: 'email', label: 'Email', name: 'email', required: true }] });
    assert.equal(def.ok, true);
    assert.equal(validateSubmission(def.form.fields, { full_name: 'A', email: 'a@b.test' }).ok, true);
    assert.deepEqual(Object.keys(validateSubmission(def.form.fields, { email: 'nope', other: 1 }).errors).sort(), ['email', 'full_name', 'other']);
  });

  it('Studio wiring: Forms rail item, Form/Video blocks, lazy rich-text editor, rendering without raw HTML', () => {
    assert.match(read('layouts/StudioRail.jsx'), /to: '\/studio\/forms', label: 'Forms'/);
    const shared = readFileSync(new URL('../../shared/cmsBlocks.js', import.meta.url), 'utf8');
    assert.match(shared, /Video: \{/);
    assert.match(shared, /Form: \{/);
    assert.match(read('components/cms/puckConfig.jsx'), /lazy\(\(\) => import\('\.\/RichTextEditor'\)/);
    const safe = read('components/cms/SafeHtml.jsx');
    assert.match(safe, /new window\.DOMParser\(\)/);
    assert.doesNotMatch(safe, /dangerouslySetInnerHTML|innerHTML\s*=/);
  });
});
