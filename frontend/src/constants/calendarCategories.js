/**
 * Presentation config for the academic calendar: the label and colour each category is
 * drawn with. This is UI styling, not institutional data, so it stays in the frontend —
 * unlike the events themselves, which come from GET /api/v1/calendar.
 *
 * `tone` maps onto the theme's soft tones (see theme/tones.js).
 */
export const calendarCategories = [
  { id: 'all', label: 'All Categories', tone: 'primary', color: '#4651DE' },
  { id: 'academic', label: 'Academic', tone: 'primary', color: '#343EBF', bg: '#EEF0FD' },
  { id: 'registration', label: 'Registration', tone: 'purple', color: '#6139BA', bg: '#F3EEFC' },
  { id: 'examination', label: 'Examination', tone: 'danger', color: '#A82A2A', bg: '#FCEDED' },
  { id: 'holiday', label: 'Holiday & Recess', tone: 'success', color: '#0C6644', bg: '#E8F6EF' },
  { id: 'administrative', label: 'Administrative', tone: 'warning', color: '#8A5200', bg: '#FDF4E5' },
];

/** Tone for an event category; unknown categories read as academic. */
export const categoryTone = (category) =>
  calendarCategories.find((cat) => cat.id === category && cat.id !== 'all')?.tone ?? 'primary';
