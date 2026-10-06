import { prisma } from '../../db/prisma.js';
import { formatShortDate } from '../../utils/format.js';
import { forbidden, notFound } from '../../utils/errors.js';
import { notifyUsers } from '../notifications/notificationService.js';
import { recordAudit } from '../audit/auditService.js';

/**
 * Resources: institutional documents (published by administrators) and teaching
 * resources (published by faculty). Students and faculty see what is PUBLISHED for
 * their audience; owners manage drafts.
 */

const audienceFor = (roles) => (roles.includes('FACULTY') ? 'FACULTY' : roles.includes('STUDENT') ? 'STUDENT' : 'ALL');

function present(resource) {
  return {
    id: resource.id,
    title: resource.title,
    description: resource.description,
    category: resource.category,
    audience: resource.audience,
    ownerRole: resource.ownerRole,
    url: resource.url,
    fileLabel: resource.fileLabel,
    content: resource.content,
    status: resource.status,
    viewCount: resource.viewCount,
    publishedAt: resource.publishedAt,
    updatedAt: resource.updatedAt,
    updatedLabel: resource.status === 'PUBLISHED' && resource.publishedAt
      ? `Published ${formatShortDate(resource.publishedAt)}`
      : `Updated ${formatShortDate(resource.updatedAt)}`,
    author: resource.createdBy ? `${resource.createdBy.firstName} ${resource.createdBy.lastName}` : null,
    createdByUserId: resource.createdByUserId,
  };
}

const include = { createdBy: { select: { firstName: true, lastName: true } } };

export async function listPublishedResources(auth, { category, search } = {}) {
  const audience = audienceFor(auth.roles);
  const where = {
    tenantId: auth.tenantId,
    status: 'PUBLISHED',
    ...(auth.roles.includes('ADMIN') ? {} : { audience: { in: ['ALL', audience] } }),
    ...(category && category !== 'ALL' ? { category } : {}),
    ...(search
      ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }
      : {}),
  };
  const rows = await prisma.portalResource.findMany({ where, include, orderBy: { publishedAt: 'desc' } });
  const categories = [...new Set(rows.map((row) => row.category))].sort();
  return { resources: rows.map(present), categories };
}

export async function openResource(auth, id) {
  const resource = await prisma.portalResource.findFirst({ where: { id, tenantId: auth.tenantId }, include });
  if (!resource) throw notFound('Resource not found.');
  const isOwner = resource.createdByUserId === auth.userId || auth.roles.includes('ADMIN');
  if (resource.status !== 'PUBLISHED' && !isOwner) throw notFound('Resource not found.');
  if (resource.status === 'PUBLISHED') {
    await prisma.portalResource.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }
  return present({ ...resource, viewCount: resource.viewCount + (resource.status === 'PUBLISHED' ? 1 : 0) });
}

/** Resources the caller manages: everything for admins, own teaching resources for faculty. */
export async function listManagedResources(auth) {
  const where = auth.roles.includes('ADMIN')
    ? { tenantId: auth.tenantId }
    : { tenantId: auth.tenantId, createdByUserId: auth.userId };
  const rows = await prisma.portalResource.findMany({ where, include, orderBy: { updatedAt: 'desc' } });
  return rows.map(present);
}

const slugify = (value) =>
  `${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}-${Date.now().toString(36)}`;

async function announce(tx, auth, resource) {
  const roleKeys = resource.audience === 'ALL' ? ['STUDENT', 'FACULTY'] : [resource.audience];
  const users = await tx.user.findMany({
    where: { tenantId: auth.tenantId, status: 'ACTIVE', id: { not: auth.userId }, userRoles: { some: { role: { key: { in: roleKeys } } } } },
    select: { id: true },
  });
  await notifyUsers(
    {
      tenantId: auth.tenantId,
      userIds: users.map((user) => user.id),
      title: `New resource: ${resource.title}`,
      message: resource.description ?? `${resource.category} resource published.`,
      category: 'campus',
      priority: 'low',
      link: '/help/resources',
      sourceType: 'PORTAL_RESOURCE',
      sourceRefId: resource.id,
      createdByUserId: auth.userId,
    },
    tx,
  );
}

export async function createResource(auth, payload) {
  const isAdmin = auth.roles.includes('ADMIN');
  return prisma.$transaction(async (tx) => {
    const resource = await tx.portalResource.create({
      data: {
        tenantId: auth.tenantId,
        slug: slugify(payload.title),
        title: payload.title,
        description: payload.description ?? null,
        category: payload.category ?? (isAdmin ? 'Institutional' : 'Teaching'),
        // Faculty publish to students; administrators choose.
        audience: isAdmin ? payload.audience ?? 'ALL' : 'STUDENT',
        ownerRole: isAdmin ? 'ADMIN' : 'FACULTY',
        url: payload.url || null,
        fileLabel: payload.fileLabel ?? (payload.url ? 'External link' : 'Portal page'),
        content: payload.content ?? null,
        status: payload.status ?? 'DRAFT',
        publishedAt: payload.status === 'PUBLISHED' ? new Date() : null,
        createdByUserId: auth.userId,
      },
      include,
    });
    if (resource.status === 'PUBLISHED') await announce(tx, auth, resource);
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'RESOURCE_CREATED', entityType: 'PortalResource', entityId: resource.id, summary: `Resource ${resource.status === 'PUBLISHED' ? 'published' : 'drafted'}: ${resource.title}` }, tx);
    return present(resource);
  });
}

export async function updateResource(auth, id, payload) {
  const existing = await prisma.portalResource.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) throw notFound('Resource not found.');
  if (!auth.roles.includes('ADMIN') && existing.createdByUserId !== auth.userId) throw forbidden();
  const publishing = payload.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
  return prisma.$transaction(async (tx) => {
    const resource = await tx.portalResource.update({
      where: { id },
      data: {
        ...['title', 'description', 'category', 'url', 'content', 'fileLabel', 'status'].reduce(
          (acc, key) => (payload[key] !== undefined ? { ...acc, [key]: payload[key] } : acc),
          {},
        ),
        ...(payload.audience && auth.roles.includes('ADMIN') ? { audience: payload.audience } : {}),
        ...(publishing ? { publishedAt: new Date() } : {}),
      },
      include,
    });
    if (publishing) await announce(tx, auth, resource);
    await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: publishing ? 'RESOURCE_PUBLISHED' : 'RESOURCE_UPDATED', entityType: 'PortalResource', entityId: id, summary: `Resource ${publishing ? 'published' : 'updated'}: ${resource.title}` }, tx);
    return present(resource);
  });
}
