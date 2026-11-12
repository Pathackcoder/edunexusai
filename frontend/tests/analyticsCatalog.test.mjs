import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FEATURES, PAGES, PAGE_KEYS, REDIRECT_PATHS, WIDGETS, pageByKey, pageKeyForPath, resolveContextRole,
} from '../../shared/analyticsCatalog.js';
import { facultyWidgets } from '../../shared/facultyWidgets.js';
import { staffWidgets, alumniWidgets } from '../../shared/communityWidgets.js';
import { ADMIN_SECTIONS } from '../../shared/cmsBlocks.js';

const read = (path) => fs.readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

/** Every `<Route path="…">` under the signed-in shell, as a full path. */
function shellRoutes() {
  const app = read('../src/App.jsx');
  const shell = app.slice(app.indexOf('<AppLayout />'), app.indexOf('<Route path="*"'));
  const paths = [...shell.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => `/${match[1]}`).filter((path) => path !== '/studio/*');
  const studio = [...read('../src/pages/studio/StudioApp.jsx').matchAll(/<Route path="([^"*]+)"/g)].map((match) => `/studio/${match[1]}`);
  return [...paths, ...studio];
}

describe('analytics page catalogue', () => {
  it('classifies every signed-in route (a new route must be added to the catalogue)', () => {
    const routes = shellRoutes();
    assert.ok(routes.length > 70, `expected the route list, found ${routes.length}`);
    const missing = routes.filter((route) => !REDIRECT_PATHS.includes(route) && !pageKeyForPath(route.replace(/:[A-Za-z]+/g, 'x1')));
    assert.deepEqual(missing, []);
  });

  it('never tracks the login page, the public site or the sign-in hand-off', () => {
    for (const path of ['/login', '/visit', '/visit/pages/admissions', '/auth/sso/complete', '/nowhere']) assert.equal(pageKeyForPath(path), null, path);
  });

  it('turns a path into a key that carries no record id, slug or query string', () => {
    assert.equal(pageKeyForPath('/faculty/courses/3f2a9c1e-77aa-4c1d-9c0e-1b2f3a4d5e6f'), 'faculty.course_detail');
    assert.equal(pageKeyForPath('/admin/integrations/8b0d'), 'admin.integration_detail');
    assert.equal(pageKeyForPath('/admin/integrations/moodle'), 'admin.integration_moodle');
    assert.equal(pageKeyForPath('/pages/financial-hardship-fund'), 'cms.page');
    assert.equal(pageKeyForPath('/studio/pages/42/edit'), 'studio.page_editor');
    assert.equal(pageKeyForPath('/campus/people?q=jane%20doe'), 'campus.people');
    assert.equal(pageKeyForPath('/dashboard?view=faculty'), 'dashboard');
    for (const key of PAGE_KEYS) assert.match(key, /^[a-z_]+(\.[a-z_]+)?$/);
  });

  it('gives every page a label and a section, and keeps keys unique per page', () => {
    for (const page of PAGES) {
      assert.ok(page.label && page.section, page.key);
      assert.equal(pageByKey(page.key).label, PAGES.find((entry) => entry.key === page.key).label);
    }
  });

  it('lists exactly the widgets the dashboards render', () => {
    const keys = new Set(WIDGETS.map((widget) => widget.key));
    const student = [...read('../src/pages/dashboard/StudentDashboard.jsx').matchAll(/key: '(dashboard\.[a-z_]+)'/g)].map((match) => match[1]);
    const faculty = [...read('../src/pages/faculty/FacultyDashboardPage.jsx').matchAll(/key: '(faculty\.[a-z_]+)'/g)].map((match) => match[1]);
    assert.ok(student.length >= 9 && faculty.length >= 9);
    for (const key of [...student, ...faculty, ...ADMIN_SECTIONS.map((s) => s.key), ...staffWidgets.map((w) => w.key), ...alumniWidgets.map((w) => w.key)]) assert.ok(keys.has(key), `${key} is not in the analytics catalogue`);
    for (const key of faculty) assert.ok(facultyWidgets.some((widget) => widget.key === key) || keys.has(key));
    assert.equal(keys.size, WIDGETS.length);
  });

  it('lets the browser record only browser features', () => {
    assert.ok(FEATURES.some((feature) => feature.origin === 'SERVER') && FEATURES.some((feature) => feature.origin === 'BROWSER'));
    assert.equal(new Set(FEATURES.map((feature) => feature.key)).size, FEATURES.length);
  });
});

describe('workspace (context) of a page view', () => {
  it('uses the page\'s own role for role pages, and refuses a page the account cannot open', () => {
    assert.equal(resolveContextRole('academics.grades', { rolesHeld: ['STUDENT'] }), 'STUDENT');
    assert.equal(resolveContextRole('academics.grades', { rolesHeld: ['FACULTY'] }), null);
    assert.equal(resolveContextRole('faculty.courses', { rolesHeld: ['ADMIN'] }), 'ADMIN');
    assert.equal(resolveContextRole('faculty.courses', { rolesHeld: ['FACULTY', 'ADMIN'] }), 'FACULTY');
    assert.equal(resolveContextRole('admin.users', { rolesHeld: ['STUDENT', 'FACULTY'] }), null);
    assert.equal(resolveContextRole('not.a.page', { rolesHeld: ['ADMIN'] }), null);
  });

  it('counts shared pages under the single role, or as shared for a multi-role account', () => {
    assert.equal(resolveContextRole('campus.map', { rolesHeld: ['ALUMNI'] }), 'ALUMNI');
    assert.equal(resolveContextRole('campus.map', { rolesHeld: ['STUDENT', 'FACULTY'] }), 'SHARED');
    assert.equal(resolveContextRole('campus.map', { rolesHeld: [] }), null);
  });

  it('accepts a dashboard view only when the account really has it', () => {
    const rolesHeld = ['STUDENT', 'FACULTY'];
    assert.equal(resolveContextRole('dashboard', { rolesHeld, view: 'faculty' }), 'FACULTY');
    assert.equal(resolveContextRole('dashboard', { rolesHeld, view: 'student' }), 'STUDENT');
    assert.equal(resolveContextRole('dashboard', { rolesHeld, view: 'overview' }), 'SHARED');
    assert.equal(resolveContextRole('dashboard', { rolesHeld, view: 'admin' }), 'SHARED');
    assert.equal(resolveContextRole('dashboard', { rolesHeld: ['STUDENT'], view: 'admin' }), 'STUDENT');
  });
});
