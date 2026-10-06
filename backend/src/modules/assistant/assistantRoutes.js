import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { PROVIDER, SUGGESTIONS, respond } from './assistantProvider.js';

const present = (row) => ({ id: row.id, role: row.role, content: row.content, actions: row.actions ?? [], at: row.createdAt });
const suggestionsFor = (auth) => (auth.studentProfileId ? SUGGESTIONS.STUDENT : SUGGESTIONS.FACULTY);

/** Conversation history is persisted per user so the assistant panel survives a reload. */
export const assistantRoutes = Router();
assistantRoutes.use(requireAuth);

assistantRoutes.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const rows = await prisma.assistantMessage.findMany({ where: { userId: req.auth.userId }, orderBy: { createdAt: 'desc' }, take: 40 });
    return sendSuccess(res, { provider: PROVIDER, messages: rows.reverse().map(present), suggestions: suggestionsFor(req.auth) });
  }),
);

assistantRoutes.post(
  '/messages',
  validate({ body: z.object({ message: z.string().trim().min(1, 'Type a question.').max(1000) }) }),
  asyncHandler(async (req, res) => {
    const { tenantId, userId } = req.auth;
    const question = await prisma.assistantMessage.create({ data: { tenantId, userId, role: 'user', content: req.body.message } });
    const answer = await respond({ auth: req.auth, message: req.body.message });
    const reply = await prisma.assistantMessage.create({
      data: { tenantId, userId, role: 'assistant', content: answer.text, actions: answer.actions ?? [] },
    });
    return sendSuccess(res, { messages: [present(question), present(reply)], intent: answer.intent, citation: answer.citation ?? null }, { status: 201 });
  }),
);

assistantRoutes.delete(
  '/messages',
  asyncHandler(async (req, res) => {
    await prisma.assistantMessage.deleteMany({ where: { userId: req.auth.userId } });
    return sendSuccess(res, { messages: [], suggestions: suggestionsFor(req.auth) });
  }),
);
