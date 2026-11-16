import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { AUTH_USER_INCLUDE, authContextFor } from '../../middleware/authContext.js';
import { AppError, ErrorCode, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { recordAudit } from '../audit/auditService.js';
import { outsideViewAs } from './viewAsContext.js';
import { normalisePath, routeArea, routeTemplate } from './viewAsPolicy.js';

/**
 * View-As sessions: an administrator looks at a student's or faculty member's portal, read-only, in a separate tab.
 *
 * Identities stay separate throughout:
 *   actor    the administrator, authenticated by their own access token on every request (never replaced)
 *   subject  the person whose portal is shown; their account, roles, credentials and sign-in are never touched
 *   persona  STUDENT or FACULTY: the one portal shown (a person with both roles is viewed as one at a time)
 *   mode     READ_ONLY, always
 *
 * The session secret is 256 random bits handed to the View-As tab once; only its SHA-256 is stored. A request is
 * served as the subject only when it carries BOTH the administrator's valid access token and the secret of a live
 * session that administrator started, in their own institution. Starting needs the ADMIN role and the named
 * permission `users.view_as`; both are re-checked on every request, so revoking either ends the session at once.
 */

export const VIEW_AS_PERMISSION = 'users.view_as';
export const VIEW_AS_POLICY = {
  absoluteMs: 30 * 60 * 1000,
  idleMs: 15 * 60 * 1000,
  maxActivePerAdmin: 5,
};

const PERSONA_PROFILE = { STUDENT: 'studentProfile', FACULTY: 'facultyProfile' };
export const PERSONA_LABEL = { STUDENT: 'Student', FACULTY: 'Faculty' };
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const fullName = (user) => `${user.firstName} ${user.lastName}`;
const ended = (message, details) => new AppError(403, ErrorCode.VIEW_AS_SESSION_ENDED, message, details);
const invalid = () => new AppError(403, ErrorCode.VIEW_AS_SESSION_INVALID, 'This View-As session is not valid. Start a new one from the Users page.');

/** The module's own bookkeeping writes run outside the View-As context, so the write guard does not apply to them. */
const audit = (entry) => outsideViewAs(() => recordAudit(entry));

const auditMetadata = (session, extra = {}) => ({
  sessionId: session.id,
  actor: { id: session.actorUserId, name: session.actor ? fullName(session.actor) : undefined },
  subject: { id: session.subjectUserId, name: session.subject ? fullName(session.subject) : undefined },
  persona: session.persona,
  mode: session.mode,
  ...extra,
});

/* ------------------------------------------------------------------ eligibility */

/** Which personas of `target` can be viewed, and why not if none. Pure. */
export function eligibilityOf(target, actorUserId) {
  const roles = target.userRoles.map((link) => link.role.key);
  const personas = Object.entries(PERSONA_PROFILE).filter(([role, profile]) => roles.includes(role) && target[profile]).map(([role]) => role);
  const problems = [];
  if (target.id === actorUserId) problems.push({ code: 'SELF', message: 'You cannot use View-As on your own account.' });
  // Administrator accounts are never viewed as: an administrator impersonating another is the classic escalation path.
  if (roles.includes('ADMIN')) problems.push({ code: 'ADMIN_ACCOUNT', message: 'Administrator accounts cannot be viewed as.' });
  if (target.status !== 'ACTIVE') problems.push({ code: 'NOT_ACTIVE', message: `This account is ${String(target.status).toLowerCase()}. Only active accounts can be viewed, because only they can sign in.` });
  if (!personas.length) problems.push({ code: 'NO_PORTAL', message: 'Only students and faculty members with a linked record have a portal to view.' });
  return { eligible: problems.length === 0, personas, problems };
}

const targetInclude = { userRoles: { include: { role: true } }, studentProfile: { select: { id: true, studentNumber: true } }, facultyProfile: { select: { id: true, employeeNumber: true } } };

async function loadTarget(actor, userId) {
  // Scoped to the administrator's institution: another institution's account is reported as not found.
  return prisma.user.findFirst({ where: { id: userId, tenantId: actor.tenantId }, include: targetInclude });
}

export async function getTargetEligibility(actor, userId) {
  const target = await loadTarget(actor, userId);
  if (!target) throw notFound('No account with this id at your institution.');
  const result = eligibilityOf(target, actor.userId);
  return {
    user: { id: target.id, fullName: fullName(target), email: target.email, status: target.status, studentNumber: target.studentProfile?.studentNumber ?? null, employeeNumber: target.facultyProfile?.employeeNumber ?? null },
    ...result,
    personas: result.personas.map((key) => ({ key, label: PERSONA_LABEL[key] })),
    policy: { absoluteMinutes: VIEW_AS_POLICY.absoluteMs / 60000, idleMinutes: VIEW_AS_POLICY.idleMs / 60000 },
  };
}

/* ------------------------------------------------------------------ lifecycle */

function timeoutOf(session, now = new Date()) {
  if (session.expiresAt <= now) return { reason: 'ABSOLUTE_TIMEOUT', at: session.expiresAt };
  const idleAt = new Date(session.lastSeenAt.getTime() + VIEW_AS_POLICY.idleMs);
  if (idleAt <= now) return { reason: 'IDLE_TIMEOUT', at: idleAt };
  return null;
}

const SUMMARY = {
  ENDED: (s) => `${fullName(s.actor)} ended View-As of ${fullName(s.subject)} (${PERSONA_LABEL[s.persona]})`,
  EXPIRED: (s) => `View-As of ${fullName(s.subject)} (${PERSONA_LABEL[s.persona]}) by ${fullName(s.actor)} expired`,
  REVOKED: (s) => `View-As of ${fullName(s.subject)} (${PERSONA_LABEL[s.persona]}) by ${fullName(s.actor)} was stopped`,
};
const ACTION = { ENDED: 'VIEW_AS_ENDED', EXPIRED: 'VIEW_AS_EXPIRED', REVOKED: 'VIEW_AS_REVOKED' };

/** Close a live session once (a concurrent close is a no-op) and audit it. `session` includes actor and subject names. */
async function closeSession(session, status, endReason, endedAt = new Date()) {
  const { count } = await outsideViewAs(() => prisma.viewAsSession.updateMany({ where: { id: session.id, status: 'ACTIVE' }, data: { status, endReason, endedAt } }));
  if (count) {
    await audit({
      tenantId: session.tenantId, actorUserId: session.actorUserId, action: ACTION[status], entityType: 'User', entityId: session.subjectUserId,
      summary: SUMMARY[status](session),
      metadata: auditMetadata(session, { endReason, startedAt: session.createdAt, endedAt, requests: session.requestCount, blocked: session.blockedCount }),
    });
  }
  return count > 0;
}

const namesInclude = { actor: { select: { firstName: true, lastName: true } }, subject: { select: { firstName: true, lastName: true } } };

/** Mark this administrator's timed-out sessions as expired (they are also caught on their next request). */
async function expireStale(actor) {
  const live = await prisma.viewAsSession.findMany({ where: { tenantId: actor.tenantId, actorUserId: actor.userId, status: 'ACTIVE' }, include: namesInclude });
  const now = new Date();
  const stillLive = [];
  for (const session of live) {
    const timeout = timeoutOf(session, now);
    if (timeout) await closeSession(session, 'EXPIRED', timeout.reason, timeout.at);
    else stillLive.push(session);
  }
  return stillLive;
}

async function holdsPermission(actor) {
  const grant = await prisma.userPermission.findFirst({ where: { tenantId: actor.tenantId, userId: actor.userId, permission: VIEW_AS_PERMISSION }, select: { id: true } });
  return Boolean(grant);
}

async function rejectStart(actor, userId, code, message, status = 403) {
  await audit({
    tenantId: actor.tenantId, actorUserId: actor.userId, action: 'VIEW_AS_START_REJECTED', entityType: 'User', entityId: userId,
    summary: `View-As refused for ${actor.firstName} ${actor.lastName}: ${message}`, metadata: { reason: code },
  });
  return new AppError(status, status === 404 ? ErrorCode.RESOURCE_NOT_FOUND : ErrorCode.VIEW_AS_NOT_ALLOWED, message, { reason: code });
}

/**
 * Start a session. Returns the session summary and the bearer secret (shown once, to the administrator's browser,
 * which hands it to the new tab). Called behind requireRole('ADMIN') + requirePermission(users.view_as).
 */
export async function startViewAs(actor, { userId, persona, reason }) {
  if (!actor.roles.includes('ADMIN')) throw await rejectStart(actor, userId, 'NOT_ADMIN', 'Only administrators can use View-As.');
  const target = await loadTarget(actor, userId);
  if (!target) throw await rejectStart(actor, userId, 'NOT_FOUND', 'No account with this id at your institution.', 404);
  const { eligible, personas, problems } = eligibilityOf(target, actor.userId);
  if (!eligible) throw await rejectStart(actor, userId, problems[0].code, problems[0].message, problems[0].code === 'NOT_ACTIVE' ? 409 : 403);

  let chosen = persona ?? null;
  if (!chosen) {
    if (personas.length > 1) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'This person has more than one portal. Choose which one to view.', { reason: 'PERSONA_REQUIRED', personas });
    [chosen] = personas;
  }
  if (!personas.includes(chosen)) throw await rejectStart(actor, userId, 'PERSONA_NOT_AVAILABLE', `${fullName(target)} has no ${PERSONA_LABEL[chosen] ?? chosen} portal to view.`);

  const live = await expireStale(actor);
  if (live.length >= VIEW_AS_POLICY.maxActivePerAdmin) {
    throw new AppError(409, ErrorCode.CONFLICT, `You already have ${live.length} View-As sessions open. End one before starting another.`, { reason: 'TOO_MANY_SESSIONS' });
  }

  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const session = await prisma.viewAsSession.create({
    data: {
      tenantId: actor.tenantId, actorUserId: actor.userId, subjectUserId: target.id, persona: chosen, mode: 'READ_ONLY',
      reason, tokenHash: hashToken(token), createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + VIEW_AS_POLICY.absoluteMs),
    },
    include: namesInclude,
  });
  await audit({
    tenantId: actor.tenantId, actorUserId: actor.userId, action: 'VIEW_AS_STARTED', entityType: 'User', entityId: target.id,
    summary: `${fullName(session.actor)} started a read-only View-As of ${fullName(target)} (${PERSONA_LABEL[chosen]})`,
    metadata: auditMetadata(session, { reason, expiresAt: session.expiresAt }),
  });
  return { token, session: summarise(session) };
}

function summarise(session) {
  return {
    id: session.id,
    persona: session.persona,
    personaLabel: PERSONA_LABEL[session.persona],
    mode: session.mode,
    status: session.status,
    subject: { id: session.subjectUserId, fullName: session.subject ? fullName(session.subject) : null },
    actor: { id: session.actorUserId, fullName: session.actor ? fullName(session.actor) : null },
    reason: session.reason,
    startedAt: session.createdAt,
    expiresAt: session.expiresAt,
    idleExpiresAt: new Date(session.lastSeenAt.getTime() + VIEW_AS_POLICY.idleMs),
    endedAt: session.endedAt ?? null,
    endReason: session.endReason ?? null,
  };
}

/* ------------------------------------------------------------------ per request */

const ENDED_MESSAGE = {
  ENDED: 'This View-As session has ended.',
  EXPIRED: 'This View-As session has expired.',
  REVOKED: 'This View-As session was stopped because access changed.',
};

/** The live session for this secret and administrator, or throw. Expires it (and says so) when its time is up. */
async function liveSessionFor(actor, token) {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) throw invalid();
  const session = await prisma.viewAsSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { ...namesInclude, subject: { include: AUTH_USER_INCLUDE } } });
  if (!session) throw invalid();
  if (session.actorUserId !== actor.userId || session.tenantId !== actor.tenantId) {
    // Another person presenting this secret: refuse, and record it against the session's own administrator's trail.
    await audit({
      tenantId: actor.tenantId, actorUserId: actor.userId, action: 'VIEW_AS_SESSION_MISUSE', entityType: 'ViewAsSession', entityId: session.id,
      summary: `${actor.firstName} ${actor.lastName} presented a View-As session that belongs to another administrator`, metadata: { sessionId: session.id },
    });
    throw invalid();
  }
  if (session.status !== 'ACTIVE') throw ended(ENDED_MESSAGE[session.status], { reason: session.endReason, status: session.status });
  const timeout = timeoutOf(session);
  if (timeout) {
    await closeSession(session, 'EXPIRED', timeout.reason, timeout.at);
    throw ended(ENDED_MESSAGE.EXPIRED, { reason: timeout.reason, status: 'EXPIRED' });
  }
  return session;
}

/**
 * requireAuth's View-As step. `actor` is the administrator's already-verified context. Returns the subject's request
 * context (one persona only) and the View-As context the write guards look for.
 */
export async function resolveViewAsRequest(actor, token, req, res) {
  const session = await liveSessionFor(actor, token);

  // The administrator's own right to View-As is re-checked on every request, so a withdrawn grant stops it at once.
  if (!actor.roles.includes('ADMIN') || !(await holdsPermission(actor))) {
    await closeSession(session, 'REVOKED', 'ACCESS_REVOKED');
    throw ended(ENDED_MESSAGE.REVOKED, { reason: 'ACCESS_REVOKED', status: 'REVOKED' });
  }
  const subject = session.subject;
  const { personas, problems } = eligibilityOf(subject, actor.userId);
  if (!subject.tenant?.isActive || subject.tenantId !== actor.tenantId || !personas.includes(session.persona) || problems.length) {
    await closeSession(session, 'REVOKED', 'SUBJECT_INELIGIBLE');
    throw ended(ENDED_MESSAGE.REVOKED, { reason: 'SUBJECT_INELIGIBLE', status: 'REVOKED' });
  }

  const auth = authContextFor(subject, {
    roles: [session.persona],
    signIn: { method: 'VIEW_AS', provider: null },
    // Never measured as the subject's own portal use.
    analytics: { tenantEnabled: false, excluded: true },
    tokenExpiresAt: actor.tokenExpiresAt,
  });
  // Only the viewed persona's record: a faculty-and-student account viewed as Student exposes no teaching data.
  auth.staffProfileId = null;
  if (session.persona === 'STUDENT') auth.facultyProfileId = null;
  if (session.persona === 'FACULTY') Object.assign(auth, { studentProfileId: null, tierKey: null, tierId: null });

  const context = {
    sessionId: session.id,
    tenantId: session.tenantId,
    actorUserId: actor.userId,
    actorName: `${actor.firstName} ${actor.lastName}`,
    subjectUserId: subject.id,
    subjectName: fullName(subject),
    persona: session.persona,
    mode: 'READ_ONLY',
    expiresAt: session.expiresAt,
    idleMs: VIEW_AS_POLICY.idleMs,
  };

  // Access log and idle clock: every portal read counts as activity; the View-As control endpoints do not, so the
  // tab checking its own status cannot keep an unattended session alive.
  const path = normalisePath(req.originalUrl);
  if (!/^\/api\/v1\/view-as(\/|$)/i.test(path)) {
    res.on('finish', () => {
      const at = new Date();
      outsideViewAs(() => prisma.$transaction([
        prisma.viewAsAccessEvent.create({ data: { sessionId: session.id, method: req.method, route: routeTemplate(req.originalUrl), area: routeArea(req.originalUrl), status: res.statusCode, createdAt: at } }),
        prisma.viewAsSession.updateMany({ where: { id: session.id, status: 'ACTIVE' }, data: { lastSeenAt: at, requestCount: { increment: 1 } } }),
      ])).catch((error) => logger.warn('View-As access log write failed', { sessionId: session.id, message: error.message }));
    });
  }
  return { auth, context, session: summarise(session) };
}

/** The session behind this tab, for GET /view-as/current. */
export async function currentSession(actor, token) {
  return summarise(await liveSessionFor(actor, token));
}

/** End the tab's own session (idempotent: ending an already-ended session reports it as ended). */
export async function endByToken(actor, token, reason = 'ENDED_BY_ADMIN') {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) throw invalid();
  const session = await prisma.viewAsSession.findUnique({ where: { tokenHash: hashToken(token) }, include: namesInclude });
  if (!session || session.actorUserId !== actor.userId || session.tenantId !== actor.tenantId) throw invalid();
  if (session.status === 'ACTIVE') await closeSession(session, 'ENDED', reason);
  return summarise(await prisma.viewAsSession.findUnique({ where: { id: session.id }, include: namesInclude }));
}

/** End one of the administrator's own sessions from the admin tab. Another administrator's session is not found. */
export async function endById(actor, sessionId) {
  const session = await prisma.viewAsSession.findFirst({ where: { id: sessionId, tenantId: actor.tenantId, actorUserId: actor.userId }, include: namesInclude });
  if (!session) throw notFound('No View-As session of yours with this id.');
  if (session.status === 'ACTIVE') await closeSession(session, 'ENDED', 'ENDED_FROM_ADMIN_TAB');
  return summarise(await prisma.viewAsSession.findUnique({ where: { id: session.id }, include: namesInclude }));
}

/** The administrator's own live sessions (timed-out ones are closed first). */
export async function listMySessions(actor) {
  return (await expireStale(actor)).map(summarise);
}

/**
 * A blocked action in a View-As tab (the HTTP gate): audited against the administrator, with the route template
 * only. Best effort; the request is refused whether or not this succeeds.
 */
export async function recordBlocked(actor, token, { method, originalUrl, kind, reason }) {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return;
  const session = await prisma.viewAsSession.findUnique({ where: { tokenHash: hashToken(token) }, include: namesInclude });
  if (!session || session.actorUserId !== actor.userId || session.tenantId !== actor.tenantId) return;
  const route = routeTemplate(originalUrl);
  await outsideViewAs(() => prisma.viewAsSession.update({ where: { id: session.id }, data: { blockedCount: { increment: 1 } } }));
  await audit({
    tenantId: session.tenantId, actorUserId: actor.userId, action: 'VIEW_AS_ACTION_BLOCKED', entityType: 'User', entityId: session.subjectUserId,
    summary: `Blocked ${kind === 'MUTATION' ? 'action' : 'read'} during View-As of ${fullName(session.subject)}: ${method} ${route}`,
    metadata: auditMetadata(session, { method, route, reason }),
  });
}
