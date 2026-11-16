import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRESENCE_HEARTBEAT_MS, PRESENCE_INPUT_IDLE_MS, createPresence } from '../src/analytics/presence.js';
import { createTracker } from '../src/analytics/core.js';
import { formatBucket } from '../src/components/analytics/format.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
};

/** One or more tabs of the same person on a shared fake clock and shared storage. */
function browser({ visible = true } = {}) {
  const state = { time: Date.parse('2026-11-12T15:00:00Z'), sent: 0, outcome: 'ok' };
  const storage = memoryStorage();
  const tab = (tabState = { visible }) => {
    const presence = createPresence({ userId: 'u1', now: () => state.time, storage, isVisible: () => tabState.visible, send: async () => { state.sent += 1; return state.outcome; } });
    return { presence, tabState };
  };
  return { state, tab };
}

describe('live-users heartbeat', () => {
  it('reports at once when the portal opens, then every 30 seconds while in use', async () => {
    const { state, tab } = browser();
    const { presence } = tab();
    await presence.start();
    assert.equal(state.sent, 1);
    for (let index = 0; index < 4; index += 1) {
      state.time += PRESENCE_HEARTBEAT_MS;
      presence.input();
      await presence.tick();
    }
    assert.equal(state.sent, 5);
  });

  it('several tabs of one person share one heartbeat', async () => {
    const { state, tab } = browser();
    const tabs = [tab(), tab(), tab()];
    for (const { presence } of tabs) await presence.start();
    assert.equal(state.sent, 1);
    for (let round = 0; round < 4; round += 1) {
      state.time += PRESENCE_HEARTBEAT_MS;
      for (const { presence } of tabs) { presence.input(); await presence.tick(); }
    }
    assert.equal(state.sent, 5); // one per 30 seconds, not three
  });

  it('sends nothing from a hidden tab or an idle screen, and reports again when the tab comes back', async () => {
    const { state, tab } = browser();
    const { presence, tabState } = tab();
    await presence.start();
    tabState.visible = false;
    state.time += PRESENCE_HEARTBEAT_MS;
    await presence.tick();
    assert.equal(state.sent, 1);
    tabState.visible = true;
    await presence.visibilityChanged();
    assert.equal(state.sent, 2);
    state.time += PRESENCE_INPUT_IDLE_MS; // nobody touched anything for 5 minutes
    await presence.tick();
    assert.equal(state.sent, 2);
  });

  it('stops when the server says collection is off, and on sign-out', async () => {
    const { state, tab } = browser();
    state.outcome = 'disabled';
    const { presence } = tab();
    await presence.start();
    assert.equal(presence.enabled, false);
    state.outcome = 'ok';
    const second = tab().presence;
    second.stop();
    state.time += 60_000;
    await second.tick();
    assert.equal(state.sent, 1);
  });
});

describe('browser and system on each batch', () => {
  it('sends only the category keys', async () => {
    const sent = [];
    const tracker = createTracker({ userId: 'u1', now: () => Date.parse('2026-11-12T15:00:00Z'), uuid: (() => { let id = 0; return () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`; })(), storage: memoryStorage(), send: async (envelope) => { sent.push(envelope); return 'ok'; }, isVisible: () => true, deviceClass: () => 'DESKTOP', agent: () => ({ browser: 'FIREFOX', os: 'LINUX' }) });
    tracker.setPage('dashboard');
    await tracker.flush();
    assert.equal(sent[0].browser, 'FIREFOX');
    assert.equal(sent[0].os, 'LINUX');
    assert.ok(!JSON.stringify(sent[0]).includes('Mozilla'));
  });
});

describe('timeline labels', () => {
  it("are in the institution's time zone", () => {
    assert.equal(formatBucket('2026-11-12T20:00:00Z', 'America/New_York', '24h'), '3:00 PM');
    assert.equal(formatBucket('2026-11-12T20:00:00Z', 'UTC', '7d'), 'Thu 8 PM');
  });
});
