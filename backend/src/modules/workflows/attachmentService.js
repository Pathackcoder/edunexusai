import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';

/**
 * Supporting documents for requests and support tickets.
 *
 * Files arrive as base64 inside the JSON body (the app has no multipart pipeline) and
 * are capped so the prototype database stays small. Access is checked against the
 * owning record: the requester or an administrator.
 */
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_ATTACHMENTS = 3;
const ALLOWED_TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+))$/;

export function decodeAttachments(files = []) {
  if (!files?.length) return [];
  if (files.length > MAX_ATTACHMENTS) throw badRequest(`Attach at most ${MAX_ATTACHMENTS} files.`);
  return files.map((file) => {
    const base64 = String(file.dataBase64 ?? '').replace(/^data:[^;]+;base64,/, '');
    const data = Buffer.from(base64, 'base64');
    if (!data.length) throw badRequest(`${file.fileName} is empty.`);
    if (data.length > MAX_ATTACHMENT_BYTES) throw badRequest(`${file.fileName} is larger than 1 MB.`);
    const mimeType = file.mimeType || 'application/octet-stream';
    if (!ALLOWED_TYPES.test(mimeType)) throw badRequest(`${file.fileName}: only PDF, image, text or Word files are accepted.`);
    return { fileName: String(file.fileName).slice(0, 200), mimeType, sizeBytes: data.length, data };
  });
}

export async function saveAttachments({ tenantId, ownerType, ownerId, userId, files }, client = prisma) {
  for (const file of files) {
    await client.attachment.create({
      data: { tenantId, ownerType, ownerId, uploadedByUserId: userId, ...file },
    });
  }
}

export async function listAttachmentMeta(ownerType, ownerIds) {
  const ids = Array.isArray(ownerIds) ? ownerIds : [ownerIds];
  if (!ids.length) return new Map();
  const rows = await prisma.attachment.findMany({
    where: { ownerType, ownerId: { in: ids } },
    select: { id: true, ownerId: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.ownerId) ?? [];
    list.push({ id: row.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes });
    map.set(row.ownerId, list);
  }
  return map;
}

/** Return the file if the caller owns the parent record or is an administrator. */
export async function getAttachmentForDownload(auth, id) {
  const file = await prisma.attachment.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!file) throw notFound('Attachment not found.');
  if (auth.roles.includes('ADMIN')) return file;

  const owner =
    file.ownerType === 'REQUEST'
      ? await prisma.serviceRequest.findFirst({ where: { id: file.ownerId }, select: { requesterUserId: true } })
      : file.ownerType === 'TICKET'
        ? await prisma.supportTicket.findFirst({ where: { id: file.ownerId }, select: { requesterUserId: true } })
        : null;
  if (owner?.requesterUserId !== auth.userId) throw forbidden('You cannot open this attachment.');
  return file;
}
