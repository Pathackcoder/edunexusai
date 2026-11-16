import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';
import { ErrorCode } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { isCollecting } from './config.js';
import { envelopeSchema, ingest } from './ingestService.js';
import { heartbeat } from './presenceService.js';
import { z } from 'zod';

/**
 * POST /api/v1/analytics/events — the browser tracker's batches. POST /api/v1/analytics/presence — its heartbeat.
 *
 * It is excluded from the request log and from the general API rate limit (app.js, middleware/rateLimit.js) and has
 * its own: a wide per-address ceiling before authentication (a whole campus may share one address) and a per-account
 * ceiling after it. A failure here is never the user's problem: the tracker retries quietly and gives up quietly.
 */
export const analyticsRoutes = Router();

const limited = { success: false, error: { code: ErrorCode.RATE_LIMITED, message: 'Too many analytics requests.' } };
const addressLimiter = rateLimit({ windowMs: 60_000, max: env.isTest ? 1_000_000 : 6000, standardHeaders: true, legacyHeaders: false, message: limited });
const accountLimiter = rateLimit({
  windowMs: 60_000,
  max: () => (env.isTest ? Number(process.env.ANALYTICS_TEST_ACCOUNT_LIMIT ?? 1_000_000) : 90),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `analytics:${req.auth?.userId ?? 'anonymous'}`,
  message: limited,
});

analyticsRoutes.post(
  '/events',
  addressLimiter,
  requireAuth,
  accountLimiter,
  // Collection off (master switch, the institution's switch, or an excluded account): nothing is read or stored,
  // and the tracker is told to stop.
  (req, res, next) => (isCollecting(req.auth) ? next() : sendSuccess(res, { enabled: false, accepted: 0, duplicates: 0, rejected: 0 })),
  validate({ body: envelopeSchema }),
  asyncHandler(async (req, res) => {
    const result = await ingest(req.auth, req.body);
    // Reason codes only: the rejected content itself is never logged.
    if (result.rejected) logger.warn('Analytics events rejected', { rejected: result.rejected });
    return sendSuccess(res, { enabled: true, ...result }, { status: 202 });
  }),
);

/**
 * The live-users heartbeat. The body is empty (strict): who is online comes from the access token alone. A person's
 * tabs coordinate so that, together, they send about two a minute; the ceiling below leaves room for a refresh or two.
 */
const presenceLimiter = rateLimit({
  windowMs: 60_000,
  max: () => (env.isTest ? Number(process.env.ANALYTICS_TEST_PRESENCE_LIMIT ?? 1_000_000) : 12),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `analytics-presence:${req.auth?.userId ?? 'anonymous'}`,
  message: limited,
});

analyticsRoutes.post(
  '/presence',
  addressLimiter,
  requireAuth,
  presenceLimiter,
  (req, res, next) => (isCollecting(req.auth) ? next() : sendSuccess(res, { enabled: false })),
  validate({ body: z.object({}).strict() }),
  asyncHandler(async (req, res) => {
    await heartbeat(req.auth);
    return sendSuccess(res, { enabled: true });
  }),
);
