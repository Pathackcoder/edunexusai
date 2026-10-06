import { prisma } from '../../db/prisma.js';
import { formatTimeAgo } from '../../utils/format.js';

/**
 * Administrative audit trail. Written by the services that change shared state
 * (request decisions, ticket resolutions, publishing, entitlement changes, broadcasts)
 * and read by the Admin dashboard's activity widget.
 */
export async function recordAudit(
  { tenantId, actorUserId = null, action, entityType, entityId = null, summary, metadata = null },
  client = prisma,
) {
  return client.auditLog.create({
    data: { tenantId, actorUserId, action, entityType, entityId, summary, metadata },
  });
}

export async function listAudit(tenantId, { limit = 20 } = {}) {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { actor: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    title: row.summary,
    description: row.actor ? `${row.actor.firstName} ${row.actor.lastName} · ${row.entityType}` : row.entityType,
    actor: row.actor ? `${row.actor.firstName} ${row.actor.lastName}` : 'System',
    timestamp: formatTimeAgo(row.createdAt),
    createdAt: row.createdAt,
  }));
}
