import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';
import { ErrorCode } from '../../utils/errors.js';
import { PAGE_KEYS } from '../../../../shared/analyticsCatalog.js';
import { ANALYTICS_VIEW, listAccess, setAccess, setCollection } from './accessService.js';
import { rejectionCounters } from './ingestService.js';
import { communicationReport, integrationsReport } from './operationalReports.js';
import {
  activityReport, dataHealthReport, devicesReport, featuresReport, navigationReport, overviewReport, pageDetailReport, pagesReport,
  reportContext, reportQuerySchema, widgetsReport,
} from './reportService.js';
import { aggregateTenant } from './rollupService.js';
import { prisma } from '../../db/prisma.js';

/**
 * /api/v1/admin/analytics — mounted inside adminRoutes, so every route here already requires a signed-in ADMIN of
 * the institution. Reports additionally require the named `analytics.view` permission. The institution is always
 * the administrator's own (req.auth.tenantId); no route accepts a tenant, and no route returns a person.
 */
export const adminAnalyticsRoutes = Router();

/* ----- Access: who holds analytics.view. Only an administrator who already holds it may see or change who
   else does (never for themselves), so administrators without access cannot hand it to each other. The first
   grant at an institution is made with scripts/analytics-access.mjs. ----- */
adminAnalyticsRoutes.use('/access', requirePermission(ANALYTICS_VIEW));
adminAnalyticsRoutes.get('/access', asyncHandler(async (req, res) => sendSuccess(res, await listAccess(req.auth.tenantId))));
adminAnalyticsRoutes.put(
  '/access/:userId',
  validate({ params: z.object({ userId: z.string().uuid() }), body: z.object({ granted: z.boolean() }).strict() }),
  asyncHandler(async (req, res) => sendSuccess(res, await setAccess(req.auth, req.params.userId, req.body.granted))),
);

/* ----- Reports ----- */
const reports = Router();
reports.use(requirePermission(ANALYTICS_VIEW));
const report = (build) => [
  validate({ query: reportQuerySchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await build(await reportContext(req.auth.tenantId, req.validatedQuery), req))),
];
reports.get('/overview', ...report(overviewReport));
reports.get('/activity', ...report(activityReport));
reports.get('/pages', ...report(pagesReport));
reports.get('/pages/:pageKey', validate({ params: z.object({ pageKey: z.enum(PAGE_KEYS) }) }), ...report((ctx, req) => pageDetailReport(ctx, req.params.pageKey)));
reports.get('/navigation', ...report(navigationReport));
reports.get('/features', ...report(featuresReport));
reports.get('/widgets', ...report(widgetsReport));
reports.get('/devices', ...report(devicesReport));
reports.get('/communication', ...report(communicationReport));
reports.get('/integrations', ...report(integrationsReport));
reports.get('/health', ...report((ctx) => dataHealthReport(ctx, { rejections: { ...rejectionCounters } })));

/* ----- Collection switch and on-demand aggregation ----- */
reports.put(
  '/settings',
  validate({ body: z.object({ enabled: z.boolean(), noticeConfirmed: z.boolean().optional() }).strict() }),
  asyncHandler(async (req, res) => sendSuccess(res, await setCollection(req.auth, req.body))),
);
const refreshLimiter = rateLimit({
  windowMs: 60_000, max: env.isTest ? 10_000 : 4, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `analytics-refresh:${req.auth?.tenantId ?? 'none'}`,
  message: { success: false, error: { code: ErrorCode.RATE_LIMITED, message: 'The figures were refreshed a moment ago. Try again in a minute.' } },
});
reports.post('/refresh', refreshLimiter, asyncHandler(async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.auth.tenantId }, select: { id: true, timezone: true, analyticsStartedAt: true } });
  if (!tenant.analyticsStartedAt) return sendSuccess(res, { days: [] });
  return sendSuccess(res, { days: await aggregateTenant({ tenantId: tenant.id, timezone: tenant.timezone, analyticsStartedAt: tenant.analyticsStartedAt }) });
}));

adminAnalyticsRoutes.use(reports);
