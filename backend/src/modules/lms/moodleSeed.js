import { prisma } from '../../db/prisma.js';
import { createConnector } from '../../integrations/registry.js';
import { moodleConfig } from '../../config/env.js';
import * as moodle from './moodleService.js';
import { createUser } from '../admin/adminService.js';
import { DEMO_PASSWORDS } from '../../../prisma/seeders/shared.js';

/**
 * Development seed for a Moodle site: one instructor, eight students and three demo
 * course shells with enrolments, all mapped to EXISTING EduNexusAI identities.
 *
 * Safety model
 *   - Read-only preflight first. Nothing is written unless every check passes:
 *     functions enabled, role ids verified against real Moodle enrolments, category
 *     exists, local identities exist, no duplicate-identity risk, the site's user quota
 *     and the 20-new-demo-account cap both hold.
 *   - Demo accounts use deterministic identifiers (ID number ENX-DEMO-<local number>,
 *     username enx-demo-<number>, email @example.org, an RFC 2606 reserved domain).
 *     An existing account is reused only when username, email and ID number all match.
 *   - Re-running creates nothing new. Every write goes through moodleService, so each
 *     one is an IntegrationOperation that can be recovered if Moodle succeeds and the
 *     local link fails.
 *   - Never deletes, suspends or edits existing Moodle users or courses, never creates or
 *     changes EduNexusAI academic (SIS) records, never asks Moodle to send email.
 */

export const DEMO_EMAIL_DOMAIN = 'example.org';
export const MAX_NEW_DEMO_ACCOUNTS = 20;

const WEB = 'ENX-DEMO-WEB';
const PROG = 'ENX-DEMO-PROG';
const CLOUD = 'ENX-DEMO-CLOUD';

export const DEMO_COURSES = [
  { key: WEB, fullName: 'ENX DEMO - Web Development' },
  { key: PROG, fullName: 'ENX DEMO - Programming Fundamentals' },
  { key: CLOUD, fullName: 'ENX DEMO - Cloud Computing' },
].map((c) => ({ ...c, shortName: c.key, idNumber: c.key, summary: 'Demo course shell created by the EduNexusAI development seed. Contains no learning content.' }));

/** Existing EduNexusAI faculty member who teaches every demo course. */
export const DEMO_INSTRUCTOR = { employeeNumber: 'FAC-20451', courses: [WEB, PROG, CLOUD] };

/**
 * Existing EduNexusAI demo students and their course combinations: one in all three,
 * several pairs, and single-course students, so rosters and isolation can be tested.
 */
export const DEMO_STUDENTS = [
  { studentNumber: 'ENX-984210', courses: [WEB, PROG, CLOUD] },
  { studentNumber: 'ENX-984507', courses: [WEB, PROG] },
  { studentNumber: 'ENX-984303', courses: [WEB, CLOUD] },
  { studentNumber: 'ENX-984304', courses: [WEB] },
  { studentNumber: 'ENX-984305', courses: [WEB] },
  { studentNumber: 'ENX-984306', courses: [PROG, CLOUD] },
  { studentNumber: 'ENX-984307', courses: [PROG] },
  { studentNumber: 'ENX-984308', courses: [CLOUD] },
];

/**
 * Mathematics additions (scope "math"). MAT_001 is the ID number of a Moodle COURSE
 * CATEGORY (not a course code); the category is resolved live by that ID number and must
 * match exactly one category. The two faculty are new EduNexusAI faculty identities
 * (identity only, no onboarding baseline, so no fabricated local teaching section).
 */
export const MATH_CATEGORY_IDNUMBER = 'MAT_001';
export const MATH_FACULTY = [
  { employeeNumber: 'FAC-30101', firstName: 'Elena', lastName: 'Rossi', email: 'elena.rossi@edunexus.ai', title: 'Associate Professor', department: 'Department of Mathematics' },
  { employeeNumber: 'FAC-30102', firstName: 'Marcus', lastName: 'Webb', email: 'marcus.webb@edunexus.ai', title: 'Assistant Professor', department: 'Department of Mathematics' },
];
export const DEMO_MATH_COURSES = [
  { key: 'ENX-DEMO-MAT-201', fullName: 'ENX DEMO - Linear Algebra', instructor: 'FAC-30101' },
  { key: 'ENX-DEMO-MAT-202', fullName: 'ENX DEMO - Probability and Statistics', instructor: 'FAC-30102' },
].map((c) => ({ ...c, shortName: c.key, idNumber: c.key, summary: 'Demo Mathematics course shell created by the EduNexusAI development seed. Contains no learning content.' }));

export const SEED_SCOPES = ['core', 'math'];

export const demoAccountFor = (number, firstName, lastName) => {
  const slug = String(number).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return {
    idnumber: `ENX-DEMO-${number}`,
    username: `enx-demo-${slug}`,
    email: `enx-demo-${slug}@${DEMO_EMAIL_DOMAIN}`,
    firstname: firstName,
    lastname: `${lastName} (ENX Demo)`,
  };
};

const isDemoAccount = (u) =>
  /^ENX-DEMO-/i.test(u.idnumber ?? '') || /^enx-demo-/i.test(u.username ?? '') || String(u.email ?? '').toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);

const REQUIRED_FUNCTIONS = [
  'core_webservice_get_site_info',
  'core_course_get_courses',
  'core_course_get_categories',
  'core_course_create_courses',
  'core_user_get_users_by_field',
  'core_user_create_users',
  'core_enrol_get_users_courses',
  'core_enrol_get_enrolled_users',
  'enrol_manual_enrol_users',
];

/** Flags that only matter when applying. */
export function seedGuards(env = process.env) {
  const config = moodleConfig();
  const problems = [];
  if (env.NODE_ENV === 'production') problems.push('NODE_ENV is production; the seed never runs there.');
  if (!['1', 'true', 'yes'].includes(String(env.MOODLE_SEED_ENABLED ?? '').toLowerCase())) problems.push('MOODLE_SEED_ENABLED is not true.');
  if (!config.valid) problems.push(...config.problems);
  if (!config.writesEnabled) problems.push('MOODLE_WRITES_ENABLED is not true.');
  return { ok: problems.length === 0, problems, config };
}

/** Moodle's default password policy (shared with account provisioning). */
export const { meetsPasswordPolicy } = moodle;

/**
 * Count every non-deleted Moodle account by id lookup (core_user_get_users_by_field
 * excludes deleted users). Suspended accounts are counted too, which over-states usage
 * on MoodleCloud and therefore errs on the safe side.
 */
export async function countSiteUsers(connector, { chunk = 500, maxId = 20000 } = {}) {
  const users = [];
  for (let start = 1; start <= maxId; start += chunk) {
    const ids = Array.from({ length: chunk }, (_, i) => start + i);
    const found = await connector.getUsersByField('id', ids);
    users.push(...found);
    // Ids are sequential; stop after a whole empty block beyond the highest id seen.
    const highest = users.reduce((m, u) => Math.max(m, Number(u.id)), 0);
    if (!found.length && start > highest) break;
  }
  return {
    total: users.length,
    suspended: users.filter((u) => Number(u.suspended)).length,
    demo: users.filter(isDemoAccount),
    users,
  };
}

async function context(tenantSlug) {
  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`No tenant with slug "${tenantSlug}".`);
  const actor = await prisma.user.findFirst({ where: { tenantId: tenant.id, userRoles: { some: { role: { key: 'ADMIN' } } } }, select: { id: true } });
  if (!actor) throw new Error('The seed records its changes against an administrator; none was found.');
  const integration = await prisma.integration.findFirst({ where: { tenantId: tenant.id, provider: 'MOODLE' } });
  if (!integration) throw new Error('Moodle is not registered for this tenant.');
  return { tenant, auth: { tenantId: tenant.id, userId: actor.id, roles: ['ADMIN'] }, connector: createConnector(integration) };
}

/**
 * Read-only. Verifies every precondition and computes the exact plan.
 * @returns {{ blockers: string[], warnings: string[], facts: object, plan: object }}
 */
export async function preflight({ tenantSlug, scope = 'core' }) {
  if (!SEED_SCOPES.includes(scope)) throw new Error(`Unknown seed scope "${scope}". Use one of: ${SEED_SCOPES.join(', ')}.`);
  const config = moodleConfig();
  const blockers = [];
  const warnings = [];
  const { tenant, auth, connector } = await context(tenantSlug);
  const site = await connector.siteInfo({ refresh: true });

  const missing = REQUIRED_FUNCTIONS.filter((fn) => !site.functions.has(fn));
  if (missing.length) blockers.push(`Enable these Moodle functions: ${missing.join(', ')}.`);
  if (site.tokenUserIsSiteAdmin) {
    warnings.push('The token belongs to a site administrator, so every capability is present. For least privilege, move to a dedicated integration user later.');
  } else {
    warnings.push('The token user is not a site administrator; Moodle cannot list its capabilities through the API, so permission problems would surface on the first write.');
  }
  if (missing.length) return { blockers, warnings, facts: { site }, plan: null };

  // Roles: verify the configured ids against roles Moodle actually reports on enrolments.
  const courses = await connector.listCourses();
  const observedRoles = new Map();
  const participantsByCourse = new Map();
  for (const course of courses) {
    const participants = await connector.getEnrolledUsers(course.id);
    participantsByCourse.set(Number(course.id), participants);
    for (const p of participants) for (const r of p.roles ?? []) observedRoles.set(Number(r.roleid), r.shortname);
  }
  const roleCheck = (id, shortname, envName) => {
    const seen = [...observedRoles.entries()].find(([, s]) => s === shortname)?.[0] ?? null;
    if (!id) blockers.push(`${envName} is not set.${seen ? ` Moodle reports ${shortname} as role id ${seen}.` : ''}`);
    else if (observedRoles.get(id) !== shortname) {
      blockers.push(observedRoles.has(id)
        ? `${envName}=${id} is the "${observedRoles.get(id)}" role in Moodle, not "${shortname}".`
        : `${envName}=${id} cannot be verified: no enrolment on this site uses that role id. Check Site administration → Users → Define roles.`);
    }
    return seen;
  };
  roleCheck(config.studentRoleId, 'student', 'MOODLE_STUDENT_ROLE_ID');
  roleCheck(config.teacherRoleId, 'editingteacher', 'MOODLE_TEACHER_ROLE_ID');

  // Category: the default one for the core demo, the MAT_001 category for Mathematics.
  const categories = await connector.getCategories();
  let categoryId = null;
  if (scope === 'core') {
    if (!config.defaultCategoryId) blockers.push('MOODLE_DEFAULT_CATEGORY_ID is not set.');
    else if (!categories.some((c) => Number(c.id) === config.defaultCategoryId)) blockers.push(`Moodle has no course category ${config.defaultCategoryId}.`);
    else categoryId = config.defaultCategoryId;
  } else {
    const matches = categories.filter((c) => c.idnumber === MATH_CATEGORY_IDNUMBER);
    if (matches.length !== 1) blockers.push(matches.length ? `More than one Moodle category has ID number ${MATH_CATEGORY_IDNUMBER}; resolve the ambiguity in Moodle.` : `No Moodle course category has ID number ${MATH_CATEGORY_IDNUMBER}. Create it in Moodle (Site administration → Courses → Manage courses and categories) or correct the ID number.`);
    else categoryId = Number(matches[0].id);
  }
  const manifestCourses = (scope === 'core' ? DEMO_COURSES : DEMO_MATH_COURSES).map((c) => ({ ...c, categoryId }));

  // Local identities (EduNexusAI side; read only).
  const instructorDefs = scope === 'core'
    ? [{ employeeNumber: DEMO_INSTRUCTOR.employeeNumber, courses: DEMO_INSTRUCTOR.courses }]
    : MATH_FACULTY.map((f) => ({ ...f, courses: DEMO_MATH_COURSES.filter((c) => c.instructor === f.employeeNumber).map((c) => c.key), createLocal: true }));
  const studentDefs = scope === 'core' ? DEMO_STUDENTS : [];
  const faculties = await prisma.facultyProfile.findMany({ where: { tenantId: tenant.id, employeeNumber: { in: instructorDefs.map((f) => f.employeeNumber) } }, include: { user: true } });
  for (const f of instructorDefs) {
    const local = faculties.find((x) => x.employeeNumber === f.employeeNumber);
    if (local && local.user.status !== 'ACTIVE') blockers.push(`EduNexusAI faculty member ${f.employeeNumber} is not active.`);
    if (!local && !f.createLocal) blockers.push(`No active EduNexusAI faculty member ${f.employeeNumber}.`);
    if (!local && f.createLocal) {
      const emailTaken = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: f.email } });
      if (emailTaken) blockers.push(`${f.employeeNumber}: the email ${f.email} already belongs to another EduNexusAI account; refusing to guess the identity.`);
    }
  }
  const students = await prisma.studentProfile.findMany({ where: { tenantId: tenant.id, studentNumber: { in: studentDefs.map((s) => s.studentNumber) } }, include: { user: true } });
  for (const s of studentDefs) {
    const local = students.find((x) => x.studentNumber === s.studentNumber);
    if (!local || local.user.status !== 'ACTIVE') blockers.push(`No active EduNexusAI student ${s.studentNumber}.`);
  }

  // People: demo account to create or reuse, guarded against duplicate identities.
  const people = [];
  const addPerson = async ({ kind, entityType, local, number, courses: courseKeys, newLocal = null }) => {
    if (!local && !newLocal) return;
    const identity = local ? local.user : newLocal;
    const account = demoAccountFor(number, identity.firstName, identity.lastName);
    const person = { kind, entityType, internalId: local?.id ?? null, newLocal, localAction: local ? 'EXISTS' : 'CREATE_LOCAL_IDENTITY', number, name: `${identity.firstName} ${identity.lastName}`, account, courses: courseKeys, moodleUserId: null, action: null };
    people.push(person);
    let found = null;
    try {
      found = await moodle.findMoodleAccount(connector, account);
    } catch (error) {
      blockers.push(`${number}: ${error.message}`);
      return;
    }
    if (found && (found.user.username !== account.username || !found.user.email || found.user.email.toLowerCase() !== account.email || found.user.idnumber !== account.idnumber)) {
      blockers.push(`${number}: Moodle user ${found.user.id} only partly matches the demo identity; it will not be reused.`);
      return;
    }
    if (found && (Number(found.user.id) === Number(site.tokenUserId) || Number(found.user.id) === 2)) {
      blockers.push(`${number}: resolves to the administrator account; refusing.`);
      return;
    }
    // The real person must not already have a non-demo Moodle account (duplicate identity).
    const real = [
      ...(await connector.getUsersByField('email', [identity.email])),
      ...(await connector.getUsersByField('idnumber', [number])),
    ].filter((u) => !found || Number(u.id) !== Number(found.user.id));
    if (real.length) {
      blockers.push(`${number}: already has a Moodle account (user ${real[0].id}). Link that account instead of creating a demo duplicate.`);
      return;
    }
    const link = local ? await moodle.identityLinkFor(tenant.id, entityType, local.id) : null;
    if (link && (!found || link.externalId !== String(found.user.id))) {
      blockers.push(`${number}: already linked to Moodle user ${link.externalId}, which is not this demo account.`);
      return;
    }
    person.moodleUserId = found ? Number(found.user.id) : null;
    person.action = link ? 'ALREADY_LINKED' : found ? 'LINK_EXISTING' : 'CREATE';
  };
  for (const f of instructorDefs) {
    const local = faculties.find((x) => x.employeeNumber === f.employeeNumber);
    await addPerson({ kind: 'instructor', entityType: 'FACULTY', local, number: f.employeeNumber, courses: f.courses, newLocal: !local && f.createLocal ? f : null });
  }
  for (const s of studentDefs) {
    await addPerson({ kind: 'student', entityType: 'STUDENT', local: students.find((x) => x.studentNumber === s.studentNumber), number: s.studentNumber, courses: s.courses });
  }

  // Quota and the hard cap on demo accounts.
  const usage = await countSiteUsers(connector);
  const newAccounts = people.filter((p) => p.action === 'CREATE').length;
  if (!config.siteUserQuota) blockers.push('MOODLE_SITE_USER_QUOTA is not set. Set it to your hosting plan’s user limit; it cannot be read through the Moodle API.');
  else if (usage.total + newAccounts > config.siteUserQuota) blockers.push(`Creating ${newAccounts} account(s) would bring the site to ${usage.total + newAccounts} of ${config.siteUserQuota} users.`);
  if (usage.demo.length + newAccounts > MAX_NEW_DEMO_ACCOUNTS) blockers.push(`${usage.demo.length} demo account(s) exist; ${newAccounts} more would exceed the cap of ${MAX_NEW_DEMO_ACCOUNTS}.`);

  // Courses: create, or reuse only an exact demo match. Existing courses are never edited.
  const courseRows = [];
  for (const demo of manifestCourses) {
    const byId = courses.find((c) => c.idnumber === demo.idNumber);
    const byShort = courses.find((c) => c.shortname?.toLowerCase() === demo.shortName.toLowerCase());
    const row = { ...demo, moodleCourseId: null, action: 'CREATE' };
    if (byId || byShort) {
      if (!byId || !byShort || byId.id !== byShort.id) {
        blockers.push(`${demo.key}: an existing course uses this short name or ID number but is not the demo course; it will not be modified.`);
      } else {
        row.moodleCourseId = Number(byId.id);
        row.action = 'EXISTS';
      }
    }
    const recorded = await moodle.identityLinkFor(tenant.id, 'SEED_COURSE', demo.key);
    if (recorded && row.moodleCourseId && recorded.externalId !== String(row.moodleCourseId)) blockers.push(`${demo.key}: recorded as Moodle course ${recorded.externalId} but Moodle has it as ${row.moodleCourseId}.`);
    courseRows.push(row);
  }

  // Enrolments.
  const enrolments = [];
  for (const person of people) {
    for (const key of person.courses) {
      const course = courseRows.find((c) => c.key === key);
      const role = person.kind === 'instructor' ? 'editingteacher' : 'student';
      const roleId = person.kind === 'instructor' ? config.teacherRoleId : config.studentRoleId;
      let action = 'ENROL';
      if (course?.moodleCourseId && person.moodleUserId) {
        const participant = (participantsByCourse.get(course.moodleCourseId) ?? []).find((u) => Number(u.id) === person.moodleUserId);
        if (participant?.roles?.some((r) => Number(r.roleid) === roleId)) action = 'ALREADY_ENROLLED';
        else if (participant?.roles?.length) blockers.push(`${person.number} already participates in ${key} with another role.`);
      }
      enrolments.push({ number: person.number, username: person.account.username, course: key, role, action });
    }
  }

  // Before-image of everything the seed must leave alone.
  const protectedCourses = courses
    .filter((c) => !manifestCourses.some((d) => d.idNumber === c.idnumber))
    .map((c) => ({ id: Number(c.id), shortname: c.shortname, fullname: c.fullname, idnumber: c.idnumber, visible: c.visible, categoryid: c.categoryid, timemodified: c.timemodified, participants: (participantsByCourse.get(Number(c.id)) ?? []).map((u) => `${u.id}:${(u.roles ?? []).map((r) => r.shortname).join('+')}`).sort() }));

  if (!meetsPasswordPolicy(process.env.MOODLE_DEMO_PASSWORD)) {
    warnings.push('MOODLE_DEMO_PASSWORD is not set (or too weak), so new demo accounts get a random unknown password; set passwords in Moodle before signing in.');
  }

  return {
    blockers,
    warnings,
    facts: {
      site: { name: site.siteName, release: site.release, tokenUserIsSiteAdmin: site.tokenUserIsSiteAdmin },
      roles: Object.fromEntries([...observedRoles.entries()].map(([id, s]) => [s, id])),
      scope,
      categoryId,
      users: { total: usage.total, suspended: usage.suspended, existingDemo: usage.demo.length, quota: config.siteUserQuota, newAccounts, afterSeed: usage.total + newAccounts, demoCap: MAX_NEW_DEMO_ACCOUNTS },
      protectedCourses,
    },
    plan: { courses: courseRows, people, enrolments },
  };
}

/** Apply the plan. Re-runs preflight and refuses on any blocker or missing guard. */
export async function applySeed({ tenantSlug, scope = 'core', log = () => {} }) {
  const guards = seedGuards();
  if (!guards.ok) return { applied: false, blockers: guards.problems };
  const check = await preflight({ tenantSlug, scope });
  if (check.blockers.length) return { applied: false, blockers: check.blockers, preflight: check };
  const { auth } = await context(tenantSlug);
  const password = meetsPasswordPolicy(process.env.MOODLE_DEMO_PASSWORD) ? process.env.MOODLE_DEMO_PASSWORD : undefined;
  const results = [];
  const courseIds = {};

  for (const course of check.plan.courses) {
    if (course.action === 'CREATE') {
      const { result } = await moodle.createCourse(auth, { fullName: course.fullName, shortName: course.shortName, idNumber: course.idNumber, summary: course.summary, categoryId: course.categoryId, visible: true });
      courseIds[course.key] = result.moodleCourseId;
      results.push({ type: 'course', key: course.key, action: result.action, moodleCourseId: result.moodleCourseId });
    } else {
      courseIds[course.key] = course.moodleCourseId;
      results.push({ type: 'course', key: course.key, action: 'EXISTS', moodleCourseId: course.moodleCourseId });
    }
    await moodle.recordSeedCourse(auth, course.key, courseIds[course.key]);
    log(`course   ${results.at(-1).action.padEnd(18)} ${course.key} → Moodle course ${courseIds[course.key]}`);
  }

  for (const person of check.plan.people) {
    if (!person.internalId && person.newLocal) {
      // Local identity first (EduNexusAI owns it); identity only, no onboarding baseline.
      const existing = await prisma.facultyProfile.findFirst({ where: { tenantId: auth.tenantId, employeeNumber: person.number } });
      if (existing) person.internalId = existing.id;
      else {
        const f = person.newLocal;
        const user = await createUser(auth.tenantId, { email: f.email, password: DEMO_PASSWORDS.faculty, firstName: f.firstName, lastName: f.lastName, roles: ['FACULTY'], employeeNumber: f.employeeNumber, title: f.title, department: f.department }, { actorUserId: auth.userId, baseline: false, temporaryPassword: false });
        person.internalId = (await prisma.facultyProfile.findFirst({ where: { userId: user.id } })).id;
        log(`local    CREATED            EduNexusAI faculty ${f.employeeNumber} (${f.firstName} ${f.lastName})`);
      }
    }
    const { result } = person.kind === 'instructor'
      ? await moodle.provisionFaculty(auth, person.internalId, { account: person.account, password })
      : await moodle.provisionStudent(auth, person.internalId, { account: person.account, password });
    person.moodleUserId = result.moodleUserId;
    results.push({ type: person.kind, key: person.account.username, action: result.action, moodleUserId: result.moodleUserId });
    log(`${person.kind.padEnd(8)} ${result.action.padEnd(18)} ${person.account.username} → Moodle user ${result.moodleUserId}`);
  }

  for (const person of check.plan.people) {
    for (const key of person.courses) {
      const { result } = person.kind === 'instructor'
        ? await moodle.enrolInstructor(auth, courseIds[key], { facultyProfileId: person.internalId })
        : await moodle.enrolStudent(auth, courseIds[key], { studentProfileId: person.internalId });
      results.push({ type: 'enrolment', key: `${person.account.username} → ${key}`, action: result.action });
      log(`enrol    ${result.action.padEnd(18)} ${person.account.username} → ${key} (${person.kind === 'instructor' ? 'editingteacher' : 'student'})`);
    }
  }
  return { applied: true, blockers: [], results, before: check.facts.protectedCourses };
}

/**
 * Read-only verification of the seeded state against the manifest, and (optionally)
 * that protected courses match a before-image.
 */
export async function verifySeed({ tenantSlug, before, scope = 'core' } = {}) {
  const config = moodleConfig();
  const { tenant, connector } = await context(tenantSlug);
  const problems = [];
  const checks = [];
  const courses = await connector.listCourses();
  const teacher = (number, courseKeys) => ({ kind: 'instructor', entityType: 'FACULTY', number, courses: courseKeys, roleId: config.teacherRoleId, role: 'editingteacher' });
  const people = scope === 'core'
    ? [
        teacher(DEMO_INSTRUCTOR.employeeNumber, DEMO_INSTRUCTOR.courses),
        ...DEMO_STUDENTS.map((s) => ({ kind: 'student', entityType: 'STUDENT', number: s.studentNumber, courses: s.courses, roleId: config.studentRoleId, role: 'student' })),
      ]
    : MATH_FACULTY.map((f) => teacher(f.employeeNumber, DEMO_MATH_COURSES.filter((c) => c.instructor === f.employeeNumber).map((c) => c.key)));
  const scopeCourses = scope === 'core' ? DEMO_COURSES : DEMO_MATH_COURSES;

  const expectedByCourse = {};
  for (const person of people) {
    const local = person.entityType === 'FACULTY'
      ? await prisma.facultyProfile.findFirst({ where: { tenantId: tenant.id, employeeNumber: person.number }, include: { user: true } })
      : await prisma.studentProfile.findFirst({ where: { tenantId: tenant.id, studentNumber: person.number }, include: { user: true } });
    if (!local) {
      problems.push(`${person.number}: no EduNexusAI identity.`);
      checks.push({ check: `identity ${person.number}`, ok: false });
      continue;
    }
    const account = demoAccountFor(person.number, local.user.firstName, local.user.lastName);
    const link = await moodle.identityLinkFor(tenant.id, person.entityType, local.id);
    const [user] = link ? await connector.getUsersByField('id', [Number(link.externalId)]) : [];
    const ok = Boolean(user && user.username === account.username && user.email?.toLowerCase() === account.email && user.idnumber === account.idnumber && !Number(user.suspended) && user.auth === 'manual');
    if (!ok) problems.push(`${person.number}: account or link does not match the manifest.`);
    checks.push({ check: `account ${account.username}`, ok, moodleUserId: user ? Number(user.id) : null, linked: Boolean(link) });
    person.moodleUserId = user ? Number(user.id) : null;
    for (const key of person.courses) (expectedByCourse[key] ??= []).push({ ...person, username: account.username });
  }

  for (const demo of scopeCourses) {
    const course = courses.find((c) => c.idnumber === demo.idNumber && c.shortname === demo.shortName);
    const recorded = await moodle.identityLinkFor(tenant.id, 'SEED_COURSE', demo.key);
    if (!course || !recorded || recorded.externalId !== String(course.id)) {
      problems.push(`${demo.key}: course or its recorded mapping is missing.`);
      checks.push({ check: `course ${demo.key}`, ok: false });
      continue;
    }
    const participants = await connector.getEnrolledUsers(course.id);
    const expected = expectedByCourse[demo.key] ?? [];
    for (const person of expected) {
      const p = participants.find((u) => Number(u.id) === person.moodleUserId);
      const roles = (p?.roles ?? []).map((r) => `${r.roleid}:${r.shortname}`);
      const ok = roles.length === 1 && roles[0] === `${person.roleId}:${person.role}`;
      if (!ok) problems.push(`${demo.key}: ${person.username} has roles [${roles.join(', ')}], expected ${person.roleId}:${person.role}.`);
      checks.push({ check: `${demo.key} ${person.username} as ${person.role}`, ok });
    }
    const unexpected = participants.filter((u) => !expected.some((e) => e.moodleUserId === Number(u.id)));
    if (unexpected.length) problems.push(`${demo.key}: unexpected participants ${unexpected.map((u) => u.id).join(', ')}.`);
    checks.push({ check: `${demo.key} has exactly the planned participants (${expected.length})`, ok: unexpected.length === 0 && participants.length === expected.length, moodleCourseId: Number(course.id) });
  }

  // The administrator is never a student in any course.
  for (const course of courses) {
    const admin = (await connector.getEnrolledUsers(course.id)).find((u) => Number(u.id) === 2);
    if (admin?.roles?.some((r) => r.shortname === 'student')) problems.push(`Administrator is a student in course ${course.id}.`);
  }
  checks.push({ check: 'administrator (user 2) is not a student anywhere', ok: !problems.some((p) => p.startsWith('Administrator')) });

  if (before) {
    for (const old of before) {
      const now = courses.find((c) => Number(c.id) === old.id);
      const participants = now ? (await connector.getEnrolledUsers(now.id)).map((u) => `${u.id}:${(u.roles ?? []).map((r) => r.shortname).join('+')}`).sort() : [];
      const same = Boolean(now) && ['shortname', 'fullname', 'idnumber', 'visible', 'categoryid', 'timemodified'].every((k) => now[k] === old[k]) && JSON.stringify(participants) === JSON.stringify(old.participants);
      if (!same) problems.push(`Protected course ${old.id} (${old.shortname}) changed.`);
      checks.push({ check: `course ${old.id} (${old.shortname}) unchanged`, ok: same });
    }
  }
  return { ok: problems.length === 0, problems, checks };
}
