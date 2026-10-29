import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { AppError, ErrorCode, forbidden, unauthenticated } from '../utils/errors.js';
import { activeSsoSession } from '../modules/identity/ssoSessions.js';

/**
 * Request context attached by `requireAuth`:
 *
 *   req.auth = {
 *     userId, tenantId, email, firstName, lastName,
 *     roles: ['STUDENT'], tierKey: 'STANDARD' | null,
 *     studentProfileId, facultyProfileId
 *   }
 *
 * Every service takes tenantId from here. No handler reads a tenant id from the body,
 * the query string or a header, so a caller cannot ask for another tenant's rows.
 */

function extractBearer(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.jwt.secret, { issuer: env.jwt.issuer });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(401, ErrorCode.TOKEN_EXPIRED, 'Your session has expired. Please sign in again.');
    }
    throw unauthenticated('Invalid authentication token.');
  }
}

/** Reject the request unless it carries a valid access token for an active user. */
export async function requireAuth(req, _res, next) {
  try {
    const token = extractBearer(req);
    if (!token) throw unauthenticated('Authentication required.');

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: { include: { role: true } },
        studentProfile: { include: { tier: true } },
        facultyProfile: true,
        staffProfile: true,
        tenant: { select: { id: true, slug: true, name: true, shortName: true, isActive: true } },
      },
    });

    if (!user || user.status !== 'ACTIVE') throw unauthenticated('Account is not active.');
    if (!user.tenant?.isActive) throw forbidden('This institution is not active.');

    // The token carries the tenant it was issued for; a mismatch means a stale or
    // tampered token and is never allowed to resolve to live data.
    if (payload.tenantId && payload.tenantId !== user.tenantId) {
      throw new AppError(403, ErrorCode.TENANT_MISMATCH, 'Token does not belong to this institution.');
    }

    // A temporary password issued by an administrator must be replaced before the account
    // can do anything else; only the session endpoints (/auth/me, /auth/password, logout) remain.
    // An institutional (SSO) session never used the local password, so a pending local password change
    // does not block it.
    const ssoSession = Array.isArray(payload.amr) && payload.amr.includes('oidc');
    if (user.passwordChangeRequired && !ssoSession && !String(req.baseUrl).endsWith('/auth')) {
      throw new AppError(403, ErrorCode.PASSWORD_CHANGE_REQUIRED, 'Choose a new password before continuing.');
    }
    // ...and it lasts only while its sso_sessions row is live (not logged out at the portal or the provider,
    // identity still linked, provider still enabled).
    if (ssoSession && !(await activeSsoSession(payload.sid, user.id))) {
      throw unauthenticated('Your institutional sign-in has ended. Please sign in again.');
    }

    req.auth = {
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
      tenantName: user.tenant.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.userRoles.map((link) => link.role.key),
      tierKey: user.studentProfile?.tier?.key ?? null,
      tierId: user.studentProfile?.tierId ?? null,
      studentProfileId: user.studentProfile?.id ?? null,
      facultyProfileId: user.facultyProfile?.id ?? null,
      staffProfileId: user.staffProfile?.id ?? null,
      // How this session started: PASSWORD, or SSO with the institution's provider key.
      signIn: ssoSession ? { method: 'SSO', provider: payload.idp ?? null, sid: payload.sid } : { method: 'PASSWORD', provider: null },
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Role gate. `requireRole('ADMIN')` or `requireRole('FACULTY', 'ADMIN')`.
 * Must run after `requireAuth`.
 */
export const requireRole =
  (...allowed) =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthenticated());
    const granted = req.auth.roles.some((role) => allowed.includes(role));
    if (!granted) {
      return next(
        forbidden(
          `This action requires the ${allowed.join(' or ')} role. Your roles: ${req.auth.roles.join(', ') || 'none'}.`,
        ),
      );
    }
    return next();
  };

/** Guard for student-scoped routes: also asserts the student profile exists. */
export function requireStudentProfile(req, _res, next) {
  if (!req.auth) return next(unauthenticated());
  if (!req.auth.roles.includes('STUDENT')) {
    return next(forbidden('This action requires the STUDENT role.'));
  }
  if (!req.auth.studentProfileId) {
    return next(new AppError(404, ErrorCode.PROFILE_NOT_FOUND, 'No student record is linked to this account.'));
  }
  return next();
}

/** Guard for faculty-scoped routes. Admins are allowed through for demo/support. */
export function requireFacultyProfile(req, _res, next) {
  if (!req.auth) return next(unauthenticated());
  const { roles, facultyProfileId } = req.auth;
  if (!roles.includes('FACULTY') && !roles.includes('ADMIN')) {
    return next(forbidden('This action requires the FACULTY role.'));
  }
  if (roles.includes('FACULTY') && !facultyProfileId) {
    return next(new AppError(404, ErrorCode.PROFILE_NOT_FOUND, 'No faculty record is linked to this account.'));
  }
  return next();
}
