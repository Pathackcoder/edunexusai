import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, '..', 'seed-data');

/**
 * Seed fixtures are snapshots of the ORIGINAL frontend dummy modules, produced by
 * `scripts/extract-frontend-data.mjs`. Seeding from the snapshots rather than from
 * hand-typed literals is what guarantees the API returns what the existing screens
 * already render.
 */
export async function loadFixture(name) {
  return JSON.parse(await readFile(resolve(DATA_DIR, `${name}.json`), 'utf8'));
}

export const TENANT_SLUG = 'demo-university';
export const CURRENT_TERM_CODE = 'FALL2026';

/** Demo credentials. Local prototype only — documented in the README. */
export const DEMO_PASSWORDS = {
  student: 'Student@Demo2026!',
  faculty: 'Faculty@Demo2026!',
  admin: 'Admin@Demo2026!',
};

/** SIS identifiers the mock external university API uses for our demo students. */
export const SIS_IDS = {
  amit: '0098421',
  maya: '0098507',
};

/** Parse "YYYY-MM-DD" as a UTC date, so a date never shifts by a timezone. */
export const utcDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

/** Parse display dates the fixtures carry, e.g. "Sep 01, 2026" or "May 14, 2026". */
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
export const parseDisplayDate = (value) => {
  if (!value) return null;
  const iso = utcDate(value);
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return iso;
  const match = String(value).match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
};

/** "2026-09-24 14:00" -> Date (local, matching how the fixtures were authored). */
export const parseTimestamp = (value) => {
  if (!value) return null;
  const normalised = String(value).replace(' ', 'T');
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const initialsOf = (first, last) =>
  `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase();
