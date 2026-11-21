import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireFacultyProfile, requireRole } from '../../middleware/auth.js';
import * as service from './facultyService.js';
import * as teaching from './teachingService.js';
import * as gradebook from '../gradebook/gradebookService.js';
import { getFacultyDashboard } from '../dashboard/dashboardService.js';

const courseParamSchema = z.object({ courseId: z.string().uuid('Expected a course id.') });

const notificationSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(160),
  message: z.string().trim().min(3, 'Message must be at least 3 characters.').max(2000),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

const sisSectionParamSchema = z.object({ sectionId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/, 'Expected a CampusCore section id.') });

// As CampusCore's class announcement limits. A fresh idempotency key per composed announcement makes a retry safe.
const publishAnnouncementSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(150),
  body: z.string().trim().min(3, 'Message must be at least 3 characters.').max(5000),
  pinned: z.boolean().default(false),
  idempotencyKey: z.string().uuid('A fresh idempotency key (UUID) is required for each announcement.'),
}).strict();

export const facultyRoutes = Router();
facultyRoutes.use(requireAuth, requireFacultyProfile);

const ctx = (req) => [req.auth.tenantId, req.auth.userId];
const opts = (req) => ({ roles: req.auth.roles });

facultyRoutes.get(
  '/dashboard',
  asyncHandler(async (req, res) =>
    // The full session context: the CampusCore teaching panels resolve the faculty member's SIS record from it.
    sendSuccess(res, await getFacultyDashboard(req.auth)),
  ),
);

/** Teaching assignments from CampusCore, each with its announcement owner (CampusCore or Moodle). */
facultyRoutes.get(
  '/sections',
  asyncHandler(async (req, res) => sendSuccess(res, await teaching.teachingSections(req.auth, { withPublishing: true }))),
);

/**
 * Publish a class announcement in the system that owns the section (CampusCore, or the mapped Moodle course), as the
 * signed-in faculty member. Faculty role only
 * (administrators have no teaching assignment to act on); View-As sessions are read-only before this is reached.
 */
facultyRoutes.post(
  '/sections/:sectionId/announcements',
  requireRole('FACULTY'),
  validate({ params: sisSectionParamSchema, body: publishAnnouncementSchema }),
  asyncHandler(async (req, res) => {
    const { idempotencyKey, ...input } = req.body;
    return sendSuccess(res, await teaching.publishAnnouncement(req.auth, req.params.sectionId, input, { idempotencyKey }), { status: 201 });
  }),
);

/** Local EduNexusAI course records (demo data); used by the local gradebook and follow-ups. */
facultyRoutes.get(
  '/courses',
  asyncHandler(async (req, res) => {
    const courses = await service.listMyCourses(...ctx(req));
    return sendSuccess(res, courses, { count: courses.length });
  }),
);

facultyRoutes.get(
  '/courses/:courseId/students',
  validate({ params: courseParamSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.getRoster(...ctx(req), req.params.courseId, opts(req))),
  ),
);

/**
 * The demonstration endpoint: creates a real Notification row for every enrolled
 * student, which then appears in that student's notification centre.
 */
facultyRoutes.post(
  '/courses/:courseId/notifications',
  validate({ params: courseParamSchema, body: notificationSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await service.sendClassNotification(...ctx(req), req.params.courseId, req.body, opts(req)),
      { status: 201 },
    ),
  ),
);

/**
 * Class announcements on the sections this faculty member teaches, read from the owning system. Without
 * CampusCore the local course records are the only source, so their announcements are listed instead.
 */
facultyRoutes.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const result = await teaching.myAnnouncements(req.auth, { teaching: await teaching.teachingSections(req.auth, { withPublishing: true }) });
    if (result.state === 'SIS_NOT_CONFIGURED') {
      const items = (await service.listMyAnnouncements(...ctx(req))).map((a) => ({ ...a, source: 'local' }));
      return sendSuccess(res, { ...result, items, sources: { local: { state: 'OK' } } }, { count: items.length });
    }
    return sendSuccess(res, result, { count: result.items.length });
  }),
);

facultyRoutes.get(
  '/schedule',
  asyncHandler(async (req, res) => {
    const schedule = await service.getTeachingSchedule(...ctx(req));
    return sendSuccess(res, schedule, { count: schedule.length });
  }),
);

/* ----- Gradebook (instructor of record only; enforced in gradebookService) ----- */
const twoDecimals = (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        assignmentId: z.string().uuid('Expected an assignment id.'),
        studentProfileId: z.string().uuid('Expected a student id.'),
        score: z
          .number({ invalid_type_error: 'Scores must be numbers.' })
          .finite()
          .min(0, 'Scores cannot be negative.')
          .refine(twoDecimals, 'Use at most two decimal places.')
          .nullable(),
      }),
    )
    .min(1, 'Nothing to save.')
    .max(2000),
});
const publishSchema = z.object({ assignmentId: z.string().uuid().optional() });
const gradingSettingsSchema = z.object({
  gradingMethod: z.enum(['POINTS', 'WEIGHTED']),
  missingWorkPolicy: z.enum(['EXCLUDE', 'ZERO']),
  atRiskThreshold: z.number().int().min(0).max(100),
  weights: z
    .array(z.object({ assignmentId: z.string().uuid(), weight: z.number().finite().min(0).max(100).nullable() }))
    .max(500)
    .default([]),
});

facultyRoutes.get('/gradebook/courses', asyncHandler(async (req, res) => sendSuccess(res, await gradebook.listGradebookCourses(req.auth))));
facultyRoutes.get(
  '/courses/:courseId/gradebook',
  validate({ params: courseParamSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await gradebook.getGradebook(req.auth, req.params.courseId))),
);
facultyRoutes.put(
  '/courses/:courseId/gradebook/scores',
  validate({ params: courseParamSchema, body: scoresSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await gradebook.saveScores(req.auth, req.params.courseId, req.body.scores))),
);
facultyRoutes.post(
  '/courses/:courseId/gradebook/publish',
  validate({ params: courseParamSchema, body: publishSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await gradebook.publishGrades(req.auth, req.params.courseId, req.body))),
);
facultyRoutes.put(
  '/courses/:courseId/gradebook/settings',
  validate({ params: courseParamSchema, body: gradingSettingsSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await gradebook.updateSettings(req.auth, req.params.courseId, req.body))),
);
