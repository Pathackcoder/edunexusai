import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireFacultyProfile } from '../../middleware/auth.js';
import * as service from './facultyService.js';
import { getFacultyDashboard } from '../dashboard/dashboardService.js';

const courseParamSchema = z.object({ courseId: z.string().uuid('Expected a course id.') });

const notificationSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(160),
  message: z.string().trim().min(3, 'Message must be at least 3 characters.').max(2000),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(200),
  content: z.string().trim().min(3, 'Content must be at least 3 characters.').max(5000),
  tags: z.array(z.string().trim().max(40)).max(6).default([]),
});

export const facultyRoutes = Router();
facultyRoutes.use(requireAuth, requireFacultyProfile);

const ctx = (req) => [req.auth.tenantId, req.auth.userId];
const opts = (req) => ({ roles: req.auth.roles });

facultyRoutes.get(
  '/dashboard',
  asyncHandler(async (req, res) =>
    sendSuccess(res, await getFacultyDashboard({ tenantId: req.auth.tenantId, userId: req.auth.userId })),
  ),
);

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

facultyRoutes.post(
  '/courses/:courseId/announcements',
  validate({ params: courseParamSchema, body: announcementSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await service.createAnnouncement(...ctx(req), req.params.courseId, req.body, opts(req)),
      { status: 201 },
    ),
  ),
);

facultyRoutes.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const announcements = await service.listMyAnnouncements(...ctx(req));
    return sendSuccess(res, announcements, { count: announcements.length });
  }),
);

facultyRoutes.get(
  '/schedule',
  asyncHandler(async (req, res) => {
    const schedule = await service.getTeachingSchedule(...ctx(req));
    return sendSuccess(res, schedule, { count: schedule.length });
  }),
);
