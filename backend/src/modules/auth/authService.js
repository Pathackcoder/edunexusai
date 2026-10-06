import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCode, invalidCredentials, unauthenticated } from '../../utils/errors.js';
import { TENANT_FALLBACK_SLUG } from './constants.js';

/**
 * Prototype authentication.
 *
 * Email + password verified with bcrypt against PostgreSQL, then a short-lived JWT access
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

function signAccessToken(user, roles, tierKey) {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles,
      tier: tierKey ?? null,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.accessTtl, issuer: env.jwt.issuer },
  );
}

function signRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, tenantId: user.tenantId, jti }, env.jwt.refreshSecret, {
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
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalidCredentials();
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw invalidCredentials();
  if (user.status !== 'ACTIVE') throw invalidCredentials('This account is not active.');

  const roles = user.userRoles.map((link) => link.role.key);
  const tierKey = user.studentProfile?.tier?.key ?? null;

  const accessToken = signAccessToken(user, roles, tierKey);
  const { token: refreshToken } = signRefreshToken(user);
  await persistRefreshToken(user.id, refreshToken);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.jwt.accessTtl,
    userId: user.id,
    tenantId: tenant.id,
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

  // Rotate: the presented token is revoked and a new one issued, so a stolen refresh
  // token stops working as soon as the legitimate client refreshes.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const roles = user.userRoles.map((link) => link.role.key);
  const tierKey = user.studentProfile?.tier?.key ?? null;
  const accessToken = signAccessToken(user, roles, tierKey);
  const { token: nextRefreshToken } = signRefreshToken(user);
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
