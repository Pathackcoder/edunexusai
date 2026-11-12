import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HEARTBEAT_MS, INPUT_IDLE_MS, TICK_MS, VISIT_IDLE_MS, classifyDevice, createTracker, resolveVisit } from '../src/analytics/core.js';
import { getTracker, setTracker, trackFeature, trackNav, trackWidgetImpression } from '../src/analytics/index.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data };
};

/** A tracker on a fake clock. `send` records every envelope; `outcome` can be changed per test. */
function harness({ visible = true, storage = memoryStorage(), userId = 'user-1' } = {}) {
  const state = { time: Date.parse('2026-11-10T15:00:00Z'), visible, outcome: 'ok', sent: [], ids: 0 };
  const tracker = createTracker({
    userId,
    now: () => state.time,
    uuid: () => `00000000-0000-4000-8000-${String(++state.ids).padStart(12, '0')}`,
    storage,
    send: async (envelope) => { state.sent.push(JSON.parse(JSON.stringify(envelope))); return state.outcome; },
    isVisible: () => state.visible,
    deviceClass: () => 'DESKTOP',
  });
  /** Let `ms` pass the way the browser would: a tick every TICK_MS, input every tick unless `idle`. */
  const pass = (ms, { idle = false } = {}) => {
    for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
      state.time += Math.min(TICK_MS, ms - elapsed);
      if (!idle && state.visible) tracker.input();
      tracker.tick();
    }
  };
  const events = () => state.sent.flatMap((envelope) => envelope.events);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { tracker, state, pass, events, settle, storage };
}
const last = (list, name) => list.filter((event) => event.name === name).at(-1);

describe('device class', () => {
  it('uses only pointer type and the shorter screen side', () => {
    assert.equal(classifyDevice({ coarsePointer: true, shortSide: 390 }), 'MOBILE');
    assert.equal(classifyDevice({ coarsePointer: true, shortSide: 820 }), 'TABLET'); // an iPad, whatever its user agent claims
    assert.equal(classifyDevice({ coarsePointer: false, shortSide: 500 }), 'DESKTOP'); // a narrow desktop window
  });
});

describe('browser visits', () => {
  it('shares one visit between tabs and starts a new one after 30 idle minutes or for another person', () => {
    const storage = memoryStorage();
    let n = 0;
    const uuid = () => `visit-${++n}`;
    const first = resolveVisit(storage, 'user-1', 1_000, uuid);
    assert.equal(resolveVisit(storage, 'user-1', 1_000 + VISIT_IDLE_MS, uuid).id, first.id); // another tab, within the window
    assert.notEqual(resolveVisit(storage, 'user-1', 1_000 + 2 * VISIT_IDLE_MS + 1, uuid).id, first.id);
    assert.notEqual(resolveVisit(storage, 'user-2', 1_000 + 2 * VISIT_IDLE_MS + 2, uuid).id, resolveVisit(storage, 'user-1', 1_000 + 2 * VISIT_IDLE_MS + 3, uuid).id);
  });
});

describe('visible time', () => {
  it('counts time only while the tab is visible and the person is active', async () => {
    const { tracker, state, pass, events, settle } = harness();
    tracker.setPage('academics.grades');
    pass(60_000);
    state.visible = false;
    tracker.visibilityChanged(); // sends page.exit with the time so far
    await settle();
    assert.equal(last(events(), 'page.exit').visibleMs, 60_000);
    pass(10 * 60_000); // ten minutes in a background tab
    state.visible = true;
    tracker.visibilityChanged();
    pass(30_000);
    tracker.tick(true);
    await settle();
    assert.equal(last(events(), 'page.ping').visibleMs, 90_000);
    assert.equal(events().filter((event) => event.name === 'page.view').length, 1); // same page view resumed
  });

  it('stops counting after five minutes without input, and resumes on input', async () => {
    const { tracker, pass, events, settle } = harness();
    tracker.setPage('dashboard');
    pass(INPUT_IDLE_MS + 10 * 60_000, { idle: true }); // visible but nobody there
    tracker.tick(true);
    await settle();
    const idle = last(events(), 'page.ping').visibleMs;
    assert.ok(idle >= INPUT_IDLE_MS - TICK_MS && idle <= INPUT_IDLE_MS + TICK_MS, `counted ${idle}`);
    tracker.input();
    pass(30_000);
    tracker.tick(true);
    await settle();
    assert.equal(last(events(), 'page.ping').visibleMs, idle + 30_000);
  });

  it('does not count a sleeping laptop', async () => {
    const { tracker, state, pass, events, settle } = harness();
    tracker.setPage('dashboard');
    pass(30_000);
    state.time += 3 * 60 * 60_000; // the lid was closed: no ticks for three hours
    tracker.tick();
    tracker.input();
    pass(15_000);
    tracker.tick(true);
    await settle();
    assert.equal(last(events(), 'page.ping').visibleMs, 45_000);
  });

  it('does not record a page opened in a background tab until it is first seen', async () => {
    const { tracker, state, pass, events, settle } = harness({ visible: false });
    tracker.setPage('campus.news');
    pass(5 * 60_000);
    tracker.tick(true);
    await settle();
    assert.equal(events().length, 0);
    state.visible = true;
    tracker.visibilityChanged();
    tracker.tick(true);
    await settle();
    assert.equal(events().filter((event) => event.name === 'page.view').length, 1);
  });

  it('closes one page view and opens another on navigation, and ignores untracked routes', async () => {
    const { tracker, pass, events, settle } = harness();
    tracker.setPage('dashboard', 'faculty');
    pass(20_000);
    tracker.setPage('faculty.courses');
    tracker.setPage('faculty.courses'); // a re-render is not a new view
    tracker.setPage(null); // e.g. a redirect-only route
    tracker.tick(true);
    await tracker.flush();
    await settle();
    const all = events();
    assert.deepEqual(all.filter((event) => event.name === 'page.view').map((event) => [event.pageKey, event.view]), [['dashboard', 'faculty'], ['faculty.courses', undefined]]);
    assert.equal(all.find((event) => event.name === 'page.exit' && event.pageKey === 'dashboard').visibleMs, 20_000);
    assert.equal(tracker.pageKey, null);
  });

  it('starts a new visit and a new page view after a long break on the same page', async () => {
    const { tracker, state, pass, events, settle } = harness();
    tracker.setPage('dashboard');
    pass(15_000);
    await tracker.flush();
    state.time += VISIT_IDLE_MS + 60_000;
    tracker.input();
    tracker.nav('academics.grades', 'SIDEBAR');
    await tracker.flush();
    await tracker.flush();
    await settle();
    assert.equal(new Set(state.sent.map((envelope) => envelope.visitId)).size, 2);
    assert.equal(events().filter((event) => event.name === 'page.view').length, 2);
  });
});

describe('sending', () => {
  it('sends an envelope with only the fixed fields', async () => {
    const { tracker, state } = harness();
    tracker.setPage('dashboard');
    tracker.nav('academics.grades', 'SIDEBAR');
    tracker.feature('chat.opened', 'INBOX');
    await tracker.flush();
    const [envelope] = state.sent;
    assert.deepEqual(Object.keys(envelope).sort(), ['deviceClass', 'events', 'schemaVersion', 'sentAt', 'visitId', 'visitStartedAt']);
    for (const event of envelope.events) {
      for (const key of Object.keys(event)) assert.ok(['eventId', 'at', 'name', 'pageViewId', 'pageKey', 'view', 'visibleMs', 'targetKey', 'source', 'widgetKey', 'featureKey', 'action'].includes(key), key);
    }
    assert.equal(tracker.queueLength, 0);
  });

  it('keeps the queue when the sign-in has expired and never retries at once', async () => {
    const { tracker, state } = harness();
    state.outcome = 'auth';
    tracker.setPage('dashboard');
    await tracker.flush();
    await tracker.flush(); // paused: no second request
    assert.equal(state.sent.length, 1);
    assert.equal(tracker.queueLength, 1);
    state.outcome = 'ok';
    state.time += 61_000;
    await tracker.flush();
    assert.equal(tracker.queueLength, 0);
    assert.equal(state.sent[1].events[0].eventId, state.sent[0].events[0].eventId); // same ids: the server stores them once
  });

  it('backs off after a failure and caps the queue', async () => {
    const { tracker, state } = harness();
    state.outcome = 'error';
    tracker.setPage('dashboard');
    for (let index = 0; index < 400; index += 1) tracker.nav('academics.grades', 'SIDEBAR');
    await tracker.flush();
    const attempts = state.sent.length;
    await tracker.flush();
    assert.equal(state.sent.length, attempts);
    assert.ok(tracker.queueLength <= 200);
  });

  it('stops for good and forgets its queue when the server says collection is off', async () => {
    const { tracker, state, storage } = harness();
    state.outcome = 'disabled';
    tracker.setPage('dashboard');
    await tracker.flush();
    assert.equal(tracker.enabled, false);
    assert.equal(tracker.queueLength, 0);
    tracker.nav('academics.grades', 'SIDEBAR');
    tracker.setPage('academics.grades');
    await tracker.flush();
    assert.equal(state.sent.length, 1);
    assert.ok(![...storage.data.keys()].some((key) => key.includes('spool')));
  });

  it('keeps unsent events for the same person\'s next load, and never hands them to someone else', async () => {
    const storage = memoryStorage();
    const first = harness({ storage });
    first.state.outcome = 'error';
    first.tracker.setPage('dashboard');
    first.pass(20_000);
    first.tracker.closing();
    await first.settle();
    assert.ok([...storage.data.keys()].some((key) => key.endsWith('spool.user-1')));

    const stranger = harness({ storage, userId: 'user-2' });
    assert.equal(stranger.tracker.queueLength, 0);

    const again = harness({ storage });
    assert.ok(again.tracker.queueLength >= 2);
    await again.tracker.flush();
    assert.ok(again.events().some((event) => event.name === 'page.exit' && event.visibleMs === 20_000));
    assert.ok(![...storage.data.keys()].some((key) => key.endsWith('spool.user-1')));
  });
});

describe('widgets and the public helpers', () => {
  it('counts a widget impression once per page view and nothing inside Studio', async () => {
    const { tracker, events } = harness();
    tracker.setPage('dashboard');
    tracker.widgetImpression('dashboard.schedule');
    tracker.widgetImpression('dashboard.schedule');
    tracker.pauseWidgets(true);
    tracker.widgetImpression('dashboard.tuition');
    tracker.widgetInteract('dashboard.tuition', 'LINK');
    tracker.pauseWidgets(false);
    tracker.setPage('campus.overview');
    tracker.setPage('dashboard');
    tracker.widgetImpression('dashboard.schedule');
    await tracker.flush();
    assert.equal(events().filter((event) => event.name === 'widget.impression').length, 2);
    assert.equal(events().filter((event) => event.name === 'widget.interact').length, 0);
  });

  it('drops anything that is not in the catalogue, and is silent without a tracker', async () => {
    setTracker(null);
    trackNav('/academics/grades', 'SIDEBAR'); // no tracker: nothing happens, nothing throws
    const { tracker, events } = harness();
    tracker.setPage('dashboard');
    setTracker(tracker);
    trackNav('/academics/grades?student=42', 'SIDEBAR');
    trackNav('/somewhere/else', 'SIDEBAR');
    trackNav('https://example.com', 'SIDEBAR');
    trackNav('app.campuscore', 'SIDEBAR');
    trackFeature('chat.opened', 'INBOX');
    trackFeature('chat.opened', 'what I typed');
    trackFeature('chat.message_sent'); // recorded by the server only
    trackFeature('made.up');
    trackWidgetImpression('cms.1234');
    await tracker.flush();
    setTracker(null);
    assert.equal(getTracker(), null);
    const sent = events().filter((event) => event.name !== 'page.view');
    assert.deepEqual(sent.map((event) => event.targetKey ?? event.featureKey), ['academics.grades', 'app.campuscore', 'chat.opened']);
    assert.ok(!JSON.stringify(sent).includes('42'));
  });

  it('sends a heartbeat only when visible time has grown', async () => {
    const { tracker, pass, events, settle } = harness();
    tracker.setPage('dashboard');
    pass(HEARTBEAT_MS);
    tracker.tick(true);
    tracker.tick(true);
    await settle();
    assert.equal(events().filter((event) => event.name === 'page.ping').length, 1);
  });
});
