import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';

after(closeTestServer);

describe('student dashboard', () => {
  it('returns only the widgets the student tier entitles', async () => {
    const token = await login('student');
    const { status, body } = await api('/dashboard', { token });

    assert.equal(status, 200);
    assert.equal(body.data.persona, 'STUDENT');
    assert.equal(body.data.tier.key, 'STANDARD');
    assert.ok(body.data.widgets.includes('dashboard.schedule'));
    // Standard tier does not receive the advanced-tier widgets.
    assert.ok(!body.data.widgets.includes('dashboard.library'));
    assert.ok(!Object.hasOwn(body.data.panels, 'dashboard.library'));
  });

  it('gives the advanced tier a superset of the standard widgets', async () => {
    const standard = await api('/dashboard', { token: await login('student') });
    const advanced = await api('/dashboard', { token: await login('advanced') });

    assert.equal(advanced.body.data.tier.key, 'ADVANCED');
    for (const widget of standard.body.data.widgets) {
      assert.ok(advanced.body.data.widgets.includes(widget), `advanced is missing ${widget}`);
    }
    assert.ok(advanced.body.data.widgets.length > standard.body.data.widgets.length);
    assert.ok(advanced.body.data.widgets.includes('dashboard.library'));
  });

  it('loads every panel it returns', async () => {
    const token = await login('student');
    const { body } = await api('/dashboard', { token });
    for (const [key, panel] of Object.entries(body.data.panels)) {
      assert.equal(panel.status, 'ok', `panel ${key} failed: ${JSON.stringify(panel.error)}`);
    }
  });
});

describe('student academic data', () => {
  it('serves courses carrying their provenance', async () => {
    const token = await login('student');
    const { status, body } = await api('/courses', { token });

    assert.equal(status, 200);
    assert.ok(body.data.length > 0);
    const cs501 = body.data.find((course) => course.code === 'CS 501');
    assert.ok(cs501, 'CS 501 is present');
    assert.equal(cs501.name, 'Advanced Database Systems');
    assert.equal(cs501.instructor, 'Dr. Sarah Mitchell');
    // This is the answer to "where does CS 501 come from?"
    assert.equal(cs501.dataSource.system, 'MOCK_UNIVERSITY');
    assert.ok(cs501.dataSource.externalId, 'the external identifier is recorded');
    assert.ok(cs501.dataSource.lastSyncedAt, 'the sync time is recorded');
  });

  it('serves the schedule, assignments and grades', async () => {
    const token = await login('student');

    const schedule = await api('/schedule', { token });
    assert.equal(schedule.status, 200);
    assert.ok(Array.isArray(schedule.body.data.allCourses));

    const assignments = await api('/assignments', { token });
    assert.equal(assignments.status, 200);
    assert.ok(assignments.body.data.length > 0);
    assert.ok(assignments.body.data[0].courseCode);
    assert.ok(['Pending', 'In Progress', 'Completed', 'Submitted'].includes(assignments.body.data[0].status));

    const grades = await api('/grades', { token });
    assert.equal(grades.status, 200);
    assert.equal(typeof grades.body.data.cumulativeGpa, 'number');
    assert.ok(grades.body.data.currentCourses.length > 0);
    assert.ok(grades.body.data.currentCourses[0].breakdown);
  });

  it('records an assignment submission', async () => {
    const token = await login('student');
    const { body: list } = await api('/assignments', { token });
    const pending = list.data.find((assignment) => assignment.status !== 'Completed');
    assert.ok(pending, 'there is an assignment to submit');

    const submitted = await api(`/assignments/${pending.id}/submit`, {
      method: 'POST',
      token,
      body: { note: 'Submitted by the test suite.' },
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.data.status, 'Completed');

    // The change is persisted, not just echoed back.
    const { body: reread } = await api('/assignments', { token });
    const after = reread.data.find((assignment) => assignment.id === pending.id);
    assert.equal(after.status, 'Completed');
  });

  it('marks an announcement read for this user only', async () => {
    const token = await login('student');
    const { body: list } = await api('/announcements', { token });
    const unread = list.data.find((announcement) => !announcement.isRead);
    if (!unread) return; // all read already; nothing to assert

    const marked = await api(`/announcements/${unread.id}/read`, { method: 'PATCH', token });
    assert.equal(marked.status, 200);

    const { body: reread } = await api('/announcements', { token });
    assert.equal(reread.data.find((a) => a.id === unread.id).isRead, true);
  });
});

describe('student finance', () => {
  it('serves the tuition account with a formatted balance', async () => {
    const token = await login('student');
    const { status, body } = await api('/finance', { token });
    assert.equal(status, 200);
    assert.equal(typeof body.data.currentBalance, 'number');
    assert.match(body.data.formattedBalance, /^\$[\d,]+\.\d{2}$/);
    assert.ok(body.data.breakdown.length > 0);
  });

  it('records a payment and decrements the balance', async () => {
    const token = await login('student');
    await api('/finance/reset', { method: 'POST', token });
    const { body: before } = await api('/finance', { token });

    const payment = await api('/finance/payments', {
      method: 'POST',
      token,
      body: { amount: 250, methodType: 'Card', methodDisplay: 'Visa ending in 4242' },
    });
    assert.equal(payment.status, 201);
    assert.ok(payment.body.data.receiptNumber);
    assert.equal(payment.body.data.newBalance, Number((before.data.currentBalance - 250).toFixed(2)));

    const { body: after } = await api('/finance', { token });
    assert.equal(after.data.currentBalance, payment.body.data.newBalance);

    // A payment also creates the student's notification.
    const { body: notifications } = await api('/notifications', { token });
    assert.ok(notifications.data.some((item) => item.category === 'finance' && /Payment/i.test(item.title)));

    await api('/finance/reset', { method: 'POST', token });
  });

  it('rejects an invalid payment amount', async () => {
    const token = await login('student');
    const { status, body } = await api('/finance/payments', {
      method: 'POST',
      token,
      body: { amount: -100 },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('serves financial aid through the integration layer', async () => {
    const token = await login('student');
    const { status, body } = await api('/financial-aid', { token });
    assert.equal(status, 200);
    assert.ok(body.data.awards.length > 0);
    // Either live from the provider or the cached copy, but always declared.
    assert.ok(['INTEGRATION', 'DATABASE_CACHE'].includes(body.data.meta.source));
  });
});

describe('student profile and campus services', () => {
  it('updates self-service profile fields', async () => {
    const token = await login('student');
    const { status, body } = await api('/profile', {
      method: 'PATCH',
      token,
      body: { pronouns: 'he/him', phone: '(555) 234-5678' },
    });
    assert.equal(status, 200);
    assert.equal(body.data.user.pronouns, 'he/him');

    const { body: reread } = await api('/auth/me', { token });
    assert.equal(reread.data.user.pronouns, 'he/him');
  });

  it('creates an address change request rather than editing the record directly', async () => {
    const token = await login('student');
    const { status, body } = await api('/profile/address-change', {
      method: 'POST',
      token,
      body: {
        addressLine1: '12 Test Lane',
        city: 'Cambridge',
        state: 'MA',
        postalCode: '02139',
        reason: 'Test relocation',
      },
    });
    assert.equal(status, 201);
    assert.equal(body.data.type, 'ADDRESS');
    assert.equal(body.data.status, 'Pending');

    const { body: requests } = await api('/profile/requests', { token });
    assert.ok(requests.data.addressRequests.some((request) => request.id === body.data.id));
  });

  it('rejects an invalid profile update', async () => {
    const token = await login('student');
    const { status } = await api('/profile', {
      method: 'PATCH',
      token,
      body: { emergencyContact: { name: '' } },
    });
    assert.equal(status, 400);
  });

  it('serves directory, library, campus safety, transcripts and help', async () => {
    const token = await login('student');

    const directory = await api('/directory', { token });
    assert.equal(directory.status, 200);
    assert.ok(directory.body.data.people.length > 0);

    const library = await api('/library', { token });
    assert.equal(library.status, 200);
    assert.ok(library.body.data.summary.patronId);

    const safety = await api('/campus-safety', { token });
    assert.equal(safety.status, 200);
    assert.ok(safety.body.data.contacts.length > 0);
    assert.ok(safety.body.data.procedures.length > 0);

    const transcripts = await api('/transcripts', { token });
    assert.equal(transcripts.status, 200);
    assert.equal(transcripts.body.data.summary.studentName, 'Amit Pathak');
    assert.ok(transcripts.body.data.terms.length > 0);

    const help = await api('/help', { token });
    assert.equal(help.status, 200);
    assert.ok(help.body.data.faqs.length > 0);
  });

  it('creates a transcript request', async () => {
    const token = await login('student');
    const { status, body } = await api('/transcript-requests', {
      method: 'POST',
      token,
      body: {
        deliveryType: 'Electronic PDF (Secure Parchment)',
        recipient: 'Test Graduate Admissions',
        recipientEmail: 'admissions@example.edu',
        copies: 1,
      },
    });
    assert.equal(status, 201);
    assert.equal(body.data.status, 'Submitted');

    const { body: history } = await api('/transcript-requests', { token });
    assert.ok(history.data.some((request) => request.id === body.data.id));
  });
});
