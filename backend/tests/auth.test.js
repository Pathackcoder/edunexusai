import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, DEMO, login } from './helpers/testEnv.js';

after(closeTestServer);

describe('health', () => {
  it('reports the service and database as reachable', async () => {
    const { status, body } = await api('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.database, 'connected');
  });
});

describe('authentication', () => {
  it('issues tokens and the session user for valid credentials', async () => {
    const { status, body } = await api('/auth/login', { method: 'POST', body: DEMO.student });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.accessToken, 'an access token is returned');
    assert.ok(body.data.refreshToken, 'a refresh token is returned');
    assert.equal(body.data.user.email, DEMO.student.email);
    assert.deepEqual(body.data.user.roles, ['STUDENT']);
    assert.equal(body.data.user.persona, 'STUDENT');
    assert.ok(Array.isArray(body.data.user.entitlements));
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPassword = await api('/auth/login', {
      method: 'POST',
      body: { email: DEMO.student.email, password: 'definitely-not-the-password' },
    });
    const unknownAccount = await api('/auth/login', {
      method: 'POST',
      body: { email: 'nobody@edunexus.ai', password: 'definitely-not-the-password' },
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownAccount.status, 401);
    assert.equal(wrongPassword.body.error.code, 'INVALID_CREDENTIALS');
    // Identical message for both, so the endpoint cannot be used to enumerate accounts.
    assert.equal(wrongPassword.body.error.message, unknownAccount.body.error.message);
  });

  it('validates the request body', async () => {
    const { status, body } = await api('/auth/login', { method: 'POST', body: { email: '' } });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.length > 0);
  });

  it('refuses protected routes without a token', async () => {
    const { status, body } = await api('/courses');
    assert.equal(status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('refuses a malformed token', async () => {
    const { status, body } = await api('/courses', { token: 'not-a-real-token' });
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });

  it('returns the current user with roles, tier and entitlements', async () => {
    const token = await login('student');
    const { status, body } = await api('/auth/me', { token });
    assert.equal(status, 200);
    assert.equal(body.data.user.fullName, 'Amit Pathak');
    assert.equal(body.data.user.tier.key, 'STANDARD');
    assert.ok(body.data.user.entitlements.includes('dashboard.schedule'));
  });

  it('rotates the refresh token', async () => {
    const first = await api('/auth/login', { method: 'POST', body: DEMO.advanced });
    const refreshed = await api('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: first.body.data.refreshToken },
    });
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.body.data.accessToken);
    assert.notEqual(refreshed.body.data.refreshToken, first.body.data.refreshToken);

    // The old token is revoked once it has been exchanged.
    const reuse = await api('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: first.body.data.refreshToken },
    });
    assert.equal(reuse.status, 401);
  });
});
