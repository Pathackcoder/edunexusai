import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOGO_LIMITS, logoShapeProblem } from '../../shared/brandAssets.js';

/** One institution logo for the whole portal (Portal Appearance). */
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('institution logo', () => {
  it('one logo: no light/dark or crest slots anywhere in the UI or client', () => {
    const settings = read('pages/admin/InstitutionLogoSettings.jsx');
    assert.doesNotMatch(settings, /dark backgrounds|light backgrounds|Crest or icon|LOGO_SLOTS/);
    assert.match(read('services/api/appearanceApi.js'), /uploadLogo: \(dataBase64\) => apiClient\.put\('\/appearance\/logo', \{ dataBase64 \}\)/);
    assert.match(read('context/AppearanceContext.jsx'), /logo: sanitiseLogo\(value\?\.logo\)/);
  });

  it('every branding location uses the same uploaded logo, contained, with the bundled logo as fallback', () => {
    const brand = read('components/brand/Brand.jsx');
    assert.match(brand, /const uploaded = useInstitutionLogo\(\);/);
    assert.match(brand, /objectFit: 'contain'/);
    assert.match(brand, /onError=\{\(\) => setFailed\(custom\.url\)\}/);
    assert.match(read('components/login/LoginIntro.jsx'), /src=\{customLogo \? customLogo\.url : institution\.logoInverse\}/);
  });

  it('a chosen file is previewed and applied only on "Apply logo"', () => {
    const settings = read('pages/admin/InstitutionLogoSettings.jsx');
    assert.match(settings, /setPending\(\{ dataUrl, \.\.\.size, name: file\.name \}\)/);
    assert.match(settings, /appearanceApi\.uploadLogo\(pending\.dataUrl/);
  });

  it('shape rules: horizontal logos and square crests fit; banners and tall images do not', () => {
    assert.equal(logoShapeProblem(700, 200), null);
    assert.equal(logoShapeProblem(256, 256), null);
    assert.match(logoShapeProblem(1400, 100), /too wide/);
    assert.match(logoShapeProblem(100, 400), /too tall/);
    assert.match(logoShapeProblem(100, 20), /too small/);
    assert.equal(Object.keys(LOGO_LIMITS.types).includes('image/svg+xml'), false);
  });
});
