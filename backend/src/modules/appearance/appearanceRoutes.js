import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, verifyAccessToken } from '../../middleware/auth.js';
import { FONT_KEYS, THEME_KEYS } from '../../../../shared/appearancePresets.js';
import { getAppearance, updateAppearance } from './appearanceService.js';

const appearanceSchema = z.object({
  themeKey: z.enum(THEME_KEYS),
  fontKey: z.enum(FONT_KEYS),
});

export const appearanceRoutes = Router();

/**
 * GET /appearance — public, so the sign-in page can wear the institution's theme. A valid
 * session resolves the caller's own tenant; otherwise the single-tenant fallback. Only
 * preset keys are returned.
 */
appearanceRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    let tenantId = null;
    const header = req.headers.authorization ?? '';
    if (header.startsWith('Bearer ')) {
      try {
        tenantId = verifyAccessToken(header.slice(7).trim()).tenantId ?? null;
      } catch {
        tenantId = null; // an expired token still gets the default institution's look
      }
    }
    sendSuccess(res, await getAppearance(tenantId));
  }),
);

/** PUT /appearance — administrators of the institution only. */
appearanceRoutes.put(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  validate({ body: appearanceSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await updateAppearance(req.auth.tenantId, req.body, req.auth.userId))),
);
