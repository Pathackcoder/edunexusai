import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  activeContextsOf,
  canIn,
  dashboardViews,
  isMultiRole,
  resolveView,
  unlinkedContextsOf,
  workspacesOf,
} from '../src/context/roleContexts.js';

/**
 * Multi-role portal (Phase 2): views, entitlements per context and the guard rails in the source.
 */
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (path) => readFileSync(join(SRC, path), 'utf8');

const ctx = (key, status = 'ACTIVE', entitlements = []) => ({ key, role: key.toUpperCase(), status, entitlements });
const student = { id: 's', roles: ['STUDENT'], persona: 'STUDENT', entitlements: ['dashboard.schedule'], contexts: [ctx('student', 'ACTIVE', ['dashboard.schedule', 'feature.lms'])], workspaces: [] };
const faculty = { id: 'f', roles: ['FACULTY'], persona: 'FACULTY', contexts: [ctx('faculty', 'ACTIVE', ['faculty.summary'])], workspaces: [] };
const admin = { id: 'a', roles: ['ADMIN'], persona: 'ADMIN', contexts: [], workspaces: ['admin'] };
const rahul = {
  id: 'r', roles: ['STUDENT', 'FACULTY'], persona: 'FACULTY',
  entitlements: ['dashboard.schedule', 'faculty.summary'],
  contexts: [ctx('faculty', 'ACTIVE', ['faculty.summary']), ctx('student', 'ACTIVE', ['dashboard.schedule'])],
  workspaces: [],
};
const unlinked = { id: 'u', roles: ['STUDENT', 'FACULTY'], contexts: [ctx('faculty', 'ACTIVE', ['faculty.summary']), ctx('student', 'UNLINKED')], workspaces: [] };
const adminFaculty = { id: 'af', roles: ['ADMIN', 'FACULTY'], contexts: [ctx('faculty', 'ACTIVE')], workspaces: ['admin'] };

describe('views', () => {
  it('a single-role account gets exactly one view and no switcher', () => {
    assert.deepEqual(dashboardViews(student).map((v) => v.key), ['student']);
    assert.deepEqual(dashboardViews(faculty).map((v) => v.key), ['faculty']);
    assert.deepEqual(dashboardViews(admin).map((v) => v.key), ['admin']);
    for (const user of [student, faculty, admin]) assert.equal(isMultiRole(user), false);
  });

  it('a student who teaches gets Overview, Teaching and Studying, under one account', () => {
    assert.equal(isMultiRole(rahul), true);
    assert.deepEqual(dashboardViews(rahul).map((v) => [v.key, v.label]), [['overview', 'Overview'], ['faculty', 'Teaching'], ['student', 'Studying']]);
  });

  it('an administrator who teaches gets the admin workspace beside the teaching context', () => {
    assert.deepEqual(dashboardViews(adminFaculty).map((v) => [v.key, v.kind]), [['overview', 'overview'], ['faculty', 'context'], ['admin', 'workspace']]);
  });

  it('an unlinked role gets no view, no widgets and is reported instead', () => {
    assert.deepEqual(activeContextsOf(unlinked).map((c) => c.key), ['faculty']);
    assert.deepEqual(unlinkedContextsOf(unlinked).map((c) => c.key), ['student']);
    assert.equal(isMultiRole(unlinked), false, 'one usable role is a single-role experience');
    assert.equal(canIn(unlinked, 'student', 'dashboard.schedule'), false);
  });

  it('an older session payload without contexts falls back to the legacy persona', () => {
    const legacy = { id: 'l', roles: ['STUDENT'], entitlements: ['dashboard.schedule'] };
    assert.deepEqual(dashboardViews(legacy).map((v) => v.key), ['student']);
    assert.deepEqual(workspacesOf({ roles: ['ADMIN'] }), ['admin']);
    assert.equal(canIn(legacy, 'student', 'dashboard.schedule'), true);
  });
});

describe('which view opens', () => {
  it('URL first, then the remembered view, then Overview; never a view the account lacks', () => {
    assert.equal(resolveView(rahul, {}), 'overview');
    assert.equal(resolveView(rahul, { remembered: 'student' }), 'student');
    assert.equal(resolveView(rahul, { requested: 'faculty', remembered: 'student' }), 'faculty');
    assert.equal(resolveView(rahul, { requested: 'admin' }), 'overview', 'a hand-edited URL cannot open the admin workspace');
    assert.equal(resolveView(student, { requested: 'faculty', remembered: 'admin' }), 'student');
  });
});

describe('entitlements are per context, not the union', () => {
  it('a widget is offered only by the context it belongs to', () => {
    assert.equal(canIn(rahul, 'student', 'dashboard.schedule'), true);
    assert.equal(canIn(rahul, 'faculty', 'dashboard.schedule'), false);
    assert.equal(canIn(rahul, 'student', 'faculty.summary'), false);
    assert.equal(canIn(rahul, 'faculty', 'faculty.summary'), true);
  });
});

describe('multi-role guard rails in the source', () => {
  it('the student dashboard reads the student context endpoint', () => {
    assert.match(read('services/api/dashboardApi.js'), /getStudent: \(\) => apiClient\.get\('\/dashboard\/student'/);
    assert.match(read('pages/dashboard/StudentDashboard.jsx'), /useApiQuery\(\(\) => dashboardApi\.getStudent\(\)\)/);
  });

  it('/dashboard keeps the single-role path and adds the multi-role one', () => {
    const page = read('pages/DashboardPage.jsx');
    assert.match(page, /if \(isMultiRole\) return <MultiRoleDashboard \/>/);
    assert.match(page, /const single = isAdmin \? <AdminDashboardPage \/> : isFaculty \? <FacultyDashboardPage \/>\s+: only === 'staff' \|\| only === 'alumni' \? <CommunityContextDashboard contextKey=\{only\} \/> : <StudentDashboard \/>;/);
    assert.match(page, /if \(!unlinkedContexts\.length\) return single;/);
  });

  it('switching views only changes ?view= (no new sign-in) and is validated against the account', () => {
    const multi = read('pages/dashboard/MultiRoleDashboard.jsx');
    assert.match(multi, /next\.set\('view', key\)/);
    assert.match(multi, /resolveView\(user, \{ requested: params\.get\('view'\)/);
    assert.doesNotMatch(multi, /login|logout|tokenStore/);
  });

  it('the sidebar groups per active context and gates student links with the student context', () => {
    const nav = read('layouts/navigation.js');
    assert.match(nav, /can: \(key\) => canIn\('student', key\)/);
    assert.match(read('layouts/Sidebar.jsx'), /buildNavGroups\(\{ isAdmin, isFaculty, can, canIn, contexts: contexts\.map\(\(c\) => c\.key\)/);
  });

  it('the session refreshes on focus so role changes reach the UI without signing in again', () => {
    assert.match(read('context/AuthContext.jsx'), /addEventListener\('focus', onFocus\)/);
  });
});
