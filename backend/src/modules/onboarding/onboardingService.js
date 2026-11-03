import { recordAudit } from '../audit/auditService.js';
import { createBaselineLibraryAccount, createBaselineTuitionAccount, stableHash } from './baselines.js';
import { institutionalBaselineSource } from './onboardingSource.js';

/**
 * Onboarding: gives a newly created Student or Faculty user the records their dashboard
 * reads, persisted in the same database the rest of the portal uses.
 *
 *   Admin creates user → source supplies person-specific records → this service
 *   persists them → the user signs in to a populated dashboard.
 *
 * Today the source is the institutional baseline (catalogue, term, degree rules). When
 * SIS/LMS/IdP connectors are wired, pass a source that reads those systems instead; the
 * persistence below and the dashboards stay the same.
 *
 * Every step is idempotent (it skips records that already exist), so onboarding can be
 * re-run safely, e.g. to backfill accounts created before onboarding existed.
 */

// Curated demo personas walk through scripted data. Onboarding someone else never
// enrols them into a new section or otherwise changes their records.
export const PRESERVED_PERSONA_EMAILS = ['student@edunexus.ai', 'student.advanced@edunexus.ai', 'faculty@edunexus.ai', 'admin@edunexus.ai'];

const AVATAR_COLORS = ['#1d4ed8', '#7c3aed', '#0f766e', '#b45309', '#be123c', '#4338ca'];
const DAY = 86_400_000;
const initialsOf = (user) => `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
const round2 = (value) => Math.round(value * 100) / 100;
const dateOnly = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const fmtDate = (date) => date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const money = (value) => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function currentTerm(db, tenantId) {
  return (
    (await db.term.findFirst({ where: { tenantId, isCurrent: true } })) ??
    (await db.term.findFirst({ where: { tenantId }, orderBy: { startDate: 'desc' } }))
  );
}

/** The institution's billing for the term: copied from its bursar records when present. */
async function termBilling(db, tenantId, term) {
  const existing = await db.tuitionAccount.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  if (existing) return { academicYear: existing.academicYear, termLabel: existing.termLabel, dueDate: existing.dueDate };
  const due = new Date(Date.now() + 21 * DAY);
  return { academicYear: '2026-2027', termLabel: term?.name ?? 'Current Term', dueDate: dateOnly(due) };
}

async function ensureDirectoryEntry(db, { tenantId, user, type, role, department, program, admitYear, location, officeHours, bio }) {
  if (await db.directoryProfile.findFirst({ where: { tenantId, userId: user.id } })) return false;
  await db.directoryProfile.create({
    data: {
      tenantId,
      userId: user.id,
      externalKey: `dir-${type.slice(0, 3)}-${user.id.slice(0, 8)}`,
      type,
      name: type === 'faculty' && /professor/i.test(role ?? '') ? `Dr. ${user.firstName} ${user.lastName}` : `${user.firstName} ${user.lastName}`,
      role,
      department: department?.replace(/^Department of /, '') ?? null,
      email: user.email,
      phone: user.phone ?? null,
      location: location ?? null,
      program: program ?? null,
      admitYear,
      avatarBg: AVATAR_COLORS[stableHash(user.id) % AVATAR_COLORS.length],
      initials: initialsOf(user),
      bio,
      officeHours: officeHours ?? null,
      isVisible: true,
    },
  });
  return true;
}

async function notify(db, { tenantId, userId }, items) {
  const existing = await db.notification.count({ where: { tenantId, userId, sourceType: 'ONBOARDING' } });
  if (existing) return 0;
  const now = Date.now();
  await db.notification.createMany({
    data: items.map((item, index) => ({
      tenantId,
      userId,
      title: item.title,
      message: item.message,
      category: item.category,
      priority: item.priority ?? 'normal',
      link: item.link ?? null,
      sourceType: 'ONBOARDING',
      // Oldest first, so the welcome note is the latest thing they see.
      createdAt: new Date(now - (items.length - index) * 60_000),
    })),
  });
  return items.length;
}

/* -------------------------------------------------------------------------- */
/* Students                                                                     */
/* -------------------------------------------------------------------------- */

export async function onboardStudent(db, { tenantId, userId, actorUserId = null, source = institutionalBaselineSource }) {
  const user = await db.user.findFirst({ where: { tenantId, id: userId }, include: { studentProfile: true } });
  const profile = user?.studentProfile;
  if (!profile) return null;
  // A student matched to an external system of record gets their data from that system
  // (provisioning and sync); baseline data must never overwrite it.
  if (await db.externalIdentity.findFirst({ where: { tenantId, entityType: 'STUDENT', internalId: profile.id } })) return null;
  const term = await currentTerm(db, tenantId);
  if (!term) return null;

  const record = await source.student({ db, tenantId, user, profile, term });
  const summary = { enrollments: 0, transcriptTerms: 0, tuition: false, library: false, aid: false, notifications: 0 };

  // Prior transcript terms (completed coursework) and the GPA that follows from them.
  const hasTranscript = (await db.transcriptTerm.count({ where: { tenantId, studentProfileId: profile.id } })) > 0;
  let earned = 0;
  let qualityPoints = 0;
  let lastTermGpa = null;
  if (!hasTranscript) {
    const ordered = [...record.prior].reverse(); // oldest first
    for (const [index, term] of ordered.entries()) {
      const credits = term.courses.reduce((sum, course) => sum + course.credits, 0);
      const points = term.courses.reduce((sum, course) => sum + course.points * course.credits, 0);
      earned += credits;
      qualityPoints += points;
      const termGpa = round2(points / credits);
      lastTermGpa = termGpa;
      await db.transcriptTerm.create({
        data: {
          tenantId,
          studentProfileId: profile.id,
          termLabel: term.termLabel,
          termGpa,
          termGpaLabel: termGpa.toFixed(2),
          cumulativeGpa: round2(qualityPoints / earned),
          creditsAttempted: credits,
          creditsEarned: credits,
          creditsEarnedLabel: String(credits),
          academicStanding: 'Good Standing',
          sortOrder: index,
          courses: {
            create: term.courses.map((course, order) => ({
              code: course.code,
              title: course.title,
              credits: course.credits,
              grade: course.grade,
              points: course.points,
              pointsLabel: (course.points * course.credits).toFixed(2),
              sortOrder: order,
            })),
          },
        },
      });
      summary.transcriptTerms += 1;
    }
  }

  const cumulativeGpa = earned ? round2(qualityPoints / earned) : null;
  await db.studentProfile.update({
    where: { id: profile.id },
    data: {
      degree: profile.degree ?? record.degree,
      department: profile.department ?? record.department,
      admitTerm: profile.admitTerm ?? record.admitTerm,
      currentTerm: record.currentTerm,
      academicStanding: profile.academicStanding ?? 'Good Standing',
      totalCreditsRequired: profile.totalCreditsRequired || record.totalCreditsRequired,
      ...(hasTranscript
        ? {}
        : {
            creditsCompleted: earned,
            cumulativeGpa,
            majorGpa: cumulativeGpa,
            semesterGpa: lastTermGpa,
            honors: cumulativeGpa >= 3.7 ? "Dean's List" : null,
          }),
    },
  });

  // Current-term enrolments; their course assignments then appear automatically.
  const enrolledCodes = [];
  for (const item of record.enrollments) {
    const exists = await db.enrollment.findFirst({ where: { tenantId, studentProfileId: profile.id, courseId: item.courseId } });
    enrolledCodes.push(item.code);
    if (exists) continue;
    await db.enrollment.create({
      data: {
        tenantId,
        courseId: item.courseId,
        studentProfileId: profile.id,
        status: 'Registered',
        percentage: item.percentage,
        letterGrade: item.letterGrade,
        gradePoints: item.gradePoints,
      },
    });
    summary.enrollments += 1;
  }

  // Work already due before they joined is recorded as submitted, not as overdue.
  const pastDue = await db.assignment.findMany({
    where: { tenantId, courseId: { in: record.enrollments.map((item) => item.courseId) }, dueDate: { lt: new Date() } },
    include: { submissions: { where: { studentProfileId: profile.id } } },
  });
  for (const assignment of pastDue) {
    if (assignment.submissions.length) continue;
    await db.assignmentSubmission.create({
      data: {
        tenantId,
        assignmentId: assignment.id,
        studentProfileId: profile.id,
        status: 'Completed',
        submittedAt: new Date(assignment.dueDate.getTime() - DAY),
      },
    });
  }

  // Bursar and library accounts.
  const fresh = await db.studentProfile.findUnique({ where: { id: profile.id }, include: { tuitionAccount: true, libraryAccount: true } });
  let tuition = fresh.tuitionAccount;
  if (!tuition) {
    tuition = await createBaselineTuitionAccount(db, { tenantId, studentProfile: fresh, template: await termBilling(db, tenantId, term) });
    summary.tuition = true;
  }
  if (!fresh.libraryAccount) {
    const account = await createBaselineLibraryAccount(db, { tenantId, studentProfile: fresh });
    // Course texts for one of their sections, borrowed in the first week of term.
    const books = await db.libraryCatalogItem.findMany({ where: { tenantId, type: { contains: 'Book', mode: 'insensitive' } }, orderBy: { title: 'asc' } });
    const h = stableHash(user.id);
    const picks = books.length ? [books[h % books.length], books[(h + 3) % books.length]].filter((book, i, all) => all.indexOf(book) === i) : [];
    for (const [index, book] of picks.entries()) {
      const checkout = dateOnly(new Date(Date.now() - (10 + index * 4) * DAY));
      await db.libraryLoan.create({
        data: {
          libraryAccountId: account.id,
          externalKey: `${account.patronId}-${book.externalKey}`,
          title: book.title,
          author: book.author,
          callNumber: book.callNumber,
          checkoutDate: checkout,
          dueDate: new Date(checkout.getTime() + 28 * DAY),
          status: 'Active',
          location: book.location,
          coverColor: AVATAR_COLORS[(h + index) % AVATAR_COLORS.length],
        },
      });
    }
    summary.library = true;
  }

  // Financial aid offer for the award year (portal-recorded until the aid system is connected).
  if (!(await db.financialAidPackage.count({ where: { tenantId, studentProfileId: profile.id } }))) {
    const awards = [record.aid.scholarship, record.aid.loan].filter(Boolean);
    const total = awards.reduce((sum, award) => sum + award.amount, 0);
    await db.financialAidPackage.create({
      data: {
        tenantId,
        studentProfileId: profile.id,
        awardYear: record.aid.awardYear,
        status: 'Offered',
        applicationStatus: 'Complete',
        totalAwarded: total,
        disbursed: 0,
        scheduled: total,
        lastUpdatedLabel: 'At enrollment',
        awards: {
          create: awards.map((award, index) => ({
            reference: `AID-${profile.studentNumber.replace(/[^0-9]/g, '')}-${index + 1}`,
            name: award.name,
            category: /loan/i.test(award.name) ? 'Loan' : 'Scholarship',
            amount: award.amount,
            termLabel: 'Fall 2026 / Spring 2027',
            status: 'Offered',
            sortOrder: index,
          })),
        },
        disbursements: {
          create: [
            { disbursedOn: dateOnly(new Date(Date.now() + 30 * DAY)), amount: total / 2, status: 'Scheduled', appliedTo: 'Tuition account', sortOrder: 0 },
            { disbursedOn: new Date(Date.UTC(2027, 0, 12)), amount: total / 2, status: 'Scheduled', appliedTo: 'Tuition account', sortOrder: 1 },
          ],
        },
      },
    });
    summary.aid = true;
  }

  const degree = profile.degree ?? record.degree;
  await ensureDirectoryEntry(db, {
    tenantId,
    user,
    type: 'student',
    role: /^b\.?s|bachelor/i.test(degree) ? 'Undergraduate Student' : 'Graduate Student',
    department: profile.department ?? record.department,
    program: degree,
    admitYear: (profile.admitTerm ?? record.admitTerm).replace(/\D/g, ''),
    bio: `${degree} student in ${(profile.department ?? record.department).replace(/^Department of /, '')}.`,
  });

  summary.notifications = await notify(db, { tenantId, userId: user.id }, [
    {
      title: 'Meet your academic advisor',
      message: 'Book a virtual advising session to plan your courses for next term.',
      category: 'academic',
      link: '/academics/advising',
    },
    {
      title: `Tuition due ${fmtDate(tuition.dueDate)}`,
      message: `Your ${tuition.termLabel} balance is ${money(tuition.currentBalance)}. Pay online from the Finance hub.`,
      category: 'finance',
      priority: 'high',
      link: '/finance/tuition',
    },
    {
      title: `Enrollment confirmed for ${record.currentTerm}`,
      message: `You are registered for ${enrolledCodes.join(', ')}.`,
      category: 'academic',
      link: '/academics/schedule',
    },
    {
      title: `Welcome to Feddrick University, ${user.firstName}`,
      message: `Your student portal is ready. Your student ID is ${profile.studentNumber}.`,
      category: 'administrative',
      link: '/profile',
    },
  ]);

  await recordAudit(
    { tenantId, actorUserId, action: 'USER_ONBOARDED', entityType: 'User', entityId: user.id, summary: `Student onboarding for ${user.firstName} ${user.lastName}: ${enrolledCodes.join(', ')}`, metadata: { source: source.name, ...summary } },
    db,
  );
  return summary;
}

/* -------------------------------------------------------------------------- */
/* Faculty                                                                      */
/* -------------------------------------------------------------------------- */

export async function onboardFaculty(db, { tenantId, userId, actorUserId = null, source = institutionalBaselineSource }) {
  const user = await db.user.findFirst({ where: { tenantId, id: userId }, include: { facultyProfile: true } });
  const profile = user?.facultyProfile;
  if (!profile) return null;
  const term = await currentTerm(db, tenantId);
  if (!term) return null;

  const record = await source.faculty({ db, tenantId, user, profile, term });
  const summary = { course: null, students: 0, assignments: 0, slots: 0, notifications: 0 };
  const displayName = /professor/i.test(record.title) ? `Dr. ${user.firstName} ${user.lastName}` : `${user.firstName} ${user.lastName}`;

  await db.facultyProfile.update({
    where: { id: profile.id },
    data: {
      title: profile.title ?? record.title,
      department: profile.department ?? record.department,
      officeLocation: profile.officeLocation ?? record.officeLocation,
      officeHours: profile.officeHours ?? record.officeHours,
      bio: profile.bio ?? (record.section ? `Instructor of record for ${record.section.code} ${record.section.name}.` : null),
    },
  });

  // Their teaching section for the current term, with a roster and coursework.
  let course = await db.course.findFirst({ where: { tenantId, termId: term.id, instructorUserId: user.id } });
  if (!course && record.section) {
    const s = record.section;
    course = await db.course.create({
      data: {
        tenantId,
        termId: term.id,
        code: s.code,
        name: s.name,
        credits: s.credits,
        description: s.description,
        room: s.room,
        meetingDays: s.meetingDays,
        dayCodes: s.dayCodes,
        timeLabel: s.timeLabel,
        startTime: s.startTime,
        endTime: s.endTime,
        colorHex: s.palette.color,
        bgColorHex: s.palette.bg,
        borderColorHex: s.palette.border,
        instructorUserId: user.id,
        instructorName: displayName,
        instructorEmail: user.email,
        officeHours: record.officeHours,
      },
    });
    summary.course = course.code;

    // Roster: students with the lightest current load, never the curated demo personas.
    const pool = await db.studentProfile.findMany({
      where: { tenantId, user: { status: 'ACTIVE', email: { notIn: PRESERVED_PERSONA_EMAILS } } },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { studentNumber: 'asc' },
    });
    const roster = pool.sort((a, b) => a._count.enrollments - b._count.enrollments).slice(0, s.rosterSize);
    await db.enrollment.createMany({
      data: roster.map((student, index) => {
        const percentage = 80 + ((stableHash(student.id) + index) % 18);
        const letter = percentage >= 93 ? ['A', 4.0] : percentage >= 90 ? ['A-', 3.7] : percentage >= 87 ? ['B+', 3.3] : percentage >= 83 ? ['B', 3.0] : ['B-', 2.7];
        return { tenantId, courseId: course.id, studentProfileId: student.id, status: 'Registered', percentage, letterGrade: letter[0], gradePoints: letter[1] };
      }),
    });
    summary.students = roster.length;

    const now = Date.now();
    const work = [
      { title: `${s.code} Problem Set 1`, days: 6, points: 50, type: 'Online upload', weight: '10%' },
      { title: `${s.code} Project proposal`, days: 13, points: 100, type: 'Online upload', weight: '15%' },
      { title: `${s.code} Midterm exam`, days: 24, points: 150, type: 'In class', weight: '25%' },
    ];
    await db.assignment.createMany({
      data: work.map((item) => ({
        tenantId,
        courseId: course.id,
        title: item.title,
        description: `${item.title} for ${s.name}.`,
        dueDate: new Date(dateOnly(new Date(now + item.days * DAY)).getTime() + 23 * 3_600_000 + 59 * 60_000),
        dueTimeLabel: '11:59 PM',
        points: item.points,
        submissionType: item.type,
        weightLabel: item.weight,
      })),
    });
    summary.assignments = work.length;

    await db.announcement.create({
      data: {
        tenantId,
        courseId: course.id,
        authorUserId: user.id,
        authorName: displayName,
        title: `Welcome to ${s.code}: ${s.name}`,
        content: `Welcome to ${s.name}. We meet ${s.meetingDays.join(' and ')}, ${s.timeLabel} in ${s.room}. Office hours are ${record.officeHours}.`,
        tags: ['Welcome', 'Syllabus'],
        audience: 'COURSE',
      },
    });

    await db.portalResource.create({
      data: {
        tenantId,
        slug: `${s.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-course-guide-${user.id.slice(0, 6)}`,
        title: `${s.code} course guide`,
        description: `Schedule, assessment and policies for ${s.name}.`,
        category: 'Teaching',
        audience: 'STUDENT',
        ownerRole: 'FACULTY',
        courseId: course.id,
        content: `Meetings: ${s.meetingDays.join(' / ')}, ${s.timeLabel}, ${s.room}.\nOffice hours: ${record.officeHours}.\nAssessment: problem sets, a project and a midterm exam.`,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdByUserId: user.id,
      },
    });

    await db.studentIntervention.createMany({
      data: [
        { tenantId, subjectLabel: 'Personal', courseId: course.id, createdByUserId: user.id, type: 'TASK', title: `Post the ${s.code} syllabus and first reading`, dueDate: dateOnly(new Date(now + 2 * DAY)) },
        { tenantId, subjectLabel: `${s.code} section`, courseId: course.id, createdByUserId: user.id, type: 'TASK', title: `Review week-one attendance for ${s.code}`, dueDate: dateOnly(new Date(now + 7 * DAY)) },
      ],
    });

    // Advising availability over the next two weeks, with one booking from their roster.
    if (!(await db.advisingSlot.count({ where: { tenantId, advisorUserId: user.id } }))) {
      const slots = [];
      const day = new Date();
      while (slots.length < 8) {
        day.setDate(day.getDate() + 1);
        if ([0, 6].includes(day.getDay())) continue;
        for (const [hour, mode] of [[10, 'VIRTUAL'], [15, 'IN_PERSON']]) {
          const startsAt = new Date(day);
          startsAt.setHours(hour, 0, 0, 0);
          slots.push({ tenantId, advisorUserId: user.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), mode, location: mode === 'IN_PERSON' ? record.officeLocation : 'Virtual meeting' });
        }
      }
      await db.advisingSlot.createMany({ data: slots });
      summary.slots = slots.length;
      const first = roster[0] && (await db.studentProfile.findUnique({ where: { id: roster[0].id }, select: { userId: true } }));
      const slot = await db.advisingSlot.findFirst({ where: { tenantId, advisorUserId: user.id, mode: 'VIRTUAL' }, orderBy: { startsAt: 'asc' } });
      if (first && slot) {
        const appointment = await db.advisingAppointment.create({
          data: { tenantId, slotId: slot.id, studentUserId: first.userId, advisorUserId: user.id, topic: `${s.code} project planning` },
        });
        await db.advisingAppointment.update({ where: { id: appointment.id }, data: { meetingUrl: `https://meet.edunexus.ai/advising/${appointment.id.slice(0, 8)}` } });
      }
    }
  }

  await ensureDirectoryEntry(db, {
    tenantId,
    user,
    type: 'faculty',
    role: profile.title ?? record.title,
    department: profile.department ?? record.department,
    program: course?.name ?? null,
    admitYear: `Faculty since ${new Date().getFullYear()}`,
    location: profile.officeLocation ?? record.officeLocation,
    officeHours: profile.officeHours ?? record.officeHours,
    bio: course ? `Instructor of record for ${course.code} ${course.name}.` : null,
  });

  summary.notifications = await notify(db, { tenantId, userId: user.id }, [
    ...(course
      ? [
          { title: 'Advising availability published', message: 'Students can now book your advising slots for the next two weeks.', category: 'academic', link: '/faculty/advising' },
          { title: `${summary.students || 'Your'} students enrolled in ${course.code}`, message: `Your ${course.code} roster is ready. Open the course to message the class.`, category: 'academic', link: `/faculty/courses/${course.id}` },
          { title: `You are instructor of record for ${course.code}`, message: `${course.name} · ${course.timeLabel} · ${course.room}.`, category: 'academic', link: '/faculty/courses' },
        ]
      : []),
    { title: `Welcome to Feddrick University, ${user.firstName}`, message: 'Your teaching workspace is ready.', category: 'administrative', link: '/profile' },
  ]);

  await recordAudit(
    { tenantId, actorUserId, action: 'USER_ONBOARDED', entityType: 'User', entityId: user.id, summary: `Faculty onboarding for ${user.firstName} ${user.lastName}${course ? `: ${course.code}` : ''}`, metadata: { source: source.name, ...summary } },
    db,
  );
  return summary;
}

/** Onboard a user for each of their personas. */
export async function onboardUser(db, { tenantId, userId, roles, actorUserId = null, source }) {
  const result = {};
  if (roles.includes('STUDENT')) result.student = await onboardStudent(db, { tenantId, userId, actorUserId, source });
  if (roles.includes('FACULTY')) result.faculty = await onboardFaculty(db, { tenantId, userId, actorUserId, source });
  return result;
}
