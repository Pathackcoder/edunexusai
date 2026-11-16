import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticateAccessToken, requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';
import { notFound, unauthenticated } from '../../utils/errors.js';
import { VIEW_AS_HEADER } from './viewAsPolicy.js';
import * as service from './viewAsService.js';

const userIdParam = z.object({ userId: z.string().uuid('Expected an account id.') });

/**
 * /api/v1/admin/view-as — mounted inside adminRoutes (signed-in ADMIN of the institution), plus the named
 * permission users.view_as. These run in the administrator's own tab; a View-As tab cannot reach them (the HTTP gate
 * refuses /admin, and its subject never holds ADMIN), so a View-As session can never start another.
 */
export const adminViewAsRoutes = Router();
adminViewAsRoutes.use(requirePermission(service.VIEW_AS_PERMISSION));

const startLimiter = rateLimit({ windowMs: 60_000, max: env.isTest ? 10_000 : 20, standardHeaders: true, legacyHeaders: false });

adminViewAsRoutes.get(
  '/targets/:userId',
  validate({ params: userIdParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await service.getTargetEligibility(req.auth, req.params.userId))),
);

adminViewAsRoutes.get('/sessions', asyncHandler(async (req, res) => sendSuccess(res, await service.listMySessions(req.auth))));

adminViewAsRoutes.post(
  '/sessions',
  startLimiter,
  validate({
    body: z.object({
      userId: z.string().uuid('Expected an account id.'),
      persona: z.enum(['STUDENT', 'FACULTY']).optional(),
      reason: z.string().trim().min(5, 'Say briefly why you need to view this account (at least 5 characters).').max(500),
    }).strict(),
  }),
  asyncHandler(async (req, res) => {
    const result = await service.startViewAs(req.auth, req.body);
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, result, { status: 201 });
  }),
);

adminViewAsRoutes.post(
  '/sessions/:id/end',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await service.endById(req.auth, req.params.id))),
);

/**
 * /api/v1/view-as — called by the View-As tab itself, with the administrator's access token and the session header.
 */
export const viewAsRoutes = Router();

// The banner's session details. requireAuth has already validated the session (and refused an ended one).
viewAsRoutes.get(
  '/current',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.viewAs) throw notFound('This tab is not in a View-As session.');
    return sendSuccess(res, await service.currentSession(req.actor, req.get(VIEW_AS_HEADER)));
  }),
);

// End Impersonation. The one state-changing call a View-As tab may make (allowlisted by the HTTP gate). It does not
// go through requireAuth's View-As step, so ending a session that has just expired still answers with its state.
viewAsRoutes.delete(
  '/current',
  asyncHandler(async (req, res) => {
    const header = req.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) throw unauthenticated();
    const actor = await authenticateAccessToken(header.slice(7).trim());
    return sendSuccess(res, await service.endByToken(actor, req.get(VIEW_AS_HEADER)));
  }),
);
