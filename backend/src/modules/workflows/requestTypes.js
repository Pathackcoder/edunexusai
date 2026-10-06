/**
 * Request catalogue: the kinds of thing a student or faculty member can ask an
 * administrator for. One table (service_requests), one queue, one decision path —
 * this list only decides who may file which request and what the form asks for.
 *
 * `sourceType` marks types whose decision is applied back to a domain record
 * (see decisionHandlers in requestService.js). Those are created by their own screens
 * (Personal Information, Transcripts, Interventions) and are not offered in the generic
 * "New request" form (`generic: false`).
 */
export const REQUEST_TYPES = {
  ADDRESS_CHANGE: {
    label: 'Address of record change',
    category: 'Profile',
    roles: ['STUDENT'],
    sourceType: 'PROFILE_CHANGE',
    generic: false,
  },
  NAME_CHANGE: {
    label: 'Legal name change',
    category: 'Profile',
    roles: ['STUDENT'],
    sourceType: 'PROFILE_CHANGE',
    generic: false,
  },
  TRANSCRIPT: {
    label: 'Official transcript',
    category: 'Records',
    roles: ['STUDENT'],
    sourceType: 'TRANSCRIPT',
    generic: false,
  },
  STUDENT_REFERRAL: {
    label: 'Student support referral',
    category: 'Student Success',
    roles: ['FACULTY'],
    sourceType: 'INTERVENTION',
    generic: false,
  },
  ENROLLMENT_VERIFICATION: {
    label: 'Enrollment verification letter',
    category: 'Records',
    roles: ['STUDENT'],
    generic: true,
    fields: [
      { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: ['Employer', 'Visa / immigration', 'Insurance', 'Loan deferment', 'Other'] },
      { key: 'deliverTo', label: 'Deliver to (email)', type: 'text', required: true },
    ],
  },
  EMERGENCY_CONTACT_VERIFICATION: {
    label: 'Emergency contact update (verified)',
    category: 'Profile',
    roles: ['STUDENT'],
    generic: true,
    fields: [
      { key: 'contactName', label: 'Contact name', type: 'text', required: true },
      { key: 'relationship', label: 'Relationship', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'text', required: true },
    ],
  },
  FEE_WAIVER: {
    label: 'Fee waiver / payment extension',
    category: 'Finance',
    roles: ['STUDENT'],
    generic: true,
    fields: [
      { key: 'amount', label: 'Amount (USD)', type: 'text', required: false },
      { key: 'reasonType', label: 'Reason', type: 'select', required: true, options: ['Financial hardship', 'Billing error', 'Late aid disbursement', 'Other'] },
    ],
  },
  COURSE_OVERRIDE: {
    label: 'Course registration override',
    category: 'Academics',
    roles: ['STUDENT'],
    generic: true,
    fields: [
      { key: 'courseCode', label: 'Course code', type: 'text', required: true },
      { key: 'overrideType', label: 'Override', type: 'select', required: true, options: ['Prerequisite', 'Capacity', 'Time conflict', 'Credit overload'] },
    ],
  },
  SYLLABUS_REVISION: {
    label: 'Curriculum / syllabus revision',
    category: 'Content',
    roles: ['FACULTY'],
    generic: true,
    fields: [{ key: 'courseCode', label: 'Course code', type: 'text', required: true }],
  },
  ROOM_BOOKING: {
    label: 'Room or facility booking',
    category: 'Facilities',
    roles: ['FACULTY'],
    generic: true,
    fields: [
      { key: 'room', label: 'Room / building', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time window', type: 'text', required: true },
    ],
  },
  EQUIPMENT: {
    label: 'Teaching technology / equipment',
    category: 'Facilities',
    roles: ['FACULTY'],
    generic: true,
    fields: [{ key: 'item', label: 'Item needed', type: 'text', required: true }],
  },
  LEAVE: {
    label: 'Leave / class cancellation',
    category: 'HR',
    roles: ['FACULTY'],
    generic: true,
    fields: [
      { key: 'from', label: 'From', type: 'date', required: true },
      { key: 'to', label: 'To', type: 'date', required: true },
    ],
  },
  ANNOUNCEMENT_APPROVAL: {
    label: 'Campus-wide announcement approval',
    category: 'Announcements',
    roles: ['STUDENT', 'FACULTY'],
    generic: true,
    fields: [{ key: 'audience', label: 'Intended audience', type: 'text', required: true }],
  },
  GENERAL: {
    label: 'General administrative request',
    category: 'General',
    roles: ['STUDENT', 'FACULTY'],
    generic: true,
    fields: [],
  },
};

export const STATUS_LABELS = {
  PENDING: 'Pending',
  IN_REVIEW: 'In Review',
  NEEDS_INFO: 'Needs Information',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const OPEN_STATUSES = ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'];

export const typeLabel = (type) => REQUEST_TYPES[type]?.label ?? type;

export function requestTypesFor(roles) {
  return Object.entries(REQUEST_TYPES)
    .filter(([, def]) => def.generic && def.roles.some((role) => roles.includes(role)))
    .map(([key, def]) => ({ key, label: def.label, category: def.category, fields: def.fields ?? [] }));
}
