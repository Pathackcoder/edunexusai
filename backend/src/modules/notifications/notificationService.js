import { prisma } from '../../db/prisma.js';
import { formatTimeAgo, formatTimestamp } from '../../utils/format.js';
import { notFound } from '../../utils/errors.js';

/** Notifications are Edunexus-owned rows, scoped to one recipient. */

function present(notification) {
  return {
    id: notification.id,
    title: notification.title,
    category: notification.category,
    // `type` is kept alongside `category` because some existing screens read `type`.
    type: notification.category,
    message: notification.message,
    timeAgo: formatTimeAgo(notification.createdAt),
    time: formatTimeAgo(notification.createdAt),
    timestamp: formatTimestamp(notification.createdAt),
    isRead: notification.isRead,
    link: notification.link,
    priority: notification.priority,
    sourceType: notification.sourceType,
  };
}

export async function listNotifications(tenantId, userId, { unreadOnly = false } = {}) {
  const notifications = await prisma.notification.findMany({
    where: { tenantId, userId, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  return { notifications: notifications.map(present), unreadCount };
}

export async function markRead(tenantId, userId, id) {
  const existing = await prisma.notification.findFirst({ where: { tenantId, userId, id } });
  if (!existing) throw notFound('Notification not found.');
  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
  return present(updated);
}

export async function markAllRead(tenantId, userId) {
  const result = await prisma.notification.updateMany({
    where: { tenantId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: result.count };
}

/**
 * Create a notification for every student enrolled in a course.
 * Used by the faculty "Send notification to class" action.
 */
export async function notifyCourse({ tenantId, courseId, createdByUserId, title, message, priority = 'normal', link }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, courseId, status: { not: 'Dropped' } },
    include: { studentProfile: { select: { userId: true } } },
  });

  if (enrollments.length === 0) return { created: 0, recipients: [] };

  const rows = enrollments.map((enrollment) => ({
    tenantId,
    userId: enrollment.studentProfile.userId,
    title,
    message,
    category: 'academic',
    priority,
    link: link ?? '/notifications',
    sourceType: 'FACULTY_MESSAGE',
    sourceCourseId: courseId,
    createdByUserId,
  }));

  const result = await prisma.notification.createMany({ data: rows });
  return { created: result.count, recipients: enrollments.map((e) => e.studentProfile.userId) };
}

/**
 * Central fan-out used by every cross-persona workflow (requests, tickets, forms,
 * broadcasts, advising). One mechanism, one table: features never write their own
 * notification rows.
 */
export async function notifyUsers({
  tenantId,
  userIds,
  title,
  message,
  category = 'administrative',
  priority = 'normal',
  link = '/notifications',
  sourceType = 'SYSTEM',
  sourceRefId = null,
  createdByUserId = null,
}, client = prisma) {
  const recipients = [...new Set((userIds ?? []).filter(Boolean))];
  if (recipients.length === 0) return { created: 0 };
  const result = await client.notification.createMany({
    data: recipients.map((userId) => ({
      tenantId,
      userId,
      title,
      message,
      category,
      priority,
      link,
      sourceType,
      sourceRefId,
      createdByUserId,
    })),
  });
  return { created: result.count };
}

/** Every active administrator of the tenant. */
export async function adminUserIds(tenantId, client = prisma) {
  const admins = await client.user.findMany({
    where: { tenantId, status: 'ACTIVE', userRoles: { some: { role: { key: 'ADMIN' } } } },
    select: { id: true },
  });
  return admins.map((admin) => admin.id);
}

export async function notifyAdmins(payload, client = prisma) {
  return notifyUsers({ ...payload, userIds: await adminUserIds(payload.tenantId, client) }, client);
}
