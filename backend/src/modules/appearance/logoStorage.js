import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

/**
 * Where uploaded institution logos are kept: a directory managed by the backend, outside the frontend
 * source and build. BRANDING_STORAGE_DIR sets it (in production a persistent directory outside the
 * code checkout, e.g. /var/lib/edunexus/branding); by default backend/storage/branding (git-ignored).
 *
 * Keys are generated here, never taken from a request: `<tenant id>/<sha-256 of the bytes>.<ext>`.
 * A replaced logo is a new file (new key, new address); the old file is removed after the switch.
 */
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const KEY = /^[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|jpg|webp)$/;

export const brandingRoot = () => path.resolve(process.env.BRANDING_STORAGE_DIR || path.join(BACKEND_ROOT, 'storage', 'branding'));

/** The absolute path of a key, only if the key is well-formed and stays inside the storage directory. */
function pathOf(key) {
  if (!KEY.test(String(key))) return null;
  const root = brandingRoot();
  const full = path.resolve(root, key);
  return full.startsWith(root + path.sep) ? full : null;
}

export async function storeLogo(tenantId, sha256, mimeType, bytes) {
  const key = `${tenantId}/${sha256}.${EXTENSION[mimeType]}`;
  const target = pathOf(key);
  if (!target) throw new Error('Invalid logo storage key.');
  await mkdir(path.dirname(target), { recursive: true });
  // Write beside the target, then rename: readers never see a half-written file.
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, bytes, { mode: 0o640 });
  await rename(temp, target);
  return key;
}

/** The file's bytes, or null when it is missing (the portal then falls back to the bundled logo). */
export async function readLogo(key) {
  const file = pathOf(key);
  if (!file) return null;
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warn('Institution logo could not be read', { code: error.code });
    return null;
  }
}

export async function removeLogo(key) {
  const file = pathOf(key);
  if (!file) return;
  await rm(file, { force: true }).catch((error) => logger.warn('Old institution logo could not be removed', { code: error.code }));
}
