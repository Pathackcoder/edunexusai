/**
 * Backfill onboarding for Student and Faculty accounts created before onboarding existed
 * (or created without data). Each user is onboarded in its own transaction. Students
 * linked to the SIS (their data comes from it), students that already have academic
 * history, faculty that already teach a section and the curated demo personas are left
 * untouched; onboarding itself also skips records that already exist.
 *
 * Run:  npm run db:onboard
 */
import { prisma } from '../src/db/prisma.js';
import { PRESERVED_PERSONA_EMAILS, onboardFaculty, onboardStudent } from '../src/modules/onboarding/onboardingService.js';

async function main() {
  const tenants = await prisma.tenant.findMany();
  for (const tenant of tenants) {
    const students = await prisma.studentProfile.findMany({
      where: { tenantId: tenant.id, transcriptTerms: { none: {} }, user: { email: { notIn: PRESERVED_PERSONA_EMAILS } } },
      include: { user: true },
    });
    const linked = new Set(
      (await prisma.externalIdentity.findMany({ where: { tenantId: tenant.id, entityType: 'STUDENT' }, select: { internalId: true } })).map((row) => row.internalId),
    );
    // Students matched to the SIS get their data from it, not from the baseline.
    const pending = students.filter((student) => !linked.has(student.id));
    for (const student of pending) {
      const summary = await prisma.$transaction((tx) => onboardStudent(tx, { tenantId: tenant.id, userId: student.userId }), { timeout: 30_000 });
      console.log(`  • student ${student.user.email}: ${summary?.enrollments ?? 0} enrolments, ${summary?.transcriptTerms ?? 0} transcript term(s)`);
    }

    const faculty = await prisma.facultyProfile.findMany({
      where: { tenantId: tenant.id, user: { email: { notIn: PRESERVED_PERSONA_EMAILS }, instructedCourses: { none: {} } } },
      include: { user: true },
    });
    for (const member of faculty) {
      const summary = await prisma.$transaction((tx) => onboardFaculty(tx, { tenantId: tenant.id, userId: member.userId }), { timeout: 30_000 });
      console.log(`  • faculty ${member.user.email}: ${summary?.course ?? 'no section'} with ${summary?.students ?? 0} students`);
    }
    if (!pending.length && !faculty.length) console.log(`  • ${tenant.name}: nothing to backfill`);
  }
}

main()
  .catch((error) => {
    console.error('Onboarding backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
