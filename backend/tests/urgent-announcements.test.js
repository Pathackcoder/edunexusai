import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { api, closeTestServer, getTestServer, login, DEMO } from './helpers/testEnv.js';

/**
 * Urgent announcements: an urgent Communication Center broadcast must be acknowledged by each recipient.
 * Recipients get a realtime signal, a pending entry until they press OK, and the acknowledgement is
 * recorded once; nobody else can see or acknowledge it. Over real HTTP and a real socket.
 */

let prisma;
let origin;
let tokens;
const sockets = [];
const createdTitles = [];

const send = (body) => {
  createdTitles.push(body.title);
  return api('/admin/broadcasts', { method: 'POST', token: tokens.admin, body: { action: 'SEND', category: 'campus', channels: ['IN_APP'], audienceLabel: 'Selected people', ...body } });
};
const pending = async (persona) => (await api('/notifications/urgent/pending', { token: tokens[persona] })).body.data;
const acknowledge = (persona, id) => api(`/notifications/urgent/${id}/acknowledge`, { method: 'POST', token: tokens[persona] });
const socketFor = (token) => new Promise((resolve, reject) => {
  const socket = connect(origin, { path: '/socket.io', transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
  sockets.push(socket);
  socket.once('connect', () => resolve(socket));
  socket.once('connect_error', reject);
});
const next = (socket, event, ms = 2000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});

async function cleanUp() {
  if (!createdTitles.length) return;
  const rows = await prisma.communicationBroadcast.findMany({ where: { title: { in: createdTitles } }, select: { id: true } });
  const ids = rows.map((row) => row.id);
  await prisma.notification.deleteMany({ where: { sourceType: 'BROADCAST', sourceRefId: { in: ids } } });
  await prisma.communicationBroadcast.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  ({ origin } = await getTestServer());
  ({ prisma } = await import('../src/db/prisma.js'));
  const [student, advanced, faculty, admin] = await Promise.all(['student', 'advanced', 'faculty', 'admin'].map(login));
  tokens = { student, advanced, faculty, admin };
});

after(async () => {
  for (const socket of sockets) socket.disconnect();
  await cleanUp();
  await closeTestServer();
});

describe('urgent announcements', () => {
  const title = `Urgent test ${Date.now()}`;

  it('reaches every selected student, live and as a pending popup', async () => {
    const socket = await socketFor(tokens.student);
    const signal = next(socket, 'notifications:urgent');
    const sent = await send({ title, message: 'Shelter in place.', priority: 'urgent', audienceType: 'INDIVIDUAL', audienceValue: `${DEMO.student.email}, ${DEMO.advanced.email}` });
    assert.equal(sent.status, 201);
    const row = sent.body.data.sent.find((item) => item.title === title);
    assert.equal(row.recipients, 2);
    assert.equal(row.acknowledgementsRequired, 2);
    assert.equal(row.acknowledgedCount, 0);
    await signal;

    for (const persona of ['student', 'advanced']) {
      const mine = (await pending(persona)).filter((item) => item.title === title);
      assert.equal(mine.length, 1, `${persona} has the announcement pending`);
      assert.equal(mine[0].message, 'Shelter in place.');
    }
    assert.equal((await pending('faculty')).filter((item) => item.title === title).length, 0, 'not targeted: nothing pending');
  });

  it('is acknowledged once, only by its recipient, and does not come back', async () => {
    const [mine] = (await pending('student')).filter((item) => item.title === title);
    assert.equal((await acknowledge('advanced', mine.id)).status, 404, 'another student cannot acknowledge it');
    assert.equal((await acknowledge('admin', mine.id)).status, 404, 'neither can an administrator');

    const first = await acknowledge('student', mine.id);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.alreadyAcknowledged, false);
    const again = await acknowledge('student', mine.id);
    assert.equal(again.body.data.alreadyAcknowledged, true);
    assert.equal(again.body.data.acknowledgedAt, first.body.data.acknowledgedAt);

    assert.equal((await pending('student')).filter((item) => item.title === title).length, 0);
    assert.equal((await pending('advanced')).filter((item) => item.title === title).length, 1, 'still pending for the other student');

    const stored = await prisma.notification.findUnique({ where: { id: mine.id } });
    assert.ok(stored.acknowledgedAt && stored.isRead);
    const audit = await prisma.auditLog.count({ where: { action: 'URGENT_ANNOUNCEMENT_ACKNOWLEDGED', actorUserId: stored.userId, entityId: stored.sourceRefId } });
    assert.equal(audit, 1, 'recorded in the audit trail once');

    const list = await api('/admin/broadcasts', { token: tokens.admin });
    assert.equal(list.body.data.sent.find((item) => item.title === title).acknowledgedCount, 1);
  });

  it('leaves ordinary broadcasts as plain notifications', async () => {
    const plain = `Plain test ${Date.now()}`;
    const sent = await send({ title: plain, message: 'Career fair Friday.', priority: 'high', audienceType: 'INDIVIDUAL', audienceValue: DEMO.student.email });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.data.sent.find((item) => item.title === plain).acknowledgedCount, null);
    assert.equal((await pending('student')).filter((item) => item.title === plain).length, 0);
    const bell = await api('/notifications', { token: tokens.student });
    assert.ok(bell.body.data.some((item) => item.title === plain), 'still in the notification list');
  });

  it('is not available to students to send', async () => {
    const attempt = await api('/admin/broadcasts', { method: 'POST', token: tokens.student, body: { action: 'SEND', title: 'x', message: 'x', priority: 'urgent', audienceType: 'ALL_STUDENTS' } });
    assert.equal(attempt.status, 403);
  });
});
