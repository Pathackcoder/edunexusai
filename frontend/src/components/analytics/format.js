/**
 * Number, duration and date formatting for Admin → Analytics, so every figure on every tab reads the same way.
 * Pure functions (unit-tested). A missing value is always an em dash, never a zero.
 */
export const DASH = '—';

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  if (Number.isInteger(value) || Math.abs(value) >= 100) return Math.round(value).toLocaleString('en-US');
  // Small averages keep two decimals, so 0.03 people a day is never shown as 0.
  if (Math.abs(value) < 1) return Math.abs(value) < 0.01 ? (value > 0 ? '<0.01' : '0') : String(Math.round(value * 100) / 100);
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

/** A share between 0 and 1 → "42%" (one decimal below 10%, so small shares are not all "0%"). */
export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  const percent = value * 100;
  if (percent > 0 && percent < 0.1) return '<0.1%';
  return `${percent < 10 && !Number.isInteger(percent) ? percent.toFixed(1) : Math.round(percent)}%`;
}

/** Milliseconds → "45s", "3m 20s", "1h 05m". */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return DASH;
  if (ms > 0 && ms < 1000) return '<1s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.round(hours / 24)} days`;
}

/** Change against the previous period: { text: "+12%", direction: "up" | "down" | "flat" } or null. */
export function formatChange(change) {
  if (change === null || change === undefined || Number.isNaN(change)) return null;
  const percent = Math.round(change * 100);
  if (percent === 0) return { text: '0%', direction: 'flat' };
  return { text: `${percent > 0 ? '+' : '−'}${Math.abs(percent) > 999 ? '999+' : Math.abs(percent)}%`, direction: percent > 0 ? 'up' : 'down' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "2026-11-10" → "Nov 10" (a calendar date, so no time zone is involved). */
export function formatDay(date, { year = false } = {}) {
  if (!date) return DASH;
  const [y, m, d] = String(date).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}${year ? `, ${y}` : ''}`;
}
/** 1 = Monday … 7 = Sunday for a calendar date. */
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
export const formatDayLong = (date) => `${WEEKDAYS[weekdayOf(date) - 1]}, ${formatDay(date, { year: true })}`;

export function formatRange(from, to) {
  if (!from || !to) return DASH;
  if (from === to) return formatDay(from, { year: true });
  return from.slice(0, 4) === to.slice(0, 4) ? `${formatDay(from)} – ${formatDay(to, { year: true })}` : `${formatDay(from, { year: true })} – ${formatDay(to, { year: true })}`;
}

/** 0–23 → "12 am", "9 am", "3 pm". */
export function formatHour(hour) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? 'am' : 'pm'}`;
}

/** An instant shown in the institution's time zone: "Nov 10, 3:42 PM". */
export function formatInstant(value, timeZone) {
  if (!value) return DASH;
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString('en-US');
  }
}

/** "5 minutes ago", "2 hours ago", "3 days ago". */
export function formatAgo(value, now = Date.now()) {
  if (!value) return 'never';
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Evenly spaced indexes for axis labels: at most `count` of them, always including the first and last. */
export function tickIndexes(length, count = 6) {
  if (length <= count) return Array.from({ length }, (_, index) => index);
  const step = (length - 1) / (count - 1);
  return [...new Set(Array.from({ length: count }, (_, index) => Math.round(index * step)))];
}

/** A round axis maximum at or above `value` (1, 2, 5 × a power of ten), never below 4 so small counts get a scale. */
export function niceMax(value) {
  if (!value || value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

export const PRESETS = [{ id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }, { id: 'custom', label: 'Custom' }];
