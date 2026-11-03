import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { cmsConfig, mailConfig } from '../../config/env.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { facultyWidgets } from '../../../../shared/facultyWidgets.js';
import { ADMIN_SECTIONS, PERSONAS, emptyLayout, isSafeUrl, validateLayout } from '../../../../shared/cmsBlocks.js';
import { cmsRequest } from './cmsClient.js';
import { sanitizeRichHtml } from './richHtml.js';
import { mailStatus, sendMail } from './mailer.js';
import { HONEYPOT, validateFormDefinition, validateSubmission } from '../../../../shared/forms.js';

/**
 * Feddrick CMS integration (Studio + content delivery).
 *
 * Trust boundary: the browser only ever talks to this backend. The tenant always comes
 * from the signed-in session (auth.tenantSlug), never from the request. Studio operations
 * require ADMIN (enforced in cmsRoutes); delivery returns only PUBLISHED content for the
 * caller's audiences. Layouts are validated against shared/cmsBlocks.js before they are
 * saved and again before they are delivered.
 *
 * Data boundary: the CMS stores pages, layouts, announcements, FAQs, media and its own
 * audit log in its own database (feddrick_cms). Nothing here writes to the EduNexusAI
 * application database; the widget catalogue is only read from it.
 */

// ADMIN keeps the staff audience it always had; a STAFF community member gets it too; ALUMNI see only
// what is published for alumni. `public` is not a role's audience: it is the signed-out landing page's
// (see publicContent), and it is never added to a signed-in person's audiences.
const AUDIENCE_OF_ROLE = { STUDENT: 'students', FACULTY: 'faculty', STAFF: 'staff', ALUMNI: 'alumni', ADMIN: 'staff' };
const PERSONA_ROLE = { student: 'STUDENT', faculty: 'FACULTY', admin: 'ADMIN' };
const CATEGORIES = ['general', 'academic', 'events', 'campus-life', 'finance', 'it-services', 'safety', 'wellness'];

// alumni and public are optional (false) so older clients that send three audiences keep working.
const audienceShape = { students: z.boolean(), faculty: z.boolean(), staff: z.boolean(), alumni: z.boolean().default(false) };
const audiences = z
  .object({ ...audienceShape, public: z.boolean().default(false) })
  .refine((a) => a.students || a.faculty || a.staff || a.alumni || a.public, 'Choose at least one audience.');
// Forms are only for signed-in people (every submission has an author).
const formAudiences = z
  .object({ ...audienceShape, public: z.boolean().optional().refine((v) => !v, 'Forms are for signed-in people and cannot be public.') })
  .refine((a) => a.students || a.faculty || a.staff || a.alumni, 'Choose at least one audience.');
const safeUrl = z.string().trim().max(500).refine(isSafeUrl, 'Use https://, mailto:, tel: or a portal path such as /help.');
const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens.');

export const schemas = {
  page: z.object({
    title: z.string().trim().min(1, 'A title is required.').max(160),
    slug,
    summary: z.string().trim().max(500).default(''),
    template: z.string().trim().max(40).default('blank'),
    showInNav: z.boolean().default(false),
    navLabel: z.string().trim().max(40).default(''),
    sortOrder: z.number().int().min(0).max(999).default(0),
    audiences,
    layout: z.unknown(),
  }),
  announcement: z.object({
    title: z.string().trim().min(1, 'A title is required.').max(160),
    summary: z.string().trim().max(400).default(''),
    body: z.string().max(50000).default(''),
    bodyFormat: z.enum(['markdown', 'html']).default('markdown'),
    category: z.enum(CATEGORIES).default('general'),
    priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
    pinned: z.boolean().default(false),
    ctaLabel: z.string().trim().max(60).default(''),
    ctaUrl: safeUrl.or(z.literal('')).default(''),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
    audiences,
  }).refine((a) => !a.ctaUrl || a.ctaLabel, { message: 'Give the link a label.', path: ['ctaLabel'] }),
  faq: z.object({
    question: z.string().trim().min(1, 'A question is required.').max(300),
    answer: z.string().trim().min(1, 'An answer is required.').max(30000),
    answerFormat: z.enum(['markdown', 'html']).default('markdown'),
    category: z.string().trim().max(60).default('general'),
    sortOrder: z.number().int().min(0).max(999).default(0),
    audiences,
  }),
  // Field-level rules live in shared/forms.js (validateFormDefinition), applied in parse().
  form: z.object({ audiences: formAudiences }).passthrough(),
};
export const TYPES = Object.keys(schemas);
/** Types whose publication can be scheduled (the CMS runs the jobs). */
export const SCHEDULABLE = ['page', 'announcement', 'faq'];

const actorOf = (auth) => ({ id: auth.userId, name: `${auth.firstName ?? ''} ${auth.lastName ?? ''}`.trim() || auth.email });
const audienceFields = (a, { withPublic = true } = {}) => ({ audienceStudents: a.students, audienceFaculty: a.faculty, audienceStaff: a.staff, audienceAlumni: Boolean(a.alumni), ...(withPublic ? { audiencePublic: Boolean(a.public) } : {}) });
const audiencesOfDoc = (d) => ({ students: Boolean(d.audienceStudents), faculty: Boolean(d.audienceFaculty), staff: Boolean(d.audienceStaff), alumni: Boolean(d.audienceAlumni), public: Boolean(d.audiencePublic) });
export const audiencesOf = (roles = []) => [...new Set(roles.map((r) => AUDIENCE_OF_ROLE[r]).filter(Boolean))];

function present(type, d) {
  if (!d) return null;
  const base = { id: d.documentId, state: d.state ?? 'published', schedule: d.schedule ?? null, updatedAt: d.updatedAt, publishedAt: d.publishedAt ?? d.publishedVersion?.publishedAt ?? null, authorName: d.authorName ?? null, updatedByName: d.updatedByName ?? null };
  if (type === 'page') return { ...base, title: d.title, slug: d.slug, summary: d.summary ?? '', template: d.template ?? 'blank', showInNav: Boolean(d.showInNav), navLabel: d.navLabel ?? '', sortOrder: d.sortOrder ?? 0, audiences: audiencesOfDoc(d), layout: d.layout ?? emptyLayout('page') };
  if (type === 'form') return { ...base, schedule: undefined, name: d.name, description: d.description ?? '', fields: Array.isArray(d.fields) ? d.fields : [], submitLabel: d.submitLabel ?? 'Submit', successMessage: d.successMessage ?? '', recipientEmail: d.recipientEmail ?? '', notificationSubject: d.notificationSubject ?? '', audiences: audiencesOfDoc(d) };
  if (type === 'announcement') return { ...base, title: d.title, summary: d.summary ?? '', body: d.body ?? '', bodyFormat: d.bodyFormat ?? 'markdown', category: d.category ?? 'general', priority: d.priority ?? 'normal', pinned: Boolean(d.pinned), ctaLabel: d.ctaLabel ?? '', ctaUrl: d.ctaUrl ?? '', expiresAt: d.expiresAt ?? null, audiences: audiencesOfDoc(d) };
  if (type === 'faq') return { ...base, question: d.question, answer: d.answer, answerFormat: d.answerFormat ?? 'markdown', category: d.category ?? 'general', sortOrder: d.sortOrder ?? 0, audiences: audiencesOfDoc(d) };
  if (type === 'dashboard-layout') return { ...base, persona: d.persona, layout: d.layout ?? emptyLayout('dashboard') };
  return base;
}

function parse(type, input) {
  const result = schemas[type].safeParse(input);
  if (!result.success) {
    const fieldErrors = {};
    for (const issue of result.error.issues) fieldErrors[issue.path.join('.') || 'form'] ??= issue.message;
    throw badRequest('Some fields need attention.', { fieldErrors });
  }
  const data = result.data;
  if (type === 'announcement' && data.bodyFormat === 'html') data.body = sanitizeRichHtml(data.body);
  if (type === 'faq' && data.answerFormat === 'html') {
    data.answer = sanitizeRichHtml(data.answer);
    if (!data.answer) throw badRequest('Some fields need attention.', { fieldErrors: { answer: 'An answer is required.' } });
  }
  if (type === 'form') {
    const checked = validateFormDefinition(input, { recipientDomains: mailConfig().recipientDomains });
    if (!checked.ok) throw badRequest('Some fields need attention.', { fieldErrors: checked.errors });
    return { ...checked.form, audiences: data.audiences };
  }
  if (type === 'page') {
    const checked = validateLayout(data.layout ?? emptyLayout('page'), { context: 'page', sanitizeHtml: sanitizeRichHtml });
    if (!checked.ok) throw badRequest('The page layout contains blocks or settings that are not allowed.', { layoutErrors: checked.errors });
    data.layout = checked.layout;
  }
  return data;
}

function toCms(type, data, auth, { creating }) {
  const who = { updatedByName: actorOf(auth).name, ...(creating ? { authorName: actorOf(auth).name } : {}) };
  if (type === 'page') {
    const { audiences: a, ...rest } = data;
    return { ...rest, ...audienceFields(a), ...who };
  }
  if (type === 'announcement') {
    const { audiences: a, ...rest } = data;
    return { ...rest, expiresAt: rest.expiresAt ?? null, ...audienceFields(a), ...who };
  }
  if (type === 'faq' || type === 'form') {
    const { audiences: a, ...rest } = data;
    return { ...rest, ...audienceFields(a, { withPublic: type === 'faq' }), ...who };
  }
  return { ...data, ...who };
}

/* ------------------------------------------------------------------ Studio */

/** The institution's timezone (tenants.timezone); schedules are shown and entered in it. */
export async function tenantTimezone(auth) {
  const tenant = auth?.tenantId ? await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { timezone: true } }) : null;
  return tenant?.timezone || 'America/New_York';
}

export async function status(auth) {
  const config = cmsConfig();
  const base = { configured: config.valid, problems: config.problems, adminUrl: config.adminUrl, layoutsEnabled: config.layoutsEnabled, timezone: await tenantTimezone(auth), mail: await mailStatus() };
  if (!config.valid) return { ...base, available: false };
  try {
    await cmsRequest('GET', '/content/faq', { query: { tenant: 'health-check', limit: 1 } });
    return { ...base, available: true };
  } catch (error) {
    return { ...base, available: false, error: { code: error.code, message: error.message } };
  }
}

export async function list(auth, type, { status: filter, q } = {}) {
  const rows = (await cmsRequest('GET', `/content/${type}`, { query: { tenant: auth.tenantSlug } })).map((d) => present(type, d));
  const needle = String(q ?? '').trim().toLowerCase();
  return rows.filter((r) => (!filter || r.state === filter) && (!needle || JSON.stringify([r.title, r.question, r.slug, r.summary]).toLowerCase().includes(needle)));
}

export async function get(auth, type, id) {
  return present(type, await cmsRequest('GET', `/content/${type}/${encodeURIComponent(id)}`, { query: { tenant: auth.tenantSlug } }));
}

export async function create(auth, type, input) {
  const data = parse(type, input);
  const doc = await cmsRequest('POST', `/content/${type}`, { body: { tenant: auth.tenantSlug, data: toCms(type, data, auth, { creating: true }), actor: actorOf(auth) } });
  logger.info('Studio create', { type, id: doc.documentId, actor: auth.userId });
  return present(type, doc);
}

export async function update(auth, type, id, input) {
  const data = parse(type, input);
  const doc = await cmsRequest('PUT', `/content/${type}/${encodeURIComponent(id)}`, { body: { tenant: auth.tenantSlug, data: toCms(type, data, auth, { creating: false }), actor: actorOf(auth) } });
  logger.info('Studio update', { type, id, actor: auth.userId });
  return present(type, doc);
}

export async function transition(auth, type, id, action) {
  const doc = await cmsRequest('POST', `/content/${type}/${encodeURIComponent(id)}/${action}`, { body: { tenant: auth.tenantSlug, actor: actorOf(auth) } });
  logger.info(`Studio ${action}`, { type, id, actor: auth.userId });
  return present(type, doc);
}

/* --------------------------------------------------------------- schedules */

const isoOrNull = z.union([z.string().datetime({ offset: true }), z.null()]).optional();
export const scheduleSchema = z.object({ publishAt: isoOrNull, unpublishAt: isoOrNull }).refine((v) => v.publishAt !== undefined || v.unpublishAt !== undefined, 'Nothing to change.');

export async function getSchedule(auth, type, id) {
  if (!SCHEDULABLE.includes(type)) throw notFound('This content cannot be scheduled.');
  return cmsRequest('GET', `/content/${type}/${encodeURIComponent(id)}/schedule`, { query: { tenant: auth.tenantSlug } });
}

/** publishAt / unpublishAt: ISO time to set, null to cancel, absent to leave as is. Times are validated again by the CMS. */
export async function setSchedule(auth, type, id, input) {
  if (!SCHEDULABLE.includes(type)) throw notFound('This content cannot be scheduled.');
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) throw badRequest('The schedule is not valid.', { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || 'form', i.message])) });
  const result = await cmsRequest('PUT', `/content/${type}/${encodeURIComponent(id)}/schedule`, { body: { tenant: auth.tenantSlug, actor: actorOf(auth), ...parsed.data } });
  logger.info('Studio schedule', { type, id, actor: auth.userId, publish: parsed.data.publishAt === undefined ? 'unchanged' : parsed.data.publishAt ? 'set' : 'cancelled', unpublish: parsed.data.unpublishAt === undefined ? 'unchanged' : parsed.data.unpublishAt ? 'set' : 'cancelled' });
  return result;
}

/** Studio: validate sample values against the saved (draft) form without sending anything. */
export async function testFormSubmission(auth, id, values) {
  const form = present('form', await cmsRequest('GET', `/content/form/${encodeURIComponent(id)}`, { query: { tenant: auth.tenantSlug } }));
  const checked = validateSubmission(form.fields, values);
  return { valid: checked.ok, errors: checked.ok ? {} : checked.errors, recipientConfigured: Boolean(form.recipientEmail), mail: await mailStatus(), sent: false };
}

export async function remove(auth, type, id) {
  const actor = actorOf(auth);
  await cmsRequest('DELETE', `/content/${type}/${encodeURIComponent(id)}`, { query: { tenant: auth.tenantSlug, actorId: actor.id, actorName: actor.name } });
  logger.info('Studio delete', { type, id, actor: auth.userId });
  return { id, deleted: true };
}

export async function auditLog(auth) {
  const rows = await cmsRequest('GET', '/audit', { query: { tenant: auth.tenantSlug, limit: 100 } });
  return rows.map((r) => ({ id: r.documentId, action: r.action, contentType: r.contentType, targetId: r.targetId, actorName: r.actorName, summary: r.summary, at: r.createdAt }));
}

/* ------------------------------------------------------- dashboard layouts */

/** The widgets a persona's dashboard can show (keys + labels). Read-only from existing definitions. */
export async function widgetCatalogue(persona) {
  if (persona === 'student') {
    const rows = await prisma.widgetDefinition.findMany({ where: { category: 'dashboard' }, orderBy: { sortOrder: 'asc' }, select: { key: true, label: true, description: true } });
    return rows.map((r) => ({ key: r.key, label: r.label, description: r.description ?? null }));
  }
  if (persona === 'faculty') return facultyWidgets.filter((w) => w.key !== 'faculty.summary').map((w) => ({ key: w.key, label: w.label, description: w.category }));
  return ADMIN_SECTIONS.map((s) => ({ key: s.key, label: s.label, description: null }));
}

function assertPersona(persona) {
  if (!PERSONAS.includes(persona)) throw notFound('Unknown dashboard.');
}

async function dashboardDoc(auth, persona) {
  const [doc] = await cmsRequest('GET', '/content/dashboard-layout', { query: { tenant: auth.tenantSlug, persona } });
  return doc ?? null;
}

export async function getDashboard(auth, persona) {
  assertPersona(persona);
  const [doc, catalogue] = await Promise.all([dashboardDoc(auth, persona), widgetCatalogue(persona)]);
  const full = doc ? present('dashboard-layout', await cmsRequest('GET', `/content/dashboard-layout/${doc.documentId}`, { query: { tenant: auth.tenantSlug } })) : null;
  return { persona, catalogue, document: full, layoutsEnabled: cmsConfig().layoutsEnabled };
}

export async function saveDashboard(auth, persona, layout) {
  assertPersona(persona);
  const catalogue = await widgetCatalogue(persona);
  const checked = validateLayout(layout, { context: 'dashboard', widgetKeys: catalogue.map((w) => w.key) });
  if (!checked.ok) throw badRequest('The dashboard layout contains blocks or settings that are not allowed.', { layoutErrors: checked.errors });
  const data = { persona, layout: checked.layout, updatedByName: actorOf(auth).name };
  const doc = await dashboardDoc(auth, persona);
  const saved = doc
    ? await cmsRequest('PUT', `/content/dashboard-layout/${doc.documentId}`, { body: { tenant: auth.tenantSlug, data, actor: actorOf(auth) } })
    : await cmsRequest('POST', '/content/dashboard-layout', { body: { tenant: auth.tenantSlug, data: { ...data, authorName: actorOf(auth).name }, actor: actorOf(auth) } });
  logger.info('Studio dashboard saved', { persona, actor: auth.userId });
  return present('dashboard-layout', saved);
}

export async function dashboardTransition(auth, persona, action) {
  assertPersona(persona);
  const doc = await dashboardDoc(auth, persona);
  if (!doc) throw notFound('Save the dashboard layout first.');
  return transition(auth, 'dashboard-layout', doc.documentId, action);
}

/** Removing the layout entirely returns the dashboard to the original built-in layout. */
export async function removeDashboard(auth, persona) {
  assertPersona(persona);
  const doc = await dashboardDoc(auth, persona);
  if (!doc) return { persona, deleted: false };
  await remove(auth, 'dashboard-layout', doc.documentId);
  return { persona, deleted: true };
}

/* ------------------------------------------------------------------- media */

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const mediaPath = (url) => `/api/v1/content/media/${String(url).replace(/^\/uploads\//, '')}`;

export async function listMedia(auth) {
  const files = await cmsRequest('GET', '/media', { query: { tenant: auth.tenantSlug } });
  return files.map((f) => ({ ...f, url: mediaPath(f.url) }));
}

export async function uploadMedia(auth, { fileName, mime, dataBase64, alternativeText }) {
  if (!IMAGE_TYPES[mime]) throw badRequest('Only PNG, JPEG, WebP or GIF images can be uploaded.');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length) throw badRequest('The file is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw badRequest('Images can be at most 3 MB.');
  const signature = bytes.subarray(0, 12).toString('hex');
  const matches = { 'image/png': signature.startsWith('89504e47'), 'image/jpeg': signature.startsWith('ffd8ff'), 'image/gif': signature.startsWith('47494638'), 'image/webp': signature.startsWith('52494646') && signature.slice(16, 24) === '57454250' };
  if (!matches[mime]) throw badRequest('The file content does not match its image type.');
  const safeName = String(fileName || 'image').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'image';
  const form = new FormData();
  form.set('tenant', auth.tenantSlug);
  form.set('alternativeText', String(alternativeText ?? '').slice(0, 200));
  form.set('actorId', auth.userId);
  form.set('actorName', actorOf(auth).name);
  form.set('file', new Blob([bytes], { type: mime }), safeName);
  const file = await cmsRequest('POST', '/media', { form });
  return { ...file, url: mediaPath(file.url) };
}

/* ---------------------------------------------------------------- delivery */

// A requested audience the caller does not hold yields nothing (never someone else's content).
const deliveryAudiences = (auth, only = null) => {
  const own = audiencesOf(auth.roles);
  return only ? own.filter((a) => a === only) : own;
};

/** Published pages for this user's audiences that should appear in navigation. */
export async function navPages(auth, { audience = null } = {}) {
  const aud = deliveryAudiences(auth, audience);
  if (!aud.length) return [];
  const rows = await cmsRequest('GET', '/content/page', { query: { tenant: auth.tenantSlug, status: 'published', audiences: aud.join(',') } });
  return rows.filter((p) => p.showInNav).map((p) => ({ title: p.title, slug: p.slug, navLabel: p.navLabel || p.title, summary: p.summary ?? '' }));
}

/** One published page by address, only if it is published for one of the user's audiences. */
export async function publishedPage(auth, pageSlug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pageSlug)) throw notFound('Page not found.');
  const aud = deliveryAudiences(auth);
  if (!aud.length) throw notFound('Page not found.');
  const [page] = await cmsRequest('GET', '/content/page', { query: { tenant: auth.tenantSlug, status: 'published', slug: pageSlug, audiences: aud.join(','), limit: 1 } });
  if (!page) throw notFound('Page not found.');
  const checked = validateLayout(page.layout ?? emptyLayout('page'), { context: 'page', sanitizeHtml: sanitizeRichHtml });
  return { title: page.title, slug: page.slug, summary: page.summary ?? '', updatedAt: page.updatedAt, layout: checked.ok ? checked.layout : emptyLayout('page'), layoutError: checked.ok ? null : 'This page could not be displayed safely.' };
}

/**
 * The published layout of a dashboard the user is entitled to see. Never throws for CMS
 * problems: the dashboards fall back to their original built-in layout on `layout: null`.
 */
export async function publishedDashboard(auth, persona) {
  assertPersona(persona);
  if (!auth.roles.includes(PERSONA_ROLE[persona])) throw forbidden('This dashboard is not available to your role.');
  const config = cmsConfig();
  if (!config.layoutsEnabled || !config.valid) return { persona, enabled: false, layout: null };
  try {
    const [doc] = await cmsRequest('GET', '/content/dashboard-layout', { query: { tenant: auth.tenantSlug, persona, status: 'published', limit: 1 } });
    if (!doc) return { persona, enabled: true, layout: null };
    const catalogue = await widgetCatalogue(persona);
    const checked = validateLayout(doc.layout, { context: 'dashboard', widgetKeys: catalogue.map((w) => w.key) });
    if (!checked.ok) {
      logger.warn('Published dashboard layout failed validation; using the built-in layout', { persona });
      return { persona, enabled: true, layout: null, invalid: true };
    }
    return { persona, enabled: true, layout: checked.layout, updatedAt: doc.updatedAt };
  } catch (error) {
    logger.warn('Dashboard layout unavailable; using the built-in layout', { persona, code: error.code });
    return { persona, enabled: true, layout: null, unavailable: true };
  }
}

export async function publishedAnnouncements(auth, { category, limit = 10, audience = null } = {}) {
  const aud = deliveryAudiences(auth, audience);
  if (!aud.length) return [];
  const rows = await cmsRequest('GET', '/content/announcement', { query: { tenant: auth.tenantSlug, status: 'published', live: 'true', audiences: aud.join(',') } });
  return rows.filter((r) => !category || category === 'all' || r.category === category).slice(0, limit).map((r) => {
    const p = present('announcement', r);
    if (p.bodyFormat === 'html') p.body = sanitizeRichHtml(p.body);
    delete p.audiences;
    delete p.schedule;
    return p;
  });
}

export async function publishedFaqs(auth, { category, limit = 50 } = {}) {
  const aud = deliveryAudiences(auth);
  if (!aud.length) return [];
  const rows = await cmsRequest('GET', '/content/faq', { query: { tenant: auth.tenantSlug, status: 'published', audiences: aud.join(',') } });
  return rows.filter((r) => !category || r.category === category).slice(0, limit).map((r) => ({ id: r.documentId, question: r.question, answer: r.answerFormat === 'html' ? sanitizeRichHtml(r.answer) : r.answer, answerFormat: r.answerFormat ?? 'markdown', category: r.category ?? 'general' }));
}

/* ------------------------------------------------------------------- forms */

/** A published form the caller may use (tenant + audience), with its private settings. */
async function loadPublishedForm(auth, id) {
  if (!/^[A-Za-z0-9]{10,64}$/.test(String(id))) throw notFound('Form not found.');
  const aud = deliveryAudiences(auth);
  let doc;
  try {
    doc = await cmsRequest('GET', `/content/form/${encodeURIComponent(id)}`, { query: { tenant: auth.tenantSlug, status: 'published' } });
  } catch (error) {
    if (error.status === 404) throw notFound('Form not found.');
    throw error;
  }
  const form = present('form', doc);
  if (!aud.some((a) => form.audiences[a])) throw notFound('Form not found.');
  return form;
}

/** Public part of a form: never the recipient or the subject line. */
export async function publishedForm(auth, id) {
  const form = await loadPublishedForm(auth, id);
  return { id: form.id, name: form.name, description: form.description, fields: form.fields, submitLabel: form.submitLabel, successMessage: form.successMessage };
}

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const displayValue = (field, value) => {
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => field.options?.find((o) => o.value === v)?.label ?? v).join(', ');
  if (field.options) return field.options.find((o) => o.value === value)?.label ?? value;
  return String(value);
};

/**
 * Submit a published form. The definition is loaded from the CMS (never trusted from the
 * browser), the values are validated against it, and the notification is emailed to the
 * form's configured recipient. Submissions are not stored. Nothing is logged except the
 * form id and the outcome.
 */
export async function submitForm(auth, id, body) {
  const form = await loadPublishedForm(auth, id);
  const raw = body?.values && typeof body.values === 'object' ? body.values : {};
  // Bots fill the hidden field: answer as if accepted, send nothing.
  if (typeof body?.[HONEYPOT] === 'string' && body[HONEYPOT].trim()) {
    logger.info('Form submission discarded (honeypot)', { formId: form.id });
    return { delivered: false, message: form.successMessage };
  }
  const checked = validateSubmission(form.fields, raw);
  if (!checked.ok) throw badRequest('Please check the highlighted fields.', { fieldErrors: checked.errors });
  if (!form.recipientEmail) throw new AppError(503, 'FORM_NOT_CONFIGURED', 'This form is not accepting submissions yet: no notification recipient has been set.');
  const config = mailConfig();
  if (!config.configured) throw new AppError(503, 'MAIL_NOT_CONFIGURED', 'This form cannot send submissions right now because email is not configured on the server.');
  const submitter = `${`${auth.firstName ?? ''} ${auth.lastName ?? ''}`.trim() || 'Portal user'} <${auth.email}>`;
  const rows = form.fields.filter((f) => checked.values[f.name] !== undefined).map((f) => [f.label, displayValue(f, checked.values[f.name])]);
  const replyField = form.fields.find((f) => f.type === 'email' && checked.values[f.name]);
  const subject = (form.notificationSubject || `New submission: ${form.name}`).replace(/[\r\n]+/g, ' ').slice(0, 150);
  const text = [`Form: ${form.name}`, `Submitted by: ${submitter} (${auth.roles.join(', ')})`, `Submitted at: ${new Date().toISOString()}`, '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const html = `<p><strong>Form:</strong> ${escapeHtml(form.name)}<br><strong>Submitted by:</strong> ${escapeHtml(submitter)} (${escapeHtml(auth.roles.join(', '))})<br><strong>Submitted at:</strong> ${escapeHtml(new Date().toISOString())}</p><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><th align="left" style="border-bottom:1px solid #ddd">${escapeHtml(k)}</th><td style="border-bottom:1px solid #ddd;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`).join('')}</table>`;
  try {
    await sendMail({ to: form.recipientEmail, subject, text, html, replyTo: replyField ? checked.values[replyField.name] : undefined });
  } catch (error) {
    if (error.code === 'MAIL_NOT_CONFIGURED') throw new AppError(503, 'MAIL_NOT_CONFIGURED', 'This form cannot send submissions right now because email is not configured on the server.');
    throw new AppError(502, 'MAIL_FAILED', 'Your submission could not be sent. Please try again later.');
  }
  logger.info('Form submission delivered', { formId: form.id, tenant: auth.tenantSlug });
  return { delivered: true, message: form.successMessage };
}

/* ------------------------------------------------------------ public content */

/**
 * Content for people who are not signed in (the public landing page): only documents published with
 * the `public` audience, for the institution named in the address. Nothing else is reachable here:
 * no drafts, no other audience's documents, no forms, no dashboards.
 */
export async function publicAnnouncements(tenantSlug, { limit = 6 } = {}) {
  const rows = await cmsRequest('GET', '/content/announcement', { query: { tenant: tenantSlug, status: 'published', live: 'true', audiences: 'public' } });
  return rows.filter((r) => r.audiencePublic === true).slice(0, limit).map((r) => {
    const p = present('announcement', r);
    if (p.bodyFormat === 'html') p.body = sanitizeRichHtml(p.body);
    const { audiences: _a, schedule: _s, authorName: _n, updatedByName: _u, ...rest } = p;
    return rest;
  });
}

export async function publicPages(tenantSlug) {
  const rows = await cmsRequest('GET', '/content/page', { query: { tenant: tenantSlug, status: 'published', audiences: 'public' } });
  return rows.filter((p) => p.audiencePublic === true).map((p) => ({ title: p.title, slug: p.slug, navLabel: p.navLabel || p.title, summary: p.summary ?? '', showInNav: Boolean(p.showInNav) }));
}

export async function publicPage(tenantSlug, pageSlug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pageSlug)) throw notFound('Page not found.');
  const [page] = await cmsRequest('GET', '/content/page', { query: { tenant: tenantSlug, status: 'published', slug: pageSlug, audiences: 'public', limit: 1 } });
  if (!page || page.audiencePublic !== true) throw notFound('Page not found.');
  const checked = validateLayout(page.layout ?? emptyLayout('page'), { context: 'page', sanitizeHtml: sanitizeRichHtml });
  return { title: page.title, slug: page.slug, summary: page.summary ?? '', updatedAt: page.updatedAt, layout: checked.ok ? checked.layout : emptyLayout('page'), layoutError: checked.ok ? null : 'This page could not be displayed safely.' };
}

export async function publicFaqs(tenantSlug, { limit = 20 } = {}) {
  const rows = await cmsRequest('GET', '/content/faq', { query: { tenant: tenantSlug, status: 'published', audiences: 'public' } });
  return rows.filter((r) => r.audiencePublic === true).slice(0, limit).map((r) => ({ id: r.documentId, question: r.question, answer: r.answerFormat === 'html' ? sanitizeRichHtml(r.answer) : r.answer, answerFormat: r.answerFormat ?? 'markdown', category: r.category ?? 'general' }));
}
