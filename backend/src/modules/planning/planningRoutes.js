import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireStudentProfile } from '../../middleware/auth.js';
import { prisma } from '../../db/prisma.js';
import * as planning from './planningService.js';

/** Student academic planning: /planning/* */
export const planningRoutes = Router();
planningRoutes.use(requireAuth, requireStudentProfile);

const ctx = (req) => [req.auth.tenantId, req.auth.studentProfileId];

planningRoutes.get('/degree-progress', asyncHandler(async (req, res) => sendSuccess(res, await planning.getDegreeProgress(...ctx(req)))));
planningRoutes.get('/recommendations', asyncHandler(async (req, res) => sendSuccess(res, await planning.getRecommendations(...ctx(req)))));
planningRoutes.put(
  '/preferences',
  validate({
    body: z.object({
      interests: z.array(z.string().trim().min(1).max(60)).max(20),
      careerGoals: z.array(z.string().trim().min(1).max(80)).max(10),
    }),
  }),
  asyncHandler(async (req, res) => {
    await prisma.studentProfile.update({ where: { id: req.auth.studentProfileId }, data: req.body });
    return sendSuccess(res, await planning.getRecommendations(...ctx(req)));
  }),
);
planningRoutes.get('/learning-paths', asyncHandler(async (req, res) => sendSuccess(res, await planning.getLearningPaths(...ctx(req)))));
planningRoutes.post(
  '/learning-paths/:id/activate',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await planning.activateLearningPath(...ctx(req), req.params.id))),
);
planningRoutes.put(
  '/learning-steps/:id',
  validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await planning.setStepStatus(...ctx(req), req.params.id, req.body.status))),
);
planningRoutes.get('/insights', asyncHandler(async (req, res) => sendSuccess(res, await planning.getInsights(...ctx(req)))));
