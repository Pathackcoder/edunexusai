import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Campus Directory: a separate, read-only people search served by the EdunexusAI backend. */
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (path) => readFileSync(join(SRC, path), 'utf8');
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));

describe('campus directory', () => {
  it('the browser calls only the EdunexusAI endpoint, never the Keycloak Admin REST API', () => {
    assert.match(read('services/api/directoryApi.js'), /apiClient\.get\('\/campus\/directory', \{ query: \{ search, page, pageSize \} \}\)/);
    for (const file of files(SRC).filter((f) => /\.(jsx?|mjs)$/.test(f))) {
      const text = readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /\/admin\/realms|openid-connect\/token|KEYCLOAK_DIRECTORY/, file);
    }
  });

  it('is its own page with no account actions; Users & Roles is unchanged', () => {
    const page = read('pages/campus/CampusDirectoryPage.jsx');
    assert.match(page, /directoryApi\.campus\(/);
    assert.doesNotMatch(page, /suspend|delete|deactivate|adminApi|Add user|Edit/i);
    assert.match(read('App.jsx'), /<Route path="campus\/directory" element=\{<CampusDirectoryPage \/>\} \/>/);
    assert.match(read('App.jsx'), /AdminUsersPage/);
  });

  it('sits next to People Search under Campus for the same people', () => {
    const nav = read('layouts/navigation.js');
    // Students: behind the same directory entitlement as People Search.
    assert.match(nav, /can\('feature\.directory'\) \? \[\{ label: 'People Search', path: '\/campus\/people' \}, \{ label: 'Campus Directory', path: '\/campus\/directory' \}\]/);
    // Faculty / staff / alumni and administrators: right after People Search.
    assert.equal(nav.match(/\{ label: 'People Search', path: '\/campus\/people' \},\n\s+\{ label: 'Campus Directory', path: '\/campus\/directory' \},/g)?.length, 2);
  });
});
