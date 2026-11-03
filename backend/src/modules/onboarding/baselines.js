/**
 * Baseline account records shared by the seed (cohort students) and by onboarding of new
 * users, so both paths create identical bursar and library records.
 *
 * `db` is a Prisma client or an interactive-transaction client.
 */

/** Stable number derived from a string (FNV-1a), so a person's baseline never reshuffles. */
export function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Bursar account for the current term. `template` carries the institution's term billing
 * (academic year, term label, due date). The balance is derived from the student number,
 * so re-running produces the same figures.
 */
export async function createBaselineTuitionAccount(db, { tenantId, studentProfile, template }) {
  const seedNumber = Number(studentProfile.studentNumber.replace(/[^0-9]/g, '').slice(-3)) || 0;
  const balance = Number((2200 + (seedNumber % 20) * 437.25).toFixed(2));
  const account = await db.tuitionAccount.create({
    data: {
      tenantId,
      studentProfileId: studentProfile.id,
      academicYear: template.academicYear,
      termLabel: template.termLabel,
      currentBalance: balance,
      openingBalance: balance,
      dueDate: template.dueDate,
      statusLabel: 'Payment due',
    },
  });
  await db.tuitionCharge.createMany({
    data: [
      { tuitionAccountId: account.id, label: 'Tuition (16 Graduate Credits)', amount: 7500, sortOrder: 0 },
      { tuitionAccountId: account.id, label: 'Campus & Technology Fees', amount: 650, sortOrder: 1 },
      { tuitionAccountId: account.id, label: 'Student Health Insurance Plan', amount: 850, sortOrder: 2 },
      { tuitionAccountId: account.id, label: 'Institutional Aid Applied', amount: -(9000 - balance), sortOrder: 3 },
    ],
  });
  return account;
}

/** Library patron record; the patron id is derived from the student number. */
export async function createBaselineLibraryAccount(db, { tenantId, studentProfile }) {
  const patronId = `LIB-${studentProfile.studentNumber.replace(/[^0-9]/g, '')}`;
  return db.libraryAccount.create({
    data: {
      tenantId,
      studentProfileId: studentProfile.id,
      patronId,
      barcode: patronId,
      patronStatus: 'Active Borrower',
      borrowingLimit: 15,
      unpaidFines: 0,
    },
  });
}
