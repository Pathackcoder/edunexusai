/** Small helpers shared by the Nexora tool files. Times are always shown in the institution's time zone. */

export const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DAY_NAMES = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

export function formatWhen(value, tz) {
  if (!value) return null;
  return new Date(value).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz });
}

/** YYYY-MM-DD of an instant in a time zone. */
export function localDate(value, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function localHour(value, tz) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(value)));
}

export function localDayCode(value, tz) {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(value));
  return short.slice(0, 3).toUpperCase();
}

export const addDaysIso = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A read that found nothing to show for a reason the person should hear (never invented data). */
export const unavailable = (reason, extra = {}) => ({ data: { available: false, reason, ...extra } });

export const requiresStudent = (auth) => (auth.studentProfileId ? null : 'STUDENT_PROFILE');
export const requiresFaculty = (auth) => (auth.facultyProfileId ? null : 'FACULTY_PROFILE');

/** What a CampusCore state means for the person, in words. */
export function sisReason(state, what) {
  switch (state) {
    case 'UNMAPPED':
      return `Your portal account is not linked to a CampusCore record yet, so your ${what} cannot be shown. The registrar can link it.`;
    case 'NOT_A_STUDENT':
      return `Your account is linked to a CampusCore faculty record, so there is no student ${what} to show.`;
    case 'NOT_FACULTY':
      return `Your account is not linked to a CampusCore faculty record, so there is no teaching ${what} to show.`;
    case 'NOT_CONFIGURED':
      return `CampusCore SIS is not connected to this portal, so your ${what} cannot be looked up.`;
    default:
      return `CampusCore SIS is not reachable right now, so your ${what} cannot be looked up. Please try again shortly.`;
  }
}

/** What a Moodle status means for the person, in words. */
export function moodleReason(status) {
  if (status === 'NOT_LINKED') return 'Your portal account is not linked to a Moodle account yet.';
  if (status === 'SUSPENDED') return 'Your Moodle account link is suspended.';
  if (status === 'NOT_CONFIGURED') return 'Moodle is not connected to this portal.';
  return 'Moodle is not reachable right now. Please try again shortly.';
}

export const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(' ');
