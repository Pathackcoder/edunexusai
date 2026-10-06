import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';

after(closeTestServer);

/**
 * Some assertions need the mock external service running. Rather than failing when it is
 * not, those tests are skipped with a reason, so `npm test` is useful on its own and
 * complete when the full stack is up.
 */
async function mockServiceIsUp() {
  try {
    const base = process.env.MOCK_UNIVERSITY_BASE_URL ?? 'http://localhost:5002/external';
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

const MOCK_UP = await mockServiceIsUp();
const needsMock = MOCK_UP ? {} : { skip: 'mock external service is not running on port 5002' };

describe('integration registry and configuration', () => {
  it('registers the mock SIS, Canvas, Banner and Ethos', async () => {
    const token = await login('admin');
    const { status, body } = await api('/admin/integrations', { token });

    assert.equal(status, 200);
    const keys = body.data.map((integration) => integration.key).sort();
    assert.deepEqual(keys, ['banner-sis', 'canvas-lms', 'ethos-integration', 'mock-university']);
  });

  it('never returns a credential value, only its environment variable name', async () => {
    const token = await login('admin');
    const { body } = await api('/admin/integrations', { token });

    const serialised = JSON.stringify(body);
    assert.ok(!serialised.includes('mock-local-api-key'), 'the API key value must not be serialised');

    for (const integration of body.data) {
      assert.ok(!Object.hasOwn(integration, 'credential'));
      assert.ok(!Object.hasOwn(integration, 'apiToken'));
      if (integration.credentialRef) {
        // A reference is an environment variable NAME, never a secret.
        assert.match(integration.credentialRef, /^[A-Z0-9_]+$/);
        assert.equal(typeof integration.credentialConfigured, 'boolean');
      }
    }
  });

  it('exposes the providers the registry can build a connector for', async () => {
    const token = await login('admin');
    const { body } = await api('/admin/integrations/providers', { token });
    const canvas = body.data.find((provider) => provider.provider === 'CANVAS');
    const banner = body.data.find((provider) => provider.provider === 'BANNER');

    assert.equal(canvas.implementsDataCalls, true);
    // Banner is registered for configuration only; this must not claim otherwise.
    assert.equal(banner.implementsDataCalls, false);
    assert.equal(banner.liveCapable, false);
  });

  it('updates integration configuration', async () => {
    const token = await login('admin');
    const { body: list } = await api('/admin/integrations', { token });
    const canvas = list.data.find((integration) => integration.key === 'canvas-lms');

    const updated = await api(`/admin/integrations/${canvas.id}`, {
      method: 'PATCH',
      token,
      body: { timeoutMs: 9500, apiVersion: 'v1' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.timeoutMs, 9500);

    await api(`/admin/integrations/${canvas.id}`, {
      method: 'PATCH',
      token,
      body: { timeoutMs: canvas.timeoutMs },
    });
  });

  it('rejects a credential reference that looks like a secret', async () => {
    const token = await login('admin');
    const { status, body } = await api('/admin/integrations', {
      method: 'POST',
      token,
      body: {
        key: 'bad-cred',
        provider: 'CANVAS',
        displayName: 'Bad credential',
        credentialRef: 'sk-live-abc123-this-is-a-secret',
      },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});

describe('connectors', () => {
  it('reports Banner as not connected rather than pretending it works', async () => {
    const token = await login('admin');
    const { body: list } = await api('/admin/integrations', { token });
    const banner = list.data.find((integration) => integration.key === 'banner-sis');

    assert.equal(banner.status, 'NOT_CONNECTED');
    assert.equal(banner.enabled, false);
    assert.deepEqual(banner.supportedDomains, []);

    const test = await api(`/admin/integrations/${banner.id}/test`, { method: 'POST', token });
    assert.equal(test.status, 409);
    assert.equal(test.body.error.code, 'INTEGRATION_NOT_CONFIGURED');

    // The failure is recorded, and it is NOT_CONNECTED rather than ERROR.
    const health = await api(`/admin/integrations/${banner.id}/health`, { token });
    assert.equal(health.body.data.status, 'NOT_CONNECTED');
    assert.ok(health.body.data.lastAttemptAt);
  });

  it('tests the mock SIS connector over HTTP and records health', needsMock, async () => {
    const token = await login('admin');
    const { body: list } = await api('/admin/integrations', { token });
    const mock = list.data.find((integration) => integration.key === 'mock-university');

    const test = await api(`/admin/integrations/${mock.id}/test`, { method: 'POST', token });
    assert.equal(test.status, 200);
    assert.equal(test.body.data.healthy, true);
    assert.ok(test.body.data.recordCount > 0);
    assert.equal(typeof test.body.data.responseTimeMs, 'number');

    const health = await api(`/admin/integrations/${mock.id}/health`, { token });
    assert.equal(health.body.data.status, 'CONNECTED');
    assert.ok(health.body.data.lastSuccessfulSyncAt);
  });

  it('runs the Canvas connector against the Canvas-compatible mock surface', needsMock, async () => {
    const token = await login('admin');
    const { body: list } = await api('/admin/integrations', { token });
    const canvas = list.data.find((integration) => integration.key === 'canvas-lms');

    const test = await api(`/admin/integrations/${canvas.id}/test`, { method: 'POST', token });
    assert.equal(test.status, 200);
    assert.equal(test.body.data.details.mode, 'MOCK');
    // The connector must not claim verification against a real Canvas tenant.
    assert.equal(test.body.data.details.verifiedAgainstLiveCanvas, false);
    assert.ok(test.body.data.details.courseCount > 0);
  });

  it('syncs courses from the provider and stamps their provenance', needsMock, async () => {
    const adminToken = await login('admin');
    const { body: list } = await api('/admin/integrations', { token: adminToken });
    const mock = list.data.find((integration) => integration.key === 'mock-university');

    const sync = await api(`/admin/integrations/${mock.id}/sync`, { method: 'POST', token: adminToken });
    assert.equal(sync.status, 200);
    assert.ok(sync.body.data.courses > 0);
    assert.ok(sync.body.data.enrollments > 0);

    const { body: courses } = await api('/courses', { token: await login('student') });
    assert.ok(courses.data.every((course) => course.dataSource.system === 'MOCK_UNIVERSITY'));
  });

  it('writes a sync log for every attempt', async () => {
    const token = await login('admin');
    const { body: list } = await api('/admin/integrations', { token });
    const mock = list.data.find((integration) => integration.key === 'mock-university');

    const { status, body } = await api(`/admin/integrations/${mock.id}/logs?limit=10`, { token });
    assert.equal(status, 200);
    assert.ok(body.data.length > 0, 'attempts are logged');
    const log = body.data[0];
    assert.ok(log.operation);
    assert.ok(['SUCCESS', 'FAILED', 'RUNNING', 'PARTIAL'].includes(log.status));
    assert.equal(typeof log.recordsProcessed, 'number');
  });
});

describe('canonical mapping', () => {
  it('no provider-native field name reaches an API response', async () => {
    const token = await login('student');
    const payloads = await Promise.all(
      ['/courses', '/assignments', '/grades', '/schedule', '/financial-aid'].map((path) =>
        api(path, { token }).then((response) => JSON.stringify(response.body)),
      ),
    );

    // These are the Mock SIS / Canvas vocabulary. If one of them appears in a response,
    // a provider payload leaked past the canonical mapper.
    const providerFields = [
      'sis_course_id',
      'subject_code',
      'catalog_number',
      'credit_hours',
      'meeting_pattern',
      'instructor_of_record',
      'sis_student_id',
      'lms_assignment_id',
      'points_possible',
      'fund_awards',
      'packaging_status_desc',
      'banner_pidm',
    ];

    for (const payload of payloads) {
      for (const field of providerFields) {
        assert.ok(!payload.includes(field), `provider field "${field}" leaked into an API response`);
      }
    }
  });
});
