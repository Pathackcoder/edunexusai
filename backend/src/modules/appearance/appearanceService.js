import { createHash } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { recordAudit } from '../audit/auditService.js';
import { TENANT_FALLBACK_SLUG } from '../auth/constants.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { findFont, findTheme } from '../../../../shared/appearancePresets.js';
import { LOGO_LIMITS, logoShapeProblem } from '../../../../shared/brandAssets.js';
import { inspectImage } from './logoImage.js';
import { readLogo, removeLogo, storeLogo } from './logoStorage.js';

/**
 * Portal appearance: the theme and typography presets an institution's administrators
 * choose. Stored per tenant (never global), returned as preset keys only. Unknown or
 * retired keys fall back to the defaults so a portal always renders.
 *
 * The institution logo: one per tenant. The file lives in the branding storage directory
 * (logoStorage.js); the tenant_brand_assets row (kind 'logo') holds its storage key and metadata.
 * `logo` is null while the bundled logo is used. Its address carries the institution and a content
 * version, so <img> tags need no token and an updated logo is a new address (no stale cache).
 */
const LOGO_KIND = 'logo';
const logoUrl = (slug, asset) => `/api/v1/appearance/logo/${encodeURIComponent(slug)}?v=${asset.sha256.slice(0, 16)}`;
const presentLogo = (tenant) => {
  const asset = (tenant.brandAssets ?? []).find((a) => a.kind === LOGO_KIND && a.storageKey);
  return asset ? { url: logoUrl(tenant.slug, asset), width: asset.width, height: asset.height, updatedAt: asset.updatedAt } : null;
};

const present = (tenant) => ({
  themeKey: findTheme(tenant.appearanceTheme).key,
  fontKey: findFont(tenant.appearanceFont).key,
  updatedAt: tenant.appearanceUpdatedAt,
  logo: presentLogo(tenant),
});

const select = {
  id: true, slug: true, appearanceTheme: true, appearanceFont: true, appearanceUpdatedAt: true,
  brandAssets: { where: { kind: LOGO_KIND }, select: { kind: true, storageKey: true, sha256: true, width: true, height: true, updatedAt: true } },
};

export async function getAppearance(tenantId) {
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select })
    : await prisma.tenant.findUnique({ where: { slug: TENANT_FALLBACK_SLUG }, select });
  if (!tenant) throw notFound('Institution not found.');
  return present(tenant);
}

export async function updateAppearance(tenantId, { themeKey, fontKey }, actorUserId) {
  const tenant = await prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.update({
      where: { id: tenantId },
      data: { appearanceTheme: themeKey, appearanceFont: fontKey, appearanceUpdatedAt: new Date() },
      select,
    });
    await recordAudit(
      {
        tenantId,
        actorUserId,
        action: 'APPEARANCE_UPDATED',
        entityType: 'Tenant',
        entityId: tenantId,
        summary: `Portal appearance set to ${findTheme(themeKey).label} with ${findFont(fontKey).label}`,
        metadata: { themeKey, fontKey },
      },
      tx,
    );
    return updated;
  });
  return present(tenant);
}

/**
 * Set the institution's logo from an upload (administrators only). The image is checked from its bytes;
 * the file is written first, then the row points at it; the previous file is removed afterwards.
 */
export async function updateLogo(tenantId, { dataBase64 }, actorUserId) {
  const bytes = Buffer.from(String(dataBase64 ?? ''), 'base64');
  if (!bytes.length) throw badRequest('The file is empty.');
  if (bytes.length > LOGO_LIMITS.maxBytes) throw badRequest('The logo can be at most 1 MB.');
  const image = inspectImage(bytes);
  if (!image || !LOGO_LIMITS.types[image.mimeType]) throw badRequest('Upload a PNG, JPEG or WebP image.');
  const problem = logoShapeProblem(image.width, image.height);
  if (problem) throw badRequest(problem);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const previous = await prisma.tenantBrandAsset.findUnique({ where: { tenantId_kind: { tenantId, kind: LOGO_KIND } }, select: { storageKey: true } });
  const storageKey = await storeLogo(tenantId, sha256, image.mimeType, bytes);
  const data = { mimeType: image.mimeType, data: null, storageKey, byteSize: bytes.length, width: image.width, height: image.height, sha256, updatedByUserId: actorUserId };
  let tenant;
  try {
    tenant = await prisma.$transaction(async (tx) => {
      await tx.tenantBrandAsset.upsert({ where: { tenantId_kind: { tenantId, kind: LOGO_KIND } }, create: { tenantId, kind: LOGO_KIND, ...data }, update: data });
      await recordAudit({ tenantId, actorUserId, action: 'APPEARANCE_LOGO_UPDATED', entityType: 'Tenant', entityId: tenantId, summary: `Institution logo replaced (${LOGO_LIMITS.types[image.mimeType]}, ${image.width} × ${image.height} px)`, metadata: { sha256, byteSize: bytes.length } }, tx);
      return tx.tenant.findUnique({ where: { id: tenantId }, select });
    });
  } catch (error) {
    if (storageKey !== previous?.storageKey) await removeLogo(storageKey);
    throw error;
  }
  if (previous?.storageKey && previous.storageKey !== storageKey) await removeLogo(previous.storageKey);
  return present(tenant);
}

/** Go back to the logo bundled with the deployment. */
export async function resetLogo(tenantId, actorUserId) {
  const previous = await prisma.tenantBrandAsset.findUnique({ where: { tenantId_kind: { tenantId, kind: LOGO_KIND } }, select: { storageKey: true } });
  const tenant = await prisma.$transaction(async (tx) => {
    const { count } = await tx.tenantBrandAsset.deleteMany({ where: { tenantId, kind: LOGO_KIND } });
    if (count) await recordAudit({ tenantId, actorUserId, action: 'APPEARANCE_LOGO_RESET', entityType: 'Tenant', entityId: tenantId, summary: 'Institution logo reset to the default' }, tx);
    return tx.tenant.findUnique({ where: { id: tenantId }, select });
  });
  if (previous?.storageKey) await removeLogo(previous.storageKey);
  return present(tenant);
}

/** The current logo file of an institution (by its public slug), or null (then the bundled logo is used). */
export async function logoFile(tenantSlug) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, isActive: true } });
  if (!tenant?.isActive) return null;
  const asset = await prisma.tenantBrandAsset.findUnique({ where: { tenantId_kind: { tenantId: tenant.id, kind: LOGO_KIND } }, select: { mimeType: true, storageKey: true, sha256: true } });
  if (!asset?.storageKey) return null;
  const bytes = await readLogo(asset.storageKey);
  return bytes ? { mimeType: asset.mimeType, sha256: asset.sha256, bytes } : null;
}
