/**
 * Custom forms: field types, form-definition validation (Studio saves) and submission
 * validation (the server checks every submission against the published definition; the
 * portal runs the same checks for immediate feedback). Plain JavaScript, no dependencies.
 */

export const FIELD_TYPES = {
  text: { label: 'Single-line text', maxLength: 500 },
  email: { label: 'Email', maxLength: 254 },
  textarea: { label: 'Multi-line text', maxLength: 5000 },
  phone: { label: 'Phone number', maxLength: 40 },
  number: { label: 'Number' },
  date: { label: 'Date' },
  select: { label: 'Dropdown', options: true },
  radio: { label: 'Radio buttons', options: true },
  checkboxes: { label: 'Checkboxes (choose any)', options: true },
  checkbox: { label: 'Single checkbox (yes/no)' },
};
export const FORM_LIMITS = { maxFields: 30, maxOptions: 30, maxSubmissionBytes: 40_000 };
const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const OPTION_VALUE = /^[A-Za-z0-9 _.,&()/'-]{1,100}$/;
export const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHONE = /^[+0-9 ()\-.]{5,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Hidden field that people never fill in; bots often do. */
export const HONEYPOT = 'website';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const fieldName = (label) => String(label ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40) || 'field';

/**
 * Validate and normalise a form definition. Returns { ok: true, form } or
 * { ok: false, errors: { path: message } }.
 */
export function validateFormDefinition(input, { requireRecipient = false, recipientDomains = [] } = {}) {
  const errors = {};
  const d = input && typeof input === 'object' ? input : {};
  const form = {
    name: str(d.name, 120),
    description: str(d.description, 500),
    submitLabel: str(d.submitLabel, 60) || 'Submit',
    successMessage: str(d.successMessage, 300) || 'Thank you. Your request has been sent.',
    recipientEmail: str(d.recipientEmail, 254).toLowerCase(),
    notificationSubject: str(d.notificationSubject, 150),
    fields: [],
  };
  if (!form.name) errors.name = 'Give the form a name.';
  if (form.recipientEmail && !EMAIL.test(form.recipientEmail)) errors.recipientEmail = 'Enter a valid email address.';
  else if (form.recipientEmail && recipientDomains.length && !recipientDomains.includes(form.recipientEmail.split('@')[1])) errors.recipientEmail = `Use an address at ${recipientDomains.join(' or ')}.`;
  if (requireRecipient && !form.recipientEmail) errors.recipientEmail = 'Set the notification recipient before publishing.';
  const fields = Array.isArray(d.fields) ? d.fields : [];
  if (!fields.length) errors.fields = 'Add at least one field.';
  if (fields.length > FORM_LIMITS.maxFields) errors.fields = `A form can have at most ${FORM_LIMITS.maxFields} fields.`;
  const names = new Set();
  fields.slice(0, FORM_LIMITS.maxFields).forEach((f, i) => {
    const at = `fields[${i}]`;
    const type = FIELD_TYPES[f?.type] ? f.type : null;
    if (!type) { errors[`${at}.type`] = 'Unknown field type.'; return; }
    const field = {
      id: str(f.id, 40) || `f${i + 1}`,
      type,
      label: str(f.label, 120),
      name: str(f.name, 40),
      placeholder: str(f.placeholder, 120),
      helpText: str(f.helpText, 200),
      required: f.required === true,
    };
    if (!field.label) errors[`${at}.label`] = 'Every field needs a label.';
    if (!NAME.test(field.name)) errors[`${at}.name`] = 'Use lowercase letters, numbers and underscores, starting with a letter.';
    else if (names.has(field.name) || field.name === HONEYPOT) errors[`${at}.name`] = `"${field.name}" is already used.`;
    names.add(field.name);
    if (FIELD_TYPES[type].maxLength) {
      const max = Number(f.maxLength) || FIELD_TYPES[type].maxLength;
      field.maxLength = Math.min(Math.max(1, Math.round(max)), FIELD_TYPES[type].maxLength);
    }
    if (type === 'number') {
      if (f.min !== undefined && f.min !== null && f.min !== '') field.min = Number(f.min);
      if (f.max !== undefined && f.max !== null && f.max !== '') field.max = Number(f.max);
      if ([field.min, field.max].some((v) => v !== undefined && !Number.isFinite(v))) errors[`${at}.min`] = 'Minimum and maximum must be numbers.';
      else if (field.min !== undefined && field.max !== undefined && field.min > field.max) errors[`${at}.min`] = 'The minimum is larger than the maximum.';
    }
    if (FIELD_TYPES[type].options) {
      const options = (Array.isArray(f.options) ? f.options : []).slice(0, FORM_LIMITS.maxOptions).map((o) => ({ label: str(o?.label, 100), value: str(o?.value ?? o?.label, 100) }));
      if (!options.length) errors[`${at}.options`] = 'Add at least one option.';
      const values = new Set();
      options.forEach((o, j) => {
        if (!o.label || !OPTION_VALUE.test(o.value)) errors[`${at}.options[${j}]`] = 'Each option needs a label (letters, numbers and simple punctuation).';
        if (values.has(o.value)) errors[`${at}.options[${j}]`] = 'Options must be different.';
        values.add(o.value);
      });
      field.options = options;
    }
    form.fields.push(field);
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, form };
}

/**
 * Validate a submission against a form's fields. Unknown keys are rejected (not ignored).
 * Returns { ok: true, values } with trimmed values, or { ok: false, errors: { name: message } }.
 */
export function validateSubmission(fields, input) {
  const errors = {};
  const values = {};
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const known = new Set(fields.map((f) => f.name));
  for (const key of Object.keys(data)) if (!known.has(key)) errors[key] = 'This field is not part of the form.';
  for (const f of fields) {
    const raw = data[f.name];
    const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0) || (f.type === 'checkbox' && raw === false);
    if (empty) {
      if (f.required) errors[f.name] = f.type === 'checkbox' ? 'Please tick this box to continue.' : `${f.label} is required.`;
      continue;
    }
    switch (f.type) {
      case 'checkbox':
        if (raw !== true) errors[f.name] = 'Invalid value.';
        else values[f.name] = true;
        break;
      case 'checkboxes': {
        const allowed = new Set(f.options.map((o) => o.value));
        if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !allowed.has(v)) || new Set(raw).size !== raw.length) errors[f.name] = 'Choose from the listed options.';
        else values[f.name] = raw;
        break;
      }
      case 'select':
      case 'radio':
        if (typeof raw !== 'string' || !f.options.some((o) => o.value === raw)) errors[f.name] = 'Choose one of the listed options.';
        else values[f.name] = raw;
        break;
      case 'number': {
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
        if (!Number.isFinite(n)) errors[f.name] = 'Enter a number.';
        else if (f.min !== undefined && n < f.min) errors[f.name] = `Enter ${f.min} or more.`;
        else if (f.max !== undefined && n > f.max) errors[f.name] = `Enter ${f.max} or less.`;
        else values[f.name] = n;
        break;
      }
      case 'date':
        if (typeof raw !== 'string' || !DATE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) errors[f.name] = 'Enter a valid date.';
        else values[f.name] = raw;
        break;
      default: {
        if (typeof raw !== 'string') { errors[f.name] = 'Invalid value.'; break; }
        const v = raw.trim();
        if (!v && f.required) { errors[f.name] = `${f.label} is required.`; break; }
        if (v.length > (f.maxLength ?? 500)) { errors[f.name] = `Use at most ${f.maxLength} characters.`; break; }
        if (f.type === 'email' && !EMAIL.test(v)) { errors[f.name] = 'Enter a valid email address.'; break; }
        if (f.type === 'phone' && !PHONE.test(v)) { errors[f.name] = 'Enter a valid phone number.'; break; }
        if (v) values[f.name] = v;
      }
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
