import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { api, closeTestServer } from './helpers/testEnv.js';
import { createMultiRoleUser, MULTI_ROLE_PASSWORD, removeMultiRoleUsers } from './helpers/multiRole.js';

/**
 * Session lifecycle for every account, single- or multi-role: an expired access token is refused,
 * logout revokes the refresh token, and suspending an account ends its access immediately (roles
 * and status are re-read on every request, not trusted from the token).
 */

const { prisma } = await import('../src/db/prisma.js');
const { env } = await import('../src/config/env.js');
let person;

before(async () => {
  person = await createMultiRoleUser({
    key: 'session.rahul', firstName: 'Rahul', roles: ['STUDENT', 'FACULTY'],
    student: { studentNumber: 'MR-S-0401', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'MR-F-0401' },
  });
});
after(async () => { await removeMultiRoleUsers(); await closeTestServer(); });

const signIn = async () => {
  const { status, body } = await api('/auth/login', { method: 'POST', body: { email: person.email, password: MULTI_ROLE_PASSWORD } });
  assert.equal(status, 200);
  return body.data;
};

describe('session lifecycle', () => {
  it('refuses an expired access token with TOKEN_EXPIRED', async () => {
    const expired = jwt.sign({ sub: person.user.id, tenantId: person.tenantId, roles: ['STUDENT', 'FACULTY'], exp: Math.floor(Date.now() / 1000) - 60 }, env.jwt.secret, { issuer: env.jwt.issuer });
    const { status, body } = await api('/auth/me', { token: expired });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'TOKEN_EXPIRED');
  });

  it('logout revokes the refresh token', async () => {
    const session = await signIn();
    const out = await api('/auth/logout', { method: 'POST', token: session.accessToken, body: { refreshToken: session.refreshToken } });
    assert.ok([200, 204].includes(out.status), `logout status ${out.status}`);
    const refresh = await api('/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken } });
    assert.equal(refresh.status, 401, 'a logged-out refresh token cannot mint a new session');
  });

  it('suspending an account ends access for its existing tokens and refuses new sign-ins', async () => {
    const session = await signIn();
    assert.equal((await api('/dashboard/student', { token: session.accessToken })).status, 200);
    await prisma.user.update({ where: { id: person.user.id }, data: { status: 'SUSPENDED' } });
    try {
      assert.equal((await api('/dashboard/student', { token: session.accessToken })).status, 401);
      assert.equal((await api('/faculty/dashboard', { token: session.accessToken })).status, 401);
      assert.notEqual((await api('/auth/login', { method: 'POST', body: { email: person.email, password: MULTI_ROLE_PASSWORD } })).status, 200);
    } finally {
      await prisma.user.update({ where: { id: person.user.id }, data: { status: 'ACTIVE' } });
    }
  });

  it('a token cannot carry roles the account no longer has: roles come from the database', async () => {
    const forged = jwt.sign({ sub: person.user.id, tenantId: person.tenantId, roles: ['ADMIN'] }, env.jwt.secret, { issuer: env.jwt.issuer, expiresIn: 300 });
    assert.equal((await api('/admin/users', { token: forged })).status, 403, 'an ADMIN claim in the token grants nothing');
  });
});
