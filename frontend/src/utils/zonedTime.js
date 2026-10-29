/**
 * Times in the institution's timezone (tenants.timezone, e.g. America/New_York), independent
 * of the browser's own timezone. Inputs use "YYYY-MM-DDTHH:mm" in that zone; the server
 * stores exact UTC instants.
 */
const parts = (date, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map((p) => [p.type, p.value]));

/** Minutes the zone is ahead of UTC at that instant (negative west of UTC). */
export function zoneOffsetMinutes(date, tz) {
  const v = parts(date, tz);
  return (Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** "2026-10-20T09:00" in `tz` → ISO UTC. Handles DST transitions (a skipped hour moves forward). */
export function zonedLocalToIso(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local ?? ''));
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = guess - zoneOffsetMinutes(new Date(guess), tz) * 60000;
  const second = guess - zoneOffsetMinutes(new Date(first), tz) * 60000;
  const matches = [first, second].filter((ts) => isoToZonedLocal(new Date(ts).toISOString(), tz) === local);
  // Ambiguous (clocks go back): the first occurrence. Nonexistent (clocks go forward): the later instant.
  const ts = matches.length ? Math.min(...matches) : Math.max(first, second);
  return new Date(ts).toISOString();
}

/** ISO UTC → "YYYY-MM-DDTHH:mm" in `tz` (for datetime-local inputs). */
export function isoToZonedLocal(iso, tz) {
  if (!iso) return '';
  const v = parts(new Date(iso), tz);
  return `${v.year}-${v.month}-${v.day}T${v.hour === '24' ? '00' : v.hour}:${v.minute}`;
}

/** Human-readable time in `tz`, with the zone abbreviation. */
export function formatInZone(iso, tz, opts = {}) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', ...opts });
}

export const zoneLabel = (tz) => {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value;
    return `${tz.replace(/_/g, ' ')}${name ? ` (${name})` : ''}`;
  } catch {
    return tz;
  }
};
