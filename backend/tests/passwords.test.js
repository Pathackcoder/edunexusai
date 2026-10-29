import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { api, closeTestServer, login, signInFirstTime } from './helpers/testEnv.js';

/**
 * Password storage and temporary passwords. Every new or changed password is a bcrypt hash;
 * a legacy plaintext row (from the retired development setting) still signs in and is hashed
 * on that login; administrator-issued passwords must be replaced at first sign-in.
 */

const EMAILS = ['pw.bcrypt@feddrick.edu', 'pw.plain@feddrick.edu', 'pw.admin.created@feddrick.edu'];
let prisma;
let passwords;

before(async () => {
  ({ prisma } = await import('../src/db/prisma.js'));
  passwords = await import('../src/modules/auth/passwords.js');
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-university' } });
  const student = await prisma.role.findUnique({ where: { key: 'STUDENT' } });
  for (const [email, passwordHash] of [[EMAILS[0], await bcrypt.hash('Hashed#Pass2026', 4)], [EMAILS[1], 'Plain#Pass2026']]) {
    await prisma.user.create({ data: { tenantId: tenant.id, email, passwordHash, firstName: 'Pw', lastName: 'Test', userRoles: { create: [{ roleId: student.id }] } } });
  }
});

after(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await closeTestServer();
});

describe('password storage', () => {
  it('always hashes, and verifies bcrypt hashes and legacy plaintext rows', async () => {
    const stored = await passwords.hashPassword('Correct#2026x');
    assert.equal(passwords.isBcryptHash(stored), true);
    assert.equal(await passwords.verifyPassword('Correct#2026x', stored), true);
    assert.equal(await passwords.verifyPassword('Wrong#2026x', stored), false);
    assert.equal(await passwords.verifyPassword('Correct#2026x', 'Correct#2026x'), true, 'legacy plaintext row');
    assert.equal(await passwords.verifyPassword('correct#2026x', 'Correct#2026x'), false);
    assert.equal(await passwords.verifyPassword('anything', ''), false);
    assert.equal(await passwords.verifyPassword('anything', null), false);
    const temp = passwords.temporaryPassword();
    assert.ok(temp.length >= 12 && /[A-Z]/.test(temp) && /[a-z]/.test(temp) && /\d/.test(temp) && /[^A-Za-z0-9]/.test(temp));
  });

  it('signs in existing accounts without lockout and hashes a legacy plaintext row on login', async () => {
    assert.equal((await api('/auth/login', { method: 'POST', body: { email: EMAILS[0], password: 'Hashed#Pass2026' } })).status, 200, 'bcrypt row');
    assert.equal((await api('/auth/login', { method: 'POST', body: { email: EMAILS[1], password: 'plain#pass2026' } })).status, 401);
    assert.equal((await api('/auth/login', { method: 'POST', body: { email: EMAILS[1], password: 'Plain#Pass2026' } })).status, 200, 'plaintext row');
    const row = await prisma.user.findFirst({ where: { email: EMAILS[1] }, select: { passwordHash: true } });
    assert.ok(passwords.isBcryptHash(row.passwordHash), 'the plaintext row is now a hash');
    assert.equal((await api('/auth/login', { method: 'POST', body: { email: EMAILS[1], password: 'Plain#Pass2026' } })).status, 200, 'same password still works');
    for (const persona of ['student', 'faculty', 'admin']) assert.ok(await login(persona), persona);
  });

  it('requires an administrator-issued password to be replaced, and never returns passwords', async () => {
    const admin = await login('admin');
    const created = await api('/admin/users', { method: 'POST', token: admin, body: { email: EMAILS[2], password: 'AdminSet#2026x', firstName: 'Pw', lastName: 'Created', roles: ['ADMIN'] } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const text = JSON.stringify(created.body);
    assert.ok(!text.includes('AdminSet#2026x') && !text.includes('passwordHash'), 'no password or hash in the response');
    const row = await prisma.user.findFirst({ where: { email: EMAILS[2] }, select: { passwordHash: true, passwordChangeRequired: true } });
    assert.ok(passwords.isBcryptHash(row.passwordHash));
    assert.equal(row.passwordChangeRequired, true);

    const first = await api('/auth/login', { method: 'POST', body: { email: EMAILS[2], password: 'AdminSet#2026x' } });
    assert.equal(first.status, 200);
    const token = first.body.data.accessToken;
    assert.equal((await api('/admin/users', { token })).status, 403, 'nothing else works until the password is changed');
    assert.equal((await api('/auth/me', { token })).status, 200);
    const weak = await api('/auth/password', { method: 'POST', token, body: { currentPassword: 'AdminSet#2026x', newPassword: 'short' } });
    assert.equal(weak.status, 400);
    const wrong = await api('/auth/password', { method: 'POST', token, body: { currentPassword: 'not-it', newPassword: 'MyOwnChoice#2026' } });
    assert.equal(wrong.status, 401);
    const same = await api('/auth/password', { method: 'POST', token, body: { currentPassword: 'AdminSet#2026x', newPassword: 'AdminSet#2026x' } });
    assert.equal(same.status, 400);
    const ok = await api('/auth/password', { method: 'POST', token, body: { currentPassword: 'AdminSet#2026x', newPassword: 'MyOwnChoice#2026' } });
    assert.equal(ok.status, 200);
    assert.ok(!JSON.stringify(ok.body).includes('MyOwnChoice#2026'));
    assert.equal((await api('/admin/users', { token })).status, 200, 'unlocked after the change');
    assert.equal((await api('/auth/login', { method: 'POST', body: { email: EMAILS[2], password: 'AdminSet#2026x' } })).status, 401, 'the temporary password no longer works');
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'PASSWORD_CHANGED', actorUserId: (await prisma.user.findFirst({ where: { email: EMAILS[2] } })).id } }));

    // An administrator reset is temporary again.
    const id = created.body.data.id;
    assert.equal((await api(`/admin/users/${id}`, { method: 'PATCH', token: admin, body: { password: 'ResetByAdmin#2026' } })).status, 200);
    assert.equal((await prisma.user.findUnique({ where: { id }, select: { passwordChangeRequired: true } })).passwordChangeRequired, true);
    assert.ok(await signInFirstTime(EMAILS[2], 'ResetByAdmin#2026', 'AnotherChoice#2026'));
  });

  it('ignores the retired plaintext setting instead of storing plaintext', async () => {
    const { execFileSync } = await import('node:child_process');
    const script = "import('./src/config/env.js').then(async ({ env }) => { const p = await import('./src/modules/auth/passwords.js'); const h = await p.hashPassword('Check#2026abc'); console.log(env.passwordStorage, p.isBcryptHash(h)); process.exit(0); })";
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PASSWORD_STORAGE: 'plaintext', DATABASE_URL: process.env.TEST_DATABASE_URL }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    assert.match(out, /bcrypt true/);
  });
});
