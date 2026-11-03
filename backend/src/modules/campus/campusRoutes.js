import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireStudentProfile } from '../../middleware/auth.js';
import * as service from './campusService.js';
import { getCampusMap, getClassroomAvailability } from './campusMapService.js';
import { searchCampusDirectory } from './campusDirectoryService.js';
import { directoryRateLimiter } from '../../middleware/rateLimit.js';

const directoryQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: z.enum(['all', 'student', 'faculty', 'staff']).optional(),
  department: z.string().trim().max(160).optional(),
});

export const directoryRoutes = Router();
directoryRoutes.use(requireAuth);
directoryRoutes.get(
  '/',
  validate({ query: directoryQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await service.listDirectory(req.auth.tenantId, req.validatedQuery, req.auth.userId);
    return sendSuccess(res, result, { count: result.people.length });
  }),
);

export const libraryRoutes = Router();
libraryRoutes.use(requireAuth, requireStudentProfile);
libraryRoutes.get(
  '/',
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.getLibrary(req.auth.tenantId, req.auth.studentProfileId)),
  ),
);
libraryRoutes.post(
  '/loans/:id/renew',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await service.renewLoan(req.auth.tenantId, req.auth.studentProfileId, req.params.id),
    ),
  ),
);

export const campusSafetyRoutes = Router();
campusSafetyRoutes.use(requireAuth);
campusSafetyRoutes.get(
  '/',
  asyncHandler(async (req, res) => sendSuccess(res, await service.getCampusSafety(req.auth.tenantId))),
);

/* Campus map + classroom availability: every persona. */
export const campusMapRoutes = Router();
campusMapRoutes.use(requireAuth);
campusMapRoutes.get('/map', asyncHandler(async (req, res) => sendSuccess(res, await getCampusMap(req.auth))));
campusMapRoutes.get(
  '/classrooms',
  validate({
    query: z.object({
      day: z.string().trim().max(12).optional(),
      time: z.string().trim().regex(/^\d{1,2}:\d{2}$/, 'Use HH:MM.').optional(),
      building: z.string().trim().max(20).optional(),
      minCapacity: z.coerce.number().int().min(0).max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await getClassroomAvailability(req.auth, req.validatedQuery))),
);

/* Campus Directory: people in the institution's identity provider (Keycloak), read-only, paged. */
export const campusDirectoryRoutes = Router();
campusDirectoryRoutes.use(requireAuth, directoryRateLimiter);
campusDirectoryRoutes.get(
  '/',
  validate({
    query: z.object({
      search: z.string().max(120).optional(),
      page: z.coerce.number().int().min(1).max(500).optional().default(1),
      pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await searchCampusDirectory(req.auth, req.validatedQuery);
    return sendSuccess(res, result, { count: result.people.length });
  }),
);
