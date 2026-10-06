import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { getDashboard } from './dashboardService.js';
import { DASHBOARD_KEYS, getLayout, resetLayout, saveLayout } from './layoutService.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);

/** One endpoint, three personas. The caller's roles decide which shape comes back. */
dashboardRoutes.get(
  '/',
  asyncHandler(async (req, res) => sendSuccess(res, await getDashboard(req.auth))),
);

const keyParam = z.object({ key: z.enum(DASHBOARD_KEYS) });

/** Drag-and-drop widget order, persisted per user. */
dashboardRoutes.get('/layout/:key', validate({ params: keyParam }), asyncHandler(async (req, res) => sendSuccess(res, await getLayout(req.auth, req.params.key))));
dashboardRoutes.put(
  '/layout/:key',
  validate({ params: keyParam, body: z.object({ order: z.array(z.string().trim().min(1).max(80)).max(60) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await saveLayout(req.auth, req.params.key, req.body.order))),
);
dashboardRoutes.delete('/layout/:key', validate({ params: keyParam }), asyncHandler(async (req, res) => sendSuccess(res, await resetLayout(req.auth, req.params.key))));
