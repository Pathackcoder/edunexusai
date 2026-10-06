import bcrypt from 'bcryptjs';
import { DEMO_PASSWORDS, SIS_IDS, TENANT_SLUG, loadFixture } from './shared.js';
import { env } from '../../src/config/env.js';

/**
 * Roles, the widget catalogue, the demo tenant, student tiers, tier entitlements,
 * the demo users and their persona profiles.
 */

const ROLES = [
  { key: 'STUDENT', name: 'Student', description: 'Enrolled student experience.' },
  { key: 'FACULTY', name: 'Faculty', description: 'Teaching staff experience.' },
  { key: 'ADMIN', name: 'Administrator', description: 'Institution administrator and configuration.' },
];

/**
 * Widget catalogue. Dashboard visibility is driven by these rows plus the per-tier
 * entitlements below — never by a condition inside a React component.
 */
const WIDGETS = [
  { key: 'dashboard.schedule', label: "Today's Schedule", category: 'dashboard', route: '/academics/schedule', sortOrder: 10, description: 'Next classes for the current day.' },
  { key: 'dashboard.progress', label: 'Academic Momentum', category: 'dashboard', route: '/academics/grades', sortOrder: 20, description: 'GPA and degree progress.' },
  { key: 'dashboard.tuition', label: 'Tuition & Accounts', category: 'dashboard', route: '/finance/tuition', sortOrder: 30, description: 'Outstanding balance and payment entry point.' },
  { key: 'dashboard.assignments', label: 'Upcoming Assignments', category: 'dashboard', route: '/academics/assignments', sortOrder: 40, description: 'Coursework due in the next seven days.' },
  { key: 'dashboard.financial_aid', label: 'Financial Aid', category: 'dashboard', route: '/finance/financial-aid', sortOrder: 50, description: 'Award package summary.' },
  { key: 'dashboard.announcements', label: 'Course Announcements', category: 'dashboard', route: '/academics/announcements', sortOrder: 60, description: 'Latest faculty announcements.' },
  { key: 'dashboard.notifications', label: 'Campus Pulse', category: 'dashboard', route: '/notifications', sortOrder: 70, description: 'Important notifications.' },
  { key: 'dashboard.library', label: 'Library Account', category: 'dashboard', route: '/campus/library', sortOrder: 80, description: 'Loans and due dates. Advanced tier.' },
  { key: 'dashboard.calendar', label: 'Academic Calendar', category: 'dashboard', route: '/academics/calendar', sortOrder: 90, description: 'Upcoming academic dates. Advanced tier.' },
  { key: 'feature.transcripts', label: 'Transcripts', category: 'feature', route: '/academics/transcripts', sortOrder: 100, description: 'Unofficial transcript and official requests.' },
  { key: 'feature.lms', label: 'Canvas LMS', category: 'feature', route: '/academics/lms', sortOrder: 110, description: 'Course LMS launch points.' },
  { key: 'feature.directory', label: 'People Search', category: 'feature', route: '/campus/people', sortOrder: 120, description: 'Campus directory.' },
  { key: 'feature.library', label: 'Library', category: 'feature', route: '/campus/library', sortOrder: 130, description: 'Library account and catalogue.' },
  { key: 'feature.security', label: 'Campus Security', category: 'feature', route: '/campus/security', sortOrder: 140, description: 'Safety contacts and procedures.' },
  // Advanced features
  { key: 'dashboard.degree_progress', label: 'Degree Progress', category: 'dashboard', route: '/academics/degree-progress', sortOrder: 15, description: 'Credits completed, in progress and remaining.' },
  { key: 'dashboard.requests', label: 'My Requests & Tickets', category: 'dashboard', route: '/help/requests', sortOrder: 75, description: 'Status of requests and help desk tickets.' },
  { key: 'dashboard.advising', label: 'Advising Appointments', category: 'dashboard', route: '/academics/advising', sortOrder: 85, description: 'Next virtual advising appointment.' },
  { key: 'dashboard.learning_path', label: 'Learning Path', category: 'dashboard', route: '/academics/learning-path', sortOrder: 92, description: 'Current stage of the active learning path.' },
  { key: 'dashboard.achievements', label: 'Achievements', category: 'dashboard', route: '/career/achievements', sortOrder: 94, description: 'Badges, milestones and level.' },
  { key: 'dashboard.opportunities', label: 'Recommended Opportunities', category: 'dashboard', route: '/career/opportunities', sortOrder: 96, description: 'Internships and jobs matched to the portfolio.' },
  { key: 'feature.degree_progress', label: 'Degree Progress Tracker', category: 'feature', route: '/academics/degree-progress', sortOrder: 150, description: 'Requirement-by-requirement degree audit.' },
  { key: 'feature.recommendations', label: 'Course Recommendations', category: 'feature', route: '/academics/recommendations', sortOrder: 160, description: 'Personalised course recommendations.' },
  { key: 'feature.learning_path', label: 'Learning Paths', category: 'feature', route: '/academics/learning-path', sortOrder: 170, description: 'Career-aligned learning paths.' },
  { key: 'feature.insights', label: 'Performance Insights', category: 'feature', route: '/academics/insights', sortOrder: 180, description: 'GPA trends and grade analytics.' },
  { key: 'feature.advising', label: 'Virtual Advising', category: 'feature', route: '/academics/advising', sortOrder: 190, description: 'Book and manage advising appointments.' },
  { key: 'feature.classrooms', label: 'Classroom Availability', category: 'feature', route: '/campus/classrooms', sortOrder: 200, description: 'Real-time room availability.' },
  { key: 'feature.campus_map', label: 'Campus Map', category: 'feature', route: '/campus/map', sortOrder: 210, description: 'Interactive campus map.' },
  { key: 'feature.careers', label: 'Jobs & Internships', category: 'feature', route: '/career/opportunities', sortOrder: 220, description: 'Career services opportunity board.' },
  { key: 'feature.portfolio', label: 'Skills Portfolio', category: 'feature', route: '/career/portfolio', sortOrder: 230, description: 'Skills, projects and experience.' },
  { key: 'feature.groups', label: 'Groups & Clubs', category: 'feature', route: '/career/groups', sortOrder: 240, description: 'Student organisations and events.' },
  { key: 'feature.achievements', label: 'Achievements', category: 'feature', route: '/career/achievements', sortOrder: 250, description: 'Gamified milestones and badges.' },
  { key: 'feature.calendar_sync', label: 'Calendar Sync', category: 'feature', route: '/academics/calendar', sortOrder: 260, description: 'Google / Outlook calendar connection.' },
  { key: 'feature.assistant', label: 'AI Assistant', category: 'feature', route: null, sortOrder: 270, description: 'Portal assistant chat.' },
];

/** Advanced features every student gets. Tiers differ on the extra dashboard widgets. */
const ADVANCED_FEATURES = [
  'feature.degree_progress',
  'feature.recommendations',
  'feature.learning_path',
  'feature.insights',
  'feature.advising',
  'feature.classrooms',
  'feature.campus_map',
  'feature.careers',
  'feature.portfolio',
  'feature.groups',
  'feature.achievements',
  'feature.calendar_sync',
  'feature.assistant',
];

/** STANDARD keeps exactly the dashboard the prototype shows today. */
const STANDARD_WIDGETS = [
  'dashboard.schedule',
  'dashboard.progress',
  'dashboard.tuition',
  'dashboard.assignments',
  'dashboard.financial_aid',
  'dashboard.announcements',
  'dashboard.notifications',
  'feature.transcripts',
  'feature.directory',
  'feature.library',
  'feature.security',
  'dashboard.degree_progress',
  'dashboard.requests',
  'dashboard.advising',
  ...ADVANCED_FEATURES,
];

/** ADVANCED is additive: everything STANDARD has, plus more dashboard widgets. */
const ADVANCED_WIDGETS = [
  ...STANDARD_WIDGETS,
  'dashboard.library',
  'dashboard.calendar',
  'feature.lms',
  'dashboard.learning_path',
  'dashboard.achievements',
  'dashboard.opportunities',
];

export async function seedRolesAndWidgets(prisma) {
  const roles = {};
  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: { key: role.key },
      create: role,
      update: { name: role.name, description: role.description },
    });
    roles[role.key] = row;
  }

  const widgets = {};
  for (const widget of WIDGETS) {
    const row = await prisma.widgetDefinition.upsert({
      where: { key: widget.key },
      create: widget,
      update: widget,
    });
    widgets[widget.key] = row;
  }

  return { roles, widgets };
}

export async function seedTenant(prisma) {
  return prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    create: {
      slug: TENANT_SLUG,
      name: 'Demo University',
      shortName: 'Demo U',
      domain: 'demouniversity.edu',
      timezone: 'America/New_York',
      isActive: true,
    },
    update: { name: 'Demo University' },
  });
}

export async function seedTiers(prisma, tenant, widgets) {
  const standard = await prisma.studentTier.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'STANDARD' } },
    create: {
      tenantId: tenant.id,
      key: 'STANDARD',
      name: 'Standard',
      description: 'Core student experience included for every enrolled student.',
      rank: 1,
    },
    update: {},
  });

  const advanced = await prisma.studentTier.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'ADVANCED' } },
    create: {
      tenantId: tenant.id,
      key: 'ADVANCED',
      name: 'Advanced',
      description: 'Everything in Standard plus library, calendar and LMS widgets.',
      rank: 2,
    },
    update: {},
  });

  const grant = async (tier, keys) => {
    for (const widget of Object.values(widgets)) {
      await prisma.widgetEntitlement.upsert({
        where: { tierId_widgetId: { tierId: tier.id, widgetId: widget.id } },
        create: {
          tenantId: tenant.id,
          tierId: tier.id,
          widgetId: widget.id,
          enabled: keys.includes(widget.key),
          sortOrder: widget.sortOrder,
        },
        update: {},
      });
    }
  };

  await grant(standard, STANDARD_WIDGETS);
  await grant(advanced, ADVANCED_WIDGETS);

  return { standard, advanced };
}

async function createUser(prisma, tenant, roles, { email, password, firstName, lastName, phone, roleKeys }) {
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    create: { tenantId: tenant.id, email, passwordHash, firstName, lastName, phone, status: 'ACTIVE' },
    update: { passwordHash, firstName, lastName, phone },
  });
  for (const key of roleKeys) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roles[key].id } },
      create: { userId: user.id, roleId: roles[key].id },
      update: {},
    });
  }
  return user;
}

export async function seedUsers(prisma, tenant, roles, tiers) {
  const { defaultStudentData: student } = await loadFixture('studentData');
  const { gradesSummaryData: grades } = await loadFixture('grades');

  // ---- Primary demo student: Amit Pathak (STANDARD tier) ----
  const amitUser = await createUser(prisma, tenant, roles, {
    email: 'student@edunexus.ai',
    password: DEMO_PASSWORDS.student,
    firstName: student.firstName,
    lastName: student.lastName,
    phone: student.phone,
    roleKeys: ['STUDENT'],
  });

  const amitProfile = await prisma.studentProfile.upsert({
    where: { userId: amitUser.id },
    create: {
      tenantId: tenant.id,
      userId: amitUser.id,
      tierId: tiers.standard.id,
      studentNumber: student.id,
      degree: student.degree,
      department: student.department,
      academicStanding: student.academicStanding,
      admitTerm: student.admitTerm,
      currentTerm: student.currentTerm,
      creditsCompleted: student.creditsCompleted,
      totalCreditsRequired: student.totalCreditsRequired,
      cumulativeGpa: student.cumulativeGpa,
      majorGpa: student.majorGpa,
      semesterGpa: grades.semesterGpa,
      honors: grades.honors,
      pronouns: 'he/him',
      pronounsVisibility: 'Faculty & Advisors Only',
      addressLine1: student.address,
      city: student.city,
      state: student.state,
      postalCode: student.zipCode,
    },
    update: { tierId: tiers.standard.id },
  });

  const existingContact = await prisma.emergencyContact.findFirst({
    where: { studentProfileId: amitProfile.id },
  });
  if (!existingContact) {
    await prisma.emergencyContact.create({
      data: {
        studentProfileId: amitProfile.id,
        name: student.emergencyContact.name,
        relationship: student.emergencyContact.relationship,
        phone: student.emergencyContact.phone,
        altPhone: student.emergencyContact.altPhone,
        email: student.emergencyContact.email,
        isPrimary: true,
      },
    });
  }

  // ---- Second demo student on the ADVANCED tier, so tiering is visible ----
  const mayaUser = await createUser(prisma, tenant, roles, {
    email: 'student.advanced@edunexus.ai',
    password: DEMO_PASSWORDS.student,
    firstName: 'Maya',
    lastName: 'Lin',
    phone: '(555) 345-6789',
    roleKeys: ['STUDENT'],
  });

  const mayaProfile = await prisma.studentProfile.upsert({
    where: { userId: mayaUser.id },
    create: {
      tenantId: tenant.id,
      userId: mayaUser.id,
      tierId: tiers.advanced.id,
      studentNumber: 'ENX-984507',
      degree: 'B.S. in Software Engineering',
      department: 'Department of Computer Science & Engineering',
      academicStanding: 'Good Standing',
      admitTerm: 'Fall 2023',
      currentTerm: 'Fall 2026',
      creditsCompleted: 102,
      totalCreditsRequired: 120,
      cumulativeGpa: 3.91,
      majorGpa: 3.95,
      semesterGpa: 3.95,
      pronouns: 'she/her',
      addressLine1: 'West Quad Residence Hall',
      city: 'Boston',
      state: 'MA',
      postalCode: '02115',
    },
    update: { tierId: tiers.advanced.id },
  });

  // ---- Faculty: Dr. Sarah Mitchell, instructor of record for CS 501 ----
  const facultyUser = await createUser(prisma, tenant, roles, {
    email: 'faculty@edunexus.ai',
    password: DEMO_PASSWORDS.faculty,
    firstName: 'Sarah',
    lastName: 'Mitchell',
    phone: '(555) 012-3410',
    roleKeys: ['FACULTY'],
  });

  await prisma.facultyProfile.upsert({
    where: { userId: facultyUser.id },
    create: {
      tenantId: tenant.id,
      userId: facultyUser.id,
      employeeNumber: 'FAC-20451',
      title: 'Associate Professor',
      department: 'Department of Computer Science & Engineering',
      officeLocation: 'Science Building 204B',
      officeHours: 'Wed 2:00 PM - 4:00 PM, Sci 204B',
      bio: 'Teaches Advanced Database Systems. Research in query optimisation and storage engines.',
    },
    update: {},
  });

  // ---- Administrator: fictional registrar systems administrator ----
  const adminUser = await createUser(prisma, tenant, roles, {
    email: 'admin@edunexus.ai',
    password: DEMO_PASSWORDS.admin,
    firstName: 'Karen',
    lastName: 'Whitfield',
    phone: '(555) 019-2050',
    roleKeys: ['ADMIN'],
  });

  await prisma.staffProfile.upsert({
    where: { userId: adminUser.id },
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      employeeNumber: 'STF-10027',
      title: 'Director, Student Systems & Integrations',
      department: 'Registrar & Enrollment Services',
      officeLocation: 'Student Services Pavilion, Suite 310',
    },
    update: {},
  });

  // ---- Canonical identity map: external SIS ids -> internal student profile ids ----
  // This is what lets an enrollment row arriving from the SIS find the right student
  // without any provider identifier being stored on the domain model.
  for (const [provider, pairs] of Object.entries({
    MOCK_UNIVERSITY: [
      [SIS_IDS.amit, amitProfile.id],
      [SIS_IDS.maya, mayaProfile.id],
    ],
    CANVAS: [
      [SIS_IDS.amit, amitProfile.id],
      [SIS_IDS.maya, mayaProfile.id],
    ],
  })) {
    for (const [externalId, internalId] of pairs) {
      await prisma.externalIdentity.upsert({
        where: {
          tenantId_provider_entityType_externalId: {
            tenantId: tenant.id,
            provider,
            entityType: 'STUDENT',
            externalId,
          },
        },
        create: { tenantId: tenant.id, provider, entityType: 'STUDENT', externalId, internalId },
        update: { internalId },
      });
    }
  }

  return {
    amitUser,
    amitProfile,
    mayaUser,
    mayaProfile,
    facultyUser,
    adminUser,
  };
}
