import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { apiOrigin, chatApi, refreshAccessToken, tokenStore } from '../services/api';

/**
 * Portal messaging state for the signed-in person: one Socket.IO connection (same backend, same
 * portal session token as every API call), the inbox, open threads, unread counts and the messaging
 * panel (components/chat/ChatPanel.jsx).
 *
 * Delivery: a message is shown at once as "sending", sent with a client id over the socket (REST when
 * the socket is down) and becomes "sent" only when the server acknowledges it was stored. Events are
 * de-duplicated by message id / client id, so a reconnect or a retry never shows a message twice.
 */

const ChatContext = createContext(null);
const SEND_TIMEOUT_MS = 10_000;

const newClientId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
const sameMessage = (a, b) => a.id === b.id || (a.clientId && b.clientId && a.clientId === b.clientId && a.senderId === b.senderId);

/** Insert or replace one message in a thread's list, keeping chronological order. */
export function mergeMessage(list, message) {
  const at = list.findIndex((m) => sameMessage(m, message));
  if (at === -1) return [...list, message].sort(byTime);
  const next = [...list];
  next[at] = { ...next[at], ...message, status: message.status };
  return next;
}

export function ChatProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const me = user?.id ?? null;
  const socketRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | reconnecting | offline
  const [unread, setUnread] = useState({ total: 0, conversations: {} });
  const [inbox, setInbox] = useState({ conversations: [], loading: false, error: null, loaded: false });
  const [threads, setThreads] = useState({});
  const [panel, setPanel] = useState({ open: false, conversationId: null, opening: false, error: null });
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const inboxLoaded = useRef(false);

  const patchThread = useCallback((id, patch) => setThreads((all) => ({ ...all, [id]: { messages: [], ...all[id], ...(typeof patch === 'function' ? patch(all[id] ?? { messages: [] }) : patch) } })), []);

  const loadUnread = useCallback(async () => {
    try {
      setUnread(await chatApi.unread());
    } catch {
      /* the badge keeps its last known value */
    }
  }, []);

  const loadInbox = useCallback(async () => {
    setInbox((current) => ({ ...current, loading: !current.loaded, error: null }));
    try {
      const { conversations, unreadTotal } = await chatApi.conversations();
      inboxLoaded.current = true;
      setInbox({ conversations, loading: false, error: null, loaded: true });
      setUnread({ total: unreadTotal, conversations: Object.fromEntries(conversations.filter((c) => c.unread).map((c) => [c.id, c.unread])) });
    } catch (error) {
      setInbox((current) => ({ ...current, loading: false, error }));
    }
  }, []);

  const loadThread = useCallback(async (id, { quiet = false } = {}) => {
    if (!quiet) patchThread(id, { loading: true, error: null });
    try {
      const page = await chatApi.messages(id);
      // Keep messages this browser is still sending (or failed to send) on top of the server's history.
      patchThread(id, (thread) => {
        const local = (thread.messages ?? []).filter((m) => m.status === 'sending' || m.status === 'failed');
        return { loading: false, error: null, hasMore: page.hasMore, participantReadAt: page.participantReadAt, messages: local.reduce(mergeMessage, page.messages) };
      });
    } catch (error) {
      patchThread(id, { loading: false, error });
    }
  }, [patchThread]);

  const loadOlder = useCallback(async (id) => {
    const first = threads[id]?.messages?.find((m) => !m.status || m.status === 'sent');
    if (!first) return;
    patchThread(id, { loadingOlder: true });
    try {
      const page = await chatApi.messages(id, { before: first.id });
      patchThread(id, (thread) => ({ loadingOlder: false, hasMore: page.hasMore, messages: page.messages.reduce(mergeMessage, thread.messages) }));
    } catch {
      patchThread(id, { loadingOlder: false });
    }
  }, [threads, patchThread]);

  /** A stored message (from the socket, an acknowledgement or REST): thread, inbox and order. */
  const receive = useCallback((conversationId, message) => {
    const stored = { ...message, status: 'sent' };
    setThreads((all) => (all[conversationId] ? { ...all, [conversationId]: { ...all[conversationId], messages: mergeMessage(all[conversationId].messages, stored) } } : all));
    setInbox((current) => {
      const row = current.conversations.find((c) => c.id === conversationId);
      if (!row) {
        if (inboxLoaded.current) setTimeout(() => loadInbox(), 0); // a new conversation: fetch its summary
        return current;
      }
      if (row.lastMessage && new Date(row.lastMessage.createdAt) > new Date(stored.createdAt)) return current;
      const updated = { ...row, lastMessage: stored, lastMessageAt: stored.createdAt };
      return { ...current, conversations: [updated, ...current.conversations.filter((c) => c.id !== conversationId)] };
    });
  }, [loadInbox]);

  const markRead = useCallback(async (conversationId) => {
    setUnread((current) => {
      const count = current.conversations[conversationId] ?? 0;
      if (!count) return current;
      const conversations = { ...current.conversations };
      delete conversations[conversationId];
      return { total: Math.max(0, current.total - count), conversations };
    });
    setInbox((current) => ({ ...current, conversations: current.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)) }));
    const socket = socketRef.current;
    if (socket?.connected) socket.timeout(SEND_TIMEOUT_MS).emit('chat:read', { conversationId }, () => {});
    else chatApi.markRead(conversationId).catch(() => {});
  }, []);

  const deliver = useCallback((conversationId, pending) => {
    const fail = (error) => patchThread(conversationId, (thread) => ({ messages: mergeMessage(thread.messages, { ...pending, status: 'failed', error: error?.message ?? 'Not sent.' }) }));
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.timeout(SEND_TIMEOUT_MS).emit('chat:send', { conversationId, body: pending.body, clientId: pending.clientId }, (timeout, ack) => {
        if (timeout) return fail({ message: 'No answer from the server. Try again.' });
        if (!ack?.ok) return fail(ack?.error);
        return receive(conversationId, ack.message);
      });
      return;
    }
    chatApi.send(conversationId, { body: pending.body, clientId: pending.clientId }).then((message) => receive(conversationId, message)).catch(fail);
  }, [patchThread, receive]);

  const send = useCallback((conversationId, text) => {
    const body = String(text ?? '').trim();
    if (!body || !me) return;
    const clientId = newClientId();
    const pending = { id: `local-${clientId}`, clientId, conversationId, senderId: me, body, createdAt: new Date().toISOString(), status: 'sending' };
    patchThread(conversationId, (thread) => ({ messages: mergeMessage(thread.messages, pending) }));
    deliver(conversationId, pending);
  }, [me, patchThread, deliver]);

  // The same client id again: the server stores a message at most once.
  const retry = useCallback((conversationId, message) => {
    const pending = { ...message, status: 'sending', error: null };
    patchThread(conversationId, (thread) => ({ messages: mergeMessage(thread.messages, pending) }));
    deliver(conversationId, pending);
  }, [patchThread, deliver]);

  /* ------------------------------------------------------------ the connection */
  useEffect(() => {
    if (!isAuthenticated || !me) return undefined;
    const socket = io(apiOrigin(), {
      path: '/socket.io',
      // Read at every (re)connect, so a refreshed token is always the one presented.
      auth: (cb) => cb({ token: tokenStore.getAccessToken() }),
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;
    setStatus('connecting');
    let closed = false;
    const reconnectFresh = async () => {
      if (closed) return;
      setStatus('reconnecting');
      if (await refreshAccessToken()) socket.connect();
      else setStatus('offline');
    };

    socket.on('connect', () => {
      setStatus('connected');
      loadUnread();
      if (inboxLoaded.current) loadInbox();
      const { open, conversationId } = panelRef.current;
      if (open && conversationId) {
        socket.emit('chat:join', { conversationId }, () => {});
        loadThread(conversationId, { quiet: true }); // anything that arrived while disconnected
      }
    });
    socket.on('disconnect', (reason) => {
      if (closed) return;
      if (reason === 'io server disconnect') reconnectFresh(); // the server ends a connection when its token expires
      else setStatus('reconnecting'); // network: Socket.IO reconnects by itself
    });
    socket.on('connect_error', (error) => {
      if (closed) return;
      if (error?.data?.code === 'TOKEN_EXPIRED') reconnectFresh();
      else if (error?.data?.code) setStatus('offline'); // refused: the session is not valid for chat
      else setStatus('reconnecting');
    });
    socket.on('chat:message', ({ conversationId, message }) => {
      receive(conversationId, message);
      const { open, conversationId: current } = panelRef.current;
      if (message.senderId !== me && open && current === conversationId && document.visibilityState === 'visible') markRead(conversationId);
    });
    socket.on('chat:unread', (summary) => {
      const { open, conversationId } = panelRef.current;
      // Already reading this conversation: its new messages are marked read right after, so they are not counted.
      const reading = open && conversationId && document.visibilityState === 'visible' ? summary.conversations?.[conversationId] ?? 0 : 0;
      if (!reading) return setUnread(summary);
      const conversations = { ...summary.conversations };
      delete conversations[conversationId];
      return setUnread({ total: Math.max(0, summary.total - reading), conversations });
    });
    socket.on('chat:read', ({ conversationId, userId, lastReadAt }) => {
      if (userId === me) return;
      setThreads((all) => (all[conversationId] ? { ...all, [conversationId]: { ...all[conversationId], participantReadAt: lastReadAt } } : all));
      setInbox((current) => ({ ...current, conversations: current.conversations.map((c) => (c.id === conversationId ? { ...c, participantReadAt: lastReadAt } : c)) }));
    });

    return () => {
      closed = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setStatus('idle');
    };
  }, [isAuthenticated, me, loadUnread, loadInbox, loadThread, receive, markRead]);

  // Signed out: forget everything.
  useEffect(() => {
    if (isAuthenticated) {
      loadUnread();
      return;
    }
    inboxLoaded.current = false;
    setUnread({ total: 0, conversations: {} });
    setInbox({ conversations: [], loading: false, error: null, loaded: false });
    setThreads({});
    setPanel({ open: false, conversationId: null, opening: false, error: null });
  }, [isAuthenticated, loadUnread]);

  // The open conversation's room, joined after a participant check on the server.
  useEffect(() => {
    const socket = socketRef.current;
    const id = panel.open ? panel.conversationId : null;
    if (!socket || !id || status !== 'connected') return undefined;
    socket.emit('chat:join', { conversationId: id }, () => {});
    return () => socket.emit('chat:leave', { conversationId: id }, () => {});
  }, [panel.open, panel.conversationId, status]);

  // Coming back to the tab while a conversation is open counts as reading it.
  useEffect(() => {
    const onVisible = () => {
      const { open, conversationId } = panelRef.current;
      if (document.visibilityState === 'visible' && open && conversationId) markRead(conversationId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  /* ------------------------------------------------------------ the panel */
  const openConversation = useCallback((id, conversation = null) => {
    setPanel({ open: true, conversationId: id, opening: false, error: null });
    patchThread(id, (thread) => ({ conversation: conversation ?? thread.conversation ?? inbox.conversations.find((c) => c.id === id) ?? null }));
    loadThread(id, { quiet: Boolean(threads[id]?.messages?.length) });
    markRead(id);
  }, [patchThread, loadThread, markRead, inbox.conversations, threads]);

  const openInbox = useCallback(() => {
    setPanel({ open: true, conversationId: null, opening: false, error: null });
    loadInbox();
  }, [loadInbox]);

  /** Chat from a People Search entry: the one conversation with that person, created if needed. */
  const openWithProfile = useCallback(async (profileId) => {
    setPanel({ open: true, conversationId: null, opening: true, error: null });
    try {
      const conversation = await chatApi.open(profileId);
      openConversation(conversation.id, conversation);
    } catch (error) {
      setPanel({ open: true, conversationId: null, opening: false, error });
    }
  }, [openConversation]);

  const backToInbox = useCallback(() => {
    setPanel({ open: true, conversationId: null, opening: false, error: null });
    loadInbox();
  }, [loadInbox]);
  const closePanel = useCallback(() => setPanel((current) => ({ ...current, open: false, opening: false })), []);

  const value = useMemo(() => ({
    me, status, unreadTotal: unread.total, unreadByConversation: unread.conversations,
    inbox, threads, panel,
    openInbox, openWithProfile, openConversation, backToInbox, closePanel,
    loadInbox, loadThread, loadOlder, send, retry, markRead,
  }), [me, status, unread, inbox, threads, panel, openInbox, openWithProfile, openConversation, backToInbox, closePanel, loadInbox, loadThread, loadOlder, send, retry, markRead]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** Null outside a ChatProvider (e.g. the public site), so callers can hide chat there. */
export const useChat = () => useContext(ChatContext);
