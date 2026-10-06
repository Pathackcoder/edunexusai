import { loadFixture, parseDisplayDate, utcDate } from './shared.js';
import { mockUniversityMapper } from '../../src/integrations/mappers/mockUniversityMapper.js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MOCK_DATA_DIR = resolve(here, '..', '..', '..', 'mock-external-service', 'data');

/**
 * Tuition is EDUNEXUS-OWNED: the portal takes the payment, so the portal owns the
 * account, the charges and the transaction history.
 */
export async function seedTuition(prisma, tenant, studentProfile) {
  const { initialFinanceData: finance } = await loadFixture('finance');

  const account = await prisma.tuitionAccount.upsert({
    where: { studentProfileId: studentProfile.id },
    create: {
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      academicYear: finance.academicYear,
      termLabel: finance.term,
      currentBalance: finance.currentBalance,
      openingBalance: finance.currentBalance,
      dueDate: utcDate(finance.dueDateIso),
      statusLabel: finance.status,
    },
    update: {},
  });

  await prisma.tuitionCharge.deleteMany({ where: { tuitionAccountId: account.id } });
  await prisma.tuitionCharge.createMany({
    data: finance.breakdown.map((line, index) => ({
      tuitionAccountId: account.id,
      label: line.label,
      amount: line.amount,
      sortOrder: index,
    })),
  });

  for (const transaction of finance.transactions) {
    await prisma.payment.upsert({
      where: { tenantId_reference: { tenantId: tenant.id, reference: transaction.id } },
      create: {
        tenantId: tenant.id,
        tuitionAccountId: account.id,
        reference: transaction.id,
        receiptNumber: transaction.receiptNumber,
        transactionRef: transaction.id,
        description: transaction.description,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        status: transaction.status,
        type: transaction.type,
        paidAt: parseDisplayDate(transaction.date) ?? new Date(),
      },
      update: {},
    });
  }

  return { charges: finance.breakdown.length, payments: finance.transactions.length };
}

/**
 * Financial aid is INTEGRATION-OWNED (the aid office system is the system of record).
 * The API reads it live through the connector; these rows are the cached copy the API
 * falls back to when the provider is unreachable, so the page degrades instead of
 * breaking. Seeded through the same canonical mapper the connector uses.
 */
export async function seedFinancialAidCache(prisma, tenant, studentProfile) {
  const raw = JSON.parse(await readFile(resolve(MOCK_DATA_DIR, 'financial-aid.json'), 'utf8'));
  const aid = mockUniversityMapper.mapFinancialAid(raw);
  if (!aid) return { awards: 0 };

  const pkg = await prisma.financialAidPackage.upsert({
    where: { studentProfileId_awardYear: { studentProfileId: studentProfile.id, awardYear: aid.awardYear } },
    create: {
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      awardYear: aid.awardYear,
      status: aid.status,
      applicationStatus: aid.applicationStatus,
      totalAwarded: aid.totalAwarded,
      disbursed: aid.disbursed,
      scheduled: aid.scheduled,
      lastUpdatedLabel: aid.lastUpdatedLabel,
      sourceSystem: 'MOCK_UNIVERSITY',
      externalId: aid.externalStudentId,
      lastSyncedAt: new Date(),
    },
    update: { lastSyncedAt: new Date() },
  });

  await prisma.financialAidAward.deleteMany({ where: { packageId: pkg.id } });
  await prisma.financialAidAward.createMany({
    data: aid.awards.map((award) => ({
      packageId: pkg.id,
      reference: award.reference,
      name: award.name,
      category: award.category,
      amount: award.amount,
      termLabel: award.termLabel,
      status: award.status,
      renewableLabel: award.renewableLabel,
      description: award.description,
      sortOrder: award.sortOrder,
    })),
  });

  await prisma.aidDisbursement.deleteMany({ where: { packageId: pkg.id } });
  await prisma.aidDisbursement.createMany({
    data: aid.disbursements.map((item) => ({
      packageId: pkg.id,
      disbursedOn: parseDisplayDate(item.disbursedOn),
      amount: item.amount,
      status: item.status,
      appliedTo: item.appliedTo,
      sortOrder: item.sortOrder,
    })),
  });

  await prisma.aidRequirement.deleteMany({ where: { packageId: pkg.id } });
  await prisma.aidRequirement.createMany({
    data: aid.requirements.map((item) => ({
      packageId: pkg.id,
      title: item.title,
      status: item.status,
      completedOn: parseDisplayDate(item.completedOn),
      sortOrder: item.sortOrder,
    })),
  });

  return { awards: aid.awards.length, disbursements: aid.disbursements.length, requirements: aid.requirements.length };
}

/**
 * Every enrolled student has a bursar account, so seed one for anyone the cohort
 * provisioning created. Amounts are varied so the admin and faculty views do not show
 * the same number for everyone.
 */
export async function seedCohortTuition(prisma, tenant, { skipStudentProfileIds = [] } = {}) {
  const { initialFinanceData: template } = await loadFixture('finance');
  const students = await prisma.studentProfile.findMany({
    where: { tenantId: tenant.id, id: { notIn: skipStudentProfileIds } },
    include: { tuitionAccount: true },
  });

  let created = 0;
  for (const student of students) {
    if (student.tuitionAccount) continue;
    // Derived from the student number so re-running the seed produces the same figures.
    const seedNumber = Number(student.studentNumber.replace(/[^0-9]/g, '').slice(-3)) || 0;
    const balance = Number((2200 + (seedNumber % 20) * 437.25).toFixed(2));
    const account = await prisma.tuitionAccount.create({
      data: {
        tenantId: tenant.id,
        studentProfileId: student.id,
        academicYear: template.academicYear,
        termLabel: template.term,
        currentBalance: balance,
        openingBalance: balance,
        dueDate: utcDate(template.dueDateIso),
        statusLabel: 'Payment due',
      },
    });
    await prisma.tuitionCharge.createMany({
      data: [
        { tuitionAccountId: account.id, label: 'Tuition (16 Graduate Credits)', amount: 7500, sortOrder: 0 },
        { tuitionAccountId: account.id, label: 'Campus & Technology Fees', amount: 650, sortOrder: 1 },
        { tuitionAccountId: account.id, label: 'Student Health Insurance Plan', amount: 850, sortOrder: 2 },
        { tuitionAccountId: account.id, label: 'Institutional Aid Applied', amount: -(9000 - balance), sortOrder: 3 },
      ],
    });
    created += 1;
  }
  return created;
}
