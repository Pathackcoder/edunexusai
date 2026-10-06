import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireAuth, requireStudentProfile } from '../../middleware/auth.js';
import { getFinancialAid } from './financialAidService.js';

export const financialAidRoutes = Router();
financialAidRoutes.use(requireAuth, requireStudentProfile);

financialAidRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const aid = await getFinancialAid(req.auth.tenantId, req.auth.studentProfileId, {
      userId: req.auth.userId,
    });
    return sendSuccess(res, aid, { source: aid.meta?.source });
  }),
);
