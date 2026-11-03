import { prisma } from '../../db/prisma.js';
import { moodleConfig } from '../../config/env.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { recordAudit } from '../audit/auditService.js';
import * as sis from '../sis/sisService.js';
import * as moodle from './moodleService.js';

/**
 * Course alignment: CampusCore registrations → Moodle enrolments.
 *
 *   CampusCore owns which classes a person takes (registrations in sections) and teaches
 *   (section instructors). Moodle owns course sites and their participants. EduNexusAI owns
 *   only the mapping "this CampusCore section is delivered in that Moodle course"
 *   (sis_section_moodle_courses), set by an administrator.
 *
 * From those three facts, Moodle enrolments are DERIVED, on demand, never copied:
 *   registered in a mapped section          → should be a student in the Moodle course
 *   teaching a mapped section               → should be an editing teacher in it
 *   registered in an unmapped section       → no Moodle course (a valid state)
 *   enrolled in a mapped Moodle course but
 *   not registered in any of its sections   → REVIEW (dropped?); never removed automatically
 *   waitlisted                              → not enrolled until registered
 * Applying a plan uses the existing Moodle enrolment operations (idempotent, retryable,
 * audited), so re-running never duplicates anything.
 */

const ENTITY = 'SisSectionMoodleCourse';
const courseUrl = (id) => (moodleConfig().baseUrl ? `${moodleConfig().baseUrl}/course/view.php?id=${id}` : null);
const norm = (v) => String(v ?? '').toLowerCase().replace(/[\s_]+/g, '');

/** Terms whose classes are still live (in progress or upcoming). */
async function liveTermCodes(adapter) {
  const today = new Date().toISOString().slice(0, 10);
  const terms = await adapter.listTerms();
  return new Set(terms.filter((t) => !t.endDate || String(t.endDate).slice(0, 10) >= today).map((t) => t.code));
}

async function mappingsFor(tenantId, sisSectionIds) {
  if (!sisSectionIds.length) return new Map();
  const rows = await prisma.sisSectionMoodleCourse.findMany({ where: { tenantId, sisSectionId: { in: sisSectionIds } } });
  return new Map(rows.map((r) => [r.sisSectionId, r]));
}

async function moodleCourseIndex(tenantId) {
  const courses = await moodle.remoteCourses(tenantId);
  return new Map(courses.map((c) => [c.moodleCourseId, { moodleCourseId: c.moodleCourseId, shortName: c.shortName, fullName: c.fullName, idNumber: c.idNumber, visible: c.visible, url: courseUrl(c.moodleCourseId) }]));
}

/* ------------------------------------------------------------- mappings (admin) */

/** One term's CampusCore sections with the Moodle course each is mapped to (or a suggestion). */
export async function listSectionMappings(auth, { termId, search, page = 1 } = {}) {
  const sections = await sis.searchSections(auth, { termId, search, page, pageSize: 50 });
  const courses = await moodleCourseIndex(auth.tenantId);
  const map = await mappingsFor(auth.tenantId, sections.items.map((s) => s.source.id));
  const items = sections.items.map((s) => {
    const row = map.get(s.source.id);
    const mapped = row ? courses.get(row.moodleCourseId) ?? null : null;
    // Suggestion only (never applied automatically): a Moodle course whose ID number or short
    // name equals "<course code>-<section>" or the course code.
    const keys = [norm(`${s.courseCode}-${s.sectionCode}`), norm(s.courseCode)];
    const suggestion = row ? null : [...courses.values()].find((c) => keys.includes(norm(c.idNumber)) || keys.includes(norm(c.shortName))) ?? null;
    return {
      sisSectionId: s.source.id,
      courseCode: s.courseCode,
      courseTitle: s.courseTitle,
      sectionCode: s.sectionCode,
      termCode: s.termCode,
      instructors: s.instructors,
      enrolled: s.seats?.enrolled ?? null,
      moodleCourse: mapped,
      mappingState: row ? (mapped ? 'MAPPED' : 'MOODLE_COURSE_MISSING') : 'NO_MOODLE_COURSE',
      missingMoodleCourseId: row && !mapped ? row.moodleCourseId : null,
      suggestion,
    };
  });
  return { terms: sections.terms, term: sections.term, items, pagination: sections.pagination, moodleCourses: [...courses.values()] };
}

export async function linkSection(auth, { sisSectionId, moodleCourseId }) {
  const section = await sis.withCampusCore(async (adapter) => (await adapter.client.get(`/sections/${encodeURIComponent(sisSectionId)}`)).data);
  const course = await moodle.assertMoodleCourse(auth.tenantId, moodleCourseId);
  const existing = await prisma.sisSectionMoodleCourse.findUnique({ where: { tenantId_sisSectionId: { tenantId: auth.tenantId, sisSectionId } } });
  const row = await prisma.sisSectionMoodleCourse.upsert({
    where: { tenantId_sisSectionId: { tenantId: auth.tenantId, sisSectionId } },
    create: { tenantId: auth.tenantId, sisSectionId, sisTermId: section.termId, moodleCourseId, linkedByUserId: auth.userId },
    update: { moodleCourseId, sisTermId: section.termId, linkedByUserId: auth.userId },
  });
  const label = `${section.course?.code}-${section.sectionNumber} (${section.termCode})`;
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: existing ? 'SIS_SECTION_MOODLE_RELINKED' : 'SIS_SECTION_MOODLE_LINKED', entityType: ENTITY, entityId: sisSectionId, summary: `CampusCore section ${label} → Moodle course ${course.shortName} (${moodleCourseId})${existing && existing.moodleCourseId !== moodleCourseId ? `, was ${existing.moodleCourseId}` : ''}` });
  return { sisSectionId, moodleCourseId: row.moodleCourseId, moodleCourse: { ...course, url: courseUrl(course.moodleCourseId) } };
}

/** Removes the mapping only. Nothing is unenrolled in Moodle and no SIS data changes. */
export async function unlinkSection(auth, sisSectionId) {
  const row = await prisma.sisSectionMoodleCourse.findUnique({ where: { tenantId_sisSectionId: { tenantId: auth.tenantId, sisSectionId } } });
  if (!row) throw notFound('This section has no Moodle course mapping.');
  await prisma.sisSectionMoodleCourse.delete({ where: { id: row.id } });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'SIS_SECTION_MOODLE_UNLINKED', entityType: ENTITY, entityId: sisSectionId, summary: `CampusCore section ${sisSectionId} no longer mapped to Moodle course ${row.moodleCourseId} (Moodle enrolments unchanged)` });
  return { unlinked: true };
}

/* --------------------------------------------------------------- per person */

async function moodleState(tenantId, entityType, profileId) {
  if (!profileId) return { state: 'NO_PROFILE' };
  const link = await moodle.moodleLinkOf(tenantId, entityType, profileId);
  if (!link) return { state: 'NOT_LINKED' };
  return { state: link.status === 'SUSPENDED' ? 'SUSPENDED' : 'LINKED', moodleUserId: Number(link.externalId) };
}

/**
 * What a student's Moodle enrolments should be, from their CampusCore registrations.
 * `userId` is resolved to the CampusCore record through the verified identity link only.
 */
export async function studentPlan(auth, userId) {
  const profile = await prisma.studentProfile.findFirst({ where: { tenantId: auth.tenantId, userId }, select: { id: true } });
  if (!sis.sisConfigured()) return { state: 'SIS_NOT_CONFIGURED', classes: [], review: [] };
  const sisPart = await sis.withCampusCore(async (adapter) => {
    // The student relationship only: a person who also teaches has a faculty link as well.
    const identity = await adapter.resolveIdentity(String(userId), { recordType: 'STUDENT' });
    if (identity.status !== 'LINKED' || identity.recordType !== 'STUDENT') return { state: identity.status === 'LINKED' ? 'NOT_A_STUDENT' : 'UNMAPPED' };
    const live = await liveTermCodes(adapter);
    const regs = (await adapter.getRegistrations(identity.sisId)).filter((r) => ['enrolled', 'waitlisted'].includes(r.status) && (!r.section?.termCode || live.has(r.section.termCode)));
    return { state: 'OK', sisId: identity.sisId, institutionalId: identity.institutionalId, regs };
  });
  const account = await moodleState(auth.tenantId, 'STUDENT', profile?.id);
  if (sisPart.state !== 'OK') return { state: sisPart.state, moodleAccount: account, classes: [], review: [] };

  const map = await mappingsFor(auth.tenantId, sisPart.regs.map((r) => r.sectionRef.id));
  const courses = map.size || account.state === 'LINKED' ? await moodleCourseIndex(auth.tenantId) : new Map();
  let active = account.state === 'LINKED' ? await moodle.activeCourseIdsOf(auth.tenantId, account.moodleUserId) : new Set();
  // One Moodle account per person: when it is also this person's teaching account, the courses they
  // teach are not part of their student plan (and are never flagged for review as a student).
  if (active.size && (await moodle.isSharedWithFaculty(auth.tenantId, userId, account.moodleUserId))) {
    const kept = new Set();
    for (const id of active) {
      const roles = await moodle.courseRolesOf(auth.tenantId, id, account.moodleUserId);
      if (!roles?.some((r) => r === 'editingteacher' || r === 'teacher') || roles.includes('student')) kept.add(id);
    }
    active = kept;
  }

  const classes = sisPart.regs.map((r) => {
    const row = map.get(r.sectionRef.id);
    const course = row ? courses.get(row.moodleCourseId) ?? null : null;
    let status;
    if (!row) status = 'NO_MOODLE_COURSE';
    else if (!course) status = 'MOODLE_COURSE_MISSING';
    else if (r.status === 'waitlisted') status = 'WAITLISTED';
    else if (account.state !== 'LINKED') status = account.state === 'SUSPENDED' ? 'MOODLE_ACCOUNT_SUSPENDED' : 'NEEDS_MOODLE_ACCOUNT';
    else status = active.has(course.moodleCourseId) ? 'ENROLLED' : 'TO_ENROL';
    return { sisSectionId: r.sectionRef.id, termCode: r.section?.termCode ?? null, courseCode: r.section?.courseCode ?? null, courseTitle: r.section?.courseTitle ?? null, sectionCode: r.section?.sectionNumber ?? null, registration: r.status === 'waitlisted' ? 'WAITLISTED' : 'REGISTERED', moodleCourse: course, status };
  });

  // Enrolled in a Moodle course that is mapped to live sections, but registered in none of them.
  const review = [];
  if (active.size) {
    const registeredCourses = new Set(classes.filter((c) => c.registration === 'REGISTERED' && c.moodleCourse).map((c) => c.moodleCourse.moodleCourseId));
    const mappedRows = await prisma.sisSectionMoodleCourse.findMany({ where: { tenantId: auth.tenantId, moodleCourseId: { in: [...active] } } });
    for (const id of new Set(mappedRows.map((r) => r.moodleCourseId))) {
      if (!registeredCourses.has(id)) review.push({ moodleCourse: courses.get(id) ?? { moodleCourseId: id }, reason: 'Enrolled in Moodle but not registered in any CampusCore section mapped to this course (dropped or never registered). Nothing is removed automatically.' });
    }
  }
  return { state: 'OK', institutionalId: sisPart.institutionalId, moodleAccount: account, classes, review };
}

/** Enrol the student in every mapped Moodle course of their registered sections. */
export async function applyStudentPlan(auth, userId) {
  const plan = await studentPlan(auth, userId);
  if (plan.state !== 'OK') return { plan, results: [] };
  const profile = await prisma.studentProfile.findFirst({ where: { tenantId: auth.tenantId, userId }, select: { id: true } });
  const results = [];
  for (const moodleCourseId of new Set(plan.classes.filter((c) => c.status === 'TO_ENROL').map((c) => c.moodleCourse.moodleCourseId))) {
    results.push(await enrolOne(() => moodle.enrolStudent(auth, moodleCourseId, { studentProfileId: profile.id }), moodleCourseId));
  }
  return { plan: await studentPlan(auth, userId), results };
}

/** What a faculty member's Moodle teaching roles should be, from their CampusCore sections. */
export async function facultyPlan(auth, userId) {
  const profile = await prisma.facultyProfile.findFirst({ where: { tenantId: auth.tenantId, userId }, select: { id: true } });
  if (!sis.sisConfigured()) return { state: 'SIS_NOT_CONFIGURED', classes: [] };
  const sisPart = await sis.withCampusCore(async (adapter) => {
    const identity = await adapter.resolveIdentity(String(userId), { recordType: 'FACULTY' });
    if (identity.status !== 'LINKED' || identity.recordType !== 'FACULTY') return { state: identity.status === 'LINKED' ? 'NOT_FACULTY' : 'UNMAPPED' };
    const live = await liveTermCodes(adapter);
    const sections = (await adapter.listFacultySections(identity.sisId)).filter((s) => !s.termCode || live.has(s.termCode));
    return { state: 'OK', sections };
  });
  const account = await moodleState(auth.tenantId, 'FACULTY', profile?.id);
  if (sisPart.state !== 'OK') return { state: sisPart.state, moodleAccount: account, classes: [] };
  const map = await mappingsFor(auth.tenantId, sisPart.sections.map((s) => s.source.id));
  const courses = map.size ? await moodleCourseIndex(auth.tenantId) : new Map();
  const classes = [];
  for (const s of sisPart.sections) {
    const row = map.get(s.source.id);
    const course = row ? courses.get(row.moodleCourseId) ?? null : null;
    let status;
    if (!row) status = 'NO_MOODLE_COURSE';
    else if (!course) status = 'MOODLE_COURSE_MISSING';
    else if (account.state !== 'LINKED') status = 'NEEDS_MOODLE_ACCOUNT';
    else {
      const roles = await moodle.courseRolesOf(auth.tenantId, course.moodleCourseId, account.moodleUserId);
      status = roles?.some((r) => r === 'editingteacher' || r === 'teacher') ? 'TEACHING' : roles?.length ? 'OTHER_ROLE' : 'TO_ENROL';
    }
    classes.push({ sisSectionId: s.source.id, termCode: s.termCode, courseCode: s.courseCode, courseTitle: s.courseTitle, sectionCode: s.sectionCode, moodleCourse: course, status });
  }
  return { state: 'OK', moodleAccount: account, classes };
}

export async function applyFacultyPlan(auth, userId) {
  const plan = await facultyPlan(auth, userId);
  if (plan.state !== 'OK') return { plan, results: [] };
  const profile = await prisma.facultyProfile.findFirst({ where: { tenantId: auth.tenantId, userId }, select: { id: true } });
  const results = [];
  for (const moodleCourseId of new Set(plan.classes.filter((c) => c.status === 'TO_ENROL').map((c) => c.moodleCourse.moodleCourseId))) {
    results.push(await enrolOne(() => moodle.enrolInstructor(auth, moodleCourseId, { facultyProfileId: profile.id }), moodleCourseId));
  }
  return { plan: await facultyPlan(auth, userId), results };
}

async function enrolOne(run, moodleCourseId) {
  try {
    const out = await run();
    return { moodleCourseId, status: out.result?.action === 'ALREADY_ENROLLED' ? 'ALREADY' : 'DONE', message: out.result?.warning ?? null, operationId: out.operation?.id ?? null };
  } catch (error) {
    return { moodleCourseId, status: error.details?.operationStatus === 'BLOCKED' ? 'BLOCKED' : 'FAILED', message: error.message, operationId: error.details?.operationId ?? null };
  }
}

/* --------------------------------------------------------------- per section */

/** One mapped section's CampusCore roster against its Moodle course. */
export async function sectionPlan(auth, sisSectionId) {
  const row = await prisma.sisSectionMoodleCourse.findUnique({ where: { tenantId_sisSectionId: { tenantId: auth.tenantId, sisSectionId } } });
  if (!row) throw badRequest('Map this section to a Moodle course first.');
  const roster = await sis.withCampusCore(async (adapter) => {
    const regs = (await adapter.getRoster(sisSectionId)).filter((r) => r.status === 'enrolled');
    const out = [];
    for (const r of regs) {
      const links = await adapter.listIdentityLinks({ sisRecordId: r.student.source.id, status: 'ACTIVE' });
      out.push({ sisStudentId: r.student.source.id, institutionalId: r.student.institutionalId, name: r.student.displayName, portalUserId: links.data[0]?.externalUserId ?? null });
    }
    return out;
  });
  const course = (await moodleCourseIndex(auth.tenantId)).get(row.moodleCourseId) ?? null;
  const students = [];
  for (const s of roster) {
    const profile = s.portalUserId ? await prisma.studentProfile.findFirst({ where: { tenantId: auth.tenantId, userId: s.portalUserId }, select: { id: true } }) : null;
    const account = await moodleState(auth.tenantId, 'STUDENT', profile?.id);
    let status;
    if (!course) status = 'MOODLE_COURSE_MISSING';
    else if (!s.portalUserId || !profile) status = 'NO_PORTAL_ACCOUNT';
    else if (account.state !== 'LINKED') status = account.state === 'SUSPENDED' ? 'MOODLE_ACCOUNT_SUSPENDED' : 'NEEDS_MOODLE_ACCOUNT';
    else status = (await moodle.activeCourseIdsOf(auth.tenantId, account.moodleUserId)).has(course.moodleCourseId) ? 'ENROLLED' : 'TO_ENROL';
    students.push({ ...s, studentProfileId: profile?.id ?? null, moodleUserId: account.moodleUserId ?? null, status });
  }
  return { sisSectionId, moodleCourse: course, students };
}

export async function applySectionPlan(auth, sisSectionId) {
  const plan = await sectionPlan(auth, sisSectionId);
  const results = [];
  for (const s of plan.students.filter((x) => x.status === 'TO_ENROL')) {
    results.push({ institutionalId: s.institutionalId, ...(await enrolOne(() => moodle.enrolStudent(auth, plan.moodleCourse.moodleCourseId, { studentProfileId: s.studentProfileId }), plan.moodleCourse.moodleCourseId)) });
  }
  return { plan: await sectionPlan(auth, sisSectionId), results };
}
