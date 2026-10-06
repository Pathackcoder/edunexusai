/**
 * Presentation helpers. The existing React screens render pre-formatted strings
 * ("$4,280.00", "Sep 28, 2026"). Formatting therefore happens once, here, so every
 * endpoint returns the exact strings those screens already expect.
 */

/** Prisma Decimal | number | string -> number */
export const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  return typeof value === 'object' && typeof value.toNumber === 'function'
    ? value.toNumber()
    : Number(value);
};

export const formatCurrency = (value) => {
  const amount = toNumber(value) ?? 0;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const parts = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};

/** 2026-09-28 -> "2026-09-28" (date-only ISO, UTC, no timezone drift) */
export const toIsoDate = (date) => {
  if (!date) return null;
  const { y, m, d } = parts(date);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** 2026-09-28 -> "Sep 28, 2026" */
export const formatShortDate = (date) => {
  if (!date) return null;
  const { y, m, d } = parts(date);
  return `${MONTHS[m]} ${String(d).padStart(2, '0')}, ${y}`;
};

/** 2026-10-15 -> "October 15, 2026" */
export const formatLongDate = (date) => {
  if (!date) return null;
  const { y, m, d } = parts(date);
  return `${LONG_MONTHS[m]} ${d}, ${y}`;
};

/** Relative label used by the notification and announcement lists. */
export function formatTimeAgo(date, now = new Date()) {
  if (!date) return null;
  const then = date instanceof Date ? date : new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.floor(months / 12)} year${months < 24 ? '' : 's'} ago`;
}

/** "2026-09-24 14:00" — the timestamp format the existing screens display. */
export const formatTimestamp = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Days between now and a due date; drives the "Due in 20 days" label. */
export const daysUntil = (date, now = new Date()) => {
  if (!date) return null;
  const target = date instanceof Date ? date : new Date(date);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
};

/** Short human reference used for receipts, requests and transactions. */
export const buildReference = (prefix) => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${stamp}-${random}`;
};
