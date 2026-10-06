import { prisma } from '../../db/prisma.js';
import { formatCurrency, toIsoDate, toNumber } from '../../utils/format.js';
import { notFound } from '../../utils/errors.js';

/** DIRECTORY ------------------------------------------------------------------ */

function presentDirectoryEntry(person) {
  return {
    id: person.externalKey,
    profileId: person.id,
    type: person.type,
    name: person.name,
    role: person.role,
    department: person.department,
    email: person.email,
    phone: person.phone,
    location: person.location,
    program: person.program,
    admitYear: person.admitYear,
    avatarBg: person.avatarBg,
    initials: person.initials,
    bio: person.bio,
    officeHours: person.officeHours,
  };
}

export async function listDirectory(tenantId, { search, type, department } = {}) {
  const people = await prisma.directoryProfile.findMany({
    where: {
      tenantId,
      isVisible: true,
      ...(type && type !== 'all' ? { type } : {}),
      ...(department && department !== 'All Departments' ? { department } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { department: { contains: search, mode: 'insensitive' } },
              { role: { contains: search, mode: 'insensitive' } },
              { program: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  const departments = await prisma.directoryProfile.findMany({
    where: { tenantId, isVisible: true },
    select: { department: true },
    distinct: ['department'],
    orderBy: { department: 'asc' },
  });

  return {
    people: people.map(presentDirectoryEntry),
    departments: [
      'All Departments',
      ...departments.map((row) => row.department).filter(Boolean),
    ],
  };
}

/** LIBRARY -------------------------------------------------------------------- */

const loanStatus = (loan) => {
  if (loan.returnedAt) return 'Returned';
  const days = Math.ceil((new Date(loan.dueDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Overdue';
  if (days <= 14) return 'Due Soon';
  return 'Active';
};

export async function getLibrary(tenantId, studentProfileId) {
  const account = await prisma.libraryAccount.findFirst({
    where: { tenantId, studentProfileId },
    include: { loans: { orderBy: { dueDate: 'asc' } } },
  });

  const catalog = await prisma.libraryCatalogItem.findMany({
    where: { tenantId },
    orderBy: { title: 'asc' },
  });

  // A student without a patron record still sees the catalogue, with an empty account.
  if (!account) {
    return {
      summary: {
        booksCheckedOut: 0,
        dueSoon: 0,
        overdue: 0,
        overdueItems: 0,
        fines: 0,
        unpaidFines: 0,
        formattedFines: formatCurrency(0),
        patronId: null,
        barcode: null,
        patronStatus: 'No library account on file',
        borrowingLimit: 0,
        hasAccount: false,
      },
      loans: [],
      catalog: catalog.map((item) => ({
        id: item.externalKey,
        title: item.title,
        author: item.author,
        type: item.type,
        year: item.year,
        callNumber: item.callNumber,
        status: item.status,
        copies: item.copiesLabel ?? item.copies,
        location: item.location,
      })),
    };
  }

  const openLoans = account.loans.filter((loan) => !loan.returnedAt);
  const withStatus = openLoans.map((loan) => ({
    id: loan.externalKey,
    loanId: loan.id,
    title: loan.title,
    author: loan.author,
    isbn: loan.isbn,
    callNumber: loan.callNumber,
    checkoutDate: toIsoDate(loan.checkoutDate),
    dueDate: toIsoDate(loan.dueDate),
    status: loanStatus(loan),
    renewable: loan.renewable && loan.renewalsCount < 2,
    renewalsCount: loan.renewalsCount,
    coverColor: loan.coverColor,
    location: loan.location,
  }));

  const dueSoon = withStatus.filter((loan) => loan.status === 'Due Soon').length;
  const overdue = withStatus.filter((loan) => loan.status === 'Overdue').length;

  return {
    summary: {
      booksCheckedOut: withStatus.length,
      dueSoon,
      overdue,
      overdueItems: overdue,
      fines: toNumber(account.unpaidFines),
      unpaidFines: toNumber(account.unpaidFines),
      formattedFines: formatCurrency(account.unpaidFines),
      patronId: account.patronId,
      barcode: account.barcode,
      patronStatus: account.patronStatus,
      borrowingLimit: account.borrowingLimit,
    },
    loans: withStatus,
    catalog: catalog.map((item) => ({
      id: item.externalKey,
      title: item.title,
      author: item.author,
      type: item.type,
      year: item.year,
      callNumber: item.callNumber,
      status: item.status,
      copies: item.copiesLabel ?? item.copies,
      location: item.location,
    })),
  };
}

/** Renew a loan: pushes the due date out and increments the renewal counter. */
export async function renewLoan(tenantId, studentProfileId, loanId) {
  const account = await prisma.libraryAccount.findFirst({ where: { tenantId, studentProfileId } });
  if (!account) throw notFound('No library account exists for this student.');

  const loan = await prisma.libraryLoan.findFirst({ where: { id: loanId, libraryAccountId: account.id } });
  if (!loan) throw notFound('Loan not found.');
  if (!loan.renewable || loan.renewalsCount >= 2) {
    throw notFound('This item cannot be renewed again. Please contact the circulation desk.');
  }

  const nextDue = new Date(loan.dueDate);
  nextDue.setUTCDate(nextDue.getUTCDate() + 28);

  const updated = await prisma.libraryLoan.update({
    where: { id: loan.id },
    data: { dueDate: nextDue, renewalsCount: loan.renewalsCount + 1, status: 'Active' },
  });

  return {
    id: updated.externalKey,
    loanId: updated.id,
    title: updated.title,
    dueDate: toIsoDate(updated.dueDate),
    renewalsCount: updated.renewalsCount,
    status: loanStatus(updated),
  };
}

/** CAMPUS SAFETY -------------------------------------------------------------- */

export async function getCampusSafety(tenantId) {
  const [contacts, procedures, settings] = await Promise.all([
    prisma.securityContact.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
    prisma.emergencyProcedure.findMany({
      where: { tenantId },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.campusSafetySetting.findMany({ where: { tenantId } }),
  ]);

  const grouped = {};
  for (const setting of settings) {
    grouped[setting.group] ??= {};
    grouped[setting.group][setting.key] = setting.value;
  }

  return {
    contacts: contacts.map((contact) => ({
      title: contact.title,
      phone: contact.phone,
      description: contact.description,
      available: contact.available,
      isPrimary: contact.isPrimary,
    })),
    dispatch: grouped.dispatch ?? {},
    safeWalk: grouped.safeWalk ?? {},
    procedures: procedures.map((procedure) => ({
      id: procedure.key,
      title: procedure.title,
      icon: procedure.icon,
      urgencyColor: procedure.urgencyColor,
      summary: procedure.summary,
      steps: procedure.steps.map((step) => step.text),
    })),
  };
}
