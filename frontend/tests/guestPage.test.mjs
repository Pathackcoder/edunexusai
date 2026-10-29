import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Guest page (/visit) layout and expandable behaviour. Regression for: opening one FAQ made the card
 * next to it grow too, because both sat in a stretched grid row with `height: '100%'`.
 */
const read = (path) => readFileSync(new URL(`../src/pages/public/${path}`, import.meta.url), 'utf8');
const page = read('PublicLandingPage.jsx');
const shell = read('GuestShell.jsx');

describe('guest page expandable content', () => {
  it('the FAQ group owns its open item, keyed by each question’s id', () => {
    assert.match(page, /const \[openId, setOpenId\] = useState\(null\)/);
    assert.match(page, /expanded=\{openId === f\.id\}/);
    assert.match(page, /onChange=\{\(_event, isOpen\) => setOpenId\(isOpen \? f\.id : null\)\}/);
    assert.match(page, /key=\{f\.id\}/);
    assert.match(page, /aria-controls=\{`\$\{domId\}-answer`\}/);
  });

  it('no card is stretched to its row: no height 100%, shared stretched grids not used', () => {
    assert.doesNotMatch(page, /height: '100%'/);
    assert.doesNotMatch(page, /DashboardGrid|GridItem|WidgetCard/);
    assert.match(page, /gridTemplateColumns: \{ xs: 'minmax\(0, 1fr\)', md: 'minmax\(0, 7fr\) minmax\(0, 5fr\)' \}, alignItems: 'start'/, 'the news + dates row is top-aligned');
  });

  it('the pages menu and the mobile drawer have separate state and ids', () => {
    assert.match(shell, /const \[pagesAnchor, setPagesAnchor\] = useState\(null\)/);
    assert.match(shell, /const \[drawerOpen, setDrawerOpen\] = useState\(false\)/);
    assert.match(shell, /id="guest-pages-menu"/);
    assert.match(shell, /id="guest-nav-drawer"/);
  });

  it('the only signed-in destination is the existing sign-in page', () => {
    for (const src of [page, shell]) {
      assert.doesNotMatch(src, /useAuth|contentApi|sisApi|workflowApi|lmsApi|to="\/dashboard"/);
    }
    assert.match(shell, /to="\/login"/);
  });
});
