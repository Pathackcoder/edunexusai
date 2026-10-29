import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer, login } from './helpers/testEnv.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';

/**
 * "Open CampusCore SIS": offered only to people with a verified CampusCore record behind a role they
 * hold, and to administrators (registrar console). It is only a link to CampusCore's own sign-in.
 */
const { prisma } = await import('../src/db/prisma.js');
const saved = process.env.CAMPUSCORE_PORTAL_URL;
let tenant;
let people;

before(async () => {
  await getTestServer();
  process.env.CAMPUSCORE_PORTAL_URL = 'http://sis.test/';
  tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  people = {
    linked: await createMultiRoleUser({ key: 'apps.linked', firstName: 'Lina', roles: ['STUDENT'], student: { studentNumber: 'APPS-S-1', tierKey: 'STANDARD' } }),
    unlinked: await createMultiRoleUser({ key: 'apps.unlinked', firstName: 'Uli', roles: ['STUDENT'], student: { studentNumber: 'APPS-S-2', tierKey: 'STANDARD' } }),
    revoked: await createMultiRoleUser({ key: 'apps.revoked', firstName: 'Rae', roles: ['FACULTY'], faculty: { employeeNumber: 'APPS-F-3' } }),
    alumnus: await createMultiRoleUser({ key: 'apps.alumnus', firstName: 'Al', roles: ['ALUMNI'] }),
  };
  const mirror = (user, entityType, status = 'ACTIVE') => prisma.externalIdentity.create({ data: { tenantId: tenant.id, provider: 'CAMPUSCORE', entityType, internalId: user.id, externalId: `cc-${user.id}-${entityType}`, linkMethod: 'TEST', status } });
  await mirror(people.linked.user, 'STUDENT');
  await mirror(people.revoked.user, 'FACULTY', 'SUSPENDED');
  // A link of a type whose role the account does not hold opens nothing either.
  await mirror(people.alumnus.user, 'STUDENT');
});

after(async () => {
  await prisma.externalIdentity.deleteMany({ where: { provider: 'CAMPUSCORE', linkMethod: 'TEST', externalId: { startsWith: 'cc-' } } });
  await removeMultiRoleUsers();
  if (saved === undefined) delete process.env.CAMPUSCORE_PORTAL_URL;
  else process.env.CAMPUSCORE_PORTAL_URL = saved;
  await closeTestServer();
});

const appsOf = async (token) => (await api('/auth/me', { token })).body.data.user.apps;

describe('Open CampusCore SIS', () => {
  it('a person with an active CampusCore record behind their role gets the entry (CampusCore’s own sign-in)', async () => {
    const apps = await appsOf(await loginFixture(people.linked.email));
    assert.deepEqual(apps.map((a) => [a.key, a.url]), [['campuscore', 'http://sis.test/api/app/auth/oidc/start']]);
  });

  it('no verified record, a suspended link, or a record for a role not held: no entry', async () => {
    assert.deepEqual(await appsOf(await loginFixture(people.unlinked.email)), []);
    assert.deepEqual(await appsOf(await loginFixture(people.revoked.email)), []);
    assert.deepEqual(await appsOf(await loginFixture(people.alumnus.email)), []);
  });

  it('administrators get the registrar console entry; CampusCore decides what their account may do', async () => {
    const [app] = await appsOf(await login('admin'));
    assert.equal(app.key, 'campuscore');
    assert.match(app.description, /staff account required/);
  });

  it('not configured: nobody gets it', async () => {
    process.env.CAMPUSCORE_PORTAL_URL = '';
    try {
      assert.deepEqual(await appsOf(await loginFixture(people.linked.email)), []);
      assert.deepEqual(await appsOf(await login('admin')), []);
    } finally {
      process.env.CAMPUSCORE_PORTAL_URL = 'http://sis.test/';
    }
  });
});
