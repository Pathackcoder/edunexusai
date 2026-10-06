import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import * as service from './profileService.js';
import { buildCurrentUser } from '../users/sessionService.js';

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  preferredName: z.string().trim().max(80).optional(),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\d\s()+\-.]*$/, 'Phone number contains unsupported characters.')
    .optional(),
  pronouns: z.string().trim().max(40).optional(),
  pronounsVisibility: z.string().trim().max(80).optional(),
  directoryVisible: z.boolean().optional(),
  locale: z.enum(['en', 'es', 'fr', 'hi']).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  careerGoals: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().min(1, 'Contact name is required.').max(120),
      relationship: z.string().trim().max(60).optional(),
      phone: z.string().trim().max(40).optional(),
      altPhone: z.string().trim().max(40).optional(),
      email: z.string().trim().email('Enter a valid email.').max(160).optional().or(z.literal('')),
    })
    .optional(),
});

const attachmentSchema = z
  .array(z.object({ fileName: z.string().trim().min(1).max(200), mimeType: z.string().trim().max(120), dataBase64: z.string().min(4) }))
  .max(3)
  .optional();

const addressChangeSchema = z.object({
  addressLine1: z.string().trim().min(3, 'Street address is required.').max(200),
  city: z.string().trim().min(1, 'City is required.').max(100),
  state: z.string().trim().min(2, 'State is required.').max(40),
  postalCode: z.string().trim().min(3, 'Postal code is required.').max(20),
  reason: z.string().trim().max(500).optional(),
  documentRef: z.string().trim().max(200).optional(),
  effectiveDate: z.string().trim().max(40).optional(),
  attachments: attachmentSchema,
});

const nameChangeSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  reason: z.string().trim().min(3, 'A reason is required for a legal name change.').max(500),
  documentRef: z.string().trim().max(200).optional(),
  attachments: attachmentSchema,
});

const preferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        categoryKey: z.string().trim().min(1).max(60),
        email: z.boolean().optional(),
        sms: z.boolean().optional(),
        push: z.boolean().optional(),
      }),
    )
    .min(1, 'Provide at least one preference to update.'),
});

export const profileRoutes = Router();
profileRoutes.use(requireAuth);

const ctx = (req) => [req.auth.tenantId, req.auth.userId];

profileRoutes.get(
  '/',
  asyncHandler(async (req, res) =>
    sendSuccess(res, { user: await buildCurrentUser({ userId: req.auth.userId }) }),
  ),
);

profileRoutes.patch(
  '/',
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, { user: await service.updateProfile(...ctx(req), req.body) }),
  ),
);

profileRoutes.get(
  '/requests',
  asyncHandler(async (req, res) => sendSuccess(res, await service.listChangeRequests(...ctx(req)))),
);

profileRoutes.post(
  '/address-change',
  validate({ body: addressChangeSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.createAddressChangeRequest(...ctx(req), req.body), { status: 201 }),
  ),
);

profileRoutes.post(
  '/name-change',
  validate({ body: nameChangeSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.createNameChangeRequest(...ctx(req), req.body), { status: 201 }),
  ),
);

profileRoutes.get(
  '/communication-preferences',
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.listCommunicationPreferences(...ctx(req))),
  ),
);

profileRoutes.patch(
  '/communication-preferences',
  validate({ body: preferencesSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await service.updateCommunicationPreferences(...ctx(req), req.body.preferences),
    ),
  ),
);
