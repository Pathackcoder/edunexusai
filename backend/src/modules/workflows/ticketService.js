import { prisma } from '../../db/prisma.js';
import { buildReference, formatTimeAgo } from '../../utils/format.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { notifyAdmins, notifyUsers } from '../notifications/notificationService.js';
import { recordAudit } from '../audit/auditService.js';
import { decodeAttachments, listAttachmentMeta, saveAttachments } from './attachmentService.js';

/**
 * Help desk. Students and faculty open tickets; the Admin Operations Workspace works
 * the queue. Replies on either side are messages on the same thread, and each side is
 * notified when the other acts.
 */

export const TICKET_CATEGORIES = ['IT Access', 'LMS / Canvas', 'Financial Aid', 'Billing', 'Registration', 'Facilities', 'Accessibility', 'Other'];

const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  AWAITING_USER: 'Awaiting Your Reply',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};
const OPEN = ['OPEN', 'IN_PROGRESS', 'AWAITING_USER'];

const include = {
  requester: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      userRoles: { select: { role: { select: { key: true } } } },
    },
  },
  assignedTo: { select: { firstName: true, lastName: true } },
  messages: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { firstName: true, lastName: true } } },
  },
};

const name = (user) => (user ? `${user.firstName} ${user.lastName}` : null);

function present(ticket, attachments = []) {
  const roles = ticket.requester.userRoles.map((link) => link.role.key);
  return {
    id: ticket.id,
    reference: ticket.reference,
    category: ticket.category,
    subject: ticket.subject,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status],
    isOpen: OPEN.includes(ticket.status),
    requester: {
      id: ticket.requester.id,
      name: name(ticket.requester),
      email: ticket.requester.email,
      role: roles.includes('FACULTY') ? 'FACULTY' : roles.includes('STUDENT') ? 'STUDENT' : 'ADMIN',
    },
    assignedTo: name(ticket.assignedTo),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    timeAgo: formatTimeAgo(ticket.createdAt),
    resolvedAt: ticket.resolvedAt,
    attachments,
    messages: ticket.messages.map((message) => ({
      id: message.id,
      body: message.body,
      author: name(message.author) ?? 'Support',
      isStaffReply: message.isStaffReply,
      at: message.createdAt,
      timeAgo: formatTimeAgo(message.createdAt),
    })),
  };
}

async function presentMany(rows) {
  const files = await listAttachmentMeta('TICKET', rows.map((row) => row.id));
  return rows.map((row) => present(row, files.get(row.id) ?? []));
}

async function load(auth, id) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id, tenantId: auth.tenantId }, include });
  if (!ticket) throw notFound('Ticket not found.');
  if (ticket.requesterUserId !== auth.userId && !auth.roles.includes('ADMIN')) throw forbidden();
  return ticket;
}

export async function getTicket(auth, id) {
  const [presented] = await presentMany([await load(auth, id)]);
  return presented;
}

export async function listMyTickets(auth) {
  const rows = await prisma.supportTicket.findMany({
    where: { tenantId: auth.tenantId, requesterUserId: auth.userId },
    include,
    orderBy: { updatedAt: 'desc' },
  });
  return { tickets: await presentMany(rows), categories: TICKET_CATEGORIES };
}

export async function createTicket(auth, { category, subject, description, priority = 'NORMAL', attachments = [] }) {
  const files = decodeAttachments(attachments);
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        tenantId: auth.tenantId,
        reference: buildReference('TCK'),
        requesterUserId: auth.userId,
        category,
        subject,
        description,
        priority,
      },
    });
    await saveAttachments({ tenantId: auth.tenantId, ownerType: 'TICKET', ownerId: created.id, userId: auth.userId, files }, tx);
    await notifyAdmins(
      {
        tenantId: auth.tenantId,
        title: `New support ticket ${created.reference}`,
        message: `${auth.firstName} ${auth.lastName} · ${category}: ${subject}`,
        priority: priority === 'HIGH' || priority === 'URGENT' ? 'high' : 'normal',
        link: '/admin?ops=support',
        sourceType: 'SUPPORT_TICKET',
        sourceRefId: created.id,
        createdByUserId: auth.userId,
      },
      tx,
    );
    return created;
  });
  return getTicket(auth, ticket.id);
}

/** Either side replies. A requester reply re-opens a ticket that was waiting on them. */
export async function replyToTicket(auth, id, { body }) {
  const ticket = await load(auth, id);
  const isStaff = auth.roles.includes('ADMIN') && ticket.requesterUserId !== auth.userId;
  if (ticket.status === 'CLOSED') throw badRequest('This ticket is closed. Open a new ticket if you still need help.');

  await prisma.$transaction(async (tx) => {
    await tx.supportTicketMessage.create({ data: { ticketId: id, authorUserId: auth.userId, body, isStaffReply: isStaff } });
    const nextStatus = isStaff
      ? ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status
      : ['AWAITING_USER', 'RESOLVED'].includes(ticket.status) ? 'IN_PROGRESS' : ticket.status;
    await tx.supportTicket.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(isStaff && !ticket.assignedToUserId ? { assignedToUserId: auth.userId } : {}),
        ...(nextStatus !== 'RESOLVED' ? { resolvedAt: null } : {}),
      },
    });
    if (isStaff) {
      await notifyUsers(
        {
          tenantId: auth.tenantId,
          userIds: [ticket.requesterUserId],
          title: `Support replied on ${ticket.reference}`,
          message: body.slice(0, 200),
          link: `/help/tickets?ticket=${id}`,
          sourceType: 'SUPPORT_TICKET',
          sourceRefId: id,
          createdByUserId: auth.userId,
        },
        tx,
      );
    } else {
      await notifyAdmins(
        {
          tenantId: auth.tenantId,
          title: `New reply on ${ticket.reference}`,
          message: `${auth.firstName} ${auth.lastName}: ${body.slice(0, 160)}`,
          link: '/admin?ops=support',
          sourceType: 'SUPPORT_TICKET',
          sourceRefId: id,
          createdByUserId: auth.userId,
        },
        tx,
      );
    }
  });
  return getTicket(auth, id);
}

/**
 * Status changes. Admins can move a ticket through any state; requesters may only
 * mark their own ticket resolved or closed.
 */
export async function updateTicketStatus(auth, id, { status, note }) {
  const ticket = await load(auth, id);
  const isAdmin = auth.roles.includes('ADMIN');
  if (!isAdmin && !['RESOLVED', 'CLOSED'].includes(status)) throw forbidden('You can only resolve or close your own ticket.');
  if (ticket.status === status) return getTicket(auth, id);

  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' ? new Date() : status === 'CLOSED' ? ticket.resolvedAt ?? new Date() : null,
        closedAt: status === 'CLOSED' ? new Date() : null,
        ...(isAdmin && !ticket.assignedToUserId ? { assignedToUserId: auth.userId } : {}),
      },
    });
    const text = note?.trim() || `Status changed to ${STATUS_LABELS[status]}.`;
    await tx.supportTicketMessage.create({
      data: { ticketId: id, authorUserId: auth.userId, body: text, isStaffReply: isAdmin && ticket.requesterUserId !== auth.userId },
    });
    if (isAdmin && ticket.requesterUserId !== auth.userId) {
      await notifyUsers(
        {
          tenantId: auth.tenantId,
          userIds: [ticket.requesterUserId],
          title: `Ticket ${ticket.reference}: ${STATUS_LABELS[status]}`,
          message: text,
          priority: status === 'AWAITING_USER' ? 'high' : 'normal',
          link: `/help/tickets?ticket=${id}`,
          sourceType: 'SUPPORT_TICKET',
          sourceRefId: id,
          createdByUserId: auth.userId,
        },
        tx,
      );
      await recordAudit(
        {
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: `TICKET_${status}`,
          entityType: 'SupportTicket',
          entityId: id,
          summary: `${ticket.reference} marked ${STATUS_LABELS[status].toLowerCase()}`,
        },
        tx,
      );
    } else {
      await notifyAdmins(
        {
          tenantId: auth.tenantId,
          title: `${ticket.reference} ${STATUS_LABELS[status].toLowerCase()} by requester`,
          message: ticket.subject,
          link: '/admin?ops=support',
          sourceType: 'SUPPORT_TICKET',
          sourceRefId: id,
          createdByUserId: auth.userId,
        },
        tx,
      );
    }
  });
  return getTicket(auth, id);
}

export async function adminListTickets(auth, { status = 'OPEN', search } = {}) {
  const where = { tenantId: auth.tenantId };
  if (status === 'OPEN') where.status = { in: OPEN };
  else if (status && status !== 'ALL') where.status = status;
  if (search) {
    where.OR = [
      { reference: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [rows, all] = await Promise.all([
    prisma.supportTicket.findMany({ where, include, orderBy: { updatedAt: 'desc' }, take: 100 }),
    prisma.supportTicket.findMany({
      where: { tenantId: auth.tenantId },
      select: { status: true, priority: true, assignedToUserId: true, createdAt: true, resolvedAt: true },
    }),
  ]);
  const resolved = all.filter((row) => row.resolvedAt);
  const avgHours = resolved.length
    ? resolved.reduce((sum, row) => sum + (row.resolvedAt - row.createdAt), 0) / resolved.length / 3_600_000
    : null;
  const open = all.filter((row) => OPEN.includes(row.status));
  return {
    tickets: await presentMany(rows),
    categories: TICKET_CATEGORIES,
    summary: {
      open: open.length,
      unassigned: open.filter((row) => !row.assignedToUserId).length,
      highPriority: open.filter((row) => ['HIGH', 'URGENT'].includes(row.priority)).length,
      avgResolutionHours: avgHours == null ? null : Math.round(avgHours * 10) / 10,
      resolved: all.filter((row) => ['RESOLVED', 'CLOSED'].includes(row.status)).length,
    },
  };
}
