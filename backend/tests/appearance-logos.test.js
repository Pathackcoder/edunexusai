import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { api, closeTestServer, getTestServer, login } from './helpers/testEnv.js';
import { inspectImage } from '../src/modules/appearance/logoImage.js';

/**
 * Portal Appearance → institution logo: one logo per institution. The image is checked from its bytes,
 * written to the branding storage directory (the row keeps only its key), served publicly (the sign-in
 * page needs it) and can be reset to the bundled default. Theme and typography behave as before.
 */
const { prisma } = await import('../src/db/prisma.js');
let base;
let admin;
let tenant;
let storageDir;
const savedDir = process.env.BRANDING_STORAGE_DIR;

/** A real PNG of width × height (solid colour), built in memory. */
function png(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0x80)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const b64 = (buf) => buf.toString('base64');
const upload = (data, token = admin) => api('/appearance/logo', { method: 'PUT', token, body: { dataBase64: b64(data) } });
const files = async () => {
  const dir = path.join(storageDir, tenant.id);
  try { return (await readdir(dir)).filter((f) => !f.endsWith('.tmp')); } catch { return []; }
};
const origin = () => base.replace(/\/api\/v1$/, '');

before(async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), 'enx-branding-test-'));
  process.env.BRANDING_STORAGE_DIR = storageDir;
  ({ baseUrl: base } = await getTestServer());
  admin = await login('admin');
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  await prisma.tenantBrandAsset.deleteMany({ where: { tenantId: tenant.id } });
});

after(async () => {
  await prisma.tenantBrandAsset.deleteMany({ where: { tenantId: tenant.id } });
  if (savedDir === undefined) delete process.env.BRANDING_STORAGE_DIR;
  else process.env.BRANDING_STORAGE_DIR = savedDir;
  await rm(storageDir, { recursive: true, force: true });
  await closeTestServer();
});

describe('reading an image from its bytes', () => {
  it('PNG, JPEG and WebP with their sizes; anything else is refused', () => {
    assert.deepEqual(inspectImage(png(700, 200)), { mimeType: 'image/png', width: 700, height: 200 });
    const jpeg = Buffer.concat([Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex'), Buffer.from('ffc0001108006400c803012200021101031101', 'hex'), Buffer.alloc(8)]);
    assert.deepEqual(inspectImage(jpeg), { mimeType: 'image/jpeg', width: 200, height: 100 });
    const webp = Buffer.alloc(30); webp.write('RIFF', 0); webp.write('WEBP', 8); webp.write('VP8X', 12); webp.writeUIntLE(699, 24, 3); webp.writeUIntLE(199, 27, 3);
    assert.deepEqual(inspectImage(webp), { mimeType: 'image/webp', width: 700, height: 200 });
    assert.equal(inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')), null);
    assert.equal(inspectImage(Buffer.from('GIF89a' + '\0'.repeat(30))), null);
    assert.equal(inspectImage(Buffer.from('just some text pretending to be an image')), null);
  });
});

describe('one institution logo in Portal Appearance', () => {
  it('starts with the bundled logo (no custom logo)', async () => {
    const res = await api('/appearance');
    assert.equal(res.body.data.logo, null);
    assert.equal('logos' in res.body.data, false, 'no per-background variants');
    assert.equal((await api('/appearance/logo/demo-university')).status, 404);
  });

  it('only administrators can change it', async () => {
    assert.equal((await upload(png(700, 200), await login('student'))).status, 403);
    assert.equal((await upload(png(700, 200), await login('faculty'))).status, 403);
    assert.equal((await api('/appearance/logo', { method: 'PUT', body: { dataBase64: b64(png(700, 200)) } })).status, 401);
    assert.equal((await api('/appearance/logo', { method: 'DELETE', token: await login('student') })).status, 403);
  });

  it('refuses the wrong kind of file and unusable shapes, with a clear reason; nothing is written', async () => {
    const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    assert.equal(svg.status, 400);
    assert.match(svg.body.error.message, /PNG, JPEG or WebP/);
    assert.match((await upload(png(1400, 100))).body.error.message, /too wide/);
    assert.match((await upload(png(100, 400))).body.error.message, /too tall/);
    assert.match((await upload(png(100, 20))).body.error.message, /too small/);
    assert.equal((await upload(Buffer.concat([png(700, 200), Buffer.alloc(1024 * 1024)]))).status, 400, 'over 1 MB');
    assert.equal((await api('/appearance/logo', { method: 'PUT', token: admin, body: { dataBase64: b64(png(700, 200)), kind: 'dark' } })).status, 400, 'no slot parameter any more');
    assert.equal(await prisma.tenantBrandAsset.count({ where: { tenantId: tenant.id } }), 0);
    assert.deepEqual(await files(), []);
  });

  it('a horizontal logo and a square crest are both accepted; the file is on disk, not in the database', async () => {
    const res = await upload(png(700, 200));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { logo } = res.body.data;
    assert.match(logo.url, /^\/api\/v1\/appearance\/logo\/demo-university\?v=[0-9a-f]{16}$/);
    assert.deepEqual([logo.width, logo.height], [700, 200]);
    const row = await prisma.tenantBrandAsset.findUnique({ where: { tenantId_kind: { tenantId: tenant.id, kind: 'logo' } } });
    assert.equal(row.data, null, 'no image bytes in the database');
    assert.match(row.storageKey, new RegExp(`^${tenant.id}/[0-9a-f]{64}\\.png$`));
    assert.equal((await stat(path.join(storageDir, row.storageKey))).size, png(700, 200).length);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'APPEARANCE_LOGO_UPDATED' }, orderBy: { createdAt: 'desc' } });
    assert.match(audit.summary, /Institution logo replaced \(PNG, 700 × 200 px\)/);
    assert.equal((await upload(png(256, 256))).status, 200, 'a square crest is fine too');
  });

  it('public retrieval without a session, served safely; each version cached for good', async () => {
    const replaced = (await upload(png(700, 200))).body.data.logo;
    const file = await fetch(`${origin()}${replaced.url}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.match(file.headers.get('content-security-policy'), /default-src 'none'; sandbox/);
    assert.match(file.headers.get('cache-control'), /immutable/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), png(700, 200));
    assert.equal((await fetch(`${origin()}${replaced.url}`, { headers: { 'If-None-Match': file.headers.get('etag') } })).status, 304);
    const unversioned = await fetch(`${origin()}/api/v1/appearance/logo/demo-university`);
    assert.equal(unversioned.headers.get('cache-control'), 'no-cache', 'an address without the version is always revalidated');
  });

  it('replacing gives a new address and removes the old file; other institutions and bad addresses find nothing', async () => {
    const first = (await api('/appearance')).body.data.logo.url;
    const second = (await upload(png(720, 200))).body.data.logo.url;
    assert.notEqual(second, first);
    assert.equal((await files()).length, 1, 'only the current file is kept');
    assert.equal((await api('/appearance/logo/another-university')).status, 404);
    assert.equal((await api('/appearance/logo/Bad_Slug!')).status, 400);
  });

  it('a missing file never breaks the page: the logo address answers 404 and the client shows the default', async () => {
    const row = await prisma.tenantBrandAsset.findUnique({ where: { tenantId_kind: { tenantId: tenant.id, kind: 'logo' } } });
    await rm(path.join(storageDir, row.storageKey));
    assert.equal((await fetch(`${origin()}${(await api('/appearance')).body.data.logo.url}`)).status, 404);
    await upload(png(700, 200));
  });

  it('theme and typography saves keep the logo; logo changes keep the theme; reset restores the default', async () => {
    const saved = await api('/appearance', { method: 'PUT', token: admin, body: { themeKey: 'teal-white', fontKey: 'collegiate-serif' } });
    assert.equal(saved.status, 200);
    assert.ok(saved.body.data.logo);
    const afterLogo = (await upload(png(710, 200))).body.data;
    assert.deepEqual([afterLogo.themeKey, afterLogo.fontKey], ['teal-white', 'collegiate-serif']);
    const me = await api('/auth/me', { token: await login('faculty') });
    assert.deepEqual(me.body.data.user.appearance, { themeKey: 'teal-white', fontKey: 'collegiate-serif' }, 'the session shape is unchanged');
    const reset = await api('/appearance/logo', { method: 'DELETE', token: admin });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.data.logo, null);
    assert.deepEqual([reset.body.data.themeKey, reset.body.data.fontKey], ['teal-white', 'collegiate-serif']);
    assert.deepEqual(await files(), [], 'the file is removed');
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'APPEARANCE_LOGO_RESET' } }));
  });
});
