import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireStudentProfile } from '../../middleware/auth.js';
import * as career from './careerService.js';
import { getAchievements } from './achievementService.js';

const idParam = z.object({ id: z.string().uuid('Expected a record id.') });
const itemSchema = z.object({
  kind: z.enum(['SKILL', 'PROJECT', 'EXPERIENCE', 'ACHIEVEMENT']),
  title: z.string().trim().min(2, 'Add a title.').max(160),
  subtitle: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  level: z.coerce.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  url: z.string().trim().url('Enter a full link, e.g. https://…').max(400).optional().or(z.literal('')),
  startDate: z.string().trim().max(20).optional().or(z.literal('')),
  endDate: z.string().trim().max(20).optional().or(z.literal('')),
});

/** Students only: career services, portfolio, groups and achievements. */
export const careerRoutes = Router();
careerRoutes.use(requireAuth, requireStudentProfile);

careerRoutes.get(
  '/opportunities',
  validate({ query: z.object({ type: z.string().max(20).optional(), search: z.string().max(120).optional(), workMode: z.string().max(20).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await career.listOpportunities(req.auth, req.validatedQuery))),
);
careerRoutes.put(
  '/opportunities/:id/status',
  validate({ params: idParam, body: z.object({ status: z.enum(['SAVED', 'APPLIED', 'NONE']) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await career.setOpportunityStatus(req.auth, req.params.id, req.body.status))),
);

careerRoutes.get('/portfolio', asyncHandler(async (req, res) => sendSuccess(res, await career.getPortfolio(req.auth))));
careerRoutes.post('/portfolio', validate({ body: itemSchema }), asyncHandler(async (req, res) => sendSuccess(res, await career.addPortfolioItem(req.auth, req.body), { status: 201 })));
careerRoutes.patch(
  '/portfolio/:id',
  validate({ params: idParam, body: itemSchema.partial() }),
  asyncHandler(async (req, res) => sendSuccess(res, await career.updatePortfolioItem(req.auth, req.params.id, req.body))),
);
careerRoutes.delete('/portfolio/:id', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await career.deletePortfolioItem(req.auth, req.params.id))));

careerRoutes.get('/groups', asyncHandler(async (req, res) => sendSuccess(res, await career.listGroups(req.auth))));
careerRoutes.post('/groups/:id/join', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await career.joinGroup(req.auth, req.params.id))));
careerRoutes.post('/groups/:id/leave', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await career.leaveGroup(req.auth, req.params.id))));
careerRoutes.post(
  '/groups/:id/members/:membershipId',
  validate({ params: z.object({ id: z.string().uuid(), membershipId: z.string().uuid() }), body: z.object({ approve: z.boolean() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await career.decideMembership(req.auth, req.params.id, req.params.membershipId, req.body.approve))),
);
careerRoutes.post(
  '/groups/:id/events',
  validate({
    params: idParam,
    body: z.object({
      title: z.string().trim().min(3).max(160),
      description: z.string().trim().max(1000).optional(),
      startsAt: z.string().trim().min(10),
      location: z.string().trim().max(160).optional(),
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await career.createGroupEvent(req.auth, req.params.id, req.body), { status: 201 })),
);

careerRoutes.get('/achievements', asyncHandler(async (req, res) => sendSuccess(res, await getAchievements(req.auth))));
