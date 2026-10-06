/**
 * EdunexusAI seed.
 *
 * Produces a demo tenant ("Demo University") with enough relational data to drive every
 * screen of the existing React prototype, three personas and two student tiers.
 *
 * Ownership is deliberate and visible in the output:
 *   EDUNEXUS-OWNED   users, roles, tiers, entitlements, tuition, payments, announcements,
 *                    notifications, transcripts, library, directory, FAQs, preferences,
 *                    profile change requests, integration configuration
 *   INTEGRATION-OWNED courses, enrollments, assignments, grade breakdowns, financial aid
 *                    — pulled through a connector and stamped with their source system
 *
 * Idempotent: every write is an upsert, so running it twice is safe.
 *
 * Run:  npm run db:seed
 */
import { prisma } from '../src/db/prisma.js';
import { DEMO_PASSWORDS } from './seeders/shared.js';
import { seedRolesAndWidgets, seedTenant, seedTiers, seedUsers } from './seeders/foundation.js';
import { seedIntegrations } from './seeders/integrations.js';
import { provisionStudentsFromSis } from './seeders/provisioning.js';
import {
  linkFacultyToCourses,
  seedAcademicCalendar,
  seedAcademicsViaIntegration,
  seedAnnouncements,
  seedTranscripts,
} from './seeders/academics.js';
import { seedCohortTuition, seedFinancialAidCache, seedTuition } from './seeders/finance.js';
import { seedCampusSafety, seedCohortLibrary, seedDirectory, seedLibrary } from './seeders/campus.js';
import {
  seedCommunicationPreferences,
  seedFaqs,
  seedNotifications,
  seedProfileRequests,
} from './seeders/support.js';
import {
  linkLegacyRequests,
  seedAdvising,
  seedCampusMap,
  seedCommunity,
  seedOperations,
  seedPlanning,
} from './seeders/advanced.js';

const step = (label) => console.log(`  • ${label}`);

async function main() {
  console.log('\nEdunexusAI — seeding demo data\n');

  console.log('Foundation');
  const { roles, widgets } = await seedRolesAndWidgets(prisma);
  step(`${Object.keys(roles).length} roles, ${Object.keys(widgets).length} widget definitions`);

  const tenant = await seedTenant(prisma);
  step(`tenant "${tenant.name}" (${tenant.slug})`);

  const tiers = await seedTiers(prisma, tenant, widgets);
  step(`student tiers: ${tiers.standard.key}, ${tiers.advanced.key} with per-tier entitlements`);

  const users = await seedUsers(prisma, tenant, roles, tiers);
  step('4 users: 2 students (STANDARD + ADVANCED), 1 faculty, 1 admin');

  console.log('\nIntegrations');
  const integrations = await seedIntegrations(prisma, tenant);
  step(`${Object.keys(integrations).length} integrations registered (mock SIS, Canvas, Banner, Ethos)`);

  const provisioned = await provisionStudentsFromSis(prisma, tenant, {
    roles,
    tiers,
    adminUserId: users.adminUser.id,
  });
  step(
    `provisioned portal accounts from the SIS roster: ${provisioned.sisStudents} SIS students, ` +
      `${provisioned.created} new accounts, ${provisioned.linked} identity mappings` +
      `${provisioned.mode === 'connector' ? '' : ' (offline fallback)'}`,
  );

  console.log('\nAcademics (integration-owned)');
  const academic = await seedAcademicsViaIntegration(prisma, tenant, { adminUserId: users.adminUser.id });
  step(
    academic.mode === 'connector'
      ? `pulled through the connector over HTTP: ${academic.courses} courses, ${academic.enrollments} enrollments, ${academic.assignments} assignments`
      : `imported offline through the canonical mapper: ${academic.courses} courses, ${academic.enrollments} enrollments, ${academic.assignments} assignments`,
  );

  const linked = await linkFacultyToCourses(prisma, tenant, users.facultyUser);
  step(`${linked} course(s) linked to the faculty account`);

  const announcements = await seedAnnouncements(prisma, tenant, users.facultyUser);
  step(`${announcements} course announcements`);

  const events = await seedAcademicCalendar(prisma, tenant);
  step(`${events} academic calendar events`);

  const transcripts = await seedTranscripts(prisma, tenant, users.amitProfile);
  step(`${transcripts.terms} transcript terms, ${transcripts.requests} transcript requests`);

  console.log('\nFinance');
  const tuition = await seedTuition(prisma, tenant, users.amitProfile);
  step(`tuition account with ${tuition.charges} charge lines and ${tuition.payments} payments`);

  const cohortTuition = await seedCohortTuition(prisma, tenant, {
    skipStudentProfileIds: [users.amitProfile.id],
  });
  step(`${cohortTuition} additional bursar account(s) for the provisioned cohort`);

  const aid = await seedFinancialAidCache(prisma, tenant, users.amitProfile);
  step(`financial aid cache: ${aid.awards} awards, ${aid.disbursements} disbursements, ${aid.requirements} requirements`);

  console.log('\nCampus');
  const directory = await seedDirectory(prisma, tenant, users);
  step(`${directory} directory profiles`);

  const library = await seedLibrary(prisma, tenant, users.amitProfile);
  step(`library account with ${library.loans} loans and ${library.catalog} catalogue items`);

  const cohortLibrary = await seedCohortLibrary(prisma, tenant, {
    skipStudentProfileIds: [users.amitProfile.id],
  });
  step(`${cohortLibrary} additional library patron record(s)`);

  const safety = await seedCampusSafety(prisma, tenant);
  step(`${safety.contacts} security contacts, ${safety.procedures} emergency procedures, ${safety.settings} safety settings`);

  console.log('\nSupport & profile');
  const faqs = await seedFaqs(prisma, tenant);
  step(`${faqs.items} FAQs across ${faqs.categories} categories, ${faqs.contacts} support contacts`);

  const prefs = await seedCommunicationPreferences(prisma, tenant, users.amitUser);
  step(`${prefs} communication categories with student preferences`);

  const requests = await seedProfileRequests(prisma, tenant, users.amitUser);
  step(`${requests} profile change request(s)`);

  const notifications = await seedNotifications(prisma, tenant, users.amitUser);
  step(`${notifications} notifications`);

  console.log('\nAdvanced features');
  const planning = await seedPlanning(prisma, tenant);
  step(`${planning.catalog} catalogue courses, ${planning.requirements} degree requirements, ${planning.paths} learning paths`);

  const community = await seedCommunity(prisma, tenant);
  step(`${community.groups} groups (${community.members} memberships), ${community.portfolioItems} portfolio items, ${community.opportunities} career opportunities synced`);

  const campusMap = await seedCampusMap(prisma, tenant);
  step(`${campusMap.buildings} campus buildings, ${campusMap.rooms} classrooms`);

  const advising = await seedAdvising(prisma, tenant);
  step(`${advising.slots} new advising slot(s) across ${advising.advisors} advisor(s)`);

  console.log('\nCross-persona workflows');
  const ops = await seedOperations(prisma, tenant);
  step(`${ops.requests} requests, ${ops.tickets} tickets, ${ops.forms} forms, ${ops.resources} resources, ${ops.broadcasts} broadcasts, ${ops.interventions} follow-ups`);

  const legacy = await linkLegacyRequests(prisma, tenant);
  step(`${legacy} legacy petition/transcript request(s) linked into the request queue`);

  console.log('\nDemo credentials');
  console.log(`  student  student@edunexus.ai           ${DEMO_PASSWORDS.student}   (Amit Pathak, STANDARD tier)`);
  console.log(`  student  student.advanced@edunexus.ai  ${DEMO_PASSWORDS.student}   (Maya Lin, ADVANCED tier)`);
  console.log(`  faculty  faculty@edunexus.ai           ${DEMO_PASSWORDS.faculty}   (Dr. Sarah Mitchell)`);
  console.log(`  admin    admin@edunexus.ai             ${DEMO_PASSWORDS.admin}     (Karen Whitfield)`);
  console.log('\nSeed complete.\n');
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
