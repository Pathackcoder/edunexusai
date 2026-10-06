import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Room-scheduling boundary (25Live / EMS style). Returns recurring non-course
 * reservations keyed by building code + room number. Course meetings are not part of
 * this feed: they come from the synced course sections in PostgreSQL.
 */
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'room-schedule.json');
let cache = null;

export const roomSchedulingAdapter = {
  key: 'ROOM_SCHEDULING_MOCK',
  label: 'Room Scheduling (mock feed)',
  async fetchReservations() {
    cache ??= JSON.parse(await readFile(FIXTURE, 'utf8')).reservations;
    return cache;
  },
};
