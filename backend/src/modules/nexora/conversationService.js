import { prisma } from '../../db/prisma.js';
import { notFound } from '../../utils/errors.js';
import { actionsById, presentAction } from './actionService.js';

/**
 * Nexora conversations. Every query is scoped by the session's tenant AND user, so another person's conversation
 * id resolves exactly like an id that does not exist (404), in this institution or any other.
 */

const owned = (auth, id) => ({ id, tenantId: auth.tenantId, userId: auth.userId });
const ID = /^[0-9a-f-]{36}$/i;

export async function ownConversation(auth, id) {
  if (typeof id !== 'string' || !ID.test(id)) throw notFound('Conversation not found.');
  const row = await prisma.nexoraConversation.findFirst({ where: owned(auth, id) });
  if (!row) throw notFound('Conversation not found.');
  return row;
}

const presentConversation = (row) => ({ id: row.id, title: row.title, lastMessageAt: row.lastMessageAt, createdAt: row.createdAt, updatedAt: row.updatedAt });

/** Action blocks are stored as references and shown with the action's current state. */
export function presentMessage(row, actions = new Map()) {
  const blocks = (row.blocks ?? []).map((block) =>
    block.type === 'action' ? { type: 'action', actionId: block.actionId, title: block.title, action: presentAction(actions.get(block.actionId) ?? null) } : block,
  );
  return { id: row.id, role: row.role, content: row.content, blocks, toolActivity: row.toolActivity ?? [], status: row.status, createdAt: row.createdAt };
}

export async function presentMessages(auth, rows) {
  const ids = rows.flatMap((row) => (row.blocks ?? []).filter((b) => b.type === 'action').map((b) => b.actionId));
  const actions = await actionsById(auth, [...new Set(ids)]);
  return rows.map((row) => presentMessage(row, actions));
}

export async function listConversations(auth) {
  const rows = await prisma.nexoraConversation.findMany({
    where: { tenantId: auth.tenantId, userId: auth.userId },
    orderBy: { updatedAt: 'desc' },
    take: 60,
  });
  return rows.map(presentConversation);
}

export async function createConversation(auth) {
  return presentConversation(await prisma.nexoraConversation.create({ data: { tenantId: auth.tenantId, userId: auth.userId } }));
}

export async function getConversation(auth, id) {
  const conversation = await ownConversation(auth, id);
  const rows = await prisma.nexoraMessage.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 500 });
  return { ...presentConversation(conversation), messages: await presentMessages(auth, rows) };
}

export async function renameConversation(auth, id, title) {
  await ownConversation(auth, id);
  return presentConversation(await prisma.nexoraConversation.update({ where: { id }, data: { title } }));
}

export async function deleteConversation(auth, id) {
  await ownConversation(auth, id);
  await prisma.nexoraConversation.delete({ where: { id } });
  return { deleted: true };
}

export async function countMessages(conversationId) {
  return prisma.nexoraMessage.count({ where: { conversationId } });
}

export async function addMessage(conversationId, data, { title } = {}) {
  const [message] = await prisma.$transaction([
    prisma.nexoraMessage.create({ data: { conversationId, ...data } }),
    prisma.nexoraConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), ...(title ? { title } : {}) } }),
  ]);
  return message;
}

/** The most recent messages, oldest first, for replaying to the model. */
export async function recentMessages(conversationId, limit) {
  const rows = await prisma.nexoraMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
  return rows.reverse();
}
