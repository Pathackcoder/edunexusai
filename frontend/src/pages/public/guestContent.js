/**
 * Illustrative content for the public guest site (/visit) only. It describes the kind of information a
 * prospective student looks for, without official claims: no fees, no deadlines, no rankings and no
 * statistics. Everything time-sensitive or official comes from the CMS (public audience) and the
 * academic calendar through /api/v1/public; this file is labelled as illustrative wherever it is shown.
 */

/** In-page sections, in page order. `id` is the anchor; `label` the navigation text. */
export const GUEST_SECTIONS = [
  { id: 'study', label: 'Study' },
  { id: 'admissions', label: 'Admissions' },
  { id: 'visit', label: 'Visit' },
  { id: 'news', label: 'News' },
  { id: 'dates', label: 'Dates' },
  { id: 'faq', label: 'FAQ' },
];

/** Broad areas of study (illustrative; the Admissions page holds the actual programme list). */
export const STUDY_AREAS = [
  { key: 'computing', title: 'Computing & data', text: 'Software, data and intelligent systems, from first principles to supervised projects.', levels: ['Undergraduate', 'Postgraduate'] },
  { key: 'business', title: 'Business & management', text: 'Organisations, finance and leadership, with case work drawn from practice.', levels: ['Undergraduate', 'Postgraduate'] },
  { key: 'sciences', title: 'Natural sciences', text: 'Laboratory-based study in the physical and life sciences.', levels: ['Undergraduate'] },
  { key: 'humanities', title: 'Arts & humanities', text: 'Languages, history and culture, with small-group seminars.', levels: ['Undergraduate'] },
];

/** The general route from interest to enrolment (illustrative steps, not an official procedure). */
export const APPLY_STEPS = [
  { key: 'explore', title: 'Explore programmes', text: 'Compare areas of study and entry routes.' },
  { key: 'visit', title: 'Visit or ask', text: 'Come to an open day or tour, or read the questions below.' },
  { key: 'apply', title: 'Apply', text: 'Follow the instructions on the Admissions page.' },
  { key: 'decide', title: 'Get a decision', text: 'Admitted students receive their next steps and portal access.' },
];
