import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import * as chat from './chatService.js';
import { publishMessage, publishRead } from './chatSocket.js';

/**
 * Portal messaging over REST: the inbox, history and opening a conversation. Sending and read receipts
 * normally go over the socket (chatSocket.js); the same operations here use the same service and also
 * announce in real time, so a client without a live connection still works.
 */
export const chatRoutes = Router();
chatRoutes.use(requireAuth);

const id = z.object({ id: z.string().uuid() });
const announce = (promise) => promise.catch((error) => logger.warn('[chat] realtime announcement failed', { code: error?.code }));

chatRoutes.get('/conversations', asyncHandler(async (req, res) => sendSuccess(res, await chat.listConversations(req.auth))));
chatRoutes.get('/unread', asyncHandler(async (req, res) => sendSuccess(res, await chat.unreadSummary(req.auth))));

chatRoutes.post(
  '/conversations',
  validate({ body: z.object({ profileId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await chat.openDirectConversation(req.auth, req.body))),
);

chatRoutes.get(
  '/conversations/:id',
  validate({ params: id }),
  asyncHandler(async (req, res) => sendSuccess(res, await chat.getConversation(req.auth, req.params.id))),
);

chatRoutes.get(
  '/conversations/:id/messages',
  validate({ params: id, query: z.object({ before: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await chat.getMessages(req.auth, req.params.id, req.validatedQuery))),
);

chatRoutes.post(
  '/conversations/:id/messages',
  validate({ params: id, body: z.object({ body: z.string().max(chat.MAX_MESSAGE_LENGTH * 2), clientId: z.string().max(64).optional() }) }),
  asyncHandler(async (req, res) => {
    const result = await chat.sendMessage(req.auth, req.params.id, req.body);
    if (!result.duplicate) await announce(publishMessage(req.auth, result));
    return sendSuccess(res, result.message, { status: result.duplicate ? 200 : 201 });
  }),
);

chatRoutes.post(
  '/conversations/:id/read',
  validate({ params: id }),
  asyncHandler(async (req, res) => {
    const result = await chat.markRead(req.auth, req.params.id);
    if (result.changed) await announce(publishRead(req.auth, req.params.id, result));
    return sendSuccess(res, { lastReadAt: result.lastReadAt });
  }),
);
