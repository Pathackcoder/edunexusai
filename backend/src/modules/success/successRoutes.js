import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as interventions from './interventionService.js';
import * as advising from './advisingService.js';

const idParam = z.object({ id: z.string().uuid('Expected a record id.') });

const interventionSchema = z.object({
  type: z.enum(Object.keys(interventions.INTERVENTION_TYPES)),
  title: z.string().trim().min(3, 'Describe the follow-up.').max(200),
  note: z.string().trim().max(2000).optional(),
  studentProfileId: z.string().uuid().optional().or(z.literal('')).transform((value) => value || undefined),
  subjectLabel: z.string().trim().max(120).optional(),
  courseId: z.string().uuid().optional().or(z.literal('')).transform((value) => value || undefined),
  dueDate: z.string().trim().max(20).optional().or(z.literal('')),
  notifyStudent: z.boolean().default(false),
  referralTo: z.string().trim().max(120).optional(),
});
const interventionUpdateSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  note: z.string().trim().max(2000).optional(),
});

/* Faculty + admin: /interventions */
export const interventionRoutes = Router();
interventionRoutes.use(requireAuth, requireRole('FACULTY', 'ADMIN'));
interventionRoutes.get(
  '/',
  validate({ query: z.object({ status: z.string().max(20).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await interventions.listInterventions(req.auth, req.validatedQuery))),
);
interventionRoutes.get('/students', asyncHandler(async (req, res) => sendSuccess(res, await interventions.listFlaggableStudents(req.auth))));
interventionRoutes.post(
  '/',
  validate({ body: interventionSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await interventions.createIntervention(req.auth, req.body), { status: 201 })),
);
interventionRoutes.patch(
  '/:id',
  validate({ params: idParam, body: interventionUpdateSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await interventions.updateIntervention(req.auth, req.params.id, req.body))),
);

/* Admin alias so the Operations Workspace reads everything from /admin/* */
export const adminInterventionRoutes = Router();
adminInterventionRoutes.get(
  '/interventions',
  validate({ query: z.object({ status: z.string().max(20).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await interventions.listInterventions(req.auth, req.validatedQuery))),
);

/* Advising: students book, faculty publish availability */
export const advisingRoutes = Router();
advisingRoutes.use(requireAuth);
advisingRoutes.get('/advisors', asyncHandler(async (req, res) => sendSuccess(res, await advising.listAdvisors(req.auth))));
advisingRoutes.get(
  '/slots',
  validate({ query: z.object({ advisorId: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await advising.listOpenSlots(req.auth, req.validatedQuery))),
);
advisingRoutes.get('/appointments', asyncHandler(async (req, res) => sendSuccess(res, await advising.listMyAppointments(req.auth))));
advisingRoutes.post(
  '/appointments',
  requireRole('STUDENT'),
  validate({ body: z.object({ slotId: z.string().uuid(), topic: z.string().trim().min(3, 'Add a topic.').max(200), notes: z.string().trim().max(2000).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await advising.bookAppointment(req.auth, req.body), { status: 201 })),
);
advisingRoutes.post(
  '/appointments/:id/reschedule',
  validate({ params: idParam, body: z.object({ slotId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await advising.rescheduleAppointment(req.auth, req.params.id, req.body))),
);
advisingRoutes.patch(
  '/appointments/:id/status',
  validate({ params: idParam, body: z.object({ status: z.enum(['CANCELLED', 'COMPLETED']) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await advising.setAppointmentStatus(req.auth, req.params.id, req.body.status))),
);
advisingRoutes.get('/my-slots', requireRole('FACULTY'), asyncHandler(async (req, res) => sendSuccess(res, await advising.listMySlots(req.auth))));
advisingRoutes.post(
  '/slots',
  requireRole('FACULTY'),
  validate({
    body: z.object({
      startsAt: z.string().trim().min(10),
      durationMinutes: z.coerce.number().int().min(15).max(120).default(30),
      count: z.coerce.number().int().min(1).max(12).default(1),
      mode: z.enum(['VIRTUAL', 'IN_PERSON']).default('VIRTUAL'),
      location: z.string().trim().max(120).optional(),
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await advising.createSlots(req.auth, req.body), { status: 201 })),
);
advisingRoutes.delete(
  '/slots/:id',
  requireRole('FACULTY'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await advising.deleteSlot(req.auth, req.params.id))),
);
