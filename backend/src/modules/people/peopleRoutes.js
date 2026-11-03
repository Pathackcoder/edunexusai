import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { passwordPolicy } from '../auth/authSchemas.js';
import { MOODLE_CREDENTIALS } from '../lms/moodleService.js';
import * as people from './peopleService.js';

/**
 * Person onboarding (mounted under /admin, so ADMIN only). CampusCore and Moodle re-check
 * their own scopes, policies and capabilities on every write.
 */
export const peopleRoutes = Router();

const sisId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);
const role = z.enum(['STUDENT', 'FACULTY', 'ADMIN']);

peopleRoutes.post(
  '/lookup',
  validate({
    body: z
      .object({ role, email: z.string().trim().email().max(200).optional(), institutionalId: z.string().trim().max(40).optional(), sisRecordId: sisId.optional() })
      .refine((b) => b.email || b.institutionalId || b.sisRecordId, 'Give an email, an institutional ID or a CampusCore record.'),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await people.lookupPerson(req.auth, req.body))),
);

const sisRecord = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(120),
  programId: sisId,
  admitTermId: sisId.optional(),
  status: z.enum(['ADMITTED', 'ACTIVE']).default('ADMITTED'),
  expectedGraduation: z.string().trim().regex(/^(Spring|Summer|Fall|Winter) \d{4}$/).optional(),
});

peopleRoutes.post(
  '/',
  validate({
    body: z.object({
      role,
      sis: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('EXISTING'), sisRecordId: sisId }),
        z.object({ mode: z.literal('CREATE'), idempotencyKey: z.string().uuid('A fresh idempotency key (UUID) is required for each new-student form.'), record: sisRecord }),
      ]).optional(),
      login: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('NEW'), password: passwordPolicy }),
        z.object({ mode: z.literal('LINK_EXISTING'), userId: z.string().uuid(), verificationNote: z.string().trim().min(5).max(300).optional() }),
      ]).optional(),
      account: z.object({ email: z.string().trim().toLowerCase().email().max(200), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), password: passwordPolicy }).optional(),
      tierKey: z.string().trim().max(40).optional(),
      moodle: z.object({ enabled: z.boolean().default(false), fromSis: z.boolean().default(true), courseIds: z.array(z.coerce.number().int().positive()).max(20).default([]), credentials: z.enum(MOODLE_CREDENTIALS).default('EMAIL') }).optional(),
    }).superRefine((b, ctx) => {
      if (b.role === 'ADMIN' && !b.account) ctx.addIssue({ code: 'custom', path: ['account'], message: 'Name, email and a temporary password are required.' });
      if (b.role !== 'ADMIN' && !b.sis) ctx.addIssue({ code: 'custom', path: ['sis'], message: 'Choose the CampusCore record.' });
      if (b.role !== 'ADMIN' && !b.login) ctx.addIssue({ code: 'custom', path: ['login'], message: 'Choose a new login (with a temporary password) or link an existing one.' });
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await people.onboardPerson(req.auth, req.body);
    // A one-time Moodle password may be in this response: never cache it anywhere.
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, result, { status: result.user ? 201 : 200 });
  }),
);

peopleRoutes.get(
  '/:userId/systems',
  validate({ params: z.object({ userId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await people.personSystems(req.auth, req.params.userId))),
);
