import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError, ErrorCode, badRequest, forbidden, notFound } from '../../utils/errors.js';

/**
 * Portal messaging (one-to-one). Every function takes the caller's verified context (`auth`, from
 * authenticateAccessToken) and never a client-supplied sender or tenant id.
 *
 *   openDirectConversation  the one conversation between the caller and a directory person (created once)
 *   listConversations       the caller's inbox with last message and unread count
 *   getMessages             a page of history, only for participants
 *   sendMessage             persist first; the caller announces it only after this returns
 *   markRead                read receipts / unread counts
 *
 * Who can be messaged: the portal account a People Search entry is linked to (directory_profiles.userId),
 * in the caller's institution and active. Never matched by name or email.
 */

export const MAX_MESSAGE_LENGTH = 4000;
const PAGE_SIZE = 50;
const CLIENT_ID = /^[\w-]{8,64}$/;
const RATE = { windowMs: 10_000, max: 20 };

const directKey = (a, b) => [a, b].sort().join(':');
const sendTimes = new Map();

/** Per-account send ceiling (in memory, per API process). */
export function assertSendAllowed(userId, now = Date.now()) {
  const recent = (sendTimes.get(userId) ?? []).filter((t) => now - t < RATE.windowMs);
  if (recent.length >= RATE.max) throw new AppError(429, ErrorCode.RATE_LIMITED, 'You are sending messages too quickly. Please wait a few seconds.');
  recent.push(now);
  sendTimes.set(userId, recent);
  if (sendTimes.size > 10_000) sendTimes.delete(sendTimes.keys().next().value);
}
export const resetSendLimits = () => sendTimes.clear();

/** Validate and normalise a message body: text, 1–4000 characters after trimming. */
export function normaliseBody(value) {
  if (typeof value !== 'string') throw badRequest('Write a message first.');
  const body = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!body) throw badRequest('Write a message first.');
  if (body.length > MAX_MESSAGE_LENGTH) throw badRequest(`A message can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  return body;
}

const presentMessage = (m) => ({ id: m.id, conversationId: m.conversationId, senderId: m.senderId, body: m.body, clientId: m.clientId, createdAt: m.createdAt });

const personInclude = { select: { id: true, firstName: true, lastName: true, status: true, directoryProfile: { select: { id: true, name: true, initials: true, avatarBg: true, type: true, role: true, department: true, email: true, isVisible: true } } } };

function presentPerson(user) {
  const profile = user.directoryProfile?.isVisible ? user.directoryProfile : null;
  const name = profile?.name ?? ([user.firstName, user.lastName].filter(Boolean).join(' ') || 'Portal member');
  return {
    userId: user.id,
    name,
    initials: profile?.initials ?? name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(Dr|Prof)\.?$/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
    avatarBg: profile?.avatarBg ?? null,
    type: profile?.type ?? null,
    role: profile?.role ?? null,
    department: profile?.department ?? null,
    email: profile?.email ?? null,
    active: user.status === 'ACTIVE',
  };
}

/** The caller's participation, or 404 (also for another tenant's or someone else's conversation). */
async function participation(auth, conversationId) {
  if (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversationId)) throw notFound('Conversation not found.');
  const row = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: auth.userId, conversation: { tenantId: auth.tenantId } },
    include: { conversation: { include: { participants: { include: { user: personInclude } } } } },
  });
  if (!row) throw notFound('Conversation not found.');
  return row;
}

export const assertParticipant = participation;

/** Unread counts per conversation for one user (messages from others after their lastReadAt). */
export async function unreadByConversation(userId, tenantId) {
  const rows = await prisma.$queryRaw`
    SELECT m."conversationId" AS "conversationId", count(*)::int AS "unread"
    FROM chat_messages m
    JOIN conversation_participants p ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
    JOIN conversations c ON c.id = m."conversationId" AND c."tenantId" = ${tenantId}
    WHERE m."senderId" <> ${userId} AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
    GROUP BY m."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, r.unread]));
}

export async function unreadSummary(auth) {
  const counts = await unreadByConversation(auth.userId, auth.tenantId);
  return { total: [...counts.values()].reduce((a, b) => a + b, 0), conversations: Object.fromEntries(counts) };
}

function presentConversation(conversation, me, { unread = 0, lastMessage = null } = {}) {
  const other = conversation.participants.find((p) => p.userId !== me);
  return {
    id: conversation.id,
    kind: conversation.kind,
    participant: other ? presentPerson(other.user) : null,
    // When the other person last read the conversation: messages sent up to here show as "Seen".
    participantReadAt: other?.lastReadAt ?? null,
    lastMessage: lastMessage ? presentMessage(lastMessage) : null,
    lastMessageAt: conversation.lastMessageAt,
    unread,
  };
}

/** Open (or create, once) the conversation with the person behind a People Search entry. */
export async function openDirectConversation(auth, { profileId }) {
  const profile = await prisma.directoryProfile.findFirst({ where: { id: String(profileId ?? ''), tenantId: auth.tenantId, isVisible: true }, select: { user: { select: { id: true, tenantId: true, status: true } } } });
  const recipient = profile?.user;
  if (!recipient || recipient.tenantId !== auth.tenantId || recipient.status !== 'ACTIVE') throw notFound('This person cannot receive messages on EdunexusAI yet.');
  if (recipient.id === auth.userId) throw badRequest('You cannot start a conversation with yourself.');
  const key = directKey(auth.userId, recipient.id);
  const where = { tenantId_directKey: { tenantId: auth.tenantId, directKey: key } };
  let conversation = await prisma.conversation.findUnique({ where });
  if (!conversation) {
    try {
      conversation = await prisma.conversation.create({ data: { tenantId: auth.tenantId, kind: 'DIRECT', directKey: key, participants: { create: [{ userId: auth.userId }, { userId: recipient.id }] } } });
    } catch (error) {
      // Both people opened the conversation at the same moment: use the one that was created.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      conversation = await prisma.conversation.findUnique({ where });
    }
  }
  return getConversation(auth, conversation.id);
}

export async function getConversation(auth, conversationId) {
  const { conversation } = await participation(auth, conversationId);
  const [lastMessage, unread] = await Promise.all([
    prisma.chatMessage.findFirst({ where: { conversationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    unreadByConversation(auth.userId, auth.tenantId),
  ]);
  return presentConversation(conversation, auth.userId, { unread: unread.get(conversationId) ?? 0, lastMessage });
}

/** The caller's conversations that have at least one message, newest first. */
export async function listConversations(auth) {
  const rows = await prisma.conversation.findMany({
    where: { tenantId: auth.tenantId, lastMessageAt: { not: null }, participants: { some: { userId: auth.userId } } },
    include: { participants: { include: { user: personInclude } }, messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  });
  const unread = await unreadByConversation(auth.userId, auth.tenantId);
  const conversations = rows.map((c) => presentConversation(c, auth.userId, { unread: unread.get(c.id) ?? 0, lastMessage: c.messages[0] ?? null }));
  return { conversations, unreadTotal: [...unread.values()].reduce((a, b) => a + b, 0) };
}

/** Messages oldest-first; `before` (a message id) loads the page before it. */
export async function getMessages(auth, conversationId, { before, limit = PAGE_SIZE } = {}) {
  const { conversation } = await participation(auth, conversationId);
  const take = Math.min(Math.max(Number(limit) || PAGE_SIZE, 1), 100);
  let cursor = null;
  if (before) {
    cursor = await prisma.chatMessage.findFirst({ where: { id: String(before), conversationId }, select: { id: true } });
    if (!cursor) throw badRequest('Unknown message cursor.');
  }
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
  });
  const other = conversation.participants.find((p) => p.userId !== auth.userId);
  return {
    messages: rows.slice(0, take).reverse().map(presentMessage),
    hasMore: rows.length > take,
    participantReadAt: other?.lastReadAt ?? null,
  };
}

/**
 * Store a message from the caller. Returns { message, participantIds, duplicate } only after it is
 * committed; a retry with the same clientId returns the stored message instead of a second copy.
 */
export async function sendMessage(auth, conversationId, { body, clientId } = {}) {
  const text = normaliseBody(body);
  if (clientId !== undefined && clientId !== null && !CLIENT_ID.test(String(clientId))) throw badRequest('Invalid message id.');
  const { conversation } = await participation(auth, conversationId);
  if (conversation.participants.some((p) => p.userId !== auth.userId && p.user.status !== 'ACTIVE')) throw forbidden('This person can no longer receive messages.');
  const participantIds = conversation.participants.map((p) => p.userId);
  if (clientId) {
    const existing = await prisma.chatMessage.findUnique({ where: { conversationId_senderId_clientId: { conversationId, senderId: auth.userId, clientId } } });
    if (existing) return { message: presentMessage(existing), participantIds, duplicate: true };
  }
  assertSendAllowed(auth.userId);
  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({ data: { conversationId, senderId: auth.userId, body: text, clientId: clientId ?? null } });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
      // Sending implies the sender has read everything up to their own message.
      await tx.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: auth.userId } }, data: { lastReadAt: created.createdAt } });
      return created;
    });
    return { message: presentMessage(message), participantIds, duplicate: false };
  } catch (error) {
    if (clientId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.chatMessage.findUnique({ where: { conversationId_senderId_clientId: { conversationId, senderId: auth.userId, clientId } } });
      if (existing) return { message: presentMessage(existing), participantIds, duplicate: true };
    }
    throw error;
  }
}

/** Mark everything received in a conversation as read. Returns { lastReadAt, participantIds, changed }. */
export async function markRead(auth, conversationId) {
  const { conversation, lastReadAt: before } = await participation(auth, conversationId);
  // The newest message's own timestamp (database clock), so unread counts never depend on server clock skew.
  const latest = await prisma.chatMessage.findFirst({ where: { conversationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { createdAt: true } });
  const participantIds = conversation.participants.map((p) => p.userId);
  if (!latest || (before && before >= latest.createdAt)) return { lastReadAt: before ?? null, participantIds, changed: false };
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: auth.userId } }, data: { lastReadAt: latest.createdAt } });
  return { lastReadAt: latest.createdAt, participantIds, changed: true };
}
