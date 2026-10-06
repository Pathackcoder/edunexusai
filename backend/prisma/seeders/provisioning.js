import bcrypt from 'bcryptjs';
import { env } from '../../src/config/env.js';
import { DEMO_PASSWORDS } from './shared.js';
import {
  getIntegrationByKey,
  runIntegrationOperation,
} from '../../src/integrations/integrationService.js';
import { mockUniversityMapper } from '../../src/integrations/mappers/mockUniversityMapper.js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MOCK_DATA_DIR = resolve(here, '..', '..', '..', 'mock-external-service', 'data');

/**
 * Account provisioning from the system of record.
 *
 * Students exist in the SIS first. This reads the SIS roster through the connector and
 * creates a portal account for any student that does not have one yet, recording the
 * SIS identifier in the canonical identity map rather than on the student record. That
 * mapping is what later lets an enrollment row arriving from the SIS find the right
 * Edunexus student without any provider id leaking into the domain model.
 *
 * Accounts created here all share the demo student password, because this is a local
 * prototype. A real deployment would not set a password at all — the student would
 * authenticate against the institution's identity provider.
 */
export async function provisionStudentsFromSis(prisma, tenant, { roles, tiers, adminUserId }) {
  let sisStudents = [];
  let mode = 'connector';

  try {
    const integration = await getIntegrationByKey(tenant.id, 'mock-university');
    const result = await runIntegrationOperation({
      integration,
      operation: 'STUDENTS.PULL',
      userId: adminUserId,
      run: async (connector) => {
        const { payload, durationMs } = await connector.request('/students');
        return { records: payload?.data ?? [], durationMs };
      },
    });
    sisStudents = result.records.map((record) => mockUniversityMapper.mapStudent(record));
  } catch {
    mode = 'offline-fallback';
    const raw = JSON.parse(await readFile(resolve(MOCK_DATA_DIR, 'students.json'), 'utf8'));
    sisStudents = raw.map((record) => mockUniversityMapper.mapStudent(record));
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORDS.student, env.bcryptRounds);
  const tierList = [tiers.standard, tiers.advanced];

  let created = 0;
  let linked = 0;
  let sequence = await prisma.studentProfile.count({ where: { tenantId: tenant.id } });

  for (const [index, sisStudent] of sisStudents.entries()) {
    if (!sisStudent?.email || !sisStudent.externalId) continue;
    const email = sisStudent.email.trim().toLowerCase();

    let user = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      include: { studentProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          firstName: sisStudent.firstName,
          lastName: sisStudent.lastName,
          status: 'ACTIVE',
          userRoles: { create: [{ roleId: roles.STUDENT.id }] },
        },
        include: { studentProfile: true },
      });
      created += 1;
    }

    let profile = user.studentProfile;
    if (!profile) {
      sequence += 1;
      profile = await prisma.studentProfile.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          // Alternate tiers across the cohort so tiering is visible in the admin screens.
          tierId: tierList[index % tierList.length].id,
          studentNumber: `ENX-${984300 + sequence}`,
          degree: sisStudent.degree,
          department: sisStudent.department,
          academicStanding: sisStudent.academicStanding,
          currentTerm: 'Fall 2026',
          admitTerm: 'Fall 2025',
          creditsCompleted: sisStudent.creditsCompleted,
          totalCreditsRequired: sisStudent.totalCreditsRequired,
          cumulativeGpa: sisStudent.cumulativeGpa,
          majorGpa: sisStudent.majorGpa,
        },
      });
    }

    for (const provider of ['MOCK_UNIVERSITY', 'CANVAS']) {
      await prisma.externalIdentity.upsert({
        where: {
          tenantId_provider_entityType_externalId: {
            tenantId: tenant.id,
            provider,
            entityType: 'STUDENT',
            externalId: sisStudent.externalId,
          },
        },
        create: {
          tenantId: tenant.id,
          provider,
          entityType: 'STUDENT',
          externalId: sisStudent.externalId,
          internalId: profile.id,
        },
        update: { internalId: profile.id },
      });
    }
    linked += 1;
  }

  return { mode, sisStudents: sisStudents.length, created, linked };
}
