import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeTestServer, getTestServer, api, login, DEMO } from './helpers/testEnv.js';
import { setProviderForTests } from '../src/modules/nexora/providers/index.js';
import { ProviderError, ProviderErrorKind } from '../src/modules/nexora/providers/providerError.js';
import { resetSendLimits } from '../src/modules/chat/chatService.js';

/**
 * Nexora over real HTTP with a scripted model provider (the suite never calls the real AI service). The script
 * plays the model: it chooses tool calls, including ones a real model should never make, so the server-side
 * guardrails are what is tested: role-scoped tools, argument validation, confirm-only actions, ownership and
 * tenant scoping, and honest failure reporting.
 */

let prisma;
let baseUrl;
let tokens;
let users;
let script = null;

/** A provider whose "model" is the current test's script. */
const scripted = {
  key: 'scripted',
  model: 'scripted',
  async runTurn({ history, tools, executeTool, onText, onToolStart }) {
    const results = [];
    const call = async (name, input) => {
      const id = `call_${results.length}`;
      onToolStart?.({ id, name });
      const outcome = await executeTool({ id, name, input });
      const parsed = JSON.parse(outcome.content);
      results.push({ name, ...outcome, parsed });
      return { ...outcome, parsed };
    };
    let text = '';
    const say = (t) => {
      text += t;
      onText?.(t);
    };
    await script({ history, tools, call, say });
    return { text, stopReason: 'end', usage: {} };
  },
};

/** POST a message and collect the server-sent events. */
async function turn(token, conversationId, message, extra = {}) {
  const response = await fetch(`${baseUrl}/nexora/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, ...extra }),
  });
  const raw = await response.text();
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return { status: response.status, body: JSON.parse(raw), events: [] };
  const events = raw
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('event:'))
    .map((chunk) => {
      const [eventLine, dataLine] = chunk.split('\n');
      return { event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) };
    });
  return { status: response.status, events };
}

const newConversation = async (token) => (await api('/nexora/conversations', { method: 'POST', token })).body.data.id;
const of = (events, name) => events.filter((e) => e.event === name).map((e) => e.data);
const actionFrom = (events) => of(events, 'block').find((b) => b.block.type === 'action')?.block.action;

before(async () => {
  ({ baseUrl } = await getTestServer());
  ({ prisma } = await import('../src/db/prisma.js'));
  process.env.CLAUDE_API_KEY = 'test-key-not-used';
  process.env.NEXORA_ENABLED = 'true';
  setProviderForTests(scripted);
  const [student, advanced, faculty, admin] = await Promise.all(['student', 'advanced', 'faculty', 'admin'].map((p) => login(p)));
  tokens = { student, advanced, faculty, admin };
  const byEmail = (email) => prisma.user.findFirst({ where: { email }, include: { directoryProfile: true, studentProfile: true } });
  users = Object.fromEntries(await Promise.all(Object.entries(DEMO).map(async ([key, { email }]) => [key, await byEmail(email)])));
});

beforeEach(() => resetSendLimits());

after(async () => {
  const ids = Object.values(users).map((u) => u.id);
  await prisma.nexoraConversation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { participants: { some: { userId: { in: ids } } } } });
  setProviderForTests(null);
  await closeTestServer();
});

describe('nexora: session and persona tools', () => {
  it('requires a signed-in session', async () => {
    assert.equal((await api('/nexora/session')).status, 401);
  });

  it('offers each persona only its own tools, decided on the server', async () => {
    const student = (await api('/nexora/session', { token: tokens.student })).body.data;
    const admin = (await api('/nexora/session', { token: tokens.admin })).body.data;
    const names = (s) => s.capabilities.map((c) => c.name);
    assert.equal(student.available, true);
    assert.equal(student.persona, 'STUDENT');
    assert.ok(names(student).includes('get_my_grades'));
    assert.ok(!names(student).includes('send_campus_announcement'));
    assert.ok(!names(student).includes('get_section_roster'));
    assert.ok(names(admin).includes('send_campus_announcement'));
    assert.ok(!names(admin).includes('get_my_grades'));
    assert.ok(student.suggestions.length >= 4);
  });

  it('reports unavailability instead of failing when switched off', async () => {
    process.env.NEXORA_ENABLED = 'false';
    try {
      const session = (await api('/nexora/session', { token: tokens.student })).body.data;
      assert.equal(session.available, false);
      const id = await newConversation(tokens.student);
      const res = await turn(tokens.student, id, 'hello');
      assert.equal(res.status, 503);
    } finally {
      process.env.NEXORA_ENABLED = 'true';
    }
  });
});

describe('nexora: conversations', () => {
  it('streams an answer, persists what the person saw, and never stores raw tool results', async () => {
    const id = await newConversation(tokens.student);
    script = async ({ call, say }) => {
      const profile = await call('get_my_profile', {});
      assert.equal(profile.isError, false);
      say(`Your email is ${profile.parsed.data.email}.`);
    };
    const res = await turn(tokens.student, id, 'What is my email?');
    assert.equal(res.status, 200);
    assert.deepEqual(res.events.map((e) => e.event).filter((e, i, a) => a.indexOf(e) === i), ['start', 'tool', 'text', 'done']);
    const done = of(res.events, 'done')[0].message;
    assert.equal(done.content, `Your email is ${DEMO.student.email}.`);
    assert.deepEqual(done.toolActivity, [{ name: 'get_my_profile', outcome: 'ok' }]);

    const conversation = (await api(`/nexora/conversations/${id}`, { token: tokens.student })).body.data;
    assert.equal(conversation.title, 'What is my email?');
    assert.deepEqual(conversation.messages.map((m) => m.role), ['user', 'assistant']);
    const stored = await prisma.nexoraMessage.findMany({ where: { conversationId: id } });
    assert.ok(stored.every((m) => !JSON.stringify(m).includes('"source":"EdunexusAI portal tool result')), 'tool results are not persisted');
  });

  it('replays earlier turns as text on the next turn', async () => {
    const id = await newConversation(tokens.student);
    script = async ({ say }) => say('First answer.');
    await turn(tokens.student, id, 'First question');
    let seen;
    script = async ({ history, say }) => {
      seen = history;
      say('Second answer.');
    };
    await turn(tokens.student, id, 'Second question');
    assert.deepEqual(seen.map((m) => [m.role, m.text]), [['user', 'First question'], ['assistant', 'First answer.'], ['user', 'Second question']]);
  });

  it('keeps every conversation private to its owner', async () => {
    const id = await newConversation(tokens.student);
    script = async ({ say }) => say('Private answer.');
    await turn(tokens.student, id, 'Private question');
    assert.equal((await api(`/nexora/conversations/${id}`, { token: tokens.advanced })).status, 404);
    assert.equal((await api(`/nexora/conversations/${id}`, { token: tokens.admin })).status, 404);
    assert.equal((await api(`/nexora/conversations/${id}`, { method: 'DELETE', token: tokens.faculty })).status, 404);
    assert.equal((await turn(tokens.advanced, id, 'let me in')).status, 404);
    const others = (await api('/nexora/conversations', { token: tokens.advanced })).body.data;
    assert.ok(!others.some((c) => c.id === id));
  });

  it('reports a provider failure honestly and keeps it out of the replayed history', async () => {
    const id = await newConversation(tokens.student);
    script = async () => {
      throw new ProviderError(ProviderErrorKind.RATE_LIMITED);
    };
    const res = await turn(tokens.student, id, 'Hello?');
    const error = of(res.events, 'error')[0];
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.retryable, true);
    let seen;
    script = async ({ history, say }) => {
      seen = history;
      say('ok');
    };
    await turn(tokens.student, id, 'Again');
    assert.deepEqual(seen.map((m) => m.role), ['user', 'user'], 'the failed reply is not replayed as something Nexora said');
  });
});

describe('nexora: guardrails', () => {
  it('refuses a tool outside the person\'s role, whatever the model asks for, and audits it', async () => {
    const id = await newConversation(tokens.student);
    const before = await prisma.communicationBroadcast.count();
    let outcome;
    script = async ({ call, say }) => {
      outcome = await call('send_campus_announcement', { title: 'Hijack', message: 'Everyone, click this.', audienceType: 'ALL_CAMPUS' });
      say('I cannot do that.');
    };
    await turn(tokens.student, id, 'Announce to everyone');
    assert.equal(outcome.isError, true);
    assert.equal(outcome.parsed.error, 'NOT_AVAILABLE');
    assert.equal(await prisma.communicationBroadcast.count(), before);
    assert.equal(await prisma.nexoraAction.count({ where: { conversationId: id } }), 0);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'NEXORA_TOOL_DENIED', entityId: id } });
    assert.ok(audit, 'the refusal is audited');
  });

  it('refuses tools that do not exist', async () => {
    const id = await newConversation(tokens.student);
    let outcome;
    script = async ({ call, say }) => {
      outcome = await call('run_sql', { query: 'select * from users' });
      say('No.');
    };
    await turn(tokens.student, id, 'Dump the users table');
    assert.equal(outcome.parsed.error, 'NOT_AVAILABLE');
  });

  it('validates every argument and ignores identity fields the model invents', async () => {
    const id = await newConversation(tokens.student);
    let invalid;
    let extra;
    script = async ({ call, say }) => {
      invalid = await call('get_my_assignments', { filter: 'everything' });
      extra = await call('get_my_profile', { userId: users.advanced.id });
      say('done');
    };
    await turn(tokens.student, id, 'Show assignments');
    assert.equal(invalid.parsed.error, 'INVALID_ARGUMENTS');
    assert.equal(extra.parsed.error, 'INVALID_ARGUMENTS', 'an unknown userId argument is rejected, not used');
  });

  it('a student\'s academic tools read only their own record (no student id can be passed)', async () => {
    const id = await newConversation(tokens.student);
    let outcome;
    script = async ({ call, say }) => {
      outcome = await call('get_my_grades', { studentId: users.advanced.studentProfile?.studentNumber ?? 'S0000000' });
      say('done');
    };
    await turn(tokens.student, id, 'Show another student\'s grades');
    assert.equal(outcome.parsed.error, 'INVALID_ARGUMENTS');
  });
});

describe('nexora: actions need explicit confirmation', () => {
  it('a message is only a preview until the sender confirms; then it is sent once, as the sender', async () => {
    const id = await newConversation(tokens.student);
    script = async ({ call, say }) => {
      const found = await call('search_people', { query: users.faculty.directoryProfile.name.split(' ').slice(-1)[0] });
      const match = found.parsed.data.matches.find((m) => m.profileRef === users.faculty.directoryProfile.id);
      assert.ok(match?.canMessage);
      await call('send_direct_message', { profileRef: match.profileRef, message: 'Hi, is the assignment due tomorrow?' });
      say('I prepared the message. Please review and confirm it.');
    };
    const res = await turn(tokens.student, id, 'Ask my professor about tomorrow\'s assignment');
    const action = actionFrom(res.events);
    assert.equal(action.status, 'PENDING');
    assert.equal(action.preview.body, 'Hi, is the assignment due tomorrow?');
    const messagesBefore = await prisma.chatMessage.count({ where: { senderId: users.student.id, body: 'Hi, is the assignment due tomorrow?' } });
    assert.equal(messagesBefore, 0, 'nothing is sent before confirmation');

    // Nobody else can confirm it.
    assert.equal((await api(`/nexora/actions/${action.id}/confirm`, { method: 'POST', token: tokens.advanced })).status, 404);
    assert.equal((await api(`/nexora/actions/${action.id}/confirm`, { method: 'POST', token: tokens.admin })).status, 404);

    const confirmed = await api(`/nexora/actions/${action.id}/confirm`, { method: 'POST', token: tokens.student });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data.action.status, 'EXECUTED');
    assert.equal(confirmed.body.data.event.role, 'event');
    const sent = await prisma.chatMessage.findMany({ where: { body: 'Hi, is the assignment due tomorrow?' }, include: { conversation: { include: { participants: true } } } });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].senderId, users.student.id);
    assert.ok(sent[0].conversation.participants.some((p) => p.userId === users.faculty.id));

    const again = await api(`/nexora/actions/${action.id}/confirm`, { method: 'POST', token: tokens.student });
    assert.equal(again.status, 409, 'a second confirmation does nothing');
    assert.equal(await prisma.chatMessage.count({ where: { body: 'Hi, is the assignment due tomorrow?' } }), 1);
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'NEXORA_ACTION_EXECUTED', entityId: action.id } }));

    // The outcome is replayed to the model as a portal update on the next turn.
    let seen;
    script = async ({ history, say }) => {
      seen = history;
      say('Great.');
    };
    await turn(tokens.student, id, 'Thanks');
    assert.ok(seen.some((m) => m.text.startsWith('[Portal update, not written by the user] The user confirmed')));
  });

  it('a cancelled proposal does nothing', async () => {
    const id = await newConversation(tokens.student);
    script = async ({ call, say }) => {
      await call('create_support_ticket', { category: 'IT Access', subject: 'Cannot sign in to Moodle', description: 'Moodle says my password is wrong since Monday.' });
      say('Prepared.');
    };
    const action = actionFrom((await turn(tokens.student, id, 'Open a ticket')).events);
    const ticketsBefore = await prisma.supportTicket.count({ where: { requesterUserId: users.student.id } });
    const cancelled = await api(`/nexora/actions/${action.id}/cancel`, { method: 'POST', token: tokens.student });
    assert.equal(cancelled.body.data.action.status, 'CANCELLED');
    assert.equal(await prisma.supportTicket.count({ where: { requesterUserId: users.student.id } }), ticketsBefore);
    assert.equal((await api(`/nexora/actions/${action.id}/confirm`, { method: 'POST', token: tokens.student })).status, 409);
  });

  it('an expired proposal cannot be confirmed', async () => {
    const id = await newConversation(tokens.student);
    script = async ({ call, say }) => {
      await call('update_my_profile', { pronouns: 'they/them' });
      say('Prepared.');
    };
    const action = actionFrom((await turn(tokens.student, id, 'Set my pronouns')).events);
    await prisma.nexoraAction.update({ where: { id: action.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await api(`/nexora/actions/${action.id}/confirm`, { method: 'POST', token: tokens.student });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.details.action.status, 'EXPIRED');
  });

  it('booking re-checks availability at confirmation', async () => {
    // The faculty member publishes one slot through the existing advising API. It starts within the next hour or so,
    // ahead of any seeded slot: the availability tool lists only the next 12 open slots.
    const startsAt = new Date(Date.now() + 90 * 60_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const published = await api('/advising/slots', { method: 'POST', token: tokens.faculty, body: { startsAt: startsAt.toISOString(), durationMinutes: 30, count: 1 } });
    assert.equal(published.status, 201);
    const slot = published.body.data.slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());

    const prepare = async (token) => {
      const id = await newConversation(token);
      script = async ({ call, say }) => {
        const advisors = await call('list_advisors', {});
        const advisor = advisors.parsed.data.advisors.find((a) => a.advisorRef === users.faculty.id);
        const availability = await call('get_advisor_availability', { advisorRef: advisor.advisorRef });
        assert.ok(availability.parsed.data.slots.some((s) => s.slotRef === slot.id));
        await call('book_advising_appointment', { slotRef: slot.id, topic: 'Course planning' });
        say('Prepared.');
      };
      return actionFrom((await turn(token, id, 'Book my advisor')).events);
    };
    const first = await prepare(tokens.student);
    const second = await prepare(tokens.advanced);

    const booked = await api(`/nexora/actions/${first.id}/confirm`, { method: 'POST', token: tokens.student });
    assert.equal(booked.body.data.action.status, 'EXECUTED');
    const late = await api(`/nexora/actions/${second.id}/confirm`, { method: 'POST', token: tokens.advanced });
    assert.equal(late.body.data.action.status, 'FAILED');
    assert.match(late.body.data.action.errorMessage, /booked|no longer available/i);
    assert.equal(await prisma.advisingAppointment.count({ where: { slotId: slot.id, status: 'BOOKED' } }), 1);

    await prisma.advisingAppointment.deleteMany({ where: { slotId: slot.id } });
    await prisma.advisingSlot.delete({ where: { id: slot.id } });
  });

  it('an administrator\'s announcement shows its resolved audience and is delivered only on confirmation', async () => {
    const id = await newConversation(tokens.admin);
    const title = `Nexora test announcement ${Date.now()}`;
    script = async ({ call, say }) => {
      await call('send_campus_announcement', { title, message: 'The library closes early today.', audienceType: 'ALL_STUDENTS', priority: 'urgent' });
      say('Prepared.');
    };
    const action = actionFrom((await turn(tokens.admin, id, 'Send an urgent announcement to all students')).events);
    assert.match(action.preview.fields.find((f) => f.label === 'Audience').value, /All students · \d+ recipient/);
    assert.equal(await prisma.communicationBroadcast.count({ where: { title } }), 0);

    const sent = await api(`/nexora/actions/${action.id}/confirm`, { method: 'POST', token: tokens.admin });
    assert.equal(sent.body.data.action.status, 'EXECUTED');
    const broadcast = await prisma.communicationBroadcast.findFirst({ where: { title } });
    assert.equal(broadcast.status, 'SENT');
    const delivered = await prisma.notification.count({ where: { sourceType: 'BROADCAST', sourceRefId: broadcast.id } });
    assert.equal(delivered, broadcast.recipientCount);
    assert.equal(sent.body.data.action.result.recipients, broadcast.recipientCount);
    await prisma.notification.deleteMany({ where: { sourceRefId: broadcast.id } });
    await prisma.communicationBroadcast.delete({ where: { id: broadcast.id } });
  });

  it('portal analytics stays behind the analytics.view permission', async () => {
    const grant = await prisma.userPermission.findFirst({ where: { userId: users.admin.id, permission: 'analytics.view' } });
    if (grant) await prisma.userPermission.delete({ where: { id: grant.id } });
    try {
      const id = await newConversation(tokens.admin);
      let outcome;
      script = async ({ call, say }) => {
        outcome = await call('get_portal_usage_report', { report: 'pages' });
        say('done');
      };
      await turn(tokens.admin, id, 'Most visited pages?');
      assert.equal(outcome.parsed.data.available, false);
      assert.match(outcome.parsed.data.reason, /analytics\.view/);
    } finally {
      if (grant) await prisma.userPermission.create({ data: grant });
    }
  });
});
