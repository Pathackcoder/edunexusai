import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireAuth } from '../../middleware/auth.js';
import { getHelpContent } from './supportService.js';

export const supportRoutes = Router();
supportRoutes.use(requireAuth);

supportRoutes.get(
  '/',
  asyncHandler(async (req, res) => sendSuccess(res, await getHelpContent(req.auth.tenantId))),
);
