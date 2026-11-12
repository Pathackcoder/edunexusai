import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAgo, formatChange, formatDay, formatDuration, formatHour, formatNumber, formatPercent, formatRange, niceMax, tickIndexes, weekdayOf } from '../src/components/analytics/format.js';

describe('analytics formatting', () => {
  it('shows a withheld or missing value as a dash, never as zero', () => {
    for (const format of [formatNumber, formatPercent, formatDuration]) {
      assert.equal(format(null), '—');
      assert.equal(format(undefined), '—');
    }
    assert.equal(formatNumber(0), '0');
    assert.equal(formatChange(null), null);
  });

  it('formats counts, shares and durations consistently', () => {
    assert.equal(formatNumber(12345), '12,345');
    assert.equal(formatNumber(21.46), '21.5');
    assert.equal(formatNumber(1234.6), '1,235');
    assert.equal(formatNumber(0.0333), '0.03'); // a small average is never rounded to 0
    assert.equal(formatNumber(0.004), '<0.01');
    assert.equal(formatNumber(2), '2');
    assert.equal(formatPercent(0.4237), '42%');
    assert.equal(formatPercent(0.034), '3.4%');
    assert.equal(formatPercent(0.0004), '<0.1%');
    assert.equal(formatPercent(1), '100%');
    assert.equal(formatDuration(400), '<1s');
    assert.equal(formatDuration(45_000), '45s');
    assert.equal(formatDuration(84_000), '1m 24s');
    assert.equal(formatDuration(120_000), '2m');
    assert.equal(formatDuration(3_900_000), '1h 05m');
  });

  it('describes change against the previous period', () => {
    assert.deepEqual(formatChange(0.124), { text: '+12%', direction: 'up' });
    assert.deepEqual(formatChange(-0.5), { text: '−50%', direction: 'down' });
    assert.deepEqual(formatChange(0.001), { text: '0%', direction: 'flat' });
    assert.equal(formatChange(25).text, '+999+%');
  });

  it('treats report dates as calendar dates, whatever the browser time zone', () => {
    assert.equal(formatDay('2026-11-01'), 'Nov 1');
    assert.equal(formatDay('2026-03-08', { year: true }), 'Mar 8, 2026');
    assert.equal(weekdayOf('2026-11-09'), 1); // a Monday
    assert.equal(weekdayOf('2026-11-08'), 7); // a Sunday
    assert.equal(formatRange('2026-10-13', '2026-11-11'), 'Oct 13 – Nov 11, 2026');
    assert.equal(formatRange('2025-12-20', '2026-01-05'), 'Dec 20, 2025 – Jan 5, 2026');
    assert.equal(formatHour(0), '12 am');
    assert.equal(formatHour(13), '1 pm');
  });

  it('describes freshness in plain words', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    assert.equal(formatAgo(null, now), 'never');
    assert.equal(formatAgo('2026-11-11T11:59:30Z', now), 'just now');
    assert.equal(formatAgo('2026-11-11T11:40:00Z', now), '20 minutes ago');
    assert.equal(formatAgo('2026-11-11T07:00:00Z', now), '5 hours ago');
    assert.equal(formatAgo('2026-11-08T12:00:00Z', now), '3 days ago');
  });

  it('chooses round axis limits and a few evenly spaced labels', () => {
    assert.equal(niceMax(0), 4);
    assert.equal(niceMax(37), 50);
    assert.equal(niceMax(140), 200);
    assert.equal(niceMax(1000), 1000);
    assert.deepEqual(tickIndexes(4), [0, 1, 2, 3]);
    const ticks = tickIndexes(90, 7);
    assert.equal(ticks[0], 0);
    assert.equal(ticks.at(-1), 89);
    assert.ok(ticks.length <= 7);
  });
});
