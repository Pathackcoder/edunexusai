import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('User onboarding UI', () => {
  it('Users & Roles adds people through the unified onboarding, not the local-only create', () => {
    const page = read('pages/admin/AdminUsersPage.jsx');
    assert.match(page, /OnboardPersonDialog/);
    assert.doesNotMatch(page, /adminApi\.createUser\(/);
    assert.match(read('components/admin/OnboardPersonDialog.jsx'), /adminApi\.onboardPerson\(/);
  });

  it('never puts a password in browser storage, URLs or logs', () => {
    for (const file of ['components/admin/OnboardPersonDialog.jsx', 'components/admin/PersonSystemsDialog.jsx', 'components/auth/ChangePasswordForm.jsx']) {
      const source = read(file);
      assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\.(log|info|debug)/, file);
      assert.doesNotMatch(source, /[?&]password=/, file);
    }
  });

  it('forces a temporary password to be replaced before the portal is shown', () => {
    const app = read('App.jsx');
    assert.match(app, /passwordChangeRequired\) return <PasswordChangeRequired \/>/);
  });
});
