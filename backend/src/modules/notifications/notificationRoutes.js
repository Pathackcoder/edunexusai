import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import * as service from './notificationService.js';

const querySchema = z.object({
  unreadOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export const notificationRoutes = Router();
notificationRoutes.use(requireAuth);

notificationRoutes.get(
  '/',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const { notifications, unreadCount } = await service.listNotifications(
      req.auth.tenantId,
      req.auth.userId,
      req.validatedQuery,
    );
    return sendSuccess(res, notifications, { count: notifications.length, unreadCount });
  }),
);

notificationRoutes.patch(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.markRead(req.auth.tenantId, req.auth.userId, req.params.id)),
  ),
);

notificationRoutes.patch(
  '/read-all',
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.markAllRead(req.auth.tenantId, req.auth.userId)),
  ),
);
