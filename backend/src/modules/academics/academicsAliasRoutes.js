import { Router } from 'express';
import * as controller from './academicsController.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireStudentProfile } from '../../middleware/auth.js';
import {
  calendarQuerySchema,
  idParamSchema,
  submitAssignmentSchema,
  transcriptRequestSchema,
} from './academicsSchemas.js';

/**
 * Top-level aliases so the public URLs read the way the product talks about them:
 *   GET /api/v1/courses          instead of  /api/v1/academics/courses
 *   GET /api/v1/grades           instead of  /api/v1/academics/grades
 *
 * Same controllers, same guards — only the mount point differs. The `/academics/*`
 * paths remain available and both are documented.
 */
export const academicAliasRoutes = Router();

academicAliasRoutes.use(requireAuth);

academicAliasRoutes.get('/calendar', validate({ query: calendarQuerySchema }), controller.listCalendar);

academicAliasRoutes.use(requireStudentProfile);

academicAliasRoutes.get('/courses', controller.listCourses);
academicAliasRoutes.get('/courses/:id', validate({ params: idParamSchema }), controller.getCourse);
academicAliasRoutes.get('/schedule', controller.getSchedule);
academicAliasRoutes.get('/assignments', controller.listAssignments);
academicAliasRoutes.post(
  '/assignments/:id/submit',
  validate({ params: idParamSchema, body: submitAssignmentSchema }),
  controller.submitAssignment,
);
academicAliasRoutes.get('/grades', controller.getGrades);
academicAliasRoutes.get('/announcements', controller.listAnnouncements);
academicAliasRoutes.patch(
  '/announcements/:id/read',
  validate({ params: idParamSchema }),
  controller.markAnnouncementRead,
);
academicAliasRoutes.get('/transcripts', controller.getTranscript);
academicAliasRoutes.get('/transcript-requests', controller.listTranscriptRequests);
academicAliasRoutes.post(
  '/transcript-requests',
  validate({ body: transcriptRequestSchema }),
  controller.createTranscriptRequest,
);
