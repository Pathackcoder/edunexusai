import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The public site and the Alumni view: guard rails in the source. */
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('public site (no account)', () => {
  it('reads only the public API, without a token', () => {
    const api = read('services/api/publicApi.js');
    assert.match(api, /\/public\/\$\{encodeURIComponent\(tenant\)\}\/home`, \{ auth: false \}/);
    assert.match(api, /\/public\/\$\{encodeURIComponent\(tenant\)\}\/pages\/\$\{encodeURIComponent\(slug\)\}`, \{ auth: false \}/);
    const page = read('pages/public/PublicLandingPage.jsx');
    assert.doesNotMatch(page, /contentApi|sisApi|workflowApi|lmsApi|useAuth/, 'no signed-in API or session on the public site');
  });

  it('is routed outside the signed-in layout and linked from the login page', () => {
    const app = read('App.jsx');
    assert.match(app, /<Route path="\/visit" element=\{<Suspense fallback=\{<FullPageLoader \/>\}><PublicLandingPage \/><\/Suspense>\} \/>/);
    assert.match(app, /<Route path="\/visit\/pages\/:slug"/);
    assert.match(read('pages/LoginPage.jsx'), /to="\/visit"/);
  });

  it('public pages never render blocks that read signed-in data', () => {
    assert.match(read('pages/public/PublicLandingPage.jsx'), /<CmsPageRenderer layout=\{data\.layout\} publicView \/>/);
    const config = read('components/cms/puckConfig.jsx');
    assert.match(config, /export const SIGNED_IN_BLOCKS = \['AnnouncementsFeed', 'FaqList', 'EventsList', 'Form'\]/);
    assert.match(config, /publicView && SIGNED_IN_BLOCKS\.includes\(type\)/);
  });
});

describe('alumni and audiences in the Studio', () => {
  it('Studio offers Alumni everywhere and Public except on forms', () => {
    const common = read('pages/studio/studioCommon.jsx');
    assert.match(common, /\['alumni', 'Alumni'\]\]/);
    assert.match(read('pages/studio/StudioForms.jsx'), /\{AUDIENCE_OPTIONS\.map/);
    assert.doesNotMatch(read('pages/studio/StudioForms.jsx'), /PUBLIC_AUDIENCE_OPTION/);
    assert.match(read('pages/studio/StudioContentList.jsx'), /\[\.\.\.AUDIENCE_OPTIONS, PUBLIC_AUDIENCE_OPTION\]/);
  });

  it('the Alumni view asks for alumni content only', () => {
    const view = read('pages/dashboard/CommunityContextDashboard.jsx');
    assert.match(view, /contentApi\.announcements\(\{ audience, limit: 5 \}\)/);
    assert.match(view, /contentApi\.pages\(\{ audience \}\)/);
    assert.match(view, /cmsAudience: 'alumni'/);
  });
});
