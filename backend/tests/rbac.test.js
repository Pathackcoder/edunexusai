import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';

after(closeTestServer);

/**
 * Access control is enforced server-side. These assertions are the reason the frontend
 * can hide links without that being the security boundary.
 */
describe('role-based access control', () => {
  it('denies a student every admin route', async () => {
    const token = await login('student');
    for (const path of ['/admin/users', '/admin/roles', '/admin/integrations', '/admin/widget-entitlements']) {
      const { status, body } = await api(path, { token });
      assert.equal(status, 403, `${path} should be forbidden for a student`);
      assert.equal(body.error.code, 'FORBIDDEN');
    }
  });

  it('denies a student the faculty routes', async () => {
    const token = await login('student');
    const { status, body } = await api('/faculty/courses', { token });
    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('denies faculty the admin routes', async () => {
    const token = await login('faculty');
    const { status } = await api('/admin/users', { token });
    assert.equal(status, 403);
  });

  it('denies faculty the student-scoped academic routes', async () => {
    const token = await login('faculty');
    for (const path of ['/courses', '/grades', '/finance', '/financial-aid']) {
      const { status } = await api(path, { token });
      assert.equal(status, 403, `${path} should be forbidden for faculty`);
    }
  });

  it('allows an admin the admin routes', async () => {
    const token = await login('admin');
    const { status, body } = await api('/admin/users', { token });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
  });

  it('lets any authenticated persona read institutional content', async () => {
    for (const persona of ['student', 'faculty', 'admin']) {
      const token = await login(persona);
      const calendar = await api('/calendar', { token });
      const help = await api('/help', { token });
      assert.equal(calendar.status, 200, `${persona} should read the calendar`);
      assert.equal(help.status, 200, `${persona} should read help content`);
    }
  });
});
