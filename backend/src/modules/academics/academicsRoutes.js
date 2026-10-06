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
 * Student-scoped academic routes. Every handler resolves the student from `req.auth`,
 * so a student can only ever read their own record — there is no student id in any path.
 */
export const academicsRoutes = Router();

academicsRoutes.use(requireAuth);

// The calendar is institutional content; any authenticated persona may read it.
academicsRoutes.get('/calendar', validate({ query: calendarQuerySchema }), controller.listCalendar);

academicsRoutes.use(requireStudentProfile);

academicsRoutes.get('/courses', controller.listCourses);
academicsRoutes.get('/courses/:id', validate({ params: idParamSchema }), controller.getCourse);
academicsRoutes.get('/schedule', controller.getSchedule);

academicsRoutes.get('/assignments', controller.listAssignments);
academicsRoutes.post(
  '/assignments/:id/submit',
  validate({ params: idParamSchema, body: submitAssignmentSchema }),
  controller.submitAssignment,
);

academicsRoutes.get('/grades', controller.getGrades);

academicsRoutes.get('/announcements', controller.listAnnouncements);
academicsRoutes.patch(
  '/announcements/:id/read',
  validate({ params: idParamSchema }),
  controller.markAnnouncementRead,
);

academicsRoutes.get('/transcripts', controller.getTranscript);
academicsRoutes.get('/transcript-requests', controller.listTranscriptRequests);
academicsRoutes.post(
  '/transcript-requests',
  validate({ body: transcriptRequestSchema }),
  controller.createTranscriptRequest,
);

academicsRoutes.get('/lms', controller.listLms);
