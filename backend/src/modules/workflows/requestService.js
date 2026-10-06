import { prisma } from '../../db/prisma.js';
import { buildReference, formatTimeAgo, toIsoDate } from '../../utils/format.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { notifyAdmins, notifyUsers } from '../notifications/notificationService.js';
import { recordAudit } from '../audit/auditService.js';
import { OPEN_STATUSES, REQUEST_TYPES, STATUS_LABELS, requestTypesFor, typeLabel } from './requestTypes.js';
import { decodeAttachments, listAttachmentMeta, saveAttachments } from './attachmentService.js';

/**
 * Bidirectional request workflow.
 *
 *   requester (student / faculty) ──create──▶ service_requests ──▶ Admin Operations
 *   admin ──decide──▶ status + history row + domain record updated + requester notified
 *
 * Every state change writes a ServiceRequestEvent, so both sides see the same timeline.
 */

const include = {
  requester: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      studentProfile: { select: { studentNumber: true, degree: true } },
      facultyProfile: { select: { title: true, department: true } },
    },
  },
  decidedBy: { select: { firstName: true, lastName: true } },
  events: {
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { firstName: true, lastName: true } } },
  },
};

const fullName = (user) => (user ? `${user.firstName} ${user.lastName}` : null);

function present(request, attachments = [], viewer = null) {
  const isRequester = viewer && viewer.userId === request.requesterUserId;
  return {
    id: request.id,
    reference: request.reference,
    type: request.type,
    typeLabel: typeLabel(request.type),
    category: request.category,
    title: request.title,
    description: request.description,
    details: request.details ?? {},
    priority: request.priority,
    status: request.status,
    statusLabel: STATUS_LABELS[request.status] ?? request.status,
    sourceType: request.sourceType,
    requester: {
      id: request.requester.id,
      name: fullName(request.requester),
      email: request.requester.email,
      role: request.requesterRole,
      studentNumber: request.requester.studentProfile?.studentNumber ?? null,
      program: request.requester.studentProfile?.degree ?? request.requester.facultyProfile?.department ?? null,
    },
    decisionNote: request.decisionNote,
    decidedBy: fullName(request.decidedBy),
    decidedAt: request.decidedAt,
    createdAt: request.createdAt,
    submittedOn: toIsoDate(request.createdAt),
    updatedAt: request.updatedAt,
    timeAgo: formatTimeAgo(request.createdAt),
    attachments,
    history: (request.events ?? []).map((event) => ({
      id: event.id,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      actor: fullName(event.actor) ?? 'System',
      at: event.createdAt,
    })),
    canRespond: Boolean(isRequester && request.status === 'NEEDS_INFO'),
    canCancel: Boolean(isRequester && OPEN_STATUSES.includes(request.status)),
  };
}

async function presentMany(rows, viewer) {
  const files = await listAttachmentMeta('REQUEST', rows.map((row) => row.id));
  return rows.map((row) => present(row, files.get(row.id) ?? [], viewer));
}

const requesterRoleOf = (roles) => (roles.includes('FACULTY') ? 'FACULTY' : roles.includes('STUDENT') ? 'STUDENT' : 'ADMIN');

export const listRequestTypes = (roles) => requestTypesFor(roles);

/**
 * Create a request. Domain screens (profile, transcripts, interventions) pass a
 * `client` so the request is written in the same transaction as their own record.
 */
export async function createRequest(
  { tenantId, userId, roles, type, title, description, details, priority = 'NORMAL', attachments = [], sourceType = null, sourceId = null, notifyRequester = false },
  client = prisma,
) {
  const def = REQUEST_TYPES[type];
  if (!def) throw badRequest(`Unknown request type: ${type}`);
  const role = requesterRoleOf(roles);
  if (!def.roles.includes(role)) throw forbidden(`A ${role.toLowerCase()} account cannot file "${def.label}".`);
  if (def.sourceType && !sourceType) throw badRequest(`"${def.label}" is submitted from its own screen.`);
  for (const field of def.fields ?? []) {
    if (field.required && !String(details?.[field.key] ?? '').trim()) {
      throw badRequest(`${field.label} is required.`, [{ field: field.key, message: `${field.label} is required.` }]);
    }
  }
  const files = decodeAttachments(attachments);

  const request = await client.serviceRequest.create({
    data: {
      tenantId,
      reference: buildReference('REQ'),
      requesterUserId: userId,
      requesterRole: role,
      type,
      category: def.category,
      title: title?.trim() || def.label,
      description: description ?? null,
      details: details ?? {},
      priority,
      sourceType,
      sourceId,
      events: { create: { actorUserId: userId, action: 'SUBMITTED', toStatus: 'PENDING', note: null } },
    },
    include: { requester: { select: { firstName: true, lastName: true } } },
  });
  await saveAttachments({ tenantId, ownerType: 'REQUEST', ownerId: request.id, userId, files }, client);

  await notifyAdmins(
    {
      tenantId,
      title: `New ${role === 'FACULTY' ? 'faculty' : 'student'} request: ${def.label}`,
      message: `${fullName(request.requester)} submitted ${request.reference} — ${request.title}.`,
      category: 'administrative',
      priority: priority === 'HIGH' || priority === 'URGENT' ? 'high' : 'normal',
      link: '/admin?ops=approvals',
      sourceType: 'SERVICE_REQUEST',
      sourceRefId: request.id,
      createdByUserId: userId,
    },
    client,
  );
  if (notifyRequester) {
    await notifyUsers(
      {
        tenantId,
        userIds: [userId],
        title: `${def.label} submitted`,
        message: `Request ${request.reference} is pending review. You will be notified when it is processed.`,
        link: '/help/requests',
        sourceType: 'SERVICE_REQUEST',
        sourceRefId: request.id,
      },
      client,
    );
  }
  return request;
}

export async function createGenericRequest(auth, payload) {
  const request = await prisma.$transaction((tx) =>
    createRequest({ tenantId: auth.tenantId, userId: auth.userId, roles: auth.roles, ...payload, notifyRequester: true }, tx),
  );
  return getRequest(auth, request.id);
}

export async function listMyRequests(auth) {
  const rows = await prisma.serviceRequest.findMany({
    where: { tenantId: auth.tenantId, requesterUserId: auth.userId },
    include,
    orderBy: { createdAt: 'desc' },
  });
  const requests = await presentMany(rows, auth);
  return {
    requests,
    summary: summarise(rows),
  };
}

export async function getRequest(auth, id) {
  const row = await prisma.serviceRequest.findFirst({ where: { id, tenantId: auth.tenantId }, include });
  if (!row) throw notFound('Request not found.');
  if (row.requesterUserId !== auth.userId && !auth.roles.includes('ADMIN')) throw forbidden();
  const [presented] = await presentMany([row], auth);
  return presented;
}

/** The requester answers a "needs information" decision; the request goes back to the queue. */
export async function respondToRequest(auth, id, { message, attachments = [] }) {
  const row = await prisma.serviceRequest.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!row) throw notFound('Request not found.');
  if (row.requesterUserId !== auth.userId) throw forbidden();
  if (row.status !== 'NEEDS_INFO') throw badRequest('This request is not waiting for information from you.');
  const files = decodeAttachments(attachments);

  await prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({ where: { id }, data: { status: 'PENDING' } });
    await tx.serviceRequestEvent.create({
      data: { requestId: id, actorUserId: auth.userId, action: 'INFO_PROVIDED', fromStatus: 'NEEDS_INFO', toStatus: 'PENDING', note: message },
    });
    await saveAttachments({ tenantId: auth.tenantId, ownerType: 'REQUEST', ownerId: id, userId: auth.userId, files }, tx);
    await applyToSource(tx, row, 'PENDING', null, null);
    await notifyAdmins(
      {
        tenantId: auth.tenantId,
        title: `Information provided on ${row.reference}`,
        message: `${auth.firstName} ${auth.lastName} responded: "${message.slice(0, 140)}"`,
        link: '/admin?ops=approvals',
        sourceType: 'SERVICE_REQUEST',
        sourceRefId: id,
        createdByUserId: auth.userId,
      },
      tx,
    );
  });
  return getRequest(auth, id);
}

export async function cancelRequest(auth, id) {
  const row = await prisma.serviceRequest.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!row) throw notFound('Request not found.');
  if (row.requesterUserId !== auth.userId) throw forbidden();
  if (!OPEN_STATUSES.includes(row.status)) throw badRequest('Only open requests can be withdrawn.');
  await prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await tx.serviceRequestEvent.create({
      data: { requestId: id, actorUserId: auth.userId, action: 'WITHDRAWN', fromStatus: row.status, toStatus: 'CANCELLED' },
    });
    await applyToSource(tx, row, 'CANCELLED', 'Withdrawn by requester', null);
  });
  return getRequest(auth, id);
}

/* ------------------------------------------------------------------------- */
/* Administrator side                                                          */
/* ------------------------------------------------------------------------- */

function summarise(rows) {
  const count = (status) => rows.filter((row) => row.status === status).length;
  return {
    total: rows.length,
    pending: count('PENDING'),
    inReview: count('IN_REVIEW'),
    needsInfo: count('NEEDS_INFO'),
    approved: count('APPROVED'),
    rejected: count('REJECTED'),
    open: rows.filter((row) => OPEN_STATUSES.includes(row.status)).length,
  };
}

export async function adminListRequests(auth, { status, role, search, limit = 100 } = {}) {
  const where = { tenantId: auth.tenantId };
  if (status === 'OPEN') where.status = { in: OPEN_STATUSES };
  else if (status && status !== 'ALL') where.status = status;
  if (role && role !== 'ALL') where.requesterRole = role;
  if (search) {
    where.OR = [
      { reference: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { requester: { lastName: { contains: search, mode: 'insensitive' } } },
      { requester: { firstName: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const [rows, all] = await Promise.all([
    prisma.serviceRequest.findMany({ where, include, orderBy: [{ createdAt: 'desc' }], take: limit }),
    prisma.serviceRequest.findMany({ where: { tenantId: auth.tenantId }, select: { status: true } }),
  ]);
  return { requests: await presentMany(rows, auth), summary: summarise(all) };
}

const DECISION_COPY = {
  IN_REVIEW: { action: 'MARKED_IN_REVIEW', title: 'is now in review', priority: 'normal' },
  NEEDS_INFO: { action: 'INFO_REQUESTED', title: 'needs more information', priority: 'high' },
  APPROVED: { action: 'APPROVED', title: 'was approved', priority: 'normal' },
  REJECTED: { action: 'REJECTED', title: 'was not approved', priority: 'normal' },
};

export async function decideRequest(auth, id, { status, note }) {
  const copy = DECISION_COPY[status];
  if (!copy) throw badRequest('Unsupported decision.');
  if ((status === 'NEEDS_INFO' || status === 'REJECTED') && !note?.trim()) {
    throw badRequest('Add a note so the requester knows what to do next.', [{ field: 'note', message: 'A note is required.' }]);
  }
  const row = await prisma.serviceRequest.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!row) throw notFound('Request not found.');
  if (!OPEN_STATUSES.includes(row.status)) throw badRequest(`This request is already ${STATUS_LABELS[row.status].toLowerCase()}.`);

  const final = status === 'APPROVED' || status === 'REJECTED';
  await prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id },
      data: {
        status,
        decisionNote: note?.trim() || row.decisionNote,
        ...(final ? { decidedByUserId: auth.userId, decidedAt: new Date() } : {}),
      },
    });
    await tx.serviceRequestEvent.create({
      data: { requestId: id, actorUserId: auth.userId, action: copy.action, fromStatus: row.status, toStatus: status, note: note?.trim() || null },
    });
    await applyToSource(tx, row, status, note, auth.userId);

    await notifyUsers(
      {
        tenantId: auth.tenantId,
        userIds: [row.requesterUserId],
        title: `${typeLabel(row.type)} ${copy.title}`,
        message: `${row.reference}: ${row.title}.${note?.trim() ? ` Note from the administrator: ${note.trim()}` : ''}`,
        category: 'administrative',
        priority: copy.priority,
        link: '/help/requests',
        sourceType: 'SERVICE_REQUEST',
        sourceRefId: id,
        createdByUserId: auth.userId,
      },
      tx,
    );
    await recordAudit(
      {
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: `REQUEST_${status}`,
        entityType: 'ServiceRequest',
        entityId: id,
        summary: `${row.reference} ${copy.title} (${typeLabel(row.type)})`,
        metadata: { note: note ?? null },
      },
      tx,
    );
  });
  return getRequest(auth, id);
}

/* ------------------------------------------------------------------------- */
/* Domain write-back                                                           */
/* ------------------------------------------------------------------------- */

const PROFILE_STATUS = {
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  NEEDS_INFO: 'NEEDS_INFO',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'REJECTED',
};

const TRANSCRIPT_STATUS = {
  PENDING: 'Submitted',
  IN_REVIEW: 'In Review',
  NEEDS_INFO: 'Action Required',
  APPROVED: 'Approved — Processing',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** "88 Harbor View Rd, Unit 12, Cambridge, MA, 02139" -> address parts (legacy rows). */
function parseAddress(value = '') {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 4) return { addressLine1: value };
  const postalCode = parts.pop();
  const state = parts.pop();
  const city = parts.pop();
  return { addressLine1: parts.join(', '), city, state, postalCode };
}

async function applyToSource(tx, request, status, note, reviewerId) {
  if (!request.sourceType || !request.sourceId) return;

  if (request.sourceType === 'PROFILE_CHANGE') {
    const change = await tx.profileChangeRequest.update({
      where: { id: request.sourceId },
      data: {
        status: PROFILE_STATUS[status],
        ...(note ? { reviewerNotes: note } : {}),
        ...(reviewerId ? { reviewedByUserId: reviewerId } : {}),
      },
    });
    if (status !== 'APPROVED') return;
    // Approval updates the record of truth, which is the point of the petition.
    const details = request.details ?? {};
    if (change.type === 'ADDRESS') {
      const address = details.addressLine1 ? details : parseAddress(change.newValue ?? '');
      await tx.studentProfile.updateMany({
        where: { userId: change.userId },
        data: {
          addressLine1: address.addressLine1 ?? undefined,
          city: address.city ?? undefined,
          state: address.state ?? undefined,
          postalCode: address.postalCode ?? undefined,
        },
      });
    } else if (change.type === 'NAME') {
      const words = String(change.newValue ?? '').split(/\s+/).filter(Boolean);
      const firstName = details.firstName ?? words[0];
      const lastName = details.lastName ?? words[words.length - 1];
      if (firstName && lastName) {
        await tx.user.update({ where: { id: change.userId }, data: { firstName, lastName } });
      }
    }
    return;
  }

  if (request.sourceType === 'TRANSCRIPT') {
    await tx.transcriptRequest.update({
      where: { id: request.sourceId },
      data: { status: TRANSCRIPT_STATUS[status] ?? 'Submitted', ...(note ? { notes: note } : {}) },
    });
    return;
  }

  if (request.sourceType === 'INTERVENTION') {
    const next = status === 'APPROVED' ? 'IN_PROGRESS' : status === 'REJECTED' || status === 'CANCELLED' ? 'OPEN' : null;
    if (next) {
      await tx.studentIntervention.update({ where: { id: request.sourceId }, data: { status: next } });
    }
  }
}
