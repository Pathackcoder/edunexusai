import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCode, invalidCredentials, unauthenticated } from '../../utils/errors.js';
import { TENANT_FALLBACK_SLUG } from './constants.js';
import { recordAudit } from '../audit/auditService.js';
import { activeSsoSession } from '../identity/ssoSessions.js';
import { burnComparison, hashPassword, needsRehash, verifyPassword } from './passwords.js';
import { trackSignIn } from '../analytics/serverEvents.js';

/**
 * Prototype authentication.
 *
 * Email + password verified against PostgreSQL (bcrypt; see passwords.js), then a short-lived JWT access
 * token plus a rotating refresh token. Refresh tokens are stored as SHA-256 hashes so a
 * database dump does not hand over usable sessions.
 *
 * PRODUCTION NOTE: a real deployment will not own student passwords at all. It will
 * federate to the institution's identity provider over SAML or OIDC (Azure AD, Okta,
 * Shibboleth) and this module becomes the place where an assertion is exchanged for a
 * session. The rest of the backend is unaffected because every route depends on
 * `req.auth`, not on how the user proved who they are.
 */

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function signAccessToken(user, roles, tierKey, { idp = null, sid = null } = {}) {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles,
      tier: tierKey ?? null,
      // Institutional sign-in: how the session started (RFC 8176 "amr") and with which provider.
      ...(idp ? { amr: ['oidc'], idp, sid } : {}),
    },
    env.jwt.secret,
    { expiresIn: env.jwt.accessTtl, issuer: env.jwt.issuer },
  );
}

function signRefreshToken(user, { idp = null, sid = null } = {}) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, tenantId: user.tenantId, jti, ...(idp ? { idp, sid } : {}) }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
    issuer: env.jwt.issuer,
  });
  return { token, jti };
}

async function persistRefreshToken(userId, token) {
  const decoded = jwt.decode(token);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(decoded.exp * 1000),
    },
  });
}

/** Resolve the tenant a login attempt belongs to. */
async function resolveTenant(tenantSlug) {
  if (tenantSlug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.isActive) throw invalidCredentials('Unknown institution.');
    return tenant;
  }
  // Single-tenant prototype: fall back to the demo institution. A production
  // deployment resolves the tenant from the host name or the IdP that authenticated.
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_FALLBACK_SLUG } });
  if (!tenant) throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'No institution is configured. Run the seed.');
  return tenant;
}

export async function login({ email, password, tenantSlug }) {
  const tenant = await resolveTenant(tenantSlug);
  const normalisedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: normalisedEmail } },
    include: {
      userRoles: { include: { role: true } },
      studentProfile: { include: { tier: true } },
    },
  });

  // Same error and comparable timing whether the account is missing or the password is
  // wrong, so the endpoint cannot be used to enumerate accounts.
  if (!user) {
    await burnComparison(password);
    throw invalidCredentials();
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) throw invalidCredentials();
  if (user.status !== 'ACTIVE') throw invalidCredentials('This account is not active.');
  // A legacy plaintext row (from the retired development setting) is hashed on this login.
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  }

  return issueSession(user);
}

/**
 * The portal session (access + rotating refresh token) for an authenticated, ACTIVE account. Shared by
 * password sign-in and institutional sign-in (`idp` + `sid`, its sso_sessions row), so both produce exactly the
 * same session.
 */
export async function issueSession(user, { idp = null, sid = null } = {}) {
  const loaded = user.userRoles && user.studentProfile !== undefined
    ? user
    : await prisma.user.findUnique({ where: { id: user.id }, include: { userRoles: { include: { role: true } }, studentProfile: { include: { tier: true } } } });
  if (!loaded || loaded.status !== 'ACTIVE') throw invalidCredentials('This account is not active.');
  const roles = loaded.userRoles.map((link) => link.role.key);
  const tierKey = loaded.studentProfile?.tier?.key ?? null;

  const accessToken = signAccessToken(loaded, roles, tierKey, { idp, sid });
  const { token: refreshToken } = signRefreshToken(loaded, { idp, sid });
  await persistRefreshToken(loaded.id, refreshToken);
  await prisma.user.update({ where: { id: loaded.id }, data: { lastLoginAt: new Date() } });
  // Analytics (only when collection is on): one sign-in per issued session; a token refresh never comes here.
  void trackSignIn({ tenantId: loaded.tenantId, userId: loaded.id, rolesHeld: roles, method: idp ? 'SSO' : 'PASSWORD' });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.jwt.accessTtl,
    userId: loaded.id,
    tenantId: loaded.tenantId,
  };
}

export async function refresh({ refreshToken }) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret, { issuer: env.jwt.issuer });
  } catch {
    throw unauthenticated('Refresh token is invalid or expired. Please sign in again.');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthenticated('Refresh token is no longer valid. Please sign in again.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      userRoles: { include: { role: true } },
      studentProfile: { include: { tier: true } },
    },
  });
  if (!user || user.status !== 'ACTIVE') throw unauthenticated('Account is not active.');
  // An institutional session ends with its sso_sessions row (logout, back-channel logout, unlink,
  // provider disabled); a token from before that row existed cannot be refreshed either.
  if (payload.idp && !(await activeSsoSession(payload.sid, user.id))) {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    throw unauthenticated('Your institutional sign-in has ended. Please sign in again.');
  }

  // Rotate: the presented token is revoked and a new one issued, so a stolen refresh
  // token stops working as soon as the legitimate client refreshes.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const roles = user.userRoles.map((link) => link.role.key);
  const tierKey = user.studentProfile?.tier?.key ?? null;
  const continued = { idp: payload.idp ?? null, sid: payload.sid ?? null };
  const accessToken = signAccessToken(user, roles, tierKey, continued);
  const { token: nextRefreshToken } = signRefreshToken(user, continued);
  await persistRefreshToken(user.id, nextRefreshToken);

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    tokenType: 'Bearer',
    expiresIn: env.jwt.accessTtl,
  };
}

export async function logout({ userId, refreshToken }) {
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), userId },
      data: { revokedAt: new Date() },
    });
  } else {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  return { revoked: true };
}

/**
 * The signed-in user replaces their password. The current password is required even for a
 * temporary one, so a stolen access token alone cannot take the account over. Every other
 * session is ended; the one making the change continues.
 */
export async function changePassword({ userId, currentPassword, newPassword, refreshToken }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, tenantId: true, passwordHash: true } });
  if (user && !user.passwordHash) throw new AppError(409, ErrorCode.CONFLICT, 'This account signs in with your institution\'s sign-in only, so it has no portal password to change.', { reason: 'SSO_ONLY_ACCOUNT' });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw invalidCredentials('Your current password is not correct.');
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Choose a password different from the current one.');
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), passwordChangeRequired: false } });
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null, ...(refreshToken ? { NOT: { tokenHash: hashToken(refreshToken) } } : {}) },
    data: { revokedAt: new Date() },
  });
  await recordAudit({ tenantId: user.tenantId, actorUserId: userId, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: userId, summary: 'Password changed by the account holder' }).catch(() => {});
  return { changed: true };
}
