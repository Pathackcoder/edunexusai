import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { ErrorCode } from '../../utils/errors.js';
import { nexoraConfig } from './config.js';
import { primaryPersona, suggestionsFor } from './prompt.js';
import { decideAction } from './actionService.js';
import * as conversations from './conversationService.js';
import { streamTurn } from './orchestrator.js';
import { toolsFor } from './tools/index.js';

/**
 * /api/v1/nexora — the AI workspace. Every route needs a signed-in session; identity, roles and institution come
 * from it alone (no route accepts a user, role or tenant id). Conversations and actions are the caller's own.
 */
export const nexoraRoutes = Router();
nexoraRoutes.use(requireAuth);

const id = z.object({ id: z.string().uuid() });

// Each turn costs a model call: a per-account ceiling on top of the global API limit.
const turnLimiter = rateLimit({
  windowMs: 60_000,
  max: () => (env.isTest ? 10_000 : nexoraConfig().turnsPerMinute),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `nexora:${req.auth?.userId ?? 'anonymous'}`,
  message: { success: false, error: { code: ErrorCode.RATE_LIMITED, message: 'You are sending messages to Nexora very quickly. Please wait a moment.' } },
});

nexoraRoutes.get(
  '/session',
  asyncHandler(async (req, res) => {
    const config = nexoraConfig();
    const tools = toolsFor(req.auth);
    const isAdmin = req.auth.roles.includes('ADMIN');
    return sendSuccess(res, {
      available: config.enabled,
      // Configuration detail only for administrators; everyone else gets a plain sentence.
      unavailableReason: config.enabled ? null : isAdmin ? (config.switchedOff ? 'NEXORA_ENABLED is off.' : config.problems.join(' ')) : 'Nexora is not available right now.',
      persona: primaryPersona(req.auth.roles),
      firstName: req.auth.firstName,
      institution: req.auth.tenantName,
      suggestions: suggestionsFor(req.auth),
      capabilities: tools.map((t) => ({ name: t.name, label: t.label, kind: t.kind })),
    });
  }),
);

nexoraRoutes.get('/conversations', asyncHandler(async (req, res) => sendSuccess(res, await conversations.listConversations(req.auth))));
nexoraRoutes.post('/conversations', asyncHandler(async (req, res) => sendSuccess(res, await conversations.createConversation(req.auth), { status: 201 })));
nexoraRoutes.get('/conversations/:id', validate({ params: id }), asyncHandler(async (req, res) => sendSuccess(res, await conversations.getConversation(req.auth, req.params.id))));
nexoraRoutes.patch(
  '/conversations/:id',
  validate({ params: id, body: z.object({ title: z.string().trim().min(1).max(80) }).strict() }),
  asyncHandler(async (req, res) => sendSuccess(res, await conversations.renameConversation(req.auth, req.params.id, req.body.title))),
);
nexoraRoutes.delete('/conversations/:id', validate({ params: id }), asyncHandler(async (req, res) => sendSuccess(res, await conversations.deleteConversation(req.auth, req.params.id))));

/** Send a message; the answer streams back as server-sent events (see orchestrator.streamTurn). */
nexoraRoutes.post(
  '/conversations/:id/messages',
  turnLimiter,
  validate({
    params: id,
    body: z
      .object({
        message: z.string().trim().min(1, 'Type a message.').max(4000),
        // A choice the person made on a card (e.g. an advising slot), passed to Nexora as their selection.
        selection: z.object({ kind: z.enum(['advising_slot']), ref: z.string().uuid(), label: z.string().trim().min(1).max(120) }).strict().optional(),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const conversation = await conversations.ownConversation(req.auth, req.params.id);
    const abort = new AbortController();
    // The person closed the tab or pressed Stop: stop generating (what was shown so far is kept).
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    await streamTurn({ auth: req.auth, conversation, message: req.body.message, selection: req.body.selection, res, signal: abort.signal });
  }),
);

nexoraRoutes.post(
  '/actions/:id/:decision',
  validate({ params: z.object({ id: z.string().uuid(), decision: z.enum(['confirm', 'cancel']) }) }),
  asyncHandler(async (req, res) => {
    const outcome = await decideAction(req.auth, req.params.id, req.params.decision);
    return sendSuccess(res, { action: outcome.action, event: (await conversations.presentMessages(req.auth, [outcome.event]))[0] });
  }),
);
