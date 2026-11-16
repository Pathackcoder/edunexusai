/**
 * View-As visual language: a warm amber "support access" band, distinct from the portal's indigo brand and from
 * error red, so it reads as a deliberate mode rather than a problem. Text on it is near-black for contrast (AA+).
 */
export const viewAsTone = {
  band: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 55%, #F59E0B 100%)',
  ink: '#1F1300',
  inkSoft: 'rgba(31, 19, 0, 0.78)',
  chip: '#1F1300',
  chipInk: '#FDE68A',
  edge: '#B45309',
  surface: '#FFFBEB',
};

/** CSS custom property the shell's sticky parts offset themselves by (0px outside View-As). */
export const TOP_OFFSET_VAR = '--enx-top-offset';
export const topOffset = `var(${TOP_OFFSET_VAR}, 0px)`;

export const PERSONA_LABEL = { STUDENT: 'Student', FACULTY: 'Faculty' };

export const ENDED_REASONS = {
  ENDED_BY_ADMIN: 'You ended this View-As session.',
  ENDED_FROM_ADMIN_TAB: 'The session was ended from your administrator tab.',
  ABSOLUTE_TIMEOUT: 'The session reached its time limit.',
  IDLE_TIMEOUT: 'The session ended after a period of inactivity.',
  ACCESS_REVOKED: 'The session stopped because your View-As access changed.',
  SUBJECT_INELIGIBLE: 'The session stopped because the account can no longer be viewed (for example, it was suspended).',
};
