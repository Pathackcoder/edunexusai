import { loadFixture, utcDate } from './shared.js';

/** Campus directory. Rows that correspond to a real account are linked to that user. */
export async function seedDirectory(prisma, tenant, users) {
  const { directoryData } = await loadFixture('directory');
  const linkByEmail = new Map([
    ['student@edunexus.ai', users.amitUser.id],
    ['m.lin@student.edunexus.ai', users.mayaUser.id],
  ]);

  let created = 0;
  for (const person of directoryData) {
    const userId = linkByEmail.get(person.email) ?? null;
    await prisma.directoryProfile.upsert({
      where: { tenantId_externalKey: { tenantId: tenant.id, externalKey: person.id } },
      create: {
        tenantId: tenant.id,
        userId,
        externalKey: person.id,
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
        isVisible: true,
      },
      update: { name: person.name, role: person.role, department: person.department },
    });
    created += 1;
  }

  // Faculty and admin demo accounts also belong in the directory.
  const extras = [
    {
      key: 'dir-fac-mitchell',
      userId: users.facultyUser.id,
      type: 'faculty',
      name: 'Dr. Sarah Mitchell',
      role: 'Associate Professor',
      department: 'Computer Science & Engineering',
      email: 'faculty@edunexus.ai',
      phone: '(555) 012-3410',
      location: 'Science Building 204B',
      program: 'Database Systems & Storage Engines',
      admitYear: 'Faculty since 2017',
      avatarBg: '#7c3aed',
      initials: 'SM',
      bio: 'Instructor of record for CS 501 Advanced Database Systems.',
      officeHours: 'Wed 2:00 PM - 4:00 PM, Sci 204B',
    },
    {
      key: 'dir-stf-whitfield',
      userId: users.adminUser.id,
      type: 'staff',
      name: 'Karen Whitfield',
      role: 'Director, Student Systems & Integrations',
      department: 'Registrar & Enrollment Services',
      email: 'admin@edunexus.ai',
      phone: '(555) 019-2050',
      location: 'Student Services Pavilion, Suite 310',
      program: null,
      admitYear: 'Staff since 2019',
      avatarBg: '#0f766e',
      initials: 'KW',
      bio: 'Owns student system configuration, entitlements and institutional integrations.',
      officeHours: 'Mon-Fri 9:00 AM - 4:00 PM',
    },
  ];

  for (const person of extras) {
    const { key, ...rest } = person;
    await prisma.directoryProfile.upsert({
      where: { tenantId_externalKey: { tenantId: tenant.id, externalKey: key } },
      create: { tenantId: tenant.id, externalKey: key, isVisible: true, ...rest },
      update: {},
    });
    created += 1;
  }

  return created;
}

export async function seedLibrary(prisma, tenant, studentProfile) {
  const { libraryAccountSummary, initialCheckedOutBooks, sampleLibraryCatalog } =
    await loadFixture('library');

  const account = await prisma.libraryAccount.upsert({
    where: { studentProfileId: studentProfile.id },
    create: {
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      patronId: libraryAccountSummary.patronId,
      barcode: libraryAccountSummary.barcode,
      patronStatus: libraryAccountSummary.patronStatus,
      borrowingLimit: libraryAccountSummary.borrowingLimit,
      unpaidFines: libraryAccountSummary.unpaidFines ?? 0,
    },
    update: {},
  });

  for (const book of initialCheckedOutBooks) {
    await prisma.libraryLoan.upsert({
      where: { libraryAccountId_externalKey: { libraryAccountId: account.id, externalKey: book.id } },
      create: {
        libraryAccountId: account.id,
        externalKey: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        callNumber: book.callNumber,
        checkoutDate: utcDate(book.checkoutDate),
        dueDate: utcDate(book.dueDate),
        status: book.status,
        renewable: book.renewable,
        renewalsCount: book.renewalsCount,
        coverColor: book.coverColor,
        location: book.location,
      },
      update: {},
    });
  }

  for (const item of sampleLibraryCatalog) {
    await prisma.libraryCatalogItem.upsert({
      where: { tenantId_externalKey: { tenantId: tenant.id, externalKey: item.id } },
      create: {
        tenantId: tenant.id,
        externalKey: item.id,
        title: item.title,
        author: item.author,
        type: item.type,
        year: item.year,
        callNumber: item.callNumber,
        status: item.status,
        // The catalogue mixes counts with labels such as "Unlimited" for e-resources,
        // so both a numeric and a display form are kept.
        copies: Number.isFinite(Number(item.copies)) ? Number(item.copies) : null,
        copiesLabel: String(item.copies),
        location: item.location,
      },
      update: { status: item.status },
    });
  }

  return { loans: initialCheckedOutBooks.length, catalog: sampleLibraryCatalog.length };
}

export async function seedCampusSafety(prisma, tenant) {
  const { campusSecurityContacts, emergencyProcedures, safeWalkInfo } = await loadFixture('security');

  for (const [index, contact] of campusSecurityContacts.items.entries()) {
    await prisma.securityContact.upsert({
      where: { tenantId_title: { tenantId: tenant.id, title: contact.title } },
      create: {
        tenantId: tenant.id,
        title: contact.title,
        phone: contact.phone,
        description: contact.description,
        available: contact.available,
        isPrimary: Boolean(contact.isPrimary),
        sortOrder: index,
      },
      update: { phone: contact.phone, description: contact.description },
    });
  }

  for (const [index, procedure] of emergencyProcedures.entries()) {
    const row = await prisma.emergencyProcedure.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: procedure.id } },
      create: {
        tenantId: tenant.id,
        key: procedure.id,
        title: procedure.title,
        icon: procedure.icon,
        urgencyColor: procedure.urgencyColor,
        summary: procedure.summary,
        sortOrder: index,
      },
      update: { title: procedure.title, summary: procedure.summary },
    });
    await prisma.emergencyProcedureStep.deleteMany({ where: { procedureId: row.id } });
    await prisma.emergencyProcedureStep.createMany({
      data: procedure.steps.map((text, stepIndex) => ({
        procedureId: row.id,
        text,
        sortOrder: stepIndex,
      })),
    });
  }

  // The scalars the original module attached to the contacts array, plus SafeWalk.
  const settings = [
    ['dispatch', 'emergency', campusSecurityContacts.emergency],
    ['dispatch', 'dispatch', campusSecurityContacts.dispatch],
    ['dispatch', 'safeWalk', campusSecurityContacts.safeWalk],
    ['dispatch', 'officeLocation', campusSecurityContacts.officeLocation],
    ['dispatch', 'hours', campusSecurityContacts.hours],
    ['dispatch', 'leadOfficial', campusSecurityContacts.leadOfficial],
    ['dispatch', 'email', campusSecurityContacts.email],
    ['safeWalk', 'hours', safeWalkInfo.hours],
    ['safeWalk', 'coverage', safeWalkInfo.coverage],
    ['safeWalk', 'averageResponseTime', safeWalkInfo.averageResponseTime],
    ['safeWalk', 'dispatchLine', safeWalkInfo.dispatchLine],
  ];

  for (const [group, key, value] of settings) {
    if (!value) continue;
    await prisma.campusSafetySetting.upsert({
      where: { tenantId_group_key: { tenantId: tenant.id, group, key } },
      create: { tenantId: tenant.id, group, key, value: String(value) },
      update: { value: String(value) },
    });
  }

  return {
    contacts: campusSecurityContacts.items.length,
    procedures: emergencyProcedures.length,
    settings: settings.length,
  };
}

/** A library patron record for every student, so the library page is never a dead end. */
export async function seedCohortLibrary(prisma, tenant, { skipStudentProfileIds = [] } = {}) {
  const students = await prisma.studentProfile.findMany({
    where: { tenantId: tenant.id, id: { notIn: skipStudentProfileIds } },
    include: { libraryAccount: true },
  });

  let created = 0;
  for (const student of students) {
    if (student.libraryAccount) continue;
    // Derived from the student number so the id is stable across re-runs. A loop index
    // would shift once some students already had an account, colliding on re-seed.
    const patronId = `LIB-${student.studentNumber.replace(/[^0-9]/g, '')}`;
    await prisma.libraryAccount.create({
      data: {
        tenantId: tenant.id,
        studentProfileId: student.id,
        patronId,
        barcode: patronId,
        patronStatus: 'Active Borrower',
        borrowingLimit: 15,
        unpaidFines: 0,
      },
    });
    created += 1;
  }
  return created;
}
