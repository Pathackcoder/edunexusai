import { Server } from 'socket.io';
import { env } from '../../config/env.js';
import { authenticateAccessToken } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import { assertParticipant, markRead, sendMessage, unreadSummary } from './chatService.js';

/**
 * Realtime messaging on the API's own HTTP server (path /socket.io, same port, same CORS allow-list).
 *
 * Authentication: the handshake carries the portal access token (`auth.token`), checked by the same
 * authenticateAccessToken as every REST request (signature, active account and tenant, live SSO session).
 * The connection is closed when that token expires; the client reconnects with a refreshed one.
 *
 * Rooms: `user:<id>` (joined at connect: that person's inbox and unread count) and `conversation:<id>`
 * (joined on request, only after a participant check). Clients never choose a room name directly.
 *
 * Client → server (every event answers through its acknowledgement: { ok, ... } or { ok: false, error }):
 *   chat:join  { conversationId }          chat:leave { conversationId }
 *   chat:send  { conversationId, body, clientId }   → persisted before { ok: true, message }
 *   chat:read  { conversationId }
 * Server → client:
 *   chat:message { conversationId, message }   chat:read { conversationId, userId, lastReadAt }
 *   chat:unread  { total, conversations }       chat:session-expired
 */

let io = null;
const userRoom = (id) => `user:${id}`;
const conversationRoom = (id) => `conversation:${id}`;

async function emitUnread(auth) {
  if (!io) return;
  io.to(userRoom(auth.userId)).emit('chat:unread', await unreadSummary(auth));
}

/** Announce a stored message to both participants (each socket once, even if it is in several rooms). */
export async function publishMessage(auth, { message, participantIds }) {
  if (!io) return;
  io.to([conversationRoom(message.conversationId), ...participantIds.map(userRoom)]).emit('chat:message', { conversationId: message.conversationId, message });
  await Promise.all(participantIds.filter((id) => id !== auth.userId).map((userId) => emitUnread({ userId, tenantId: auth.tenantId })));
}

export async function publishRead(auth, conversationId, { lastReadAt, participantIds }) {
  if (!io) return;
  io.to(participantIds.map(userRoom)).emit('chat:read', { conversationId, userId: auth.userId, lastReadAt });
  await emitUnread(auth);
}

const failure = (error) => {
  const status = error?.status ?? 500;
  if (status >= 500) logger.error('[chat] socket event failed', { code: error?.code, message: error?.message?.slice(0, 200) });
  return { ok: false, error: { code: status >= 500 ? 'INTERNAL_ERROR' : error.code, message: status >= 500 ? 'Something went wrong. Please try again.' : error.message } };
};

export function attachChatSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 32 * 1024, // a message is at most 4000 characters
    cors: { origin: env.cors.origins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
      socket.data.auth = await authenticateAccessToken(token);
      socket.data.token = token;
      return next();
    } catch (error) {
      const refusal = new Error(error.message ?? 'Authentication required.');
      refusal.data = { code: error.code ?? 'UNAUTHENTICATED' };
      return next(refusal);
    }
  });

  io.on('connection', (socket) => {
    const { auth } = socket.data;
    socket.join(userRoom(auth.userId));
    const expiresIn = auth.tokenExpiresAt ? auth.tokenExpiresAt * 1000 - Date.now() : 0;
    const expiry = setTimeout(() => {
      socket.emit('chat:session-expired');
      socket.disconnect(true);
    }, Math.max(1000, Math.min(expiresIn, 2 ** 31 - 1)));
    socket.on('disconnect', () => clearTimeout(expiry));

    // Every event: a plain-object payload and an acknowledgement; the account is re-checked so a
    // suspended account or ended SSO session cannot keep sending on an open connection.
    const handle = (event, run) => socket.on(event, async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('Invalid request.'), { status: 400, code: 'VALIDATION_ERROR' });
        const current = await authenticateAccessToken(socket.data.token);
        ack({ ok: true, ...(await run(current, payload)) });
      } catch (error) {
        ack(failure(error));
      }
    });

    handle('chat:join', async (current, { conversationId }) => {
      await assertParticipant(current, conversationId);
      socket.join(conversationRoom(conversationId));
      return {};
    });
    handle('chat:leave', async (_current, { conversationId }) => {
      if (typeof conversationId === 'string') socket.leave(conversationRoom(conversationId));
      return {};
    });
    handle('chat:send', async (current, { conversationId, body, clientId }) => {
      const result = await sendMessage(current, conversationId, { body, clientId });
      // Stored: the sender is told so even if announcing it fails (the recipient then sees it on their next load).
      if (!result.duplicate) await publishMessage(current, result).catch((error) => logger.warn('[chat] announcing a message failed', { code: error?.code }));
      return { message: result.message };
    });
    handle('chat:read', async (current, { conversationId }) => {
      const result = await markRead(current, conversationId);
      if (result.changed) await publishRead(current, conversationId, result).catch((error) => logger.warn('[chat] announcing a read receipt failed', { code: error?.code }));
      return { lastReadAt: result.lastReadAt };
    });
  });
  return io;
}

/** Disconnect every client (shutdown, tests). The HTTP server itself is closed by its owner. */
export function closeChatSocket() {
  if (!io) return;
  io.disconnectSockets(true);
  io = null;
}
