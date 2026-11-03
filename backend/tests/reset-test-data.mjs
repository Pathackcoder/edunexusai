/**
 * Removes records that earlier test runs created in the TEST database, so every run sees
 * the same seeded starting point. Deletes only test-created rows (never seeded data) and
 * refuses to run against anything but TEST_DATABASE_URL.
 */
import 'dotenv/config';

if (process.env.NODE_ENV !== 'test' || !process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
  console.error('reset-test-data only runs against TEST_DATABASE_URL (via tests/prepare-db.mjs).');
  process.exit(1);
}

const { prisma } = await import('../src/db/prisma.js');

// Submissions recorded by student.test.js.
const submissions = await prisma.assignmentSubmission.deleteMany({ where: { submissionNote: 'Submitted by the test suite.' } });

// Accounts created by the onboarding tests, with the section and records onboarding gave them.
const users = await prisma.user.findMany({ where: { email: { startsWith: 'onboard.', endsWith: '@feddrick.edu' } }, select: { id: true } });
const ids = users.map((user) => user.id);
if (ids.length) {
  await prisma.course.deleteMany({ where: { instructorUserId: { in: ids } } });
  await prisma.directoryProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.portalResource.deleteMany({ where: { createdByUserId: { in: ids } } });
  await prisma.studentIntervention.deleteMany({ where: { createdByUserId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
// Mathematics demo faculty created by the Moodle seed test (identity only, no baseline).
const mathUsers = await prisma.user.findMany({ where: { email: { in: ['elena.rossi@edunexus.ai', 'marcus.webb@edunexus.ai'] } }, select: { id: true } });
if (mathUsers.length) {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: mathUsers.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: mathUsers.map((u) => u.id) } } });
}

// Multi-role fixtures (tests/helpers/multiRole.js), in case a run stopped before its cleanup.
await prisma.user.deleteMany({ where: { email: { startsWith: 'multirole.' } } });
// Resource-access fixtures (tests/resource-access.test.js): test resources and the second tenant.
await prisma.portalResource.deleteMany({ where: { slug: { startsWith: 'mr-test-' } } });
await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'mr-test-' } } });
// Institutional sign-in fixtures (tests/sso-flow.test.js): the test provider and everything linked to it.
await prisma.identityProvider.deleteMany({ where: { key: 'test-sso' } });

// Moodle links and operations created by moodle.test.js (the stub Moodle is in-memory).
const moodleLinks = await prisma.externalIdentity.deleteMany({ where: { provider: 'MOODLE' } });
await prisma.integrationOperation.deleteMany({ where: { integration: { provider: 'MOODLE' } } });

console.log(`  • removed ${moodleLinks.count} Moodle link(s), ${submissions.count} test submission(s) and ${ids.length} test account(s)`);
await prisma.$disconnect();
