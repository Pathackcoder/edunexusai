/**
 * Shapes CampusCore canonical data (from /sis/*) into the props the existing portal
 * components already use, so pages keep their design while the data source changes.
 */
const DAY = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
const COLORS = ['#4651DE', '#0E9F6E', '#C2410C', '#7A4FD8', '#0891B2', '#BE185D'];

/** One timetable entry per distinct meeting time of each class (TimetableGrid shape). */
export function toTimetableCourses(items = []) {
  const out = [];
  items.forEach((s, index) => {
    const groups = new Map();
    for (const m of s.meetings ?? []) {
      const key = `${m.start}-${m.end}-${m.location ?? ''}`;
      const g = groups.get(key) ?? { start: m.start, end: m.end, location: m.location, days: [] };
      g.days.push(DAY[m.day] ?? m.day);
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      out.push({
        id: `${s.source.id}-${key}`,
        code: s.courseCode,
        name: s.courseTitle,
        credits: s.credits,
        days: g.days,
        time: `${g.start} – ${g.end}`,
        room: g.location ?? 'Room not listed',
        instructor: s.instructors?.join(', ') || 'Instructor not listed',
        description: `Section ${s.sectionCode} · ${s.enrollment?.status ?? s.status}${s.enrollment?.waitlistPosition ? ` (waitlist #${s.enrollment.waitlistPosition})` : ''}`,
        color: COLORS[index % COLORS.length],
      });
    }
  });
  return out;
}

/** Today's meetings. Meeting times are institution-local, so "today" is decided in the institution's timezone. */
export function todaysClasses(items = [], now = new Date(), timeZone = undefined) {
  const today = now.toLocaleDateString('en-US', { weekday: 'short', timeZone }).slice(0, 3).toUpperCase();
  return items
    .flatMap((s) => (s.meetings ?? []).filter((m) => m.day === today).map((m) => ({ id: `${s.source.id}-${m.start}`, code: s.courseCode, name: s.courseTitle, time: `${m.start} – ${m.end}`, start: m.start, room: m.location, instructor: s.instructors?.join(', ') })))
    .sort((a, b) => a.start.localeCompare(b.start));
}

const CATEGORY = { DEADLINE: 'Deadline', HOLIDAY: 'Holiday', EXAM: 'Exam', REGISTRATION: 'Registration', TERM: 'Term', EVENT: 'Event' };
/** CampusCore calendar events in the shape CalendarGrid / CalendarEventModal use. */
export const toCalendarEvents = (events = []) =>
  events.map((e) => ({
    id: e.id,
    title: e.title,
    date: e.startDate ?? e.date,
    endDate: e.endDate ?? null,
    category: CATEGORY[e.category] ?? e.category ?? 'Event',
    description: e.description ?? '',
    isImportant: e.category === 'DEADLINE',
  }));

export const pretty = (value) => (value ? String(value).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');
