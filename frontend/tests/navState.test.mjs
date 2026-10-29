import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupOwnsPath } from '../src/layouts/navState.js';

const accessControl = { id: 'admin-access', pathPrefix: '/admin', children: [{ path: '/admin/users' }, { path: '/admin/roles' }, { path: '/admin/entitlements' }] };
const teaching = { id: 'faculty-teaching', pathPrefix: '/faculty', children: [{ path: '/faculty/courses' }, { path: '/faculty/gradebook' }] };

describe('sidebar group ownership', () => {
  it('does not open Access Control for Integrations or Portal Appearance', () => {
    assert.equal(groupOwnsPath(accessControl, '/admin/integrations'), false);
    assert.equal(groupOwnsPath(accessControl, '/admin/integrations/moodle'), false);
    assert.equal(groupOwnsPath(accessControl, '/admin/appearance'), false);
  });
  it('opens a group for its own children and their sub-routes', () => {
    assert.equal(groupOwnsPath(accessControl, '/admin/users'), true);
    assert.equal(groupOwnsPath(accessControl, '/admin/roles'), true);
    assert.equal(groupOwnsPath(teaching, '/faculty/courses/abc'), true);
  });
  it('does not match a sibling that merely shares a prefix', () => {
    assert.equal(groupOwnsPath(accessControl, '/admin/usersettings'), false);
    assert.equal(groupOwnsPath({ children: [] }, '/anything'), false);
  });
});
