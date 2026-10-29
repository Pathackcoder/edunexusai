import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { PERSONAS } from '../../../../shared/cmsBlocks.js';
import rateLimit from 'express-rate-limit';
import { cmsMedia } from './cmsClient.js';
import { FORM_LIMITS } from '../../../../shared/forms.js';
import * as cms from './cmsService.js';

/**
 * Studio (/api/v1/studio/*): ADMIN only. Every call is also tenant-scoped by the session.
 * Content (/api/v1/content/*): any signed-in user; published content for their audiences.
 * Media (/api/v1/content/media/*): public image bytes (as Strapi's own /uploads are), so
 * <img> tags work without a bearer token; only image files with safe names are served.
 */
const docId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const type = z.enum(cms.TYPES);
const persona = z.enum(PERSONAS);

export const studioRoutes = Router();
studioRoutes.use(requireAuth, requireRole('ADMIN'));

studioRoutes.get('/meta', asyncHandler(async (req, res) => sendSuccess(res, await cms.status(req.auth))));
studioRoutes.get('/audit', asyncHandler(async (req, res) => sendSuccess(res, await cms.auditLog(req.auth))));

studioRoutes.get('/media', asyncHandler(async (req, res) => sendSuccess(res, await cms.listMedia(req.auth))));
studioRoutes.post(
  '/media',
  validate({ body: z.object({ fileName: z.string().trim().min(1).max(200), mime: z.string().max(40), dataBase64: z.string().min(1).max(Math.ceil((cms.MAX_IMAGE_BYTES * 4) / 3) + 8), alternativeText: z.string().max(200).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await cms.uploadMedia(req.auth, req.body), { status: 201 })),
);

studioRoutes.get('/dashboards/:persona', validate({ params: z.object({ persona }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.getDashboard(req.auth, req.params.persona))));
studioRoutes.put('/dashboards/:persona', validate({ params: z.object({ persona }), body: z.object({ layout: z.unknown() }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.saveDashboard(req.auth, req.params.persona, req.body.layout))));
studioRoutes.delete('/dashboards/:persona', validate({ params: z.object({ persona }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.removeDashboard(req.auth, req.params.persona))));
studioRoutes.post(
  '/dashboards/:persona/:action',
  validate({ params: z.object({ persona, action: z.enum(['publish', 'unpublish', 'discard']) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await cms.dashboardTransition(req.auth, req.params.persona, req.params.action))),
);

// Scheduled publish / unpublish (pages, news, help articles); the CMS executes the jobs.
const schedulable = z.enum(cms.SCHEDULABLE);
studioRoutes.get('/:type/:id/schedule', validate({ params: z.object({ type: schedulable, id: docId }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.getSchedule(req.auth, req.params.type, req.params.id))));
studioRoutes.put('/:type/:id/schedule', validate({ params: z.object({ type: schedulable, id: docId }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.setSchedule(req.auth, req.params.type, req.params.id, req.body))));
// Forms: validate sample values against the draft definition; never sends mail.
studioRoutes.post('/form/:id/test-submission', validate({ params: z.object({ id: docId }), body: z.object({ values: z.record(z.unknown()) }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.testFormSubmission(req.auth, req.params.id, req.body.values))));

studioRoutes.get('/:type', validate({ params: z.object({ type }), query: z.object({ status: z.enum(['draft', 'scheduled', 'published', 'modified']).optional(), q: z.string().max(100).optional() }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.list(req.auth, req.params.type, req.validatedQuery))));
studioRoutes.post('/:type', validate({ params: z.object({ type }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.create(req.auth, req.params.type, req.body), { status: 201 })));
studioRoutes.get('/:type/:id', validate({ params: z.object({ type, id: docId }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.get(req.auth, req.params.type, req.params.id))));
studioRoutes.put('/:type/:id', validate({ params: z.object({ type, id: docId }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.update(req.auth, req.params.type, req.params.id, req.body))));
studioRoutes.delete('/:type/:id', validate({ params: z.object({ type, id: docId }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.remove(req.auth, req.params.type, req.params.id))));
studioRoutes.post(
  '/:type/:id/:action',
  validate({ params: z.object({ type, id: docId, action: z.enum(['publish', 'unpublish', 'discard']) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await cms.transition(req.auth, req.params.type, req.params.id, req.params.action))),
);

export const contentRoutes = Router();

contentRoutes.get(
  '/media/:file',
  validate({ params: z.object({ file: z.string().regex(/^[A-Za-z0-9._-]{1,200}$/) }) }),
  asyncHandler(async (req, res) => {
    const upstream = await cmsMedia(req.params.file);
    const contentType = upstream?.headers.get('content-type') ?? '';
    if (!upstream || !/^image\/(png|jpeg|webp|gif)$/.test(contentType.split(';')[0])) return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Image not found.' } });
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  }),
);

contentRoutes.use(requireAuth);

// Form submissions: per user, a short burst limit and an hourly cap (plus the global API limiter).
const keyByUser = (req) => `${req.auth?.tenantId}:${req.auth?.userId}`;
const submissionLimits = [
  rateLimit({ windowMs: 60_000, max: process.env.NODE_ENV === 'test' ? 1000 : 10, keyGenerator: keyByUser, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many submissions. Please wait a minute and try again.' } } }),
  rateLimit({ windowMs: 3_600_000, max: process.env.NODE_ENV === 'test' ? 1000 : 30, keyGenerator: keyByUser, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many submissions this hour. Please try again later.' } } }),
];
const submissionSize = (req, res, next) => (Number(req.headers['content-length'] ?? 0) > FORM_LIMITS.maxSubmissionBytes ? res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'The submission is too large.' } }) : next());
contentRoutes.get('/forms/:id', validate({ params: z.object({ id: docId }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.publishedForm(req.auth, req.params.id))));
contentRoutes.post(
  '/forms/:id/submissions',
  submissionSize,
  ...submissionLimits,
  validate({ params: z.object({ id: docId }), body: z.object({ values: z.record(z.unknown()), website: z.string().max(200).optional() }).strict() }),
  asyncHandler(async (req, res) => sendSuccess(res, await cms.submitForm(req.auth, req.params.id, req.body))),
);
// `audience` narrows to ONE of the caller's own audiences (a context's view shows its own content only).
const audienceQuery = z.enum(['students', 'faculty', 'staff', 'alumni']).optional();
contentRoutes.get('/pages', validate({ query: z.object({ audience: audienceQuery }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.navPages(req.auth, req.validatedQuery))));
contentRoutes.get('/pages/:slug', validate({ params: z.object({ slug: z.string().max(80) }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.publishedPage(req.auth, req.params.slug))));
contentRoutes.get('/dashboard-layouts/:persona', validate({ params: z.object({ persona }) }), asyncHandler(async (req, res) => sendSuccess(res, await cms.publishedDashboard(req.auth, req.params.persona))));
contentRoutes.get(
  '/announcements',
  validate({ query: z.object({ category: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(50).default(10), audience: audienceQuery }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await cms.publishedAnnouncements(req.auth, req.validatedQuery))),
);
contentRoutes.get(
  '/faqs',
  validate({ query: z.object({ category: z.string().max(60).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await cms.publishedFaqs(req.auth, req.validatedQuery))),
);
