import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Institutional sign-in and role administration: guard rails in the source.
 */
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (path) => readFileSync(join(SRC, path), 'utf8');

describe('institutional sign-in in the browser', () => {
  it('the login page offers the institution’s sign-in options next to the password form', () => {
    assert.match(read('pages/LoginPage.jsx'), /<InstitutionSignIn error=\{ssoError\} \/>/);
    const button = read('components/login/InstitutionSignIn.jsx');
    assert.match(button, /href=\{ssoApi\.startUrl\(p\.tenant, p\.key, '\/dashboard'\)\}/, 'a full-page navigation to the API start address');
    assert.match(button, /SSO_ERROR_MESSAGES\[error\] \?\? SSO_ERROR_MESSAGES\.SIGN_IN_FAILED/, 'unknown error codes fall back to a generic message');
  });

  it('the completion page takes the code from the fragment, clears it at once and only returns to same-site paths', () => {
    const page = read('pages/SsoCompletePage.jsx');
    assert.match(page, /new URLSearchParams\(window\.location\.hash\.slice\(1\)\)/);
    assert.match(page, /window\.history\.replaceState\(null, '', window\.location\.pathname\)/);
    assert.match(page, /value\.startsWith\('\/'\) && !value\.startsWith\('\/\/'\) && !value\.includes\('\\\\'\)/);
    assert.match(read('App.jsx'), /<Route path="\/auth\/sso\/complete" element=\{<SsoCompletePage \/>\} \/>/);
  });

  it('logout follows the provider’s end-session address when the session came from it', () => {
    assert.match(read('context/AuthContext.jsx'), /if \(providerLogoutUrl\) window\.location\.assign\(providerLogoutUrl\)/);
    assert.match(read('services/api/authApi.js'), /return result\?\.providerLogoutUrl \?\? null/);
  });

  it('the exchange keeps the session where password sign-in keeps it', () => {
    assert.match(read('services/api/ssoApi.js'), /tokenStore\.set\(\{ accessToken: data\.accessToken, refreshToken: data\.refreshToken \}\)/);
  });
});

describe('role administration', () => {
  it('Student and Faculty are added by linking the institutional record, never by a toggle', () => {
    const drawer = read('components/admin/AccountAccessDrawer.jsx');
    assert.match(drawer, /option\.how === 'LINK_SIS_RECORD' && <Button size="sm" variant="secondary" onClick=\{\(\) => setLinkType\(option\.key\)\}>Link CampusCore record<\/Button>/);
    assert.match(drawer, /option\.how === 'ASSIGN' && option\.key !== 'ADMIN'/, 'only roles the server marks assignable get an Add button');
    assert.match(drawer, /adminApi\.linkRecord\(userId, \{ recordType: type, sisRecordId: selected/);
  });

  it('administrator access needs an explicit confirmation; removals are confirmed', () => {
    const drawer = read('components/admin/AccountAccessDrawer.jsx');
    assert.match(drawer, /adminApi\.addRole\(userId, \{ role: 'ADMIN', confirm: true \}\)/);
    assert.match(drawer, /disabled=\{!adminAck \|\| busy\}/);
    assert.match(drawer, /title=\{`Remove the \$\{ROLE_LABEL\[confirm\.role\]\} role\?`\}/);
  });

  it('the user list shows every role of an account with its record status', () => {
    const page = read('pages/admin/AdminUsersPage.jsx');
    assert.match(page, /user\.roleDetails/);
    assert.match(page, /const ROLES = \['STUDENT', 'FACULTY', 'STAFF', 'ALUMNI', 'ADMIN'\]/);
    assert.match(page, /<AccountAccessDrawer userId=\{accessFor\}/);
  });

  it('the sign-in administration never asks for or shows a client secret, and maps to community roles only', () => {
    const page = read('pages/admin/AdminSignInPage.jsx');
    assert.doesNotMatch(page, /clientSecret[^E]/, 'only the NAME of the server variable is handled');
    assert.match(page, /label="Server variable holding the client secret"/);
    const targets = page.slice(page.indexOf('const TARGETS'), page.indexOf('];', page.indexOf('const TARGETS')));
    assert.doesNotMatch(targets, /ADMIN/);
    assert.match(read('App.jsx'), /path="admin\/sign-in" element=\{<RoleRoute allow=\{\['ADMIN'\]\}><AdminSignInPage \/><\/RoleRoute>\}/);
  });
});
