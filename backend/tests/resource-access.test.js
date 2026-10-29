import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { createMultiRoleUser, loginFixture, removeMultiRoleUsers } from './helpers/multiRole.js';

/**
 * Opening a resource by id must follow the same rules as the listing: same tenant,
 * published, and addressed to one of the caller's audiences. Owners and administrators keep
 * access to resources they manage. Knowing an id is never enough on its own.
 */

const { prisma } = await import('../src/db/prisma.js');

const OTHER_TENANT = 'mr-test-other-university';
const r = {};
let rahulToken;

before(async () => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-university' } });
  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'admin@edunexus.ai' } });
  const faculty = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'faculty@edunexus.ai' } });
  await prisma.portalResource.deleteMany({ where: { slug: { startsWith: 'mr-test-' } } });
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });

  const make = (slug, data) => prisma.portalResource.create({
    data: { tenantId: tenant.id, slug: `mr-test-${slug}`, title: `Test ${slug}`, category: 'Testing', content: `content of ${slug}`, publishedAt: data.status === 'PUBLISHED' ? new Date() : null, ...data },
  });
  r.facultyOnly = await make('faculty-only', { audience: 'FACULTY', status: 'PUBLISHED', ownerRole: 'ADMIN', createdByUserId: admin.id });
  r.studentOnly = await make('student-only', { audience: 'STUDENT', status: 'PUBLISHED', ownerRole: 'ADMIN', createdByUserId: admin.id });
  r.everyone = await make('everyone', { audience: 'ALL', status: 'PUBLISHED', ownerRole: 'ADMIN', createdByUserId: admin.id });
  // Teaching resources written by the demo faculty member are addressed to students.
  r.teachingPublished = await make('teaching-published', { audience: 'STUDENT', status: 'PUBLISHED', ownerRole: 'FACULTY', createdByUserId: faculty.id });
  r.teachingDraft = await make('teaching-draft', { audience: 'STUDENT', status: 'DRAFT', ownerRole: 'FACULTY', createdByUserId: faculty.id });

  const other = await prisma.tenant.create({ data: { slug: OTHER_TENANT, name: 'Other University (test)' } });
  r.otherTenant = await prisma.portalResource.create({
    data: { tenantId: other.id, slug: 'mr-test-other-tenant', title: 'Other tenant', category: 'Testing', audience: 'ALL', status: 'PUBLISHED', publishedAt: new Date(), content: 'other tenant content' },
  });

  const rahul = await createMultiRoleUser({
    key: 'resources.rahul', firstName: 'Rahul', roles: ['STUDENT', 'FACULTY'],
    student: { studentNumber: 'MR-S-0101', tierKey: 'STANDARD' }, faculty: { employeeNumber: 'MR-F-0101' },
  });
  rahulToken = await loginFixture(rahul.email);
});

after(async () => {
  await prisma.portalResource.deleteMany({ where: { slug: { startsWith: 'mr-test-' } } });
  await prisma.tenant.deleteMany({ where: { slug: OTHER_TENANT } });
  await removeMultiRoleUsers();
  await closeTestServer();
});

const open = async (token, resource) => (await api(`/resources/${resource.id}`, { token })).status;

describe('GET /resources/:id enforces the listing rules', () => {
  it('a student opens student and ALL resources, but not faculty-only ones', async () => {
    const token = await login('student');
    assert.equal(await open(token, r.studentOnly), 200);
    assert.equal(await open(token, r.everyone), 200);
    assert.equal(await open(token, r.teachingPublished), 200);
    const refused = await api(`/resources/${r.facultyOnly.id}`, { token });
    assert.equal(refused.status, 404, 'faculty-only resource must not open for a student');
    assert.equal(refused.body.data ?? null, null, 'no content in the refusal');
  });

  it('a faculty member opens faculty and ALL resources and their own teaching resources, but not other student-only ones', async () => {
    const token = await login('faculty');
    assert.equal(await open(token, r.facultyOnly), 200);
    assert.equal(await open(token, r.everyone), 200);
    assert.equal(await open(token, r.teachingPublished), 200, 'owner keeps access to a resource outside their own audience');
    assert.equal(await open(token, r.studentOnly), 404);
  });

  it('a person who is both student and faculty opens resources for either audience', async () => {
    assert.equal(await open(rahulToken, r.studentOnly), 200);
    assert.equal(await open(rahulToken, r.facultyOnly), 200);
    assert.equal(await open(rahulToken, r.everyone), 200);
    assert.equal(await open(rahulToken, r.teachingDraft), 404, 'a draft he does not own stays hidden');
  });

  it('drafts open only for their owner and administrators', async () => {
    assert.equal(await open(await login('student'), r.teachingDraft), 404);
    assert.equal(await open(await login('faculty'), r.teachingDraft), 200);
    assert.equal(await open(await login('admin'), r.teachingDraft), 200);
  });

  it('administrators keep their existing access to every resource of their institution', async () => {
    const token = await login('admin');
    for (const resource of [r.facultyOnly, r.studentOnly, r.everyone, r.teachingPublished]) {
      assert.equal(await open(token, resource), 200);
    }
  });

  it('nobody opens another institution’s resource, administrators included', async () => {
    for (const persona of ['student', 'faculty', 'admin']) {
      assert.equal(await open(await login(persona), r.otherTenant), 404, persona);
    }
    assert.equal(await open(rahulToken, r.otherTenant), 404);
  });

  it('a refused open does not count as a view', async () => {
    const before = (await prisma.portalResource.findUnique({ where: { id: r.facultyOnly.id } })).viewCount;
    await open(await login('student'), r.facultyOnly);
    const afterRefusal = (await prisma.portalResource.findUnique({ where: { id: r.facultyOnly.id } })).viewCount;
    assert.equal(afterRefusal, before);
  });

  it('for every caller, a test resource opens by id exactly when it is in their listing', async () => {
    const published = [r.facultyOnly, r.studentOnly, r.everyone, r.teachingPublished];
    const callers = [['student', await login('student')], ['rahul', rahulToken]];
    for (const [label, token] of callers) {
      const listed = new Set((await api('/resources', { token })).body.data.resources.map((x) => x.id));
      for (const resource of published) {
        const opened = (await open(token, resource)) === 200;
        assert.equal(opened, listed.has(resource.id), `${label}: ${resource.slug} listed=${listed.has(resource.id)} opened=${opened}`);
      }
    }
  });
});
