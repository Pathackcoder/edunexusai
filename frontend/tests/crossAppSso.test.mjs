import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Cross-application sign-in: the CampusCore entry and the two sign-out choices. */
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('university systems and sign-out', () => {
  it('the sidebar lists only the apps the server offers, opening them in a new tab', () => {
    const sidebar = read('layouts/Sidebar.jsx');
    assert.match(sidebar, /\(user\?\.apps \?\? \[\]\)\.length > 0/);
    assert.match(sidebar, /component="a" href=\{app\.url\} target="_blank" rel="noopener noreferrer"/);
  });

  it('an SSO session can sign out of EdunexusAI only, or of all university apps', () => {
    const header = read('layouts/Header.jsx');
    assert.match(header, /handleLogout\(\{ everywhere: false \}\)/);
    assert.match(header, /handleLogout\(\{ everywhere: true \}\)/);
    assert.match(header, /ssoSession && \(/, 'the local-only choice is offered only to SSO sessions');
    assert.match(read('services/api/authApi.js'), /\{ refreshToken: tokenStore\.getRefreshToken\(\) \?\? undefined, everywhere \}/);
  });
});
