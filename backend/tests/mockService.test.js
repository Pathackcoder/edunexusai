import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeTestServer } from './helpers/testEnv.js';

after(closeTestServer);

const BASE = (process.env.MOCK_UNIVERSITY_BASE_URL ?? 'http://localhost:5002/external').replace(/\/external$/, '');
const API_KEY = process.env.MOCK_UNIVERSITY_API_KEY ?? 'mock-local-api-key';

async function up() {
  try {
    const response = await fetch(`${BASE}/external/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

const MOCK_UP = await up();
const needsMock = MOCK_UP ? {} : { skip: 'mock external service is not running on port 5002' };

/**
 * The mock external service stands in for a real institutional system, so it is tested
 * the way an external vendor API would be: authentication is required, resources use the
 * provider's own vocabulary, and unknown ids produce 404.
 */
describe('mock external university API', () => {
  it('answers health without authentication', needsMock, async () => {
    const response = await fetch(`${BASE}/external/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.service, 'mock-university-api');
    assert.ok(body.record_counts.courses > 0);
  });

  it('requires an API key for data resources', needsMock, async () => {
    const anonymous = await fetch(`${BASE}/external/courses`);
    assert.equal(anonymous.status, 401);

    const authorised = await fetch(`${BASE}/external/courses`, { headers: { 'x-api-key': API_KEY } });
    assert.equal(authorised.status, 200);
  });

  it('serves courses in the provider’s own vocabulary', needsMock, async () => {
    const response = await fetch(`${BASE}/external/courses`, { headers: { 'x-api-key': API_KEY } });
    const body = await response.json();
    const course = body.data[0];

    // These are exactly the names the canonical mapper has to translate away.
    assert.ok(Object.hasOwn(course, 'sis_course_id'));
    assert.ok(Object.hasOwn(course, 'subject_code'));
    assert.ok(Object.hasOwn(course, 'catalog_number'));
    assert.ok(Object.hasOwn(course, 'credit_hours'));
    assert.ok(Object.hasOwn(course, 'meeting_pattern'));
    // And it does not speak the Edunexus canonical model.
    assert.ok(!Object.hasOwn(course, 'code'));
    assert.ok(!Object.hasOwn(course, 'credits'));
  });

  it('returns 404 for an unknown student rather than inventing one', needsMock, async () => {
    const response = await fetch(`${BASE}/external/students/0000000`, { headers: { 'x-api-key': API_KEY } });
    assert.equal(response.status, 404);
  });

  it('exposes a Canvas-compatible surface that requires a bearer token', needsMock, async () => {
    const anonymous = await fetch(`${BASE}/canvas/api/v1/courses`);
    assert.equal(anonymous.status, 401);

    const authorised = await fetch(`${BASE}/canvas/api/v1/courses`, {
      headers: { Authorization: 'Bearer mock-canvas-token' },
    });
    const body = await authorised.json();
    assert.equal(authorised.status, 200);
    assert.ok(Array.isArray(body));
    // Canvas field names, as published by the real Canvas REST API.
    assert.ok(Object.hasOwn(body[0], 'course_code'));
    assert.ok(Object.hasOwn(body[0], 'workflow_state'));
  });

  it('filters enrollments by student and by course', needsMock, async () => {
    const headers = { 'x-api-key': API_KEY };
    const byStudent = await (await fetch(`${BASE}/external/enrollments?studentId=0098421`, { headers })).json();
    assert.ok(byStudent.data.length > 0);
    assert.ok(byStudent.data.every((row) => row.sis_student_id === '0098421'));

    const courseId = byStudent.data[0].sis_course_id;
    const byCourse = await (await fetch(`${BASE}/external/enrollments?courseId=${courseId}`, { headers })).json();
    assert.ok(byCourse.data.every((row) => row.sis_course_id === courseId));
  });
});
