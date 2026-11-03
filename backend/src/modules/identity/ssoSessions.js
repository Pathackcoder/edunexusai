import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

/**
 * Institutional sign-in sessions and the single-use hand-off, kept in the database so every backend
 * instance sees the same state.
 *
 *   sso_sessions  one row per sign-in; its id is the `sid` in the session tokens. A session works only
 *                 while the row is not ended or expired, the provider is still enabled and the sign-in
 *                 identity is still linked. Ending it stops the access token on its next request and
 *                 the refresh token at once.
 *   sso_handoffs  the code the callback hands to the browser: only its SHA-256 is stored, it is consumed
 *                 by one conditional UPDATE (so two concurrent exchanges cannot both win), it expires
 *                 after 60 seconds, and it holds no tokens.
 */

export const HANDOFF_TTL_MS = 60_000;
const DURATION = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** The session lives as long as a refresh token could keep it alive. */
function sessionTtlMs() {
  const match = /^(\d+)\s*([smhd])?$/.exec(String(env.jwt.refreshTtl).trim());
  return match ? Number(match[1]) * DURATION[match[2] ?? 's'] : 7 * DURATION.d;
}

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

/* The ID token is needed only as the logout hint; at rest it is sealed with a key of its own. */
const tokenKey = () => Buffer.from(hkdfSync('sha256', Buffer.from(String(env.jwt.secret)), Buffer.alloc(0), Buffer.from('edunexus-sso-id-token-v1'), 32));

function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

function unseal(sealed) {
  try {
    const [iv, tag, body] = String(sealed).split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function startSsoSession({ tenantId, userId, providerId, subject, idpSessionId = null, idToken = null }) {
  return prisma.ssoSession.create({
    data: { tenantId, userId, providerId, subject, idpSessionId, idTokenSealed: idToken ? seal(idToken) : null, expiresAt: new Date(Date.now() + sessionTtlMs()) },
  });
}

/**
 * The SSO session behind a token, or null when it no longer grants access: ended, expired, another
 * account's, the provider disabled, or the sign-in identity unlinked.
 */
export async function activeSsoSession(sid, userId) {
  if (!sid) return null;
  const session = await prisma.ssoSession.findUnique({ where: { id: String(sid) }, include: { provider: { select: { enabled: true, key: true } } } });
  if (!session || session.userId !== userId || session.endedAt || session.expiresAt <= new Date() || !session.provider.enabled) return null;
  const linked = await prisma.federatedIdentity.count({ where: { userId, providerId: session.providerId, subject: session.subject } });
  return linked ? session : null;
}

/** End sessions matching `where` (a Prisma filter); returns how many were ended. */
export async function endSsoSessions(where, reason) {
  const { count } = await prisma.ssoSession.updateMany({ where: { ...where, endedAt: null }, data: { endedAt: new Date(), endedReason: reason, idTokenSealed: null } });
  return count;
}

/** The ID token to send as id_token_hint at logout (so the provider skips its confirmation page). */
export async function idTokenHint(sid, userId) {
  if (!sid) return null;
  const session = await prisma.ssoSession.findUnique({ where: { id: String(sid) }, select: { userId: true, idTokenSealed: true } });
  if (!session || session.userId !== userId || !session.idTokenSealed) return null;
  return unseal(session.idTokenSealed);
}

/* ------------------------------------------------------------------ hand-off */

export async function createHandoff({ tenantId, userId, ssoSessionId, returnTo }) {
  // Housekeeping: hand-offs past their expiry are of no use to anyone.
  await prisma.ssoHandoff.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - HANDOFF_TTL_MS) } } }).catch(() => {});
  const code = randomBytes(32).toString('base64url');
  await prisma.ssoHandoff.create({ data: { codeHash: sha256(code), tenantId, userId, ssoSessionId, returnTo, expiresAt: new Date(Date.now() + HANDOFF_TTL_MS) } });
  return code;
}

/** Consume a hand-off code exactly once. Returns { tenantId, userId, ssoSessionId, returnTo } or null. */
export async function redeemHandoff(code) {
  const codeHash = sha256(code ?? '');
  const now = new Date();
  const { count } = await prisma.ssoHandoff.updateMany({ where: { codeHash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
  if (count !== 1) return null;
  const { tenantId, userId, ssoSessionId, returnTo } = await prisma.ssoHandoff.findUnique({ where: { codeHash } });
  return { tenantId, userId, ssoSessionId, returnTo };
}
