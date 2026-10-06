/**
 * Shared test bootstrap.
 *
 * Runs against TEST_DATABASE_URL (a separate `edunexusai_test` database), applies
 * migrations, seeds it once per run, and starts the Express app on an ephemeral port.
 * Tests talk to it over real HTTP with `fetch`, so routing, middleware, validation and
 * serialisation are all exercised rather than stubbed.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env.');
}

let bootstrap;

/**
 * Migrations and seeding happen once, in `npm run pretest` (tests/prepare-db.mjs).
 * Each test file only boots the app against the already-prepared test database.
 */
async function boot() {
  const { createApp } = await import('../../src/app.js');
  const app = createApp();
  const server = await new Promise((resolveServer) => {
    const listener = app.listen(0, () => resolveServer(listener));
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}/api/v1` };
}

/** Lazily start the server; every test file awaits the same promise. */
export function getTestServer() {
  bootstrap ??= boot();
  return bootstrap;
}

export async function closeTestServer() {
  if (!bootstrap) return;
  const { server } = await bootstrap;
  await new Promise((done) => server.close(done));
  const { disconnect } = await import('../../src/db/prisma.js');
  await disconnect();
}

/** HTTP helper returning { status, body }. */
export async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const { baseUrl } = await getTestServer();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

export const DEMO = {
  student: { email: 'student@edunexus.ai', password: 'Student@Demo2026!' },
  advanced: { email: 'student.advanced@edunexus.ai', password: 'Student@Demo2026!' },
  faculty: { email: 'faculty@edunexus.ai', password: 'Faculty@Demo2026!' },
  admin: { email: 'admin@edunexus.ai', password: 'Admin@Demo2026!' },
};

const tokenCache = new Map();

/** Sign in once per persona and reuse the access token across assertions. */
export async function login(persona) {
  if (tokenCache.has(persona)) return tokenCache.get(persona);
  const credentials = DEMO[persona];
  const { status, body } = await api('/auth/login', { method: 'POST', body: credentials });
  if (status !== 200 || !body?.data?.accessToken) {
    throw new Error(`Login failed for ${persona}: ${status} ${JSON.stringify(body)}`);
  }
  tokenCache.set(persona, body.data.accessToken);
  return body.data.accessToken;
}
