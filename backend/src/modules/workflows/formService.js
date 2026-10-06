import { prisma } from '../../db/prisma.js';
import { formatShortDate, formatTimeAgo } from '../../utils/format.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { notifyAdmins, notifyUsers } from '../notifications/notificationService.js';
import { recordAudit } from '../audit/auditService.js';

/**
 * Forms & surveys.
 *
 *   admin creates/publishes  ─▶  student/faculty sees it (by audience) and submits
 *   admin reviews submission ─▶  submitter notified (forms that require review)
 */

const FIELD_TYPES = ['text', 'textarea', 'select', 'rating', 'checkbox', 'date'];
const REVIEW_LABELS = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Not Approved',
  ACKNOWLEDGED: 'Acknowledged',
};

const audienceFor = (roles) => (roles.includes('FACULTY') ? 'FACULTY' : roles.includes('STUDENT') ? 'STUDENT' : null);

function normaliseFields(fields = []) {
  if (!Array.isArray(fields) || fields.length === 0) throw badRequest('Add at least one question.');
  return fields.map((field, index) => {
    if (!FIELD_TYPES.includes(field.type)) throw badRequest(`Unsupported field type: ${field.type}`);
    if (!String(field.label ?? '').trim()) throw badRequest(`Question ${index + 1} needs a label.`);
    return {
      key: field.key || `q${index + 1}`,
      label: String(field.label).trim(),
      type: field.type,
      required: Boolean(field.required),
      options: field.type === 'select' ? (field.options ?? []).map(String).filter(Boolean) : [],
    };
  });
}

const slugify = (value) =>
  `${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}-${Date.now().toString(36)}`;

function presentForm(form, extra = {}) {
  return {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: form.description,
    category: form.category,
    audience: form.audience,
    fields: form.fields,
    status: form.status,
    requiresReview: form.requiresReview,
    closesAt: form.closesAt,
    closesLabel: form.closesAt ? `Closes ${formatShortDate(form.closesAt)}` : 'No deadline',
    publishedAt: form.publishedAt,
    updatedAt: form.updatedAt,
    ...extra,
  };
}

function presentSubmission(submission) {
  return {
    id: submission.id,
    formId: submission.formId,
    formTitle: submission.form?.title,
    answers: submission.answers,
    status: submission.status,
    statusLabel: REVIEW_LABELS[submission.status] ?? submission.status,
    reviewNote: submission.reviewNote,
    reviewedAt: submission.reviewedAt,
    submittedAt: submission.createdAt,
    timeAgo: formatTimeAgo(submission.createdAt),
    submitter: submission.user
      ? { id: submission.user.id, name: `${submission.user.firstName} ${submission.user.lastName}`, email: submission.user.email }
      : undefined,
  };
}

/* ----- requester side ----- */

export async function listAvailableForms(auth) {
  const audience = audienceFor(auth.roles);
  const now = new Date();
  const forms = await prisma.portalForm.findMany({
    where: {
      tenantId: auth.tenantId,
      status: 'PUBLISHED',
      audience: { in: ['ALL', audience].filter(Boolean) },
      OR: [{ closesAt: null }, { closesAt: { gte: now } }],
    },
    include: { submissions: { where: { userId: auth.userId } } },
    orderBy: { publishedAt: 'desc' },
  });
  const mine = await prisma.formSubmission.findMany({
    where: { tenantId: auth.tenantId, userId: auth.userId },
    include: { form: true },
    orderBy: { createdAt: 'desc' },
  });
  return {
    forms: forms.map((form) =>
      presentForm(form, { submitted: form.submissions.length > 0, mySubmission: form.submissions[0] ? presentSubmission(form.submissions[0]) : null }),
    ),
    submissions: mine.map(presentSubmission),
  };
}

export async function submitForm(auth, formId, { answers }) {
  const form = await prisma.portalForm.findFirst({ where: { id: formId, tenantId: auth.tenantId, status: 'PUBLISHED' } });
  if (!form) throw notFound('This form is not open.');
  const audience = audienceFor(auth.roles);
  if (form.audience !== 'ALL' && form.audience !== audience) throw badRequest('This form is not addressed to you.');
  if (form.closesAt && form.closesAt < new Date()) throw badRequest('This form has closed.');
  const existing = await prisma.formSubmission.findUnique({ where: { formId_userId: { formId, userId: auth.userId } } });
  if (existing) throw badRequest('You have already submitted this form.');

  const errors = [];
  for (const field of form.fields) {
    const value = answers?.[field.key];
    const empty = value === undefined || value === null || String(value).trim() === '' || value === false;
    if (field.required && empty) errors.push({ field: field.key, message: `${field.label} is required.` });
  }
  if (errors.length) throw badRequest('Please answer the required questions.', errors);

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.formSubmission.create({
      data: { tenantId: auth.tenantId, formId, userId: auth.userId, answers, status: form.requiresReview ? 'SUBMITTED' : 'ACKNOWLEDGED' },
      include: { form: true },
    });
    if (form.requiresReview) {
      await notifyAdmins(
        {
          tenantId: auth.tenantId,
          title: `Form submission needs review: ${form.title}`,
          message: `${auth.firstName} ${auth.lastName} submitted "${form.title}".`,
          link: '/admin?ops=forms',
          sourceType: 'FORM_SUBMISSION',
          sourceRefId: created.id,
          createdByUserId: auth.userId,
        },
        tx,
      );
    }
    return created;
  });
  return presentSubmission(submission);
}

/* ----- administrator side ----- */

export async function adminListForms(auth) {
  const [forms, students, faculty] = await Promise.all([
    prisma.portalForm.findMany({
      where: { tenantId: auth.tenantId },
      include: { _count: { select: { submissions: true } }, submissions: { select: { status: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.studentProfile.count({ where: { tenantId: auth.tenantId } }),
    prisma.facultyProfile.count({ where: { tenantId: auth.tenantId } }),
  ]);
  const audienceSize = { STUDENT: students, FACULTY: faculty, ALL: students + faculty };
  return forms.map((form) =>
    presentForm(form, {
      responses: form._count.submissions,
      audienceSize: audienceSize[form.audience] ?? 0,
      awaitingReview: form.submissions.filter((row) => ['SUBMITTED', 'UNDER_REVIEW'].includes(row.status)).length,
    }),
  );
}

export async function adminCreateForm(auth, payload) {
  const form = await prisma.portalForm.create({
    data: {
      tenantId: auth.tenantId,
      slug: slugify(payload.title),
      title: payload.title,
      description: payload.description ?? null,
      category: payload.category ?? 'Survey',
      audience: payload.audience ?? 'ALL',
      fields: normaliseFields(payload.fields),
      requiresReview: Boolean(payload.requiresReview),
      closesAt: payload.closesAt ? new Date(payload.closesAt) : null,
      status: 'DRAFT',
      createdByUserId: auth.userId,
    },
  });
  await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'FORM_CREATED', entityType: 'PortalForm', entityId: form.id, summary: `Form drafted: ${form.title}` });
  if (payload.publish) return adminSetFormStatus(auth, form.id, 'PUBLISHED');
  return presentForm(form);
}

/** Publishing notifies the audience once; closing simply stops new submissions. */
export async function adminSetFormStatus(auth, id, status) {
  const form = await prisma.portalForm.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!form) throw notFound('Form not found.');
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.portalForm.update({
      where: { id },
      data: { status, ...(status === 'PUBLISHED' && !form.publishedAt ? { publishedAt: new Date() } : {}) },
    });
    if (status === 'PUBLISHED' && !form.publishedAt) {
      const roleKeys = form.audience === 'ALL' ? ['STUDENT', 'FACULTY'] : [form.audience];
      const users = await tx.user.findMany({
        where: { tenantId: auth.tenantId, status: 'ACTIVE', userRoles: { some: { role: { key: { in: roleKeys } } } } },
        select: { id: true },
      });
      await notifyUsers(
        {
          tenantId: auth.tenantId,
          userIds: users.map((user) => user.id),
          title: `New form: ${form.title}`,
          message: form.description ?? 'A new form is available in Help & Support → Forms.',
          link: '/help/forms',
          sourceType: 'PORTAL_FORM',
          sourceRefId: id,
          createdByUserId: auth.userId,
        },
        tx,
      );
    }
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: `FORM_${status}`, entityType: 'PortalForm', entityId: id, summary: `Form ${status.toLowerCase()}: ${form.title}` }, tx);
    return row;
  });
  return presentForm(updated);
}

export async function adminListSubmissions(auth, formId) {
  const form = await prisma.portalForm.findFirst({ where: { id: formId, tenantId: auth.tenantId } });
  if (!form) throw notFound('Form not found.');
  const rows = await prisma.formSubmission.findMany({
    where: { formId },
    include: { form: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return { form: presentForm(form), submissions: rows.map(presentSubmission) };
}

export async function adminReviewSubmission(auth, submissionId, { status, note }) {
  const submission = await prisma.formSubmission.findFirst({
    where: { id: submissionId, tenantId: auth.tenantId },
    include: { form: true },
  });
  if (!submission) throw notFound('Submission not found.');
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.formSubmission.update({
      where: { id: submissionId },
      data: { status, reviewNote: note ?? null, reviewedByUserId: auth.userId, reviewedAt: new Date() },
      include: { form: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    await notifyUsers(
      {
        tenantId: auth.tenantId,
        userIds: [submission.userId],
        title: `${submission.form.title}: ${REVIEW_LABELS[status]}`,
        message: note?.trim() || 'Your form submission was reviewed.',
        link: '/help/forms',
        sourceType: 'FORM_SUBMISSION',
        sourceRefId: submissionId,
        createdByUserId: auth.userId,
      },
      tx,
    );
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: `FORM_SUBMISSION_${status}`, entityType: 'FormSubmission', entityId: submissionId, summary: `${submission.form.title} submission ${REVIEW_LABELS[status].toLowerCase()}` }, tx);
    return row;
  });
  return presentSubmission(updated);
}
