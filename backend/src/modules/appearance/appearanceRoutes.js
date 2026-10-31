import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, verifyAccessToken } from '../../middleware/auth.js';
import { FONT_KEYS, THEME_KEYS } from '../../../../shared/appearancePresets.js';
import { getAppearance, logoFile, resetLogo, updateAppearance, updateLogo } from './appearanceService.js';
import { LOGO_LIMITS } from '../../../../shared/brandAssets.js';

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

/* ------------------------------------------------------------------ logo */

/**
 * GET /appearance/logo/:tenant — public image bytes (the sign-in page shows the logo before any
 * session). Each version has its own address (?v=); a versioned request is cached for good, anything
 * else is revalidated. Served with its stored type, never sniffed, no active content.
 */
appearanceRoutes.get(
  '/logo/:tenant',
  validate({ params: z.object({ tenant: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/) }) }),
  asyncHandler(async (req, res) => {
    const logo = await logoFile(req.params.tenant);
    if (!logo) return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'No custom logo.' } });
    const versioned = req.query.v && logo.sha256.startsWith(String(req.query.v));
    res.set({
      'Content-Type': logo.mimeType,
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
      ETag: `"${logo.sha256}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-site',
    });
    if (req.get('if-none-match') === `"${logo.sha256}"`) return res.status(304).end();
    res.set('Content-Length', String(logo.bytes.length));
    return res.end(logo.bytes);
  }),
);

/** PUT /appearance/logo { dataBase64 } — administrators of the institution only (their own tenant). */
appearanceRoutes.put(
  '/logo',
  requireAuth,
  requireRole('ADMIN'),
  validate({ body: z.object({ dataBase64: z.string().min(1).max(Math.ceil((LOGO_LIMITS.maxBytes * 4) / 3) + 8) }).strict() }),
  asyncHandler(async (req, res) => sendSuccess(res, await updateLogo(req.auth.tenantId, req.body, req.auth.userId))),
);

/** DELETE /appearance/logo — back to the logo bundled with the deployment. */
appearanceRoutes.delete(
  '/logo',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => sendSuccess(res, await resetLogo(req.auth.tenantId, req.auth.userId))),
);
