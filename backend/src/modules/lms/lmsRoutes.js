import { Router } from 'express';
import * as alignment from './courseAlignmentService.js';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireFacultyProfile, requireRole, requireStudentProfile } from '../../middleware/auth.js';
import { testIntegration } from '../../integrations/integrationService.js';
import { clearMoodleCapabilityCache } from '../../integrations/connectors/MoodleConnector.js';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../utils/errors.js';
import * as moodle from './moodleService.js';

/**
 * LMS routes (Moodle).
 *
 *   /lms/me/...           the signed-in student's own Moodle data. Moodle ids for the
 *                         student are resolved server-side from their link, never taken
 *                         from the request; a course id in the path is checked against
 *                         the student's own enrolments.
 *   /lms/admin/moodle/... administration, ADMIN role only.
 *
 * There is no generic pass-through: each route maps to one validated operation.
 */
export const lmsRoutes = Router();
lmsRoutes.use(requireAuth);

const moodleId = z.coerce.number().int().positive().max(2_147_483_647);
const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

/* ---------- student ---------- */

lmsRoutes.get(
  '/me/moodle/courses',
  requireStudentProfile,
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.myCourses(req.auth))),
);

lmsRoutes.get(
  '/me/moodle/courses/:courseId',
  requireStudentProfile,
  validate({ params: z.object({ courseId: moodleId }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.myCourse(req.auth, req.params.courseId))),
);

lmsRoutes.get('/me/moodle/assignments', requireStudentProfile, asyncHandler(async (req, res) => sendSuccess(res, await moodle.myAssignments(req.auth))));
lmsRoutes.get('/me/moodle/grades', requireStudentProfile, asyncHandler(async (req, res) => sendSuccess(res, await moodle.myGrades(req.auth))));
// The signed-in student's CampusCore classes with their Moodle course (if any). Self only:
// the CampusCore record comes from the session user's identity link.
lmsRoutes.get('/me/sis-classes', requireStudentProfile, asyncHandler(async (req, res) => sendSuccess(res, await alignment.studentPlan(req.auth, req.auth.userId))));

/* ---------- faculty: authorised per course by the live Moodle teaching role ---------- */

const faculty = Router();
faculty.use(requireRole('FACULTY'), requireFacultyProfile);
const facultyCourse = z.object({ courseId: moodleId });
const facultyAssignment = z.object({ courseId: moodleId, assignmentId: moodleId });
faculty.get('/courses', asyncHandler(async (req, res) => sendSuccess(res, await moodle.myTeaching(req.auth))));
faculty.get('/courses/:courseId', validate({ params: facultyCourse }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.teachingCourse(req.auth, req.params.courseId))));
faculty.get(
  '/courses/:courseId/assignments/:assignmentId/submissions',
  validate({ params: facultyAssignment }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.assignmentSubmissions(req.auth, req.params.courseId, req.params.assignmentId))),
);
faculty.put(
  '/courses/:courseId/assignments/:assignmentId/grades/:moodleUserId',
  validate({
    params: facultyAssignment.extend({ moodleUserId: moodleId }),
    body: z.object({ grade: z.number().finite().min(0), feedback: z.string().trim().max(10000).optional() }),
  }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await moodle.saveStudentGrade(req.auth, req.params.courseId, req.params.assignmentId, req.params.moodleUserId, req.body)),
  ),
);
faculty.get('/sis-classes', asyncHandler(async (req, res) => sendSuccess(res, await alignment.facultyPlan(req.auth, req.auth.userId))));
lmsRoutes.use('/faculty/moodle', faculty);

/* ---------- admin ---------- */

const admin = Router();
admin.use(requireRole('ADMIN'));

admin.get('/status', asyncHandler(async (req, res) => sendSuccess(res, await moodle.getStatus(req.auth.tenantId))));

admin.post(
  '/test',
  asyncHandler(async (req, res) => {
    const integration = await prisma.integration.findFirst({ where: { tenantId: req.auth.tenantId, provider: 'MOODLE' } });
    if (!integration) throw notFound('Moodle is not registered for this institution.');
    clearMoodleCapabilityCache();
    // Shared health tracking: updates the integration status and writes a sync log row.
    return sendSuccess(res, await testIntegration({ integration, userId: req.auth.userId }));
  }),
);

// LMS-specific read of Moodle rosters (the Moodle counterpart of an SIS sync; read-only).
admin.post('/rosters/read', asyncHandler(async (req, res) => sendSuccess(res, await moodle.readRosters(req.auth))));

admin.get('/categories', asyncHandler(async (req, res) => sendSuccess(res, await moodle.listCategories(req.auth.tenantId))));
admin.get('/courses', asyncHandler(async (req, res) => sendSuccess(res, await moodle.listCourses(req.auth.tenantId))));

const courseFields = {
  fullName: z.string().trim().min(3).max(254),
  shortName: z.string().trim().min(2).max(100),
  idNumber: z.string().trim().max(100).optional().or(z.literal('')),
  summary: z.string().trim().max(5000).optional(),
  categoryId: moodleId.optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  visible: z.boolean().optional(),
};
const createCourseSchema = z
  .object({ ...courseFields, localCourseId: uuid.optional() })
  .refine((v) => !v.startDate || !v.endDate || new Date(v.endDate) > new Date(v.startDate), { message: 'End date must be after the start date.', path: ['endDate'] });
const updateCourseSchema = z
  .object(Object.fromEntries(Object.entries(courseFields).map(([k, v]) => [k, v.optional()])))
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to change.' });
const courseParam = z.object({ courseId: moodleId });

admin.post('/courses', validate({ body: createCourseSchema }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.createCourse(req.auth, req.body), { status: 201 })));
admin.patch('/courses/:courseId', validate({ params: courseParam, body: updateCourseSchema }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.updateCourse(req.auth, req.params.courseId, req.body))));
admin.post('/courses/:courseId/hide', validate({ params: courseParam }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.updateCourse(req.auth, req.params.courseId, { visible: false }))));
admin.post('/courses/:courseId/show', validate({ params: courseParam }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.updateCourse(req.auth, req.params.courseId, { visible: true }))));
admin.delete(
  '/courses/:courseId',
  validate({ params: courseParam, body: z.object({ confirmShortName: z.string().min(1) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.deleteCourse(req.auth, req.params.courseId, req.body))),
);
admin.put('/courses/:courseId/link', validate({ params: courseParam, body: z.object({ courseId: uuid }) }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.linkCourse(req.auth, req.params.courseId, req.body))));
admin.delete('/courses/:courseId/link', validate({ params: courseParam }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.unlinkCourse(req.auth, req.params.courseId))));

admin.get('/courses/:courseId/enrolments', validate({ params: courseParam }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.listEnrolments(req.auth.tenantId, req.params.courseId))));
admin.post(
  '/courses/:courseId/enrolments',
  validate({ params: courseParam, body: z.object({ studentProfileId: uuid }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.enrolStudent(req.auth, req.params.courseId, req.body))),
);
admin.post(
  '/courses/:courseId/enrolments/end',
  validate({ params: courseParam, body: z.object({ studentProfileId: uuid, mode: z.enum(['SUSPEND', 'REMOVE']).default('SUSPEND'), confirm: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.endEnrolment(req.auth, req.params.courseId, req.body))),
);

const studentParam = z.object({ studentProfileId: uuid });
admin.get('/students', validate({ query: z.object({ search: z.string().trim().max(100).optional() }) }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.listStudents(req.auth.tenantId, req.validatedQuery))));
admin.post(
  '/students/:studentProfileId/link',
  validate({ params: studentParam, body: z.object({ moodleUserId: moodleId.optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.linkStudent(req.auth, req.params.studentProfileId, req.body))),
);
admin.delete('/students/:studentProfileId/link', validate({ params: studentParam }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.unlinkStudent(req.auth, req.params.studentProfileId))));
admin.post(
  '/students/:studentProfileId/provision',
  validate({ params: studentParam, body: z.object({ sendWelcomeEmail: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.provisionStudent(req.auth, req.params.studentProfileId, req.body))),
);
// One profile's Moodle account (Systems): state, live account, courses, or the matching candidate when not linked.
const profileParam = z.object({ entityType: z.enum(['STUDENT', 'FACULTY']), profileId: uuid });
admin.get('/profiles/:entityType/:profileId', validate({ params: profileParam }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.profileMoodleState(req.auth.tenantId, req.params.entityType, req.params.profileId))));
// Link an EXISTING Moodle account (the matching one, or an explicit Moodle user id checked against the institutional
// ID / email); unlink removes only the EduNexusAI link. Neither creates, edits or deletes anything in Moodle.
admin.post(
  '/profiles/:entityType/:profileId/link',
  validate({ params: profileParam, body: z.object({ moodleUserId: moodleId.optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await (req.params.entityType === 'FACULTY' ? moodle.linkFaculty : moodle.linkStudent)(req.auth, req.params.profileId, req.body))),
);
admin.delete('/profiles/:entityType/:profileId/link', validate({ params: profileParam }), asyncHandler(async (req, res) => sendSuccess(res, await (req.params.entityType === 'FACULTY' ? moodle.unlinkFaculty : moodle.unlinkStudent)(req.auth, req.params.profileId))));
// New one-time Moodle password for a linked student or faculty account (change forced at
// next Moodle login). Returned once, never stored; the response is not cacheable.
// Moodle account for a student or faculty profile. A person's second profile reuses the account of the first.
admin.post(
  '/people/:entityType/:profileId/provision',
  validate({ params: z.object({ entityType: z.enum(['STUDENT', 'FACULTY']), profileId: uuid }), body: z.object({ credentials: z.enum(['EMAIL', 'ONE_TIME', 'NONE']).default('NONE') }) }),
  asyncHandler(async (req, res) => {
    const run = req.params.entityType === 'FACULTY' ? moodle.provisionFaculty : moodle.provisionStudent;
    const outcome = await run(req.auth, req.params.profileId, { credentials: req.body.credentials });
    // A one-time password is shown to the administrator once and never stored (see MOODLE_CREDENTIALS).
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, outcome, { status: 201 });
  }),
);
admin.post(
  '/people/:entityType/:profileId/one-time-password',
  validate({ params: z.object({ entityType: z.enum(['STUDENT', 'FACULTY']), profileId: uuid }) }),
  asyncHandler(async (req, res) => {
    const result = await moodle.issueOneTimeMoodlePassword(req.auth, { entityType: req.params.entityType, internalId: req.params.profileId });
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, result);
  }),
);
admin.post(
  '/students/:studentProfileId/onboard',
  validate({ params: studentParam, body: z.object({ courseIds: z.array(moodleId).max(20).default([]) }) }),
  asyncHandler(async (req, res) => {
    const { courseIds } = await moodle.precheckStudentOnboarding(req.auth.tenantId, req.body.courseIds);
    return sendSuccess(res, await moodle.onboardStudentSummary(req.auth, req.params.studentProfileId, { courseIds }));
  }),
);
admin.post(
  '/students/:studentProfileId/suspension',
  validate({ params: studentParam, body: z.object({ suspended: z.boolean() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.setStudentSuspended(req.auth, req.params.studentProfileId, req.body))),
);

admin.get(
  '/operations',
  validate({ query: z.object({ status: z.enum(['PENDING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'NEEDS_RECONCILIATION', 'BLOCKED']).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await moodle.listOperations(req.auth.tenantId, req.validatedQuery))),
);
admin.post('/operations/:id/retry', validate({ params: z.object({ id: uuid }) }), asyncHandler(async (req, res) => sendSuccess(res, await moodle.retryOperation(req.auth, req.params.id))));

/* ---------- CampusCore section ↔ Moodle course alignment ---------- */
const sisSection = z.object({ sisSectionId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/) });
admin.get(
  '/sis-sections',
  validate({ query: z.object({ termId: z.string().trim().max(64).optional(), search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await alignment.listSectionMappings(req.auth, req.validatedQuery))),
);
admin.put(
  '/sis-sections/:sisSectionId',
  validate({ params: sisSection, body: z.object({ moodleCourseId: moodleId }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await alignment.linkSection(req.auth, { sisSectionId: req.params.sisSectionId, moodleCourseId: req.body.moodleCourseId }))),
);
admin.delete('/sis-sections/:sisSectionId', validate({ params: sisSection }), asyncHandler(async (req, res) => sendSuccess(res, await alignment.unlinkSection(req.auth, req.params.sisSectionId))));
admin.get('/sis-sections/:sisSectionId/plan', validate({ params: sisSection }), asyncHandler(async (req, res) => sendSuccess(res, await alignment.sectionPlan(req.auth, req.params.sisSectionId))));
admin.post('/sis-sections/:sisSectionId/apply', validate({ params: sisSection }), asyncHandler(async (req, res) => sendSuccess(res, await alignment.applySectionPlan(req.auth, req.params.sisSectionId))));
const personParam = z.object({ userId: uuid });
admin.get('/people/:userId/sis-plan', validate({ params: personParam }), asyncHandler(async (req, res) => sendSuccess(res, await personPlan(req.auth, req.params.userId, false))));
admin.post('/people/:userId/sis-plan/apply', validate({ params: personParam }), asyncHandler(async (req, res) => sendSuccess(res, await personPlan(req.auth, req.params.userId, true))));

async function personPlan(auth, userId, apply) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: auth.tenantId }, select: { studentProfile: { select: { id: true } }, facultyProfile: { select: { id: true } } } });
  if (!user) throw notFound('User not found.');
  const student = user.studentProfile ? { kind: 'STUDENT', ...(apply ? await alignment.applyStudentPlan(auth, userId) : { plan: await alignment.studentPlan(auth, userId) }) } : null;
  const faculty = user.facultyProfile ? { kind: 'FACULTY', ...(apply ? await alignment.applyFacultyPlan(auth, userId) : { plan: await alignment.facultyPlan(auth, userId) }) } : null;
  // A person with both relationships gets both plans; single-role people keep the original shape.
  if (student && faculty) return { kind: 'STUDENT_AND_FACULTY', student, faculty };
  return student ?? faculty ?? { kind: 'NONE', plan: { state: 'NOT_APPLICABLE' } };
}

lmsRoutes.use('/admin/moodle', admin);
