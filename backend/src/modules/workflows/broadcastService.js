import { prisma } from '../../db/prisma.js';
import { formatTimeAgo } from '../../utils/format.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { notifyUsers } from '../notifications/notificationService.js';
import { recordAudit } from '../audit/auditService.js';

/**
 * Communication Center broadcasts. Sending one resolves the audience against real
 * users and writes in-app notifications through the shared notification table, so
 * "open rate" is the share of those notifications that were read. Email / SMS / push
 * channels are recorded as requested but not delivered (no providers are connected).
 */

export async function resolveAudience(tenantId, { audienceType, audienceValue }, client = prisma) {
  const active = { tenantId, status: 'ACTIVE' };
  const withRole = (keys) => ({ ...active, userRoles: { some: { role: { key: { in: keys } } } } });
  let where;
  switch (audienceType) {
    case 'ALL_CAMPUS':
      where = active;
      break;
    case 'ALL_STUDENTS':
      where = withRole(['STUDENT']);
      break;
    case 'ALL_FACULTY':
      where = withRole(['FACULTY']);
      break;
    case 'ROLE':
      where = withRole([audienceValue || 'STUDENT']);
      break;
    case 'DEPARTMENT':
      where = audienceValue && audienceValue !== 'ALL'
        ? { ...active, OR: [{ studentProfile: { department: { contains: audienceValue, mode: 'insensitive' } } }, { facultyProfile: { department: { contains: audienceValue, mode: 'insensitive' } } }] }
        : withRole(['STUDENT', 'FACULTY']);
      break;
    case 'PROGRAM':
      where = { ...active, studentProfile: { degree: { contains: audienceValue ?? '', mode: 'insensitive' } } };
      break;
    case 'COURSE':
      where = { ...active, studentProfile: { enrollments: { some: { course: { code: audienceValue ?? '' } } } } };
      break;
    case 'INDIVIDUAL':
      where = { ...active, OR: [{ email: { equals: audienceValue ?? '', mode: 'insensitive' } }, { studentProfile: { studentNumber: audienceValue ?? '' } }] };
      break;
    case 'STATUS':
      where = !audienceValue || /follow-up/i.test(audienceValue)
        ? { ...active, studentProfile: { interventions: { some: { status: { not: 'RESOLVED' } } } } }
        : { ...active, studentProfile: { academicStanding: { contains: audienceValue.replace(/standing/i, '').trim(), mode: 'insensitive' } } };
      break;
    default:
      where = withRole(['STUDENT']);
  }
  const users = await client.user.findMany({ where, select: { id: true } });
  return users.map((user) => user.id);
}

async function presentAll(tenantId, rows) {
  const ids = rows.filter((row) => row.status === 'SENT').map((row) => row.id);
  const stats = ids.length
    ? await prisma.notification.groupBy({
        by: ['sourceRefId', 'isRead'],
        where: { tenantId, sourceType: 'BROADCAST', sourceRefId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  return rows.map((row) => {
    const mine = stats.filter((stat) => stat.sourceRefId === row.id);
    const total = mine.reduce((sum, stat) => sum + stat._count._all, 0);
    const read = mine.filter((stat) => stat.isRead).reduce((sum, stat) => sum + stat._count._all, 0);
    return {
      id: row.id,
      title: row.title,
      message: row.message,
      category: row.category,
      priority: row.priority,
      audienceType: row.audienceType,
      audienceValue: row.audienceValue,
      audience: row.audienceLabel,
      channels: row.channels,
      status: row.status,
      scheduledFor: row.scheduledFor,
      expiresAt: row.expiresAt,
      sentAt: row.sentAt ? formatTimeAgo(row.sentAt) : null,
      sentAtIso: row.sentAt,
      lastSaved: formatTimeAgo(row.updatedAt),
      recipients: row.recipientCount,
      recipientsEst: row.recipientCount,
      readCount: read,
      openRate: total ? `${Math.round((read / total) * 100)}%` : '0%',
    };
  });
}

export async function listBroadcasts(auth) {
  // Scheduled sends whose time has passed are delivered when the list is next read —
  // the prototype has no job runner, and this keeps "scheduled" honest.
  const due = await prisma.communicationBroadcast.findMany({
    where: { tenantId: auth.tenantId, status: 'SCHEDULED', scheduledFor: { lte: new Date() } },
  });
  for (const broadcast of due) await deliver(auth, broadcast.id);

  const rows = await prisma.communicationBroadcast.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: { updatedAt: 'desc' },
  });
  const presented = await presentAll(auth.tenantId, rows);
  return {
    sent: presented.filter((row) => row.status === 'SENT'),
    scheduled: presented.filter((row) => row.status === 'SCHEDULED'),
    drafts: presented.filter((row) => row.status === 'DRAFT'),
  };
}

export async function previewAudience(auth, audience) {
  return { recipients: (await resolveAudience(auth.tenantId, audience)).length };
}

async function deliver(auth, id) {
  return prisma.$transaction(async (tx) => {
    const broadcast = await tx.communicationBroadcast.findUnique({ where: { id } });
    const userIds = await resolveAudience(auth.tenantId, broadcast, tx);
    await notifyUsers(
      {
        tenantId: auth.tenantId,
        userIds,
        title: broadcast.title,
        message: broadcast.message,
        category: broadcast.category,
        priority: broadcast.priority === 'urgent' ? 'high' : broadcast.priority,
        link: '/notifications',
        sourceType: 'BROADCAST',
        sourceRefId: broadcast.id,
        createdByUserId: broadcast.createdByUserId,
      },
      tx,
    );
    await tx.communicationBroadcast.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), recipientCount: userIds.length },
    });
    await recordAudit(
      { tenantId: auth.tenantId, actorUserId: auth.userId, action: 'BROADCAST_SENT', entityType: 'CommunicationBroadcast', entityId: id, summary: `Broadcast sent to ${userIds.length} recipient(s): ${broadcast.title}` },
      tx,
    );
    return userIds.length;
  });
}

/** action: DRAFT (save), SEND (now) or SCHEDULE (scheduledFor). */
export async function saveBroadcast(auth, payload, id = null) {
  const { action = 'SEND' } = payload;
  if (action !== 'DRAFT' && !payload.message?.trim()) throw badRequest('Message cannot be empty.');
  if (action === 'SCHEDULE' && (!payload.scheduledFor || new Date(payload.scheduledFor) <= new Date())) {
    throw badRequest('Choose a future scheduled time.');
  }
  const recipients = (await resolveAudience(auth.tenantId, payload)).length;
  if (action !== 'DRAFT' && recipients === 0) throw badRequest('No active users match this audience.');

  const data = {
    title: payload.title,
    message: payload.message ?? '',
    category: payload.category ?? 'academic',
    priority: payload.priority ?? 'normal',
    audienceType: payload.audienceType,
    audienceValue: payload.audienceValue ?? null,
    audienceLabel: payload.audienceLabel ?? payload.audienceType,
    channels: payload.channels ?? ['IN_APP'],
    scheduledFor: action === 'SCHEDULE' ? new Date(payload.scheduledFor) : null,
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
    recipientCount: recipients,
    status: action === 'DRAFT' ? 'DRAFT' : action === 'SCHEDULE' ? 'SCHEDULED' : 'DRAFT',
  };
  let row;
  if (id) {
    const existing = await prisma.communicationBroadcast.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!existing) throw notFound('Broadcast not found.');
    if (existing.status === 'SENT') throw badRequest('A sent broadcast cannot be edited.');
    row = await prisma.communicationBroadcast.update({ where: { id }, data });
  } else {
    row = await prisma.communicationBroadcast.create({ data: { ...data, tenantId: auth.tenantId, createdByUserId: auth.userId } });
  }
  if (action === 'SEND') await deliver(auth, row.id);
  if (action === 'SCHEDULE') {
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'BROADCAST_SCHEDULED', entityType: 'CommunicationBroadcast', entityId: row.id, summary: `Broadcast scheduled: ${row.title}` });
  }
  return listBroadcasts(auth);
}

export async function deleteBroadcast(auth, id) {
  const existing = await prisma.communicationBroadcast.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) throw notFound('Broadcast not found.');
  if (existing.status === 'SENT') throw badRequest('A sent broadcast cannot be deleted.');
  await prisma.communicationBroadcast.delete({ where: { id } });
  return listBroadcasts(auth);
}
