import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { api, closeTestServer, getTestServer, login, DEMO } from './helpers/testEnv.js';
import { resetSendLimits } from '../src/modules/chat/chatService.js';

/**
 * Portal messaging: REST (/chat) and realtime (Socket.IO on the API's own server), over real HTTP and
 * real sockets. Participants: the demo student and faculty member (both linked to People Search
 * entries); the advanced student plays an outsider.
 */

let prisma;
let origin;
let student;
let faculty;
let outsider;
let profiles;
let users;
const sockets = [];

const open = (profileId, token) => api('/chat/conversations', { method: 'POST', token, body: { profileId } });
const socketFor = (token, opts = {}) => new Promise((resolve, reject) => {
  const socket = connect(origin, { path: '/socket.io', transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true, ...opts });
  sockets.push(socket);
  socket.once('connect', () => resolve(socket));
  socket.once('connect_error', (error) => reject(error));
});
const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const next = (socket, event, ms = 2000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const collect = (socket, event) => { const seen = []; socket.on(event, (d) => seen.push(d)); return seen; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clearChats() {
  const ids = Object.values(users);
  await prisma.conversation.deleteMany({ where: { participants: { some: { userId: { in: ids } } } } });
}

before(async () => {
  ({ origin } = await getTestServer());
  ({ prisma } = await import('../src/db/prisma.js'));
  const byEmail = async (email) => prisma.user.findFirst({ where: { email }, include: { directoryProfile: true } });
  const [s, f, o] = await Promise.all([byEmail(DEMO.student.email), byEmail(DEMO.faculty.email), byEmail(DEMO.advanced.email)]);
  assert.ok(s.directoryProfile && f.directoryProfile && o.directoryProfile, 'demo users are linked to People Search entries');
  users = { student: s.id, faculty: f.id, outsider: o.id };
  profiles = { student: s.directoryProfile.id, faculty: f.directoryProfile.id, outsider: o.directoryProfile.id };
  [student, faculty, outsider] = await Promise.all([login('student'), login('faculty'), login('advanced')]);
  await clearChats();
});

beforeEach(() => resetSendLimits());

after(async () => {
  for (const socket of sockets) socket.disconnect();
  await clearChats();
  await closeTestServer();
});

describe('chat: starting a conversation', () => {
  it('People Search says who can be messaged (linked, active, not yourself)', async () => {
    const { people } = (await api('/directory', { token: student })).body.data;
    const me = people.find((p) => p.profileId === profiles.student);
    const sarah = people.find((p) => p.profileId === profiles.faculty);
    assert.equal(me.isYou, true);
    assert.equal(me.canMessage, false);
    assert.equal(sarah.canMessage, true);
    const unlinked = await prisma.directoryProfile.findFirst({ where: { userId: null, isVisible: true } });
    if (unlinked) assert.equal(people.find((p) => p.profileId === unlinked.id)?.canMessage, false);
  });

  it('either person opens the same single conversation, even at the same moment', async () => {
    const [a, b] = await Promise.all([open(profiles.faculty, student), open(profiles.student, faculty)]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.data.id, b.body.data.id);
    assert.equal(a.body.data.participant.userId, users.faculty);
    assert.equal(a.body.data.participant.name, 'Dr. Sarah Mitchell');
    assert.equal((await open(profiles.faculty, student)).body.data.id, a.body.data.id);
    assert.equal(await prisma.conversation.count({ where: { participants: { some: { userId: users.student } }, AND: { participants: { some: { userId: users.faculty } } } } }), 1);
  });

  it('refuses yourself, people without a portal account, and unknown entries', async () => {
    assert.equal((await open(profiles.student, student)).status, 400);
    const unlinked = await prisma.directoryProfile.findFirst({ where: { userId: null } });
    if (unlinked) assert.equal((await open(unlinked.id, student)).status, 404);
    assert.equal((await open('00000000-0000-4000-8000-000000000000', student)).status, 404);
    assert.equal((await api('/chat/conversations', { method: 'POST', token: student, body: { userId: users.faculty } })).status, 400, 'a raw user id is not accepted');
    assert.equal((await api('/chat/conversations', { method: 'POST', body: { profileId: profiles.faculty } })).status, 401);
  });
});

describe('chat: realtime', () => {
  it('refuses sockets without a valid portal session', async () => {
    await assert.rejects(socketFor(undefined), (e) => e.data?.code === 'UNAUTHENTICATED');
    await assert.rejects(socketFor('not-a-token'), (e) => e.data?.code === 'UNAUTHENTICATED');
  });

  it('delivers a stored message to the recipient once, and updates their unread count', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const [s, f] = await Promise.all([socketFor(student), socketFor(faculty)]);
    assert.equal((await emit(f, 'chat:join', { conversationId: conversation.id })).ok, true); // room + user room: still one event
    const received = collect(f, 'chat:message');
    const unread = next(f, 'chat:unread');
    // A client-supplied sender id is ignored: the sender is the socket's own account.
    const ack = await emit(s, 'chat:send', { conversationId: conversation.id, body: '  Hello Dr. Mitchell!  ', clientId: 'test-msg-0001', senderId: users.faculty });
    assert.equal(ack.ok, true);
    assert.equal(ack.message.body, 'Hello Dr. Mitchell!');
    assert.equal(ack.message.senderId, users.student);
    const stored = await prisma.chatMessage.findUnique({ where: { id: ack.message.id } });
    assert.equal(stored.senderId, users.student, 'persisted before the acknowledgement');
    assert.equal((await unread).total, 1);
    await sleep(150);
    assert.equal(received.length, 1);
    assert.equal(received[0].message.id, ack.message.id);
  });

  it('stores a retried send once (same clientId)', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const s = await socketFor(student);
    const first = await emit(s, 'chat:send', { conversationId: conversation.id, body: 'Retry me', clientId: 'test-msg-retry-1' });
    const again = await emit(s, 'chat:send', { conversationId: conversation.id, body: 'Retry me', clientId: 'test-msg-retry-1' });
    assert.equal(again.message.id, first.message.id);
    assert.equal(await prisma.chatMessage.count({ where: { clientId: 'test-msg-retry-1' } }), 1);
  });

  it('keeps history across reconnects, in order, and shows it in the inbox', async () => {
    const conversation = (await open(profiles.student, faculty)).body.data;
    const f = await socketFor(faculty);
    await emit(f, 'chat:send', { conversationId: conversation.id, body: 'Office hours are Tuesday.', clientId: 'test-msg-reply-1' });
    f.disconnect();
    const history = (await api(`/chat/conversations/${conversation.id}/messages`, { token: student })).body.data;
    const bodies = history.messages.map((m) => m.body);
    assert.deepEqual(bodies.slice(-2), ['Retry me', 'Office hours are Tuesday.']);
    assert.ok(history.messages.every((m, i, all) => i === 0 || new Date(all[i - 1].createdAt) <= new Date(m.createdAt)));
    const inbox = (await api('/chat/conversations', { token: student })).body.data;
    const row = inbox.conversations.find((c) => c.id === conversation.id);
    assert.equal(row.lastMessage.body, 'Office hours are Tuesday.');
    assert.equal(row.unread, 1);
    assert.equal(inbox.unreadTotal, 1);
  });

  it('marks a conversation read: unread clears and the other person gets a read receipt', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const [s, f] = await Promise.all([socketFor(student), socketFor(faculty)]);
    const receipt = next(f, 'chat:read');
    const cleared = next(s, 'chat:unread');
    const ack = await emit(s, 'chat:read', { conversationId: conversation.id });
    assert.equal(ack.ok, true);
    assert.equal((await cleared).total, 0);
    const read = await receipt;
    assert.equal(read.userId, users.student);
    assert.equal(read.conversationId, conversation.id);
    assert.equal((await api('/chat/unread', { token: student })).body.data.total, 0);
    const view = (await api(`/chat/conversations/${conversation.id}/messages`, { token: faculty })).body.data;
    assert.ok(new Date(view.participantReadAt) >= new Date(view.messages.at(-1).createdAt), 'faculty sees their message as seen');
  });

  it('sends over REST too, announcing it in real time', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const f = await socketFor(faculty);
    const incoming = next(f, 'chat:message');
    const res = await api(`/chat/conversations/${conversation.id}/messages`, { method: 'POST', token: student, body: { body: 'Sent without a socket' } });
    assert.equal(res.status, 201);
    assert.equal((await incoming).message.id, res.body.data.id);
  });
});

describe('chat: privacy and abuse protection', () => {
  it('an outsider cannot read, join, send to or mark someone else’s conversation', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const o = await socketFor(outsider);
    const leaked = collect(o, 'chat:message');
    assert.equal((await api(`/chat/conversations/${conversation.id}/messages`, { token: outsider })).status, 404);
    assert.equal((await api(`/chat/conversations/${conversation.id}`, { token: outsider })).status, 404);
    assert.equal((await api(`/chat/conversations/${conversation.id}/messages`, { method: 'POST', token: outsider, body: { body: 'let me in' } })).status, 404);
    assert.equal((await api(`/chat/conversations/${conversation.id}/read`, { method: 'POST', token: outsider })).status, 404);
    const join = await emit(o, 'chat:join', { conversationId: conversation.id });
    assert.equal(join.ok, false);
    assert.equal(join.error.code, 'RESOURCE_NOT_FOUND');
    assert.equal((await emit(o, 'chat:send', { conversationId: conversation.id, body: 'hi' })).ok, false);
    // Room names are never client-chosen: guessing one gives nothing.
    o.emit('join', `conversation:${conversation.id}`);
    const s = await socketFor(student);
    await emit(s, 'chat:send', { conversationId: conversation.id, body: 'Private note', clientId: 'test-msg-private-1' });
    await sleep(200);
    assert.equal(leaked.length, 0);
    assert.ok(!(await api('/chat/conversations', { token: outsider })).body.data.conversations.some((c) => c.id === conversation.id));
  });

  it('validates message payloads on the server', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const s = await socketFor(student);
    for (const body of ['', '   ', 42, null, 'x'.repeat(4001)]) {
      const ack = await emit(s, 'chat:send', { conversationId: conversation.id, body });
      assert.equal(ack.ok, false, `refused ${typeof body === 'string' ? `${body.length} chars` : body}`);
      assert.equal(ack.error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await emit(s, 'chat:send', 'not an object')).error.code, 'VALIDATION_ERROR');
    assert.equal((await emit(s, 'chat:send', { conversationId: 'conversation:../../x', body: 'hi' })).error.code, 'RESOURCE_NOT_FOUND');
    assert.equal((await emit(s, 'chat:send', { conversationId: conversation.id, body: 'ok', clientId: 'bad id!' })).error.code, 'VALIDATION_ERROR');
    assert.equal((await emit(s, 'chat:send', { conversationId: conversation.id, body: 'x'.repeat(4000) })).ok, true, '4000 characters is allowed');
  });

  it('limits how fast one account can send', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const s = await socketFor(student);
    const acks = [];
    for (let i = 0; i < 21; i += 1) acks.push(await emit(s, 'chat:send', { conversationId: conversation.id, body: `burst ${i}` }));
    assert.equal(acks.filter((a) => a.ok).length, 20);
    assert.equal(acks.at(-1).error.code, 'RATE_LIMITED');
  });

  it('a client cannot swap identity on an open connection', async () => {
    const conversation = (await open(profiles.faculty, student)).body.data;
    const s = await socketFor(student);
    s.auth = { token: 'tampered' }; // the server keeps the handshake's verified token
    const ack = await emit(s, 'chat:send', { conversationId: conversation.id, body: 'still me' });
    assert.equal(ack.message.senderId, users.student);
  });

  it('re-checks the account on every send: a suspended sender is cut off, a suspended recipient is refused', async () => {
    const conversation = (await open(profiles.faculty, outsider)).body.data;
    const [o, s] = await Promise.all([socketFor(outsider), socketFor(student)]);
    const withStudent = (await open(profiles.outsider, student)).body.data;
    await prisma.user.update({ where: { id: users.outsider }, data: { status: 'SUSPENDED' } });
    try {
      const own = await emit(o, 'chat:send', { conversationId: conversation.id, body: 'after suspension' });
      assert.equal(own.ok, false);
      assert.equal(own.error.code, 'UNAUTHENTICATED');
      const toSuspended = await emit(s, 'chat:send', { conversationId: withStudent.id, body: 'are you there?' });
      assert.equal(toSuspended.ok, false);
      assert.equal(toSuspended.error.code, 'FORBIDDEN');
      assert.equal(await prisma.chatMessage.count({ where: { body: { in: ['after suspension', 'are you there?'] } } }), 0, 'nothing stored');
    } finally {
      await prisma.user.update({ where: { id: users.outsider }, data: { status: 'ACTIVE' } });
    }
  });
});
