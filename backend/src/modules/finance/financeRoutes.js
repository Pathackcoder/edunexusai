import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireStudentProfile } from '../../middleware/auth.js';
import * as service from './financeService.js';

const paymentSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: 'Amount must be a number.' })
    .positive('Amount must be greater than zero.')
    .max(1_000_000, 'Amount exceeds the maximum allowed for a single payment.'),
  methodType: z.string().trim().max(60).optional(),
  methodDisplay: z.string().trim().max(120).optional(),
});

export const financeRoutes = Router();
financeRoutes.use(requireAuth, requireStudentProfile);

const ctx = (req) => [req.auth.tenantId, req.auth.studentProfileId];

financeRoutes.get(
  '/',
  asyncHandler(async (req, res) => sendSuccess(res, await service.getFinance(...ctx(req)))),
);

financeRoutes.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const payments = await service.listPayments(...ctx(req));
    return sendSuccess(res, payments, { count: payments.length });
  }),
);

financeRoutes.post(
  '/payments',
  validate({ body: paymentSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.createPayment(...ctx(req), req.body), { status: 201 }),
  ),
);

/** Demo-only: restores the seeded balance so the payment flow can be shown repeatedly. */
financeRoutes.post(
  '/reset',
  asyncHandler(async (req, res) => sendSuccess(res, await service.resetFinance(...ctx(req)))),
);
