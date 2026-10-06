import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';

after(closeTestServer);

const notificationsFor = async (persona) => (await api('/notifications', { token: await login(persona) })).body.data;

describe('cross-persona request workflow', () => {
  it('student request reaches the admin queue, decision returns to the student', async () => {
    const student = await login('student');
    const admin = await login('admin');

    const created = await api('/requests', {
      method: 'POST',
      token: student,
      body: { type: 'ENROLLMENT_VERIFICATION', description: 'Letter for my landlord, please.', details: { purpose: 'Other', deliverTo: 'me@example.com' } },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, 'PENDING');
    const id = created.body.data.id;

    const queue = await api('/admin/requests?status=OPEN', { token: admin });
    assert.ok(queue.body.data.requests.some((row) => row.id === id), 'admin sees the new request');
    const adminBell = await notificationsFor('admin');
    assert.ok(adminBell.some((n) => n.title.includes('Enrollment verification')), 'admin was notified');

    // Needs-information requires a note, then the student responds.
    const noNote = await api(`/admin/requests/${id}/decision`, { method: 'PATCH', token: admin, body: { status: 'NEEDS_INFO' } });
    assert.equal(noNote.status, 400);
    const needsInfo = await api(`/admin/requests/${id}/decision`, { method: 'PATCH', token: admin, body: { status: 'NEEDS_INFO', note: 'Which address should appear?' } });
    assert.equal(needsInfo.body.data.status, 'NEEDS_INFO');

    const mine = await api(`/requests/${id}`, { token: student });
    assert.equal(mine.body.data.canRespond, true);
    const responded = await api(`/requests/${id}/respond`, { method: 'POST', token: student, body: { message: 'My campus address.' } });
    assert.equal(responded.body.data.status, 'PENDING');

    const approved = await api(`/admin/requests/${id}/decision`, { method: 'PATCH', token: admin, body: { status: 'APPROVED', note: 'Sent.' } });
    assert.equal(approved.body.data.status, 'APPROVED');
    assert.ok(approved.body.data.history.length >= 4, 'every step is in the history');

    const studentBell = await notificationsFor('student');
    assert.ok(studentBell.some((n) => n.title === 'Enrollment verification letter was approved'));
  });

  it('approving an address petition updates the record of truth', async () => {
    const student = await login('student');
    const admin = await login('admin');
    const petition = await api('/profile/address-change', {
      method: 'POST',
      token: student,
      body: { addressLine1: '12 Test Lane', city: 'Somerville', state: 'MA', postalCode: '02143' },
    });
    assert.equal(petition.status, 201);

    const queue = await api('/admin/requests?status=OPEN', { token: admin });
    const linked = queue.body.data.requests.find((row) => row.details.petition === petition.body.data.id);
    assert.ok(linked, 'petition appears in the admin queue');

    await api(`/admin/requests/${linked.id}/decision`, { method: 'PATCH', token: admin, body: { status: 'APPROVED' } });
    const profile = await api('/profile', { token: student });
    assert.equal(profile.body.data.user.address, '12 Test Lane');
    const history = await api('/profile/requests', { token: student });
    assert.equal(history.body.data.addressRequests.find((row) => row.id === petition.body.data.id).status, 'Approved');
  });

  it('faculty can file requests of their own types but not student types', async () => {
    const faculty = await login('faculty');
    const types = await api('/requests/types', { token: faculty });
    assert.ok(types.body.data.some((type) => type.key === 'ROOM_BOOKING'));
    assert.ok(!types.body.data.some((type) => type.key === 'FEE_WAIVER'));
    const refused = await api('/requests', { method: 'POST', token: faculty, body: { type: 'FEE_WAIVER', description: 'Not allowed here', details: { reasonType: 'Other' } } });
    assert.equal(refused.status, 403);
  });
});

describe('help desk tickets', () => {
  it('runs a ticket from creation to resolution with notifications both ways', async () => {
    const faculty = await login('faculty');
    const admin = await login('admin');
    const created = await api('/support/tickets', { method: 'POST', token: faculty, body: { category: 'IT Access', subject: 'Projector login', description: 'The lecture hall projector rejects my login.' } });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const queue = await api('/admin/tickets?status=OPEN', { token: admin });
    assert.ok(queue.body.data.tickets.some((row) => row.id === id));

    await api(`/support/tickets/${id}/messages`, { method: 'POST', token: admin, body: { body: 'Try the reset code on the panel.' } });
    const resolved = await api(`/support/tickets/${id}/status`, { method: 'PATCH', token: admin, body: { status: 'RESOLVED' } });
    assert.equal(resolved.body.data.status, 'RESOLVED');

    const bell = await notificationsFor('faculty');
    assert.ok(bell.some((n) => n.title.startsWith('Support replied')));
    assert.ok(bell.some((n) => n.title.includes('Resolved')));

    const other = await api(`/support/tickets/${id}`, { token: await login('student') });
    assert.equal(other.status, 403, 'another user cannot read the ticket');
  });
});

describe('forms, resources and broadcasts', () => {
  it('admin publishes a form, the student submits, the admin sees it', async () => {
    const admin = await login('admin');
    const student = await login('student');
    const form = await api('/admin/forms', {
      method: 'POST',
      token: admin,
      body: { title: 'Test pulse survey', audience: 'STUDENT', requiresReview: true, publish: true, fields: [{ label: 'How are you?', type: 'rating', required: true }] },
    });
    assert.equal(form.status, 201);
    const available = await api('/forms', { token: student });
    const target = available.body.data.forms.find((row) => row.id === form.body.data.id);
    assert.ok(target, 'student sees the published form');

    const missing = await api(`/forms/${target.id}/submissions`, { method: 'POST', token: student, body: { answers: {} } });
    assert.equal(missing.status, 400);
    const submitted = await api(`/forms/${target.id}/submissions`, { method: 'POST', token: student, body: { answers: { [target.fields[0].key]: 4 } } });
    assert.equal(submitted.status, 201);

    const submissions = await api(`/admin/forms/${target.id}/submissions`, { token: admin });
    assert.equal(submissions.body.data.submissions.length, 1);
    const reviewed = await api(`/admin/form-submissions/${submitted.body.data.id}/review`, { method: 'PATCH', token: admin, body: { status: 'APPROVED' } });
    assert.equal(reviewed.body.data.status, 'APPROVED');
  });

  it('resources respect status and audience', async () => {
    const admin = await login('admin');
    const created = await api('/resources', { method: 'POST', token: admin, body: { title: 'Faculty-only memo', audience: 'FACULTY', content: 'Hello faculty', status: 'PUBLISHED' } });
    assert.equal(created.status, 201);
    const studentView = await api('/resources', { token: await login('student') });
    assert.ok(!studentView.body.data.resources.some((row) => row.id === created.body.data.id));
    const facultyView = await api('/resources', { token: await login('faculty') });
    assert.ok(facultyView.body.data.resources.some((row) => row.id === created.body.data.id));
  });

  it('a broadcast is delivered as in-app notifications to the resolved audience', async () => {
    const admin = await login('admin');
    const result = await api('/admin/broadcasts', { method: 'POST', token: admin, body: { action: 'SEND', title: 'Test broadcast to CS 501', message: 'Room change today.', audienceType: 'COURSE', audienceValue: 'CS 501', audienceLabel: 'Course: CS 501' } });
    assert.equal(result.status, 201);
    const sent = result.body.data.sent.find((row) => row.title === 'Test broadcast to CS 501');
    assert.ok(sent.recipients > 0);
    const bell = await notificationsFor('advanced');
    assert.ok(bell.some((n) => n.title === 'Test broadcast to CS 501'), 'an enrolled student received it');
  });
});

describe('advanced features', () => {
  it('computes degree progress and recommendations from the transcript', async () => {
    const token = await login('student');
    const progress = await api('/planning/degree-progress', { token });
    assert.equal(progress.status, 200);
    assert.equal(progress.body.data.completedCredits, 48);
    assert.ok(progress.body.data.remainingRequirements.some((req) => req.title === 'Capstone or Thesis'));
    const recs = await api('/planning/recommendations', { token });
    assert.ok(recs.body.data.recommendations.length > 0);
    assert.ok(recs.body.data.recommendations.every((course) => course.reasons.length > 0), 'every recommendation is explained');
  });

  it('books, reschedules and cancels an advising appointment', async () => {
    const student = await login('student');
    const slots = (await api('/advising/slots', { token: student })).body.data;
    assert.ok(slots.length >= 2);
    const booked = await api('/advising/appointments', { method: 'POST', token: student, body: { slotId: slots[0].id, topic: 'Test plan' } });
    assert.equal(booked.status, 201);
    const twice = await api('/advising/appointments', { method: 'POST', token: student, body: { slotId: slots[0].id, topic: 'Again' } });
    assert.equal(twice.status, 400, 'a slot cannot be double-booked');
    const moved = await api(`/advising/appointments/${booked.body.data.id}/reschedule`, { method: 'POST', token: student, body: { slotId: slots[1].id } });
    assert.equal(moved.status, 200);
    const cancelled = await api(`/advising/appointments/${booked.body.data.id}/status`, { method: 'PATCH', token: student, body: { status: 'CANCELLED' } });
    assert.equal(cancelled.body.data.status, 'CANCELLED');
  });

  it('a faculty referral creates an intervention and an admin request', async () => {
    const faculty = await login('faculty');
    const students = (await api('/interventions/students', { token: faculty })).body.data;
    const created = await api('/interventions', { method: 'POST', token: faculty, body: { type: 'REFERRAL', title: 'Test referral', studentProfileId: students[0].id, notifyStudent: false } });
    assert.equal(created.status, 201);
    const queue = await api('/admin/requests?status=OPEN', { token: await login('admin') });
    assert.ok(queue.body.data.requests.some((row) => row.type === 'STUDENT_REFERRAL' && row.title.includes('Test referral')));
    const denied = await api('/interventions', { token: await login('student') });
    assert.equal(denied.status, 403, 'students cannot read intervention flags');
  });

  it('persists a dashboard layout per user', async () => {
    const token = await login('student');
    const order = ['dashboard.progress', 'dashboard.schedule'];
    const saved = await api('/dashboard/layout/student', { method: 'PUT', token, body: { order } });
    assert.deepEqual(saved.body.data.order, order);
    const dashboard = await api('/dashboard', { token });
    assert.deepEqual(dashboard.body.data.layout.slice(0, 2), order);
    await api('/dashboard/layout/student', { method: 'DELETE', token });
  });

  it('serves classrooms, campus map, opportunities, groups, achievements and the assistant', async () => {
    const token = await login('student');
    for (const path of ['/campus/classrooms', '/campus/map', '/career/opportunities', '/career/groups', '/career/achievements', '/career/portfolio', '/planning/insights', '/planning/learning-paths', '/calendar-sync']) {
      const { status } = await api(path, { token });
      assert.equal(status, 200, path);
    }
    const answer = await api('/assistant/messages', { method: 'POST', token, body: { message: 'How many credits do I have left?' } });
    assert.match(answer.body.data.messages[1].content, /credits/);
  });
});
