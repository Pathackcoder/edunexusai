import { prisma } from '../../db/prisma.js';
import { moodleConfig } from '../../config/env.js';
import * as moodle from './moodleService.js';
import * as alignment from './courseAlignmentService.js';
import * as sis from '../sis/sisService.js';
import { countSiteUsers, MAX_NEW_DEMO_ACCOUNTS, seedContext } from './moodleSeed.js';

/**
 * Seed scope "restore": rebuild the pilot LMS environment of the expired MoodleCloud site on a new one.
 *
 * The manifest names everything by stable identifiers only (course short name and ID number, institutional
 * number, CampusCore section id), never by a Moodle id of the old site; every Moodle id is read live from the new
 * site. People are EXISTING EduNexusAI identities with their stored email; accounts are ordinary manual users with
 * an unknown random password (an administrator issues a one-time password from Admin → Moodle when needed).
 *
 * Same safety model as the demo scopes: read-only preflight, nothing written while any blocker remains, every write
 * an IntegrationOperation through moodleService, re-runs create nothing new, existing Moodle records are never
 * edited, no SIS record is created or changed, no section mapping is invented.
 */

const MATH = 'Mathematics';
const DEFAULT = 'Category 1';
const WRITING = 'Writing and Research';

export const RESTORE_COURSES = [
  { key: 'ADBMS', shortName: 'ADBMS', fullName: 'Advanced Database Systems', idNumber: 'CS 501', category: DEFAULT, startDate: '2026-10-11', endDate: '2027-10-11', localCourseCode: 'CS 501' },
  { key: 'ItP', shortName: 'ItP', fullName: 'Introduction to Programming', idNumber: 'CS-101', category: DEFAULT, startDate: '2026-10-15', endDate: '2027-10-15' },
  { key: 'LA', shortName: 'LA', fullName: 'Linear Algebra', idNumber: 'MATH 241-01', category: MATH, startDate: '2026-10-15', endDate: '2027-10-15' },
  { key: 'PNS', shortName: 'PNS', fullName: 'Probability & Statistics', idNumber: 'MATH 251-01', category: MATH, startDate: '2026-10-15', endDate: '2027-10-15' },
  { key: 'WNR', shortName: 'WNR', fullName: 'Writing & Research', idNumber: 'ENGL 102-01', category: WRITING, startDate: '2026-10-15', endDate: '2027-10-15' },
];

/**
 * CampusCore sections delivered in each course, named by course code, section and term: each environment's
 * CampusCore resolves them to its own section ids, and exactly one section must match.
 */
export const RESTORE_SECTIONS = [
  { course: 'ADBMS', courseCode: 'CS 310', sectionNumber: '01', termCode: '2027SP' },
  { course: 'ItP', courseCode: 'CS 101', sectionNumber: 'D1', termCode: '2026FA' },
  { course: 'ItP', courseCode: 'CS 101', sectionNumber: '01', termCode: '2027SP' },
  { course: 'ItP', courseCode: 'CS 101', sectionNumber: '02', termCode: '2027SP' },
  { course: 'LA', courseCode: 'MATH 241', sectionNumber: '01', termCode: '2027SP' },
  { course: 'WNR', courseCode: 'ENGL 102', sectionNumber: '01', termCode: '2027SP' },
].map((s) => ({ ...s, label: `${s.courseCode}-${s.sectionNumber} ${s.termCode}` }));

async function resolveSection({ courseCode, sectionNumber, termCode, label }) {
  return sis.withCampusCore(async (adapter) => {
    const term = (await adapter.listTerms()).find((t) => t.code === termCode);
    if (!term) throw new Error(`CampusCore has no term ${termCode}.`);
    const res = await adapter.client.get('/sections', { termId: term.source.id, search: courseCode, pageSize: 100 });
    const hits = res.data.filter((s) => s.course?.code === courseCode && s.sectionNumber === sectionNumber);
    if (hits.length !== 1) throw new Error(`${hits.length} CampusCore sections match ${label}.`);
    return hits[0].id;
  });
}

/**
 * Profiles in provisioning order. Rahul is one person with a faculty and a student profile: the faculty profile
 * creates the account (f01024) and the student profile reuses it (one Moodle account per person). Marcus teaches
 * ItP directly and Yuki's four enrolments are direct (no mapped CampusCore section carries them).
 */
export const RESTORE_PEOPLE = [
  { number: 'F01002', entityType: 'FACULTY', teaches: ['ADBMS', 'ItP'], studies: [] },
  { number: 'F01024', entityType: 'FACULTY', teaches: ['ItP'], studies: [] },
  { number: 'S2600187', entityType: 'STUDENT', teaches: [], studies: ['ADBMS'], sharesAccountWith: 'F01024' },
  { number: 'S2400017', entityType: 'STUDENT', teaches: [], studies: ['ItP', 'LA', 'PNS', 'WNR'] },
];

const accountOf = (entityType, profile) => ({
  username: String(entityType === 'FACULTY' ? profile.employeeNumber : profile.studentNumber).toLowerCase().replace(/[^a-z0-9._@-]/g, '-'),
  email: profile.user.email,
  idnumber: entityType === 'FACULTY' ? profile.employeeNumber : profile.studentNumber,
});
const toUnix = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
// Moodle returns formatted course names (e.g. "&amp;").
const plain = (text) => String(text ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

async function localProfile(tenantId, { number, entityType }) {
  return entityType === 'FACULTY'
    ? prisma.facultyProfile.findFirst({ where: { tenantId, employeeNumber: number }, include: { user: true } })
    : prisma.studentProfile.findFirst({ where: { tenantId, studentNumber: number }, include: { user: true } });
}

/** Read-only. Same contract as the demo scopes' preflight. */
export async function preflightRestore({ tenantSlug }) {
  const config = moodleConfig();
  const blockers = [];
  const warnings = [];
  const { tenant, connector } = await seedContext(tenantSlug);
  const site = await connector.siteInfo({ refresh: true });
  if (site.tokenUserIsSiteAdmin) blockers.push('The token belongs to a site administrator; the restore runs only with the dedicated integration user.');
  const required = ['core_course_get_courses', 'core_course_get_categories', 'core_course_create_courses', 'core_user_get_users_by_field', 'core_user_create_users', 'core_enrol_get_enrolled_users', 'enrol_manual_enrol_users'];
  const missing = required.filter((fn) => !site.functions.has(fn));
  if (missing.length) return { blockers: [`Enable these Moodle functions: ${missing.join(', ')}.`], warnings, facts: { site }, plan: null };

  // Courses. core_course_get_courses refuses the whole list when one course is not accessible to the token user.
  let courses = null;
  try {
    courses = await connector.listCourses();
  } catch (error) {
    blockers.push(`Moodle refused to list courses (${error.message.replace(/<[^>]+>/g, '').slice(0, 160)}). Give the integration role moodle/course:view and moodle/course:viewhiddencourses at system level; without a complete course list duplicates cannot be ruled out.`);
  }

  // Roles, as Moodle reports them on existing enrolments.
  const observedRoles = new Map();
  const participantsByCourse = new Map();
  for (const course of courses ?? []) {
    const participants = await connector.getEnrolledUsers(course.id);
    participantsByCourse.set(Number(course.id), participants);
    for (const p of participants) for (const r of p.roles ?? []) observedRoles.set(Number(r.roleid), r.shortname);
  }
  for (const [id, shortname, env] of [[config.studentRoleId, 'student', 'MOODLE_STUDENT_ROLE_ID'], [config.teacherRoleId, 'editingteacher', 'MOODLE_TEACHER_ROLE_ID']]) {
    if (!id) blockers.push(`${env} is not set.`);
    else if (observedRoles.has(id) && observedRoles.get(id) !== shortname) blockers.push(`${env}=${id} is the "${observedRoles.get(id)}" role in Moodle, not "${shortname}".`);
    else if (!observedRoles.has(id)) warnings.push(`${env}=${id} cannot be confirmed through the API yet (no enrolment on this site uses it). The apply re-reads the roster after every enrolment and stops at the first role Moodle reports differently.`);
  }

  // Categories, by exact name (the integration role cannot read category ID numbers).
  const categories = await connector.getCategories();
  const categoryIds = {};
  for (const name of [...new Set(RESTORE_COURSES.map((c) => c.category))]) {
    const matches = categories.filter((c) => c.name === name);
    if (matches.length !== 1) blockers.push(matches.length ? `More than one Moodle category is named "${name}".` : `No Moodle category is named "${name}". Create it in Moodle (Site administration → Courses → Manage courses and categories).`);
    else categoryIds[name] = Number(matches[0].id);
  }
  if (!categories.some((c) => c.idnumber)) warnings.push(`Category ID numbers (e.g. ${MATH} = MAT_001) are not visible to the integration role, so categories are matched by their exact name.`);

  // Courses to create, or reuse only an exact match created by an earlier run of this restore.
  const courseRows = [];
  for (const def of RESTORE_COURSES) {
    const row = { ...def, categoryId: categoryIds[def.category] ?? null, moodleCourseId: null, action: courses ? 'CREATE' : 'UNKNOWN' };
    if (courses) {
      const byId = courses.find((c) => c.idnumber === def.idNumber);
      const byShort = courses.find((c) => c.shortname?.toLowerCase() === def.shortName.toLowerCase());
      if (byId || byShort) {
        if (byId && byId === byShort && plain(byId.fullname) === def.fullName && Number(byId.categoryid) === row.categoryId) {
          row.moodleCourseId = Number(byId.id);
          row.action = 'EXISTS';
        } else blockers.push(`${def.key}: course ${(byId ?? byShort).id} already uses this short name or ID number but differs from the manifest; it will not be modified.`);
      }
    }
    if (def.localCourseCode) {
      const local = await prisma.course.findFirst({ where: { tenantId: tenant.id, code: def.localCourseCode } });
      if (!local) warnings.push(`${def.key}: no local course ${def.localCourseCode}; the local course link is skipped.`);
      row.localCourseId = local?.id ?? null;
    }
    courseRows.push(row);
  }

  // People: existing local identities only, each with at most one Moodle account.
  const people = [];
  for (const def of RESTORE_PEOPLE) {
    const local = await localProfile(tenant.id, def);
    if (!local || local.user.status !== 'ACTIVE') {
      blockers.push(`No active EduNexusAI ${def.entityType.toLowerCase()} ${def.number}.`);
      continue;
    }
    const account = accountOf(def.entityType, local);
    const kind = def.entityType === 'FACULTY' ? 'instructor' : 'student';
    const person = { ...def, kind, internalId: local.id, userId: local.user.id, localAction: 'EXISTS', name: `${local.user.firstName} ${local.user.lastName}`, account, moodleUserId: null, action: null };
    people.push(person);
    const link = await moodle.identityLinkFor(tenant.id, def.entityType, local.id);
    const owner = def.sharesAccountWith ? people.find((p) => p.number === def.sharesAccountWith) : null;
    if (owner) {
      // The account comes from the other profile; this profile's own identifiers must not have a separate account.
      const separate = [...(await connector.getUsersByField('username', [account.username])), ...(await connector.getUsersByField('idnumber', [account.idnumber]))];
      if (separate.length) blockers.push(`${def.number}: Moodle user ${separate[0].id} uses this profile's own username or ID number; one person must have one account.`);
      if (owner.userId !== local.user.id) blockers.push(`${def.number} and ${owner.number} are not the same EduNexusAI person.`);
      person.account = owner.account;
      person.moodleUserId = owner.moodleUserId;
      person.action = link ? 'ALREADY_LINKED' : 'SAME_PERSON';
      continue;
    }
    let found = null;
    try {
      found = await moodle.findMoodleAccount(connector, account);
    } catch (error) {
      blockers.push(`${def.number}: ${error.message}`);
      continue;
    }
    if (found && [Number(site.tokenUserId), 2].includes(Number(found.user.id))) {
      blockers.push(`${def.number}: resolves to the integration or administrator account; refusing.`);
      continue;
    }
    if (link && (!found || link.externalId !== String(found.user.id))) {
      blockers.push(`${def.number}: linked to Moodle user ${link.externalId}, which is not the account found on this site.`);
      continue;
    }
    person.moodleUserId = found ? Number(found.user.id) : null;
    person.action = link ? 'ALREADY_LINKED' : found ? 'LINK_EXISTING' : 'CREATE';
  }

  // Quota (every visible account, conservatively) and the shared cap on accounts the seed creates.
  const usage = await countSiteUsers(connector);
  const newAccounts = people.filter((p) => p.action === 'CREATE').length;
  if (!config.siteUserQuota) blockers.push('MOODLE_SITE_USER_QUOTA is not set.');
  else if (usage.total + newAccounts > config.siteUserQuota) blockers.push(`Creating ${newAccounts} account(s) would bring the site to ${usage.total + newAccounts} of ${config.siteUserQuota} users.`);
  if (usage.demo.length + newAccounts > MAX_NEW_DEMO_ACCOUNTS) blockers.push(`${newAccounts} new account(s) would exceed the seed cap of ${MAX_NEW_DEMO_ACCOUNTS}.`);
  const hiddenDetails = usage.users.filter((u) => Number(u.id) !== Number(site.tokenUserId) && !u.username).length;
  if (hiddenDetails) warnings.push(`${hiddenDetails} Moodle account(s) are visible without username or email: give the integration role moodle/user:viewdetails, moodle/user:viewhiddendetails and moodle/user:viewalldetails so accounts can be verified after creation.`);

  // Enrolments.
  const enrolments = [];
  for (const person of people) {
    for (const [key, role] of [...person.teaches.map((k) => [k, 'editingteacher']), ...person.studies.map((k) => [k, 'student'])]) {
      const course = courseRows.find((c) => c.key === key);
      const roleId = role === 'student' ? config.studentRoleId : config.teacherRoleId;
      let action = 'ENROL';
      if (course?.moodleCourseId && person.moodleUserId) {
        const roles = (participantsByCourse.get(course.moodleCourseId) ?? []).find((u) => Number(u.id) === person.moodleUserId)?.roles ?? [];
        if (roles.some((r) => Number(r.roleid) === roleId)) action = 'ALREADY_ENROLLED';
        else if (roles.length) blockers.push(`${person.number} already participates in ${key} as ${roles.map((r) => r.shortname).join(', ')}.`);
      }
      enrolments.push({ number: person.number, entityType: person.entityType, internalId: person.internalId, username: person.account.username, course: key, role, action });
    }
  }

  // Section mappings: each named CampusCore section must resolve to exactly one section of this environment.
  const sections = [];
  for (const def of RESTORE_SECTIONS) {
    let sisSectionId = null;
    try {
      sisSectionId = await resolveSection(def);
    } catch (error) {
      blockers.push(`CampusCore section ${def.label}: ${error.message}`);
      sections.push({ ...def, sisSectionId, action: 'BLOCKED' });
      continue;
    }
    const row = await prisma.sisSectionMoodleCourse.findUnique({ where: { tenantId_sisSectionId: { tenantId: tenant.id, sisSectionId } } });
    const course = courseRows.find((c) => c.key === def.course);
    const action = row ? (course.moodleCourseId && row.moodleCourseId === course.moodleCourseId ? 'ALREADY_MAPPED' : 'BLOCKED') : 'MAP';
    if (action === 'BLOCKED') blockers.push(`CampusCore section ${def.label} is already mapped to Moodle course ${row.moodleCourseId}.`);
    sections.push({ ...def, sisSectionId, action });
  }

  return {
    blockers,
    warnings,
    facts: {
      site: { name: site.siteName, release: site.release, tokenUserIsSiteAdmin: site.tokenUserIsSiteAdmin, tokenUsername: site.tokenUsername, tokenUserId: site.tokenUserId },
      roles: Object.fromEntries([...observedRoles.entries()].map(([id, s]) => [s, id])),
      scope: 'restore',
      categoryId: Object.entries(categoryIds).map(([n, id]) => `${n}=${id}`).join(', '),
      users: { total: usage.total, suspended: usage.suspended, existingDemo: usage.demo.length, quota: config.siteUserQuota, newAccounts, afterSeed: usage.total + newAccounts, demoCap: MAX_NEW_DEMO_ACCOUNTS },
      protectedCourses: (courses ?? []).filter((c) => !RESTORE_COURSES.some((d) => d.idNumber === c.idnumber)).map((c) => ({ id: Number(c.id), shortname: c.shortname, fullname: c.fullname, idnumber: c.idnumber, visible: c.visible, categoryid: c.categoryid, timemodified: c.timemodified })),
    },
    plan: { courses: courseRows, people, enrolments, sections },
  };
}

/** Applies the plan through moodleService; re-runs preflight and refuses on any blocker. */
export async function applyRestore({ tenantSlug, log = () => {}, linkOnly = false }) {
  const check = await preflightRestore({ tenantSlug });
  if (check.blockers.length) return { applied: false, blockers: check.blockers, preflight: check };
  // Link-only (a second environment sharing the site): every Moodle record must already exist, so nothing is sent
  // to Moodle; only this environment's links and section mappings are written.
  if (linkOnly) {
    const writes = [
      ...check.plan.courses.filter((c) => c.action !== 'EXISTS').map((c) => `course ${c.key} (${c.action})`),
      ...check.plan.people.filter((p) => p.action === 'CREATE').map((p) => `account for ${p.number}`),
      ...check.plan.enrolments.filter((e) => e.action !== 'ALREADY_ENROLLED').map((e) => `enrolment ${e.number} → ${e.course}`),
    ];
    if (writes.length) return { applied: false, blockers: [`Link-only refused: these would need Moodle writes: ${writes.join('; ')}.`], preflight: check };
  }
  const { auth, connector } = await seedContext(tenantSlug);
  const config = moodleConfig();
  const results = [];
  const courseIds = {};

  for (const course of check.plan.courses) {
    if (course.action === 'CREATE') {
      const { result } = await moodle.createCourse(auth, { fullName: course.fullName, shortName: course.shortName, idNumber: course.idNumber, categoryId: course.categoryId, startDate: course.startDate, endDate: course.endDate, visible: true });
      courseIds[course.key] = result.moodleCourseId;
    } else courseIds[course.key] = course.moodleCourseId;
    if (course.localCourseId && !(await moodle.identityLinkFor(auth.tenantId, 'COURSE', course.localCourseId))) {
      await moodle.linkCourse(auth, courseIds[course.key], { courseId: course.localCourseId });
      log(`course   LINKED_LOCAL       ${course.key} ↔ EduNexusAI course ${course.localCourseCode}`);
    }
    results.push({ type: 'course', key: course.key, action: course.action === 'CREATE' ? 'CREATED' : 'EXISTS', moodleCourseId: courseIds[course.key] });
    log(`course   ${results.at(-1).action.padEnd(18)} ${course.key} → Moodle course ${courseIds[course.key]}`);
  }

  for (const person of check.plan.people) {
    const { result } = person.entityType === 'FACULTY'
      ? await moodle.provisionFaculty(auth, person.internalId, { credentials: 'NONE' })
      : await moodle.provisionStudent(auth, person.internalId, { credentials: 'NONE' });
    person.moodleUserId = result.moodleUserId;
    results.push({ type: person.kind, key: `${person.number} (${person.account.username})`, action: result.action, moodleUserId: result.moodleUserId });
    log(`${person.kind.padEnd(8)} ${result.action.padEnd(18)} ${person.number} → Moodle user ${result.moodleUserId} (${person.account.username})`);
  }

  for (const e of check.plan.enrolments) {
    const courseId = courseIds[e.course];
    const { result } = e.role === 'editingteacher'
      ? await moodle.enrolInstructor(auth, courseId, { facultyProfileId: e.internalId })
      : await moodle.enrolStudent(auth, courseId, { studentProfileId: e.internalId });
    // Re-read the roster: the role Moodle reports must be exactly the intended one.
    const roleId = e.role === 'student' ? config.studentRoleId : config.teacherRoleId;
    const roles = ((await connector.getEnrolledUsers(courseId)).find((u) => Number(u.id) === Number(result.moodleUserId))?.roles ?? []).map((r) => `${r.roleid}:${r.shortname}`);
    results.push({ type: 'enrolment', key: `${e.number} → ${e.course} as ${e.role}`, action: result.action, roles });
    log(`enrol    ${result.action.padEnd(18)} ${e.number} → ${e.course} as ${e.role}; Moodle reports [${roles.join(', ')}]${result.warning ? ` (warning: ${result.warning})` : ''}`);
    if (!roles.includes(`${roleId}:${e.role}`)) {
      return { applied: false, blockers: [`Stopped: after enrolling ${e.number} in ${e.course}, Moodle reports roles [${roles.join(', ')}], not ${roleId}:${e.role}. Nothing further was changed; check the role ids.`], results };
    }
  }

  for (const s of check.plan.sections) {
    if (s.action === 'MAP') await alignment.linkSection(auth, { sisSectionId: s.sisSectionId, moodleCourseId: courseIds[s.course] });
    results.push({ type: 'section', key: `${s.label} → ${s.course}`, action: s.action === 'MAP' ? 'MAPPED' : s.action });
    log(`section  ${results.at(-1).action.padEnd(18)} ${s.label} → ${s.course} (Moodle course ${courseIds[s.course]})`);
  }
  return { applied: true, blockers: [], results, before: check.facts.protectedCourses };
}

/** Read-only verification of the restored state against the manifest. */
export async function verifyRestore({ tenantSlug, before } = {}) {
  const config = moodleConfig();
  const { tenant, connector } = await seedContext(tenantSlug);
  const site = await connector.siteInfo({ refresh: true });
  const problems = [];
  const checks = [];
  const check = (label, ok, problem) => {
    checks.push({ check: label, ok });
    if (!ok) problems.push(problem ?? label);
  };
  const courses = await connector.listCourses();
  const categories = await connector.getCategories();

  const courseIds = {};
  for (const def of RESTORE_COURSES) {
    const c = courses.find((x) => x.idnumber === def.idNumber && x.shortname === def.shortName);
    const category = categories.find((x) => Number(x.id) === Number(c?.categoryid));
    const ok = Boolean(c && plain(c.fullname) === def.fullName && category?.name === def.category && Number(c.startdate) === toUnix(def.startDate) && Number(c.enddate) === toUnix(def.endDate));
    check(`course ${def.shortName} [${def.idNumber}] in "${def.category}" ${def.startDate} – ${def.endDate}${c ? ` (Moodle course ${c.id})` : ''}`, ok);
    if (c) courseIds[def.key] = Number(c.id);
    if (def.localCourseCode && c) {
      const local = await prisma.course.findFirst({ where: { tenantId: tenant.id, code: def.localCourseCode } });
      // Only where this environment has that local course (the preflight skips the link otherwise).
      if (local) check(`EduNexusAI course ${def.localCourseCode} ↔ Moodle course ${c.id}`, (await moodle.identityLinkFor(tenant.id, 'COURSE', local.id))?.externalId === String(c.id));
    }
  }

  const accountIds = {};
  for (const def of RESTORE_PEOPLE) {
    const local = await localProfile(tenant.id, def);
    const link = local ? await moodle.identityLinkFor(tenant.id, def.entityType, local.id) : null;
    const owner = def.sharesAccountWith ? RESTORE_PEOPLE.find((p) => p.number === def.sharesAccountWith) : def;
    const ownerLocal = owner === def ? local : await localProfile(tenant.id, owner);
    const expected = ownerLocal ? accountOf(owner.entityType, ownerLocal) : null;
    const [user] = link ? await connector.getUsersByField('id', [Number(link.externalId)]) : [];
    // The email is checked whenever Moodle shows it (moodle/site:viewuseridentity); username and ID number always.
    const emailOk = user?.email === undefined ? null : user.email.toLowerCase() === expected?.email.toLowerCase();
    const ok = Boolean(user && expected && user.username === expected.username && emailOk !== false && user.idnumber === expected.idnumber && !Number(user.suspended) && Number(user.id) !== Number(site.tokenUserId));
    check(`${def.number} linked to Moodle user ${link?.externalId ?? '—'} (${expected?.username ?? '?'}, ${expected?.idnumber ?? '?'}${emailOk === null ? ', email not visible to the integration role' : `, ${expected?.email}`})`, ok);
    accountIds[def.number] = link ? Number(link.externalId) : null;
  }
  check('Rahul\'s two profiles share one Moodle account', accountIds.F01024 && accountIds.F01024 === accountIds.S2600187);

  for (const def of RESTORE_COURSES) {
    if (!courseIds[def.key]) continue;
    const participants = await connector.getEnrolledUsers(courseIds[def.key]);
    const expected = new Map();
    for (const p of RESTORE_PEOPLE) {
      for (const k of p.teaches) if (k === def.key) expected.set(accountIds[p.number], [...(expected.get(accountIds[p.number]) ?? []), `${config.teacherRoleId}:editingteacher`]);
      for (const k of p.studies) if (k === def.key) expected.set(accountIds[p.number], [...(expected.get(accountIds[p.number]) ?? []), `${config.studentRoleId}:student`]);
    }
    for (const [uid, roles] of expected) {
      const got = (participants.find((u) => Number(u.id) === uid)?.roles ?? []).map((r) => `${r.roleid}:${r.shortname}`).sort();
      check(`${def.shortName}: Moodle user ${uid} as ${roles.join('+')}`, JSON.stringify(got) === JSON.stringify(roles.sort()), `${def.shortName}: Moodle user ${uid} has [${got.join(', ')}], expected [${roles.join(', ')}].`);
    }
    const unexpected = participants.filter((u) => !expected.has(Number(u.id)));
    check(`${def.shortName}: no other participants`, unexpected.length === 0, `${def.shortName}: unexpected participants ${unexpected.map((u) => u.id).join(', ')}.`);
  }

  const sectionIds = [];
  for (const s of RESTORE_SECTIONS) {
    const sisSectionId = await resolveSection(s);
    sectionIds.push(sisSectionId);
    const row = await prisma.sisSectionMoodleCourse.findUnique({ where: { tenantId_sisSectionId: { tenantId: tenant.id, sisSectionId } } });
    check(`section ${s.label} → ${s.course} (Moodle course ${courseIds[s.course] ?? '—'})`, Boolean(row && row.moodleCourseId === courseIds[s.course]));
  }
  const strays = await prisma.sisSectionMoodleCourse.count({ where: { tenantId: tenant.id, sisSectionId: { notIn: sectionIds } } });
  check('no other section mappings', strays === 0, `${strays} section mapping(s) outside the manifest.`);

  if (before) {
    for (const old of before) {
      const now = courses.find((c) => Number(c.id) === old.id);
      const same = Boolean(now) && ['shortname', 'fullname', 'idnumber', 'visible', 'categoryid', 'timemodified'].every((k) => now[k] === old[k]);
      check(`course ${old.id} (${old.shortname}) unchanged`, same);
    }
  }
  return { ok: problems.length === 0, problems, checks };
}

/**
 * Moving this environment to a new Moodle site (MOODLE_BASE_URL): the integration row still names the previous site,
 * and every Moodle link and section mapping refers to the previous site's ids, which mean nothing (or someone else)
 * on the new one. Report them; with `apply`, return them as an archive, delete exactly them and point the integration
 * at the new site, in one transaction. Operation history is kept. `expect` guards against acting on a different set
 * than the one reviewed.
 */
export async function moveToSite({ tenantSlug, apply = false, expect = null }) {
  const config = moodleConfig();
  if (!config.valid) throw new Error(`Moodle is not configured: ${config.problems.join(' ')}`);
  const { tenant } = await seedContext(tenantSlug);
  const integration = await prisma.integration.findFirst({ where: { tenantId: tenant.id, provider: 'MOODLE' } });
  if (integration.baseUrl === config.baseUrl) return { moved: false, alreadyOnSite: true, fromSite: integration.baseUrl, toSite: config.baseUrl };
  const links = await prisma.externalIdentity.findMany({ where: { tenantId: tenant.id, provider: 'MOODLE' }, orderBy: { createdAt: 'asc' } });
  const mappings = await prisma.sisSectionMoodleCourse.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'asc' } });
  const report = { fromSite: integration.baseUrl, toSite: config.baseUrl, links, mappings, operationsKept: await prisma.integrationOperation.count({ where: { integrationId: integration.id } }) };
  if (!apply) return { moved: false, ...report };
  if (!expect || expect.links !== links.length || expect.mappings !== mappings.length) {
    throw new Error(`Refusing: expected ${expect?.links ?? '?'} link(s) and ${expect?.mappings ?? '?'} mapping(s), found ${links.length} and ${mappings.length}.`);
  }
  await prisma.$transaction(async (tx) => {
    const a = await tx.externalIdentity.deleteMany({ where: { id: { in: links.map((l) => l.id) } } });
    const b = await tx.sisSectionMoodleCourse.deleteMany({ where: { id: { in: mappings.map((m) => m.id) } } });
    if (a.count !== links.length || b.count !== mappings.length) throw new Error('Unexpected delete counts; rolled back.');
    await tx.integration.update({ where: { id: integration.id }, data: { baseUrl: config.baseUrl } });
  });
  return { moved: true, ...report };
}

/** Create (or link) the Moodle account of one existing local student, without enrolments. Needs writes enabled. */
export async function provisionOneStudent({ tenantSlug, studentNumber }) {
  const { tenant, auth } = await seedContext(tenantSlug);
  const local = await localProfile(tenant.id, { number: studentNumber, entityType: 'STUDENT' });
  if (!local || local.user.status !== 'ACTIVE') throw new Error(`No active EduNexusAI student ${studentNumber}.`);
  const { result } = await moodle.provisionStudent(auth, local.id, { credentials: 'NONE' });
  return result;
}
