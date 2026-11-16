import { prisma } from '../../db/prisma.js';
import { AppError, ErrorCode, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { recordAudit } from '../audit/auditService.js';
import { nexoraConfig } from './config.js';
import { toolContext } from './context.js';
import { denialReason, getTool } from './tools/index.js';

/**
 * Proposed actions: the only path by which Nexora changes anything.
 *
 *   createAction   a tool's prepare() produced a payload and a preview → PENDING (nothing has happened yet)
 *   decideAction   the person pressed Confirm or Cancel on the card (a plain REST request, never the model):
 *                  ownership, expiry and the tool's availability for this session are checked again, the row is
 *                  claimed atomically so a double click cannot run it twice, and the tool's execute() calls the
 *                  module's existing service, which re-validates everything itself (slot still open, recipient
 *                  still active, roster still taught, audience still non-empty).
 *
 * Outcomes are recorded on the row, in the audit log, and as an event message in the conversation, so Nexora (and
 * the person) only ever hear "done" when the service actually confirmed it.
 */

export function presentAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    tool: row.tool,
    status: row.status,
    preview: row.preview,
    result: row.result ?? null,
    errorMessage: row.errorMessage ?? null,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
  };
}

export async function createAction(auth, { conversationId, tool, payload, preview }) {
  const { actionTtlMinutes } = nexoraConfig();
  return prisma.nexoraAction.create({
    data: { tenantId: auth.tenantId, userId: auth.userId, conversationId, tool, payload, preview, expiresAt: new Date(Date.now() + actionTtlMinutes * 60_000) },
  });
}

/** The caller's own actions by id (another person's or institution's ids simply do not resolve). */
export async function actionsById(auth, ids) {
  if (!ids.length) return new Map();
  const rows = await prisma.nexoraAction.findMany({ where: { id: { in: ids }, tenantId: auth.tenantId, userId: auth.userId } });
  return new Map(rows.map((row) => [row.id, row]));
}

const audit = (auth, row, action, summary) =>
  recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action, entityType: 'NexoraAction', entityId: row.id, summary, metadata: { tool: row.tool, conversationId: row.conversationId } }).catch((error) =>
    logger.warn('[nexora] audit entry not written', { code: error.code ?? null }),
  );

async function appendEvent(row, content, blocks) {
  const [message] = await prisma.$transaction([
    prisma.nexoraMessage.create({ data: { conversationId: row.conversationId, role: 'event', content, blocks } }),
    prisma.nexoraConversation.update({ where: { id: row.conversationId }, data: { lastMessageAt: new Date() } }),
  ]);
  return message;
}

const conflict = (message, row) => new AppError(409, ErrorCode.CONFLICT, message, { action: presentAction(row) });

/** decision: 'confirm' | 'cancel'. Returns { action, event }. */
export async function decideAction(auth, id, decision) {
  const row = await prisma.nexoraAction.findFirst({ where: { id, tenantId: auth.tenantId, userId: auth.userId } });
  if (!row) throw notFound('This proposal was not found.');
  if (row.status !== 'PENDING') throw conflict('This proposal has already been handled.', row);
  const title = row.preview?.title ?? 'Proposed action';

  if (row.expiresAt <= new Date()) {
    const expired = await prisma.nexoraAction.update({ where: { id }, data: { status: 'EXPIRED', decidedAt: new Date() } });
    throw conflict('This proposal expired before it was confirmed. Ask Nexora to prepare it again.', expired);
  }

  // Claim the row: only one confirm/cancel request can move it out of PENDING.
  const claimed = await prisma.nexoraAction.updateMany({ where: { id, status: 'PENDING', decidedAt: null }, data: { decidedAt: new Date() } });
  if (!claimed.count) throw conflict('This proposal is already being handled.', await prisma.nexoraAction.findUnique({ where: { id } }));

  if (decision === 'cancel') {
    const cancelled = await prisma.nexoraAction.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit(auth, row, 'NEXORA_ACTION_CANCELLED', `${title}: cancelled by the user before anything was done`);
    const event = await appendEvent(row, `The user cancelled “${title}”. Nothing was done.`, [{ type: 'action', actionId: id, title }]);
    return { action: presentAction(cancelled), event };
  }

  const tool = getTool(row.tool);
  const denied = !tool || tool.kind !== 'action' ? 'UNKNOWN_TOOL' : denialReason(tool, auth);
  let updated;
  let eventText;
  if (denied) {
    updated = await prisma.nexoraAction.update({ where: { id }, data: { status: 'FAILED', errorMessage: 'This action is no longer available to your account.' } });
    await audit(auth, row, 'NEXORA_ACTION_DENIED', `${title}: refused at confirmation (${denied})`);
    eventText = `“${title}” could not be done: this action is no longer available to the user's account.`;
  } else {
    try {
      const ctx = await toolContext(auth, { actionId: id, conversationId: row.conversationId });
      const { result, summary } = await tool.execute(ctx, row.payload);
      updated = await prisma.nexoraAction.update({ where: { id }, data: { status: 'EXECUTED', result: { ...(result ?? {}), summary } } });
      await audit(auth, row, 'NEXORA_ACTION_EXECUTED', `${title}: ${summary}`);
      eventText = `The user confirmed “${title}” and the portal completed it: ${summary}`;
    } catch (error) {
      const known = error instanceof AppError || error?.isOperational;
      if (!known) logger.error('[nexora] action failed', { tool: row.tool, name: error?.name, message: error?.message });
      const message = known ? error.message : 'The portal could not complete this action. Nothing was changed by Nexora.';
      updated = await prisma.nexoraAction.update({ where: { id }, data: { status: 'FAILED', errorMessage: message } });
      await audit(auth, row, 'NEXORA_ACTION_FAILED', `${title}: failed (${known ? error.code : 'INTERNAL_ERROR'})`);
      eventText = `The user confirmed “${title}” but the portal did not complete it: ${message}`;
    }
  }
  const event = await appendEvent(row, eventText, [{ type: 'action', actionId: id, title }]);
  return { action: presentAction(updated), event };
}
