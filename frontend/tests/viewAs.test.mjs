import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE, composeReason, deliverToTab, isSessionSecret, receiveFromOpener, viewAsOffer } from '../src/viewAs/handoff.js';

/** A tiny window: postMessage delivers to the target's listeners with the sender as `source`, like a browser. */
function fakeWindow(origin = 'https://portal.test') {
  const listeners = new Set();
  const win = {
    origin,
    addEventListener: (type, fn) => type === 'message' && listeners.add(fn),
    removeEventListener: (type, fn) => type === 'message' && listeners.delete(fn),
    listenerCount: () => listeners.size,
    deliver: (data, source, from = origin) => listeners.forEach((fn) => fn({ data, source, origin: from })),
  };
  return win;
}
/** Wire two fake windows so a.postMessage(...) arrives at b from a, honouring targetOrigin. */
function link(sender, receiver) {
  return { postMessage: (data, targetOrigin) => { if (targetOrigin === receiver.origin) queueMicrotask(() => receiver.deliver(data, sender, sender.origin)); } };
}

const SECRET = 'A'.repeat(43);

describe('View-As tab hand-off', () => {
  let admin;
  let tab;
  beforeEach(() => {
    admin = fakeWindow();
    tab = fakeWindow();
  });

  it('delivers the secret once the new tab is ready, whichever side is first, and both sides clean up', async () => {
    const received = [];
    const toTab = link(admin, tab);
    const toAdmin = link(tab, admin);
    // The tab is identified on the admin side by the WindowProxy window.open returned.
    const tabProxy = { ...toTab };
    const openerProxy = { ...toAdmin };
    // Messages must arrive with source === the proxy each side holds for the other.
    const adminDeliver = admin.deliver;
    admin.deliver = (data, _source, from) => adminDeliver(data, tabProxy, from);
    const tabDeliver = tab.deliver;
    tab.deliver = (data, _source, from) => tabDeliver(data, openerProxy, from);

    const delivered = deliverToTab({ tab: tabProxy, token: SECRET, origin: admin.origin, win: admin, timeoutMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 20)); // the tab loads after the admin started waiting
    const stop = receiveFromOpener({ opener: openerProxy, origin: tab.origin, win: tab, onToken: (token) => received.push(token), intervalMs: 10 });
    await delivered;
    await new Promise((resolve) => setTimeout(resolve, 30));
    stop();
    assert.deepEqual(received, [SECRET], 'received exactly once');
    assert.equal(admin.listenerCount(), 0);
    assert.equal(tab.listenerCount(), 0);
  });

  it('ignores messages from another origin, another window, or with a malformed secret', async () => {
    const received = [];
    const opener = { postMessage: () => {} };
    const stop = receiveFromOpener({ opener, origin: tab.origin, win: tab, onToken: (token) => received.push(token), intervalMs: 1000 });
    tab.deliver({ type: MESSAGE.TOKEN, token: SECRET }, opener, 'https://evil.test');
    tab.deliver({ type: MESSAGE.TOKEN, token: SECRET }, { postMessage: () => {} });
    tab.deliver({ type: MESSAGE.TOKEN, token: 'short' }, opener);
    tab.deliver({ type: 'other', token: SECRET }, opener);
    assert.deepEqual(received, []);
    tab.deliver({ type: MESSAGE.TOKEN, token: SECRET }, opener);
    assert.deepEqual(received, [SECRET]);
    stop();
  });

  it('gives up with a clear error when the tab never answers', async () => {
    const tabProxy = { postMessage: () => {} };
    await assert.rejects(() => deliverToTab({ tab: tabProxy, token: SECRET, origin: admin.origin, win: admin, timeoutMs: 30 }), /did not open the View-As session in time/);
    assert.equal(admin.listenerCount(), 0);
  });

  it('only accepts 256-bit url-safe secrets', () => {
    assert.equal(isSessionSecret(SECRET), true);
    assert.equal(isSessionSecret(`${SECRET}=`), false);
    assert.equal(isSessionSecret(undefined), false);
  });
});

describe('View-As offer on the Users table', () => {
  const viewer = { viewerId: 'admin-1', canViewAs: true };
  const row = (over) => ({ id: 'u1', status: 'ACTIVE', roles: ['STUDENT'], roleDetails: [{ key: 'STUDENT', status: 'ACTIVE' }], ...over });

  it('offers students and faculty, with every persona that has a record', () => {
    assert.deepEqual(viewAsOffer(row(), viewer), { show: true, enabled: true, personas: ['STUDENT'] });
    const both = row({ roles: ['FACULTY', 'STUDENT'], roleDetails: [{ key: 'FACULTY', status: 'ACTIVE' }, { key: 'STUDENT', status: 'SIS_NOT_LINKED' }] });
    assert.deepEqual(viewAsOffer(both, viewer).personas, ['FACULTY', 'STUDENT']);
  });

  it('never offers administrators, staff/alumni-only accounts or oneself', () => {
    assert.equal(viewAsOffer(row({ roles: ['ADMIN'], roleDetails: [{ key: 'ADMIN', status: 'ACTIVE' }] }), viewer).show, false);
    assert.equal(viewAsOffer(row({ roles: ['STUDENT', 'ADMIN'] }), viewer).show, false);
    assert.equal(viewAsOffer(row({ roles: ['ALUMNI'], roleDetails: [{ key: 'ALUMNI', status: 'ACTIVE' }] }), viewer).show, false);
    assert.equal(viewAsOffer(row({ id: 'admin-1' }), viewer).show, false);
  });

  it('shows but disables it, with the reason, when it cannot be used', () => {
    assert.match(viewAsOffer(row(), { ...viewer, canViewAs: false }).reason, /users\.view_as/);
    assert.match(viewAsOffer(row({ status: 'SUSPENDED' }), viewer).reason, /suspended/);
    assert.match(viewAsOffer(row({ roleDetails: [{ key: 'STUDENT', status: 'UNLINKED' }] }), viewer).reason, /No linked/);
  });
});

describe('View-As reason', () => {
  it('uses the chosen reason, with details appended, and Other needs its own text', () => {
    assert.equal(composeReason('TROUBLESHOOTING'), 'Troubleshooting a reported issue');
    assert.equal(composeReason('SUPPORT', ' Ticket #42 '), 'Following up a support request: Ticket #42');
    assert.equal(composeReason('OTHER', ''), '');
    assert.equal(composeReason('OTHER', 'Accessibility check'), 'Accessibility check');
  });
});

describe('API client in a View-As tab', () => {
  it('sends nothing state-changing, sends the secret only from the tab that holds it, and allows ending the session', async () => {
    const store = new Map();
    globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    globalThis.localStorage = { getItem: () => 'admin-access-token', setItem: () => {}, removeItem: () => {} };
    const { assertViewAsAllows, authHeaders, viewAsStore, onViewAsEvent } = await import('../src/services/api/client.js');

    assert.deepEqual(authHeaders(), { Authorization: 'Bearer admin-access-token' }, 'a normal tab sends no View-As header');
    assert.doesNotThrow(() => assertViewAsAllows('POST', '/requests'), 'a normal tab is not restricted');

    viewAsStore.set(SECRET);
    assert.deepEqual(authHeaders(), { Authorization: 'Bearer admin-access-token', 'X-View-As-Session': SECRET });
    const blocked = [];
    const off = onViewAsEvent('blocked', (detail) => blocked.push(detail));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.throws(() => assertViewAsAllows(method, '/profile'), (e) => e.code === 'VIEW_AS_READ_ONLY');
    assert.doesNotThrow(() => assertViewAsAllows('GET', '/profile'));
    assert.doesNotThrow(() => assertViewAsAllows('DELETE', '/view-as/current'), 'End Impersonation is allowed');
    assert.throws(() => assertViewAsAllows('POST', '/view-as/current'));
    assert.equal(blocked.length, 5);
    off();
    viewAsStore.clear();
    assert.equal(viewAsStore.active(), false);
  });
});
