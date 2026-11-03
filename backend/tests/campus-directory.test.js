import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer, login } from './helpers/testEnv.js';
import { startKeycloakAdminStub } from './helpers/keycloakAdminStub.js';
import { affiliationsFor, assertDirectoryAccess, resetDirectoryClient, searchTerm } from '../src/modules/campus/campusDirectoryService.js';

/**
 * Campus Directory (GET /campus/directory): enabled people of the institution's Keycloak realm, read by
 * the backend as a read-only service account. Keycloak is an in-process stub (helpers/keycloakAdminStub.js).
 */

const REALM = 'test-realm';
const CLIENT = { id: 'edunexusai-directory', secret: 'kc-directory-stub-secret-0123456789' };
const KEYS = ['KEYCLOAK_DIRECTORY_BASE_URL', 'KEYCLOAK_DIRECTORY_REALM', 'KEYCLOAK_DIRECTORY_CLIENT_ID', 'KEYCLOAK_DIRECTORY_CLIENT_SECRET', 'KEYCLOAK_DIRECTORY_TENANT', 'KEYCLOAK_DIRECTORY_PROVIDER_KEY', 'KEYCLOAK_DIRECTORY_TIMEOUT_MS'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let kc;
let prisma;
let tenant;
let admin;
let student;
let faculty;

const directory = (query = '', token = admin) => api(`/campus/directory${query}`, { token });
const configure = (overrides = {}) => Object.assign(process.env, {
  KEYCLOAK_DIRECTORY_BASE_URL: kc.url, KEYCLOAK_DIRECTORY_REALM: REALM, KEYCLOAK_DIRECTORY_CLIENT_ID: CLIENT.id, KEYCLOAK_DIRECTORY_CLIENT_SECRET: CLIENT.secret,
  KEYCLOAK_DIRECTORY_TENANT: tenant.slug, KEYCLOAK_DIRECTORY_PROVIDER_KEY: 'dir-test-sso', KEYCLOAK_DIRECTORY_TIMEOUT_MS: '1000', ...overrides,
});

before(async () => {
  await getTestServer();
  ({ prisma } = await import('../src/db/prisma.js'));
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  kc = await startKeycloakAdminStub({ realm: REALM, clientId: CLIENT.id, clientSecret: CLIENT.secret });
  kc.state.addUser({ username: 'ana.lopez', firstName: 'Ana', lastName: 'Lopez', email: 'Ana.Lopez@students.feddrick.edu', roles: ['learner'], attributes: { student_number: ['S2500001'] } });
  kc.state.addUser({ username: 'rahul.multirole', firstName: 'Rahul', lastName: 'Multirole', email: 'rahul.multirole@feddrick.edu', roles: ['learner', 'faculty'] });
  kc.state.addUser({ username: 'grace.hopper', firstName: 'Grace', lastName: 'Hopper', email: 'grace.hopper@feddrick.edu', roles: ['employee'] });
  kc.state.addUser({ username: 'it.admin', firstName: 'Iris', lastName: 'Admin', email: 'iris.admin@feddrick.edu', roles: ['it-admins'] });
  kc.state.addUser({ username: 'no.profile' }); // no name, no email, no classification
  kc.state.addUser({ username: 'disabled.dan', firstName: 'Dan', lastName: 'Gone', email: 'dan@feddrick.edu', enabled: false, roles: ['faculty'] });
  kc.state.addUser({ username: 'service-account-edunexusai-directory', serviceAccount: true });
  await prisma.identityProvider.deleteMany({ where: { key: 'dir-test-sso' } });
  const provider = await prisma.identityProvider.create({ data: { tenantId: tenant.id, key: 'dir-test-sso', displayName: 'Directory test IdP', issuer: `${kc.url}/realms/${REALM}`, clientId: 'edunexusai', enabled: false, allowInsecureHttp: true } });
  await prisma.identityRoleMapping.createMany({ data: [['learner', 'STUDENT'], ['faculty', 'FACULTY'], ['employee', 'STAFF']].map(([externalValue, targetRole]) => ({ tenantId: tenant.id, providerId: provider.id, claim: 'realm_access.roles', externalValue, targetRole })) });
  [admin, student, faculty] = await Promise.all([login('admin'), login('student'), login('faculty')]);
  configure();
});

beforeEach(() => {
  resetDirectoryClient();
  kc.state.fail = null;
  kc.state.delayMs = 0;
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetDirectoryClient();
  await prisma.identityProvider.deleteMany({ where: { key: 'dir-test-sso' } });
  await kc.close();
  await closeTestServer();
});

describe('Campus Directory: access', () => {
  it('refuses a caller without a session', async () => {
    const res = await directory('', null);
    assert.equal(res.status, 401);
  });

  it('follows the People Search audience on the server', async () => {
    const auth = { tenantId: tenant.id, tierId: null };
    for (const roles of [['FACULTY'], ['STAFF'], ['ALUMNI'], ['ADMIN']]) await assertDirectoryAccess({ ...auth, roles });
    // A student needs a tier that includes the directory; no tier (or no role) means no access.
    await assert.rejects(assertDirectoryAccess({ ...auth, roles: ['STUDENT'] }), (e) => e.status === 403);
    await assert.rejects(assertDirectoryAccess({ ...auth, roles: [] }), (e) => e.status === 403);
    const standard = await prisma.studentTier.findFirst({ where: { tenantId: tenant.id, key: 'STANDARD' } });
    await assertDirectoryAccess({ ...auth, roles: ['STUDENT'], tierId: standard.id });
  });

  it('serves students on a tier with the directory, and faculty', async () => {
    assert.equal((await directory('', student)).status, 200);
    assert.equal((await directory('', faculty)).status, 200);
  });
});

describe('Campus Directory: results', () => {
  it('lists enabled people from the realm, without service accounts or disabled accounts', async () => {
    const res = await directory();
    assert.equal(res.status, 200);
    const { people, total, hasMore, source, labels } = res.body.data;
    assert.equal(source, 'KEYCLOAK');
    assert.equal(labels, true);
    assert.deepEqual(people.map((p) => p.displayName), ['Ana Lopez', 'Rahul Multirole', 'Grace Hopper', 'Iris Admin', null]);
    assert.equal(total, 5);
    assert.equal(hasMore, false);
    // Only the token endpoint and GETs were used, with the service account's bearer token.
    assert.ok(kc.state.requests.every((r) => r.authorization?.startsWith('Bearer stub-token-')));
    assert.ok(kc.state.requests.some((r) => r.path === '/users' && r.query.enabled === 'true' && r.query.briefRepresentation === 'true'));
  });

  it('labels people from their realm roles with the institution’s mapping rules, including several roles', async () => {
    const byName = Object.fromEntries((await directory()).body.data.people.map((p) => [p.displayName ?? '(none)', p.affiliations]));
    assert.deepEqual(byName['Rahul Multirole'], ['STUDENT', 'FACULTY']);
    assert.deepEqual(byName['Ana Lopez'], ['STUDENT']);
    assert.deepEqual(byName['Grace Hopper'], ['STAFF']);
    // An unmapped role (it-admins) and no roles at all give no label: nothing is guessed.
    assert.deepEqual(byName['Iris Admin'], []);
    assert.deepEqual(byName['(none)'], []);
  });

  it('returns only the approved fields, and handles missing names and email', async () => {
    const { people } = (await directory()).body.data;
    for (const person of people) assert.deepEqual(Object.keys(person).sort(), ['affiliations', 'displayName', 'email', 'firstName', 'key', 'lastName']);
    const blank = people.find((p) => p.displayName === null);
    assert.deepEqual({ ...blank, key: undefined }, { key: undefined, firstName: null, lastName: null, displayName: null, email: null, affiliations: [] });
    const ana = people.find((p) => p.firstName === 'Ana');
    assert.equal(ana.email, 'ana.lopez@students.feddrick.edu');
    const keycloakIds = kc.state.users.map((u) => u.id);
    assert.ok(people.every((p) => !keycloakIds.includes(p.key)), 'the browser never receives Keycloak user ids');
    const raw = JSON.stringify(people);
    for (const leak of ['S2500001', 'username', 'attributes', 'access', 'createdTimestamp', 'ana.lopez"']) assert.ok(!raw.includes(leak), `response must not contain ${leak}`);
  });

  it('searches first name, last name and email on the server', async () => {
    const names = async (q) => (await directory(`?search=${encodeURIComponent(q)}`)).body.data.people.map((p) => p.displayName);
    assert.deepEqual(await names('grace'), ['Grace Hopper']);
    assert.deepEqual(await names('HOPPER'), ['Grace Hopper']);
    assert.deepEqual(await names('students.feddrick'), ['Ana Lopez']);
    assert.deepEqual(await names('nobody-like-this'), []);
    // Keycloak wildcards and quotes in the input are treated as plain text.
    assert.equal(searchTerm(' *ana" '), 'ana');
    assert.ok(kc.state.requests.some((r) => r.query.search === '*grace*'));
  });

  it('pages on the server with bounded page sizes', async () => {
    const page = async (n) => (await directory(`?page=${n}&pageSize=2`)).body.data;
    const [one, two, three] = [await page(1), await page(2), await page(3)];
    assert.deepEqual([one.people.length, two.people.length, three.people.length], [2, 2, 1]);
    assert.deepEqual([one.hasMore, two.hasMore, three.hasMore], [true, true, false]);
    assert.equal(one.total, 5);
    assert.ok(kc.state.requests.filter((r) => r.path === '/users' && r.query.first).every((r) => Number(r.query.max) <= 50));
    assert.equal((await directory('?pageSize=51')).status, 400);
    assert.equal((await directory('?page=0')).status, 400);
  });

  it('shares the mapping rules with sign-in: no rules, no labels', async () => {
    configure({ KEYCLOAK_DIRECTORY_PROVIDER_KEY: '' });
    try {
      const roleReads = kc.state.requests.filter((r) => r.path.includes('role-mappings')).length;
      const data = (await directory()).body.data;
      assert.equal(data.labels, false);
      assert.ok(data.people.every((p) => p.affiliations.length === 0));
      assert.equal(kc.state.requests.filter((r) => r.path.includes('role-mappings')).length, roleReads, 'roles are not read when no rules can label them');
    } finally {
      configure();
    }
  });

  it('changes nothing in the portal (no accounts, links or roles)', async () => {
    const before = await Promise.all([prisma.user.count(), prisma.federatedIdentity.count(), prisma.userRole.count(), prisma.roleAssignmentSource.count()]);
    await directory('?search=rahul');
    const after = await Promise.all([prisma.user.count(), prisma.federatedIdentity.count(), prisma.userRole.count(), prisma.roleAssignmentSource.count()]);
    assert.deepEqual(after, before);
  });
});

describe('Campus Directory: configuration and upstream failures', () => {
  it('says the directory is not connected when it is not configured, naming problems only to administrators', async () => {
    configure({ KEYCLOAK_DIRECTORY_CLIENT_SECRET: '' });
    try {
      const asAdmin = await directory();
      assert.equal(asAdmin.status, 409);
      assert.equal(asAdmin.body.error.code, 'INTEGRATION_NOT_CONFIGURED');
      assert.ok(asAdmin.body.error.details.problems.includes('KEYCLOAK_DIRECTORY_CLIENT_SECRET is not set.'));
      const asFaculty = await directory('', faculty);
      assert.equal(asFaculty.status, 409);
      assert.equal(asFaculty.body.error.details, undefined);
    } finally {
      configure();
    }
  });

  it('refuses admin-cli as the directory client', async () => {
    configure({ KEYCLOAK_DIRECTORY_CLIENT_ID: 'admin-cli' });
    try {
      assert.equal((await directory()).status, 409);
    } finally {
      configure();
    }
  });

  it('serves only the institution the realm belongs to', async () => {
    configure({ KEYCLOAK_DIRECTORY_TENANT: 'another-university' });
    try {
      assert.equal((await directory()).status, 409);
    } finally {
      configure();
    }
  });

  it('reuses its token, and gets a new one when Keycloak no longer accepts it', async () => {
    await directory('?search=ana');
    const issued = kc.state.tokenRequests;
    await directory('?search=grace');
    assert.equal(kc.state.tokenRequests, issued, 'a valid token is reused');
    kc.state.revokeAll(); // expired, revoked or rotated at Keycloak
    const res = await directory('?search=rahul');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.people[0].displayName, 'Rahul Multirole');
    assert.equal(kc.state.tokenRequests, issued + 1);
  });

  it('reports rejected credentials without exposing the secret or Keycloak’s answer', async () => {
    configure({ KEYCLOAK_DIRECTORY_CLIENT_SECRET: 'wrong-secret-value-123' });
    try {
      const res = await directory();
      assert.equal(res.status, 502);
      assert.equal(res.body.error.details.reason, 'DIRECTORY_CREDENTIALS_REJECTED');
      assert.ok(!JSON.stringify(res.body).includes('wrong-secret-value-123'));
      assert.ok(!JSON.stringify(res.body).includes('Invalid client credentials'));
    } finally {
      configure();
    }
  });

  it('reports a missing permission (403) without passing Keycloak’s body through', async () => {
    kc.state.fail = { status: 403, times: 1, path: '/users' };
    const res = await directory();
    assert.equal(res.status, 502);
    assert.equal(res.body.error.details.reason, 'DIRECTORY_PERMISSION_MISSING');
    const text = JSON.stringify(res.body);
    for (const leak of ['stub-internal-detail', 'stub-token-', CLIENT.secret]) assert.ok(!text.includes(leak));
  });

  it('retries one upstream outage, then reports the directory as unavailable', async () => {
    kc.state.fail = { status: 503, times: 1, path: '/users/count' };
    assert.equal((await directory()).status, 200, 'one 503 is retried');
    resetDirectoryClient();
    kc.state.fail = { status: 503, times: 10 };
    const res = await directory();
    assert.equal(res.status, 503);
    assert.equal(res.body.error.details.reason, 'DIRECTORY_UNAVAILABLE');
  });

  it('handles malformed answers and timeouts', async () => {
    kc.state.fail = { status: 200, times: 10, path: '/users/count', body: 'not json' };
    const malformed = await directory();
    assert.equal(malformed.status, 502);
    assert.equal(malformed.body.error.details.reason, 'DIRECTORY_UPSTREAM_ERROR');
    resetDirectoryClient();
    kc.state.fail = null;
    kc.state.delayMs = 1300; // longer than the 1 s timeout
    const slow = await directory();
    assert.equal(slow.status, 503);
    assert.equal(slow.body.error.details.reason, 'DIRECTORY_UNAVAILABLE');
  });

  it('gives a person whose roles cannot be read no label rather than failing the page', async () => {
    kc.state.fail = { status: 500, times: 100, path: /role-mappings/ };
    const res = await directory();
    assert.equal(res.status, 200);
    assert.ok(res.body.data.people.every((p) => p.affiliations === null));
  });
});

describe('Campus Directory: labels', () => {
  it('maps realm roles only through enabled realm_access.roles rules', () => {
    const rules = [
      { claim: 'realm_access.roles', externalValue: 'learner', targetRole: 'STUDENT', enabled: true },
      { claim: 'realm_access.roles', externalValue: 'faculty', targetRole: 'FACULTY', enabled: false },
    ];
    assert.deepEqual(affiliationsFor(['learner', 'faculty', 'offline_access'], rules), ['STUDENT']);
    assert.deepEqual(affiliationsFor([], rules), []);
  });
});
