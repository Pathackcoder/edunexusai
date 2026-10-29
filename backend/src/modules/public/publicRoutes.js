import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../db/prisma.js';
import * as cms from '../cms/cmsService.js';
import { publicCalendar } from '../sis/sisService.js';
import { enabledProviders } from '../identity/providerService.js';

/**
 * The public experience (/api/v1/public/:tenant/*) for prospective students, families and visitors.
 * No sign-in and no role: there is no GUEST account. It returns only
 *   - CMS documents published with the "public" audience (never another audience's, never drafts),
 *   - the institution's public academic dates (events, term dates, holidays, exam weeks),
 *   - the institution's name and its sign-in options (the same list the login page shows).
 * Nothing here reads a person, a record, a course roster, Moodle or any private CampusCore data.
 * Each part fails on its own and degrades to empty, so the landing page always renders.
 */
export const publicRoutes = Router();

publicRoutes.use(rateLimit({ windowMs: 60_000, max: process.env.NODE_ENV === 'test' ? 1000 : 120, standardHeaders: true, legacyHeaders: false }));
publicRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60');
  next();
});

const tenantParam = z.object({ tenant: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/) });

async function activeTenant(slug) {
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { slug: true, name: true, shortName: true, isActive: true } });
  if (!tenant?.isActive) throw notFound('Institution not found.');
  return tenant;
}

const part = async (name, fn, fallback) => {
  try {
    return await fn();
  } catch (error) {
    logger.warn('Public content part unavailable', { part: name, code: error.code ?? error.name });
    return fallback;
  }
};

publicRoutes.get(
  '/:tenant/home',
  validate({ params: tenantParam }),
  asyncHandler(async (req, res) => {
    const tenant = await activeTenant(req.params.tenant);
    const today = new Date().toISOString().slice(0, 10);
    const [announcements, pages, faqs, calendar, signIn] = await Promise.all([
      part('announcements', () => cms.publicAnnouncements(tenant.slug), []),
      part('pages', () => cms.publicPages(tenant.slug), []),
      part('faqs', () => cms.publicFaqs(tenant.slug, { limit: 8 }), []),
      part('calendar', async () => (await publicCalendar(tenant.slug, { from: today })).slice(0, 8), []),
      part('signIn', () => enabledProviders(tenant.slug), []),
    ]);
    return sendSuccess(res, { institution: { slug: tenant.slug, name: tenant.name, shortName: tenant.shortName }, announcements, pages, faqs, calendar, signIn });
  }),
);

publicRoutes.get(
  '/:tenant/pages/:slug',
  validate({ params: tenantParam.extend({ slug: z.string().trim().max(80) }) }),
  asyncHandler(async (req, res) => {
    const tenant = await activeTenant(req.params.tenant);
    return sendSuccess(res, await cms.publicPage(tenant.slug, req.params.slug));
  }),
);
