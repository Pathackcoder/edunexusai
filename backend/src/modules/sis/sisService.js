import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { sisConfig } from '../../config/env.js';
import { AppError, ErrorCode, badRequest, conflict, forbidden } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { recordAudit } from '../audit/auditService.js';
import { hashPassword } from '../auth/passwords.js';
import { grantRole } from '../roles/roleAssignments.js';
import { refreshDirectoryEntry } from '../people/directorySync.js';
import { CampusCoreAdapter } from '../../integrations/campuscore/connector/adapters/CampusCoreAdapter.js';
import { SisPortalService } from '../../integrations/campuscore/connector/portal/SisPortalService.js';
import { SisError } from '../../integrations/campuscore/connector/errors.js';

/**
 * EduNexusAI's side of the CampusCore SIS integration.
 *
 * CampusCore is the system of record for academic data. Everything here reads it live
 * through the vendored connector (token caching and refresh, retries, canonical mapping)
 * and the reference SisPortalService (identity from the server session, faculty limited to
 * their own sections, admin + effective-capability checks). Nothing is copied into the
 * local academic tables, and nothing falls back to local data when CampusCore fails.
 *
 * Identity: CampusCore's ExternalIdentityLink is the authority. Each EduNexusAI user is
 * identified to CampusCore by its stable internal user id (`externalUserId`). A local
 * mirror in external_identities (provider CAMPUSCORE, internalId = EduNexusAI user id,
 * externalId = CampusCore record id) is kept in step for admin views and audit; it is
 * refreshed from CampusCore and never used on its own to authorise SIS data access.
 */

const PROVIDER = 'CAMPUSCORE';
const EXTERNAL_SYSTEM = 'edunexusai';
const VERIFY_TTL_MS = 10 * 60 * 1000;

let state = null; // { fingerprint, adapter, portal, verified: { at, institution } | null }

/** Tests (and secret rotation without restart) reset the cached client. */
export function resetSisClient() {
  state = null;
}

function build() {
  const config = sisConfig();
  if (!config.valid) {
    throw new AppError(409, ErrorCode.INTEGRATION_NOT_CONFIGURED, `CampusCore SIS is not configured: ${config.problems.join(' ')}`, { provider: PROVIDER, reason: 'NOT_CONFIGURED' });
  }
  // The secret only contributes a hash to the fingerprint, so a rotated secret builds a new client.
  const fingerprint = [config.baseUrl, config.clientId, config.expectedInstitution, config.tenantKey, config.timeoutMs, createHash('sha256').update(process.env.CAMPUSCORE_CLIENT_SECRET).digest('hex')].join('|');
  if (state?.fingerprint === fingerprint) return state;
  const adapter = new CampusCoreAdapter({
    baseUrl: config.baseUrl,
    clientId: config.clientId,
    clientSecret: process.env.CAMPUSCORE_CLIENT_SECRET,
    timeoutMs: config.timeoutMs,
    // The connector logs token issuance (scopes, lifetime) and retries; never tokens or secrets.
    logger: { info: (m) => logger.info(m), warn: (m) => logger.warn(m) },
  });
  const portal = new SisPortalService({
    adapter,
    tenantKey: config.tenantKey,
    externalSystem: EXTERNAL_SYSTEM,
    isAdmin: (u) => (u.roles ?? []).includes('ADMIN'),
  });
  state = { fingerprint, adapter, portal, verified: null, config };
  return state;
}

/** Refuses to use credentials that belong to a different institution. */
async function ensureInstitution(s) {
  if (s.verified && Date.now() - s.verified.at < VERIFY_TTL_MS) return s.verified.institution;
  const institution = await s.adapter.verifyInstitution(s.config.expectedInstitution);
  s.verified = { at: Date.now(), institution };
  return institution;
}

/** The server-side session user, in the shape SisPortalService expects. */
export const portalUser = (auth) => ({
  id: auth.userId,
  roles: auth.roles,
  role: auth.roles.includes('ADMIN') ? 'ADMIN' : auth.roles[0],
  tenantKey: auth.tenantSlug,
  email: auth.email,
});

/** SisError -> AppError: CampusCore's status, code and requestId; retryable failures become 503. */
export function toAppError(error) {
  if (!(error instanceof SisError)) return error;
  const details = { provider: PROVIDER, sisCode: error.code, requestId: error.requestId ?? null, ...(error.details ? { sisDetails: error.details } : {}) };
  if (error.code === 'invalid_client' || (error.status === 401 && error.code !== 'unauthenticated')) {
    return new AppError(502, 'SIS_AUTH_FAILED', 'CampusCore rejected the integration credentials. An administrator must check or rotate the client secret.', details);
  }
  if (error.retryable || error.code === 'sis_unavailable' || error.code === 'sis_outcome_unknown') {
    return new AppError(503, 'SIS_UNAVAILABLE', error.code === 'sis_outcome_unknown' ? error.message : 'CampusCore SIS is unavailable right now. Please try again shortly.', details);
  }
  if (error.code === 'institution_mismatch') return new AppError(502, 'SIS_INSTITUTION_MISMATCH', error.message, details);
  const status = [400, 403, 404, 409, 412, 422].includes(error.status) ? error.status : 502;
  return new AppError(status, status === 403 ? ErrorCode.FORBIDDEN : status === 404 ? ErrorCode.RESOURCE_NOT_FOUND : status === 409 || status === 412 ? ErrorCode.CONFLICT : status === 502 ? ErrorCode.INTEGRATION_ERROR : ErrorCode.VALIDATION_ERROR, error.message, details);
}

/** Run an SIS operation after institution verification, translating failures. */
async function withSis(fn) {
  const s = build();
  try {
    await ensureInstitution(s);
    return await fn(s);
  } catch (error) {
    throw toAppError(error);
  }
}

/* ---------------------------------------------------------------- health */

/** Status for admin pages. Never includes the secret or a token value. */
export async function health() {
  const config = sisConfig();
  const base = { provider: 'campuscore', baseUrl: config.baseUrl || null, expectedInstitution: config.expectedInstitution, tenantKey: config.tenantKey, clientId: config.clientId || null, clientSecretConfigured: config.clientSecretConfigured };
  if (!config.valid) return { ...base, ok: false, state: 'NOT_CONFIGURED', problems: config.problems };
  const s = build();
  const h = await s.adapter.health();
  if (!h.ok) {
    s.verified = null;
    return { ...base, ok: false, state: h.error?.code === 'invalid_client' ? 'AUTH_FAILED' : h.error?.retryable ? 'UNAVAILABLE' : 'ERROR', error: { code: h.error?.code ?? null, status: h.error?.status ?? null, message: h.error?.message ?? 'Unknown error', retryable: Boolean(h.error?.retryable) }, latencyMs: h.latencyMs };
  }
  const matches = !config.expectedInstitution || [h.institution?.slug, h.institution?.id].includes(config.expectedInstitution);
  if (!matches) s.verified = null;
  else s.verified = { at: Date.now(), institution: h.institution };
  return {
    ...base,
    ok: matches,
    state: matches ? 'CONNECTED' : 'INSTITUTION_MISMATCH',
    institution: h.institution,
    institutionVerified: matches,
    client: h.client,
    scopes: h.scopes,
    tokenExpiresAt: h.tokenExpiresAt,
    latencyMs: h.latencyMs,
    ...(matches ? {} : { error: { code: 'institution_mismatch', message: `These credentials belong to "${h.institution?.slug}", not "${config.expectedInstitution}".` } }),
  };
}

/* ------------------------------------------------------- local identity mirror */

const RECORD_TYPES = ['STUDENT', 'FACULTY'];

/**
 * Local mirror of CampusCore links, one row per record type (a faculty member who is also a
 * student has two). `identity` is a resolve result: one link, LINKED_MULTIPLE with `links`, or
 * UNMAPPED. With `recordType` only that relationship is updated; without it, every type is.
 */
async function syncMirror(auth, identity, recordType = null) {
  try {
    const types = recordType ? [recordType] : RECORD_TYPES;
    const links = Array.isArray(identity?.links)
      ? identity.links
      : identity?.status === 'LINKED' ? [{ recordType: identity.recordType, sisId: identity.sisId }] : [];
    for (const type of types) {
      const want = links.find((l) => l.recordType === type) ?? null;
      const where = { tenantId: auth.tenantId, provider: PROVIDER, internalId: auth.userId, entityType: type };
      const current = await prisma.externalIdentity.findFirst({ where });
      if (want && current?.externalId === want.sisId) continue;
      if (current) await prisma.externalIdentity.delete({ where: { id: current.id } });
      if (want) {
        await prisma.externalIdentity.create({
          data: { tenantId: auth.tenantId, provider: PROVIDER, entityType: type, internalId: auth.userId, exclusiveInternalId: auth.userId, externalId: want.sisId, linkMethod: 'CAMPUSCORE_LINK', verifiedAt: new Date() },
        });
      }
    }
  } catch (error) {
    // The mirror is a convenience; CampusCore remains the authority, so a mirror failure is logged only.
    logger.warn('CampusCore identity mirror not updated', { code: error.code ?? null });
  }
}

/**
 * Resolve the signed-in user's CampusCore identity (cached 60 s by SisPortalService). With
 * `recordType`, that one relationship: student calls use the student record, faculty calls the
 * faculty record, never "whichever link exists".
 */
async function resolveIdentity(s, auth, recordType = null) {
  const identity = await s.portal.resolve(portalUser(auth), recordType ? { recordType } : {});
  await syncMirror(auth, identity, recordType);
  return identity;
}

/** The relationship of `recordType`, or why there is none (OTHER_ROLE: linked only as the other type). */
async function relationship(s, auth, recordType) {
  const identity = await resolveIdentity(s, auth, recordType);
  if (identity.status === 'LINKED' && identity.recordType === recordType) return { identity };
  const any = await resolveIdentity(s, auth);
  return { missing: any.status === 'LINKED' || any.status === 'LINKED_MULTIPLE' ? 'OTHER_ROLE' : 'NOT_LINKED' };
}

/* --------------------------------------------------------------- student */

/**
 * The signed-in student's SIS data: profile, academic summary, schedule, published grades
 * and registrations. The SIS id comes only from the verified identity link of the session
 * user, never from the request. Each section reports OK / FORBIDDEN / NOT_FOUND /
 * UNAVAILABLE on its own.
 */
export async function studentOverview(auth, { termId } = {}) {
  try {
    return await withSis(async (s) => {
      const found = await relationship(s, auth, 'STUDENT');
      if (found.missing === 'OTHER_ROLE') return { state: 'NOT_A_STUDENT' };
      if (found.missing) return { state: 'UNMAPPED', message: 'Your portal account is not linked to a CampusCore student record yet. Contact the registrar.' };
      const { identity } = found;
      const overview = await s.portal.studentOverview(portalUser(auth), { termId });
      if (overview.state !== 'OK') return overview;
      // Which terms the student actually has classes in. CampusCore's schedule defaults to the
      // current term, but registration usually happens for the next one, so a student registered
      // only for an upcoming term would otherwise see an empty timetable.
      const [terms, regs] = await Promise.all([s.adapter.listTerms(), s.adapter.getRegistrations(identity.sisId).catch(() => null)]);
      const counts = new Map();
      for (const r of regs ?? []) {
        if (!['enrolled', 'waitlisted'].includes(r.status) || !r.section?.termCode) continue;
        const c = counts.get(r.section.termCode) ?? { registered: 0, waitlisted: 0 };
        c[r.status === 'enrolled' ? 'registered' : 'waitlisted'] += 1;
        counts.set(r.section.termCode, c);
      }
      const today = new Date().toISOString().slice(0, 10);
      return {
        ...overview,
        terms: terms.map((t) => ({ id: t.source.id, code: t.code, name: t.name, startDate: t.startDate, endDate: t.endDate, isCurrent: t.isCurrent, registrationOpen: t.registrationOpen, ...(counts.get(t.code) ?? { registered: 0, waitlisted: 0 }) })),
        classTermIds: regs ? terms.filter((t) => counts.has(t.code) && (!t.endDate || String(t.endDate).slice(0, 10) >= today)).map((t) => t.source.id) : null,
      };
    });
  } catch (error) {
    if (error.code === 'SIS_UNAVAILABLE') return { state: 'UNAVAILABLE', message: error.message };
    throw error;
  }
}

/** Institution-wide academic calendar (calendar:read). Any signed-in user of this tenant. */
export async function calendar(auth, query = {}) {
  assertTenant(auth);
  return withSis((s) => s.adapter.getCalendar({ from: query.from, to: query.to, termId: query.termId, category: query.category }));
}

/**
 * The academic calendar for the public landing page (no sign-in): only for the institution the SIS
 * connection belongs to, and only the categories a visitor needs (no internal deadlines such as
 * faculty grade submission). Same CampusCore read as the signed-in calendar.
 */
const PUBLIC_CALENDAR_CATEGORIES = new Set(['EVENT', 'ACADEMIC', 'HOLIDAY', 'EXAM']);
export async function publicCalendar(tenantSlug, { from } = {}) {
  const config = sisConfig();
  if (!config.valid || (config.tenantKey && tenantSlug !== config.tenantKey)) return [];
  const items = await withSis((s) => s.adapter.getCalendar({ from }));
  return (Array.isArray(items) ? items : []).filter((e) => PUBLIC_CALENDAR_CATEGORIES.has(e.category)).map((e) => ({ id: e.id, title: e.title, description: e.description ?? null, category: e.category, startDate: e.startDate, endDate: e.endDate ?? null }));
}

/** Class search: catalog sections for a term (sections:read). */
export async function searchSections(auth, { termId, search, page = 1, pageSize = 25 } = {}) {
  assertTenant(auth);
  return withSis(async (s) => {
    const terms = await s.adapter.listTerms();
    const term = termId ? terms.find((t) => t.source.id === termId) : terms.find((t) => t.registrationOpen) ?? terms.find((t) => t.isCurrent);
    const res = await s.adapter.client.get('/sections', { termId: term?.source.id, search, page, pageSize });
    return { terms, term: term ?? null, items: res.data.map(s.adapter.mapSection), pagination: res.pagination };
  });
}

function assertTenant(auth) {
  const config = sisConfig();
  if (config.tenantKey && auth.tenantSlug !== config.tenantKey) throw forbidden('This account belongs to a different institution than the SIS connection.');
}

/* --------------------------------------------------------------- faculty */

export async function facultyTeaching(auth, { termId } = {}) {
  try {
    return await withSis(async (s) => {
      const found = await relationship(s, auth, 'FACULTY');
      if (found.missing === 'OTHER_ROLE') return { state: 'NOT_FACULTY' };
      if (found.missing) return { state: 'UNMAPPED', message: 'Your portal account is not linked to a CampusCore faculty record yet.' };
      const { identity } = found;
      return { state: 'OK', identity: { sisId: identity.sisId, institutionalId: identity.institutionalId }, ...(await s.portal.facultyTeaching(portalUser(auth), { termId })) };
    });
  } catch (error) {
    if (error.code === 'SIS_UNAVAILABLE') return { state: 'UNAVAILABLE', message: error.message };
    throw error;
  }
}

/** Roster of one section, only if the SIS says this faculty member teaches it. */
export async function facultyRoster(auth, sectionId) {
  return withSis((s) => s.portal.facultyRoster(portalUser(auth), sectionId));
}

/* ----------------------------------------------------------------- admin */

const actorAudit = (auth, action, summary, metadata, entityId = null) =>
  recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action, entityType: 'CampusCoreSIS', entityId, summary, metadata }).catch(() => {});

/** Audit both outcomes of an admin write: what was attempted, and whether CampusCore accepted it. */
async function auditedWrite(auth, action, summary, fn, entityId) {
  try {
    const result = await fn();
    await actorAudit(auth, action, summary, { outcome: 'ACCEPTED' }, entityId);
    return result;
  } catch (error) {
    await actorAudit(auth, `${action}_REJECTED`, `${summary} (rejected: ${error.details?.sisCode ?? error.code})`, { outcome: 'REJECTED', sisCode: error.details?.sisCode ?? null, requestId: error.details?.requestId ?? null }, entityId);
    throw error;
  }
}

export async function capabilities(auth) {
  return withSis((s) => s.portal.adminCapabilities(portalUser(auth)));
}

/**
 * EduNexusAI's integration policy = this client's write preferences, stored and enforced by
 * CampusCore. They can only narrow what CampusCore's scopes and institutional policies allow.
 */
export async function setWritePreferences(auth, prefs) {
  return withSis(async (s) => {
    await s.portal.adminCapabilities(portalUser(auth)); // admin + tenant check
    return auditedWrite(auth, 'SIS_WRITE_PREFERENCES_UPDATED', `Write preferences: disabled ${prefs.disabledOperations.join(', ') || 'none'}`, () => s.adapter.setWritePreferences(prefs, { actingUser: s.portal.actingUser(portalUser(auth)) }));
  });
}

async function mirrorBySisIds(tenantId, sisIds) {
  const rows = sisIds.length ? await prisma.externalIdentity.findMany({ where: { tenantId, provider: PROVIDER, externalId: { in: sisIds } } }) : [];
  const users = rows.length ? await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.internalId) } }, select: { id: true, email: true, firstName: true, lastName: true } }) : [];
  return new Map(rows.map((r) => [r.externalId, { userId: r.internalId, user: users.find((u) => u.id === r.internalId) ?? null, verifiedAt: r.verifiedAt }]));
}

export async function searchStudents(auth, query) {
  return withSis(async (s) => {
    const result = await s.portal.adminSearchStudents(portalUser(auth), query);
    const mirror = await mirrorBySisIds(auth.tenantId, result.items.map((i) => i.source.id));
    return { ...result, items: result.items.map((item) => ({ ...item, portalAccount: mirror.get(item.source.id) ?? null })) };
  });
}

export async function getStudent(auth, sisId) {
  return withSis(async (s) => {
    const record = await s.portal.adminGetStudent(portalUser(auth), sisId);
    const mirror = await mirrorBySisIds(auth.tenantId, [sisId]);
    return { ...record, portalAccount: mirror.get(sisId) ?? null };
  });
}

export async function studentAudit(auth, sisId, query) {
  return withSis(async (s) => {
    await s.portal.adminCapabilities(portalUser(auth));
    return s.adapter.getStudentAudit(sisId, query);
  });
}

export async function referenceData(auth) {
  return withSis(async (s) => {
    await s.portal.adminCapabilities(portalUser(auth));
    const [programs, terms] = await Promise.all([s.adapter.client.get('/programs'), s.adapter.listTerms()]);
    return { programs: programs.data.map((p) => ({ id: p.id, code: p.code, name: p.name, degreeType: p.degreeType ?? null, active: p.active ?? p.isActive ?? true })), terms };
  });
}

/** Create a student in CampusCore. The idempotency key comes from the form and is reused on retry. */
export async function createStudent(auth, input, { idempotencyKey }) {
  return withSis((s) => auditedWrite(auth, 'SIS_STUDENT_CREATE', `Create CampusCore student ${input.email}`, () => s.portal.adminCreateStudent(portalUser(auth), input, { idempotencyKey })));
}

export async function updateStudent(auth, sisId, changes, { etag }) {
  return withSis((s) => auditedWrite(auth, 'SIS_STUDENT_UPDATE', `Update CampusCore student ${sisId}: ${Object.keys(changes).join(', ')}`, () => s.portal.adminUpdateStudent(portalUser(auth), sisId, changes, { etag }), sisId));
}

export async function deactivateStudent(auth, sisId, { reason, dropFutureRegistrations, idempotencyKey }) {
  return withSis((s) => auditedWrite(auth, 'SIS_STUDENT_DEACTIVATE', `Deactivate CampusCore student ${sisId}`, () => s.portal.adminDeactivateStudent(portalUser(auth), sisId, { reason, dropFutureRegistrations, idempotencyKey }), sisId));
}

/* -------------------------------------------------------- identity (admin) */

/**
 * Classify EduNexusAI accounts against CampusCore. Only email is sent as evidence: local
 * student/employee numbers are EduNexusAI-generated, not institutional numbers, so sending
 * them could create false matches. Names are sent for display only; CampusCore never
 * matches on names.
 */
export async function reconcile(auth, { recordType, userIds } = {}) {
  return withSis(async (s) => {
    await s.portal.adminCapabilities(portalUser(auth));
    const roleKey = recordType === 'FACULTY' ? 'FACULTY' : 'STUDENT';
    const users = await prisma.user.findMany({
      where: { tenantId: auth.tenantId, userRoles: { some: { role: { key: roleKey } } }, ...(userIds?.length ? { id: { in: userIds } } : {}) },
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 200,
    });
    if (!users.length) return { recordType: roleKey, results: [], summary: {} };
    const response = await s.portal.adminReconcile(portalUser(auth), users.map((u) => ({ externalUserId: u.id, recordType: roleKey, email: u.email, firstName: u.firstName, lastName: u.lastName })));
    const byId = new Map(users.map((u) => [u.id, u]));
    // Keep the local mirror in step with what CampusCore reports as linked.
    for (const r of response.data) {
      const u = byId.get(r.externalUserId);
      if (u) await syncMirror({ tenantId: auth.tenantId, userId: u.id }, r.status === 'LINKED' ? { status: 'LINKED', recordType: r.sisRecord?.recordType ?? roleKey, sisId: r.sisRecord?.sisId } : null, roleKey);
    }
    return {
      recordType: roleKey,
      results: response.data.map((r) => ({ ...r, portalUser: byId.get(r.externalUserId) ?? null })),
      summary: response.summary,
    };
  });
}

export async function listLinks(auth, query) {
  return withSis(async (s) => {
    await s.portal.adminCapabilities(portalUser(auth));
    return s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, ...query });
  });
}

/** Confirm a link between an EduNexusAI account (this tenant) and a CampusCore record. */
export async function linkIdentity(auth, { userId, recordType, sisRecordId, evidenceMismatchReason }) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: auth.tenantId }, select: { id: true, email: true, firstName: true, lastName: true } });
  if (!user) throw badRequest('That EduNexusAI account does not belong to this institution.');
  return withSis(async (s) => {
    const link = await auditedWrite(
      auth,
      'SIS_IDENTITY_LINK',
      `Link ${user.email} to CampusCore ${recordType.toLowerCase()} ${sisRecordId}${evidenceMismatchReason ? ` (verified: ${evidenceMismatchReason})` : ''}`,
      () => s.portal.adminLinkIdentity(portalUser(auth), { externalUserId: user.id, externalEmail: user.email, externalLabel: `${user.firstName} ${user.lastName}`, recordType, sisRecordId, evidenceMismatchReason }),
      user.id,
    );
    await syncMirror({ tenantId: auth.tenantId, userId: user.id }, { status: 'LINKED', recordType, sisId: sisRecordId }, recordType);
    return link;
  });
}

export async function revokeLink(auth, linkId, { reason, userId }) {
  return withSis(async (s) => {
    const result = await auditedWrite(auth, 'SIS_IDENTITY_UNLINK', `Revoke CampusCore identity link ${linkId}: ${reason}`, () => s.portal.adminRevokeIdentityLink(portalUser(auth), linkId, reason, userId), userId ?? null);
    const owner = userId ?? result.externalUserId;
    // Only the revoked relationship leaves the mirror; the person's other link (if any) stays.
    if (owner) await syncMirror({ tenantId: auth.tenantId, userId: owner }, null, RECORD_TYPES.includes(result.recordType) ? result.recordType : null);
    return result;
  });
}

/* ------------------------------------------------- signed-in user's SIS record */

const PROGRAM_TTL_MS = 10 * 60 * 1000;
let programCache = null; // { at, fingerprint, byId }

/** CampusCore programs by id (requiredCredits for progress bars); cached briefly, read-only. */
async function programsById(s) {
  if (programCache && programCache.fingerprint === s.fingerprint && Date.now() - programCache.at < PROGRAM_TTL_MS) return programCache.byId;
  const res = await s.adapter.client.get('/programs', { pageSize: 100 });
  programCache = { at: Date.now(), fingerprint: s.fingerprint, byId: new Map(res.data.map((p) => [p.id, p])) };
  return programCache.byId;
}

const facultyDto = (f) => ({
  source: { system: 'campuscore', id: f.id },
  institutionalId: f.employeeNumber,
  displayName: `${f.firstName} ${f.lastName}`,
  givenName: f.firstName,
  familyName: f.lastName,
  email: f.email,
  title: f.title ?? null,
  department: f.department?.name ?? null,
  status: f.status ?? null,
  officeLocation: f.officeLocation ?? null,
  officeHours: f.officeHours ?? null,
});

/**
 * The signed-in user's own CampusCore identity record (student: profile + academic summary;
 * faculty: employee record). Used by the header, profile pages and dashboard summaries in
 * place of the deprecated academic columns on student_profiles. States: OK, UNMAPPED,
 * UNAVAILABLE, NOT_CONFIGURED. Never falls back to local data.
 */
export async function myProfile(auth) {
  if (!sisConfig().valid) return { state: 'NOT_CONFIGURED', message: 'CampusCore SIS is not configured for this portal.' };
  try {
    return await withSis(async (s) => {
      const identity = await resolveIdentity(s, auth);
      if (identity.status !== 'LINKED' && identity.status !== 'LINKED_MULTIPLE') return { state: 'UNMAPPED', message: 'Your portal account is not linked to a CampusCore record yet. Contact the registrar.' };
      // One record, or both records of a faculty member who is also a student.
      const links = identity.status === 'LINKED_MULTIPLE' ? identity.links : [identity];
      const studentLink = links.find((l) => l.recordType === 'STUDENT');
      const facultyLink = links.find((l) => l.recordType === 'FACULTY');
      const loadFaculty = async () => facultyDto((await s.adapter.client.get(`/faculty/${encodeURIComponent(facultyLink.sisId)}`)).data);
      const loadStudent = async () => {
        const [raw, academic, programs] = await Promise.all([
          s.adapter.client.get(`/students/${encodeURIComponent(studentLink.sisId)}`),
          s.adapter.getAcademicSummary(studentLink.sisId).catch((error) => (error instanceof SisError && error.status === 403 ? null : Promise.reject(error))),
          programsById(s).catch(() => new Map()),
        ]);
        const mapped = s.adapter.mapStudent(raw.data);
        const program = raw.data.program ? programs.get(raw.data.program.id) : null;
        return {
          student: {
            ...mapped,
            status: raw.data.status,
            admitTerm: raw.data.admitTerm ?? null,
            expectedGraduation: raw.data.expectedGraduation ?? null,
            program: mapped.program ? { ...mapped.program, requiredCredits: program?.requiredCredits ?? null } : null,
          },
          academic,
        };
      };
      const [studentPart, faculty] = await Promise.all([studentLink ? loadStudent() : null, facultyLink ? loadFaculty() : null]);
      const recordType = studentLink && facultyLink ? 'MULTIPLE' : studentLink ? 'STUDENT' : 'FACULTY';
      return { state: 'OK', recordType, ...(studentPart ?? {}), ...(faculty ? { faculty } : {}) };
    });
  } catch (error) {
    if (error.code === 'SIS_UNAVAILABLE') return { state: 'UNAVAILABLE', message: error.message };
    throw error;
  }
}

/**
 * Academic summary for dashboard widgets and the assistant, from CampusCore only.
 * Returns { state, ... }; a non-OK state carries no academic values at all.
 */
export async function academicSnapshot(auth) {
  const result = await myProfile(auth).catch((error) => ({ state: 'ERROR', message: error.message, code: error.code ?? null }));
  if (result.state !== 'OK') return { source: 'campuscore', state: result.state, message: result.message ?? null };
  // A student who also teaches (MULTIPLE) has a student record too: the snapshot is that record's.
  if (!result.student) return { source: 'campuscore', state: 'NOT_A_STUDENT', message: 'This account is linked to a CampusCore faculty record.' };
  const { student, academic } = result;
  return {
    source: 'campuscore',
    state: 'OK',
    institutionalId: student.institutionalId,
    program: student.program,
    status: student.status,
    cumulativeGpa: academic?.gpa ?? null,
    creditsEarned: academic?.creditsEarned ?? null,
    creditsInProgress: academic?.creditsInProgress ?? null,
    requiredCredits: student.program?.requiredCredits ?? null,
    standing: academic?.standing ?? student.standing ?? null,
    level: academic?.level ?? student.level ?? null,
    terms: academic?.terms ?? [],
  };
}

/* ------------------------------------------------------- faculty directory */

export async function searchFaculty(auth, { search, page = 1, pageSize = 25 } = {}) {
  return withSis(async (s) => {
    await s.portal.adminCapabilities(portalUser(auth));
    const res = await s.adapter.client.get('/faculty', { search, page, pageSize });
    const items = res.data.map(facultyDto);
    const mirror = await mirrorBySisIds(auth.tenantId, items.map((i) => i.source.id));
    return { items: items.map((item) => ({ ...item, portalAccount: mirror.get(item.source.id) ?? null })), total: res.pagination.total, page: res.pagination.page, totalPages: res.pagination.totalPages };
  });
}

/* ------------------------------------------------ portal account provisioning */

// CampusCore record statuses that may receive a portal login. Withdrawn, suspended,
// graduated and applicant records are refused; an administrator resolves those in CampusCore.
const PROVISIONABLE = { STUDENT: ['ACTIVE', 'ADMITTED', 'LEAVE_OF_ABSENCE'], FACULTY: ['ACTIVE'] };

/**
 * Create an EduNexusAI login for an existing CampusCore student or faculty member and link it
 * to that record, as one operation.
 *
 *  - The CampusCore record is the source: the login email is its institutional email, and
 *    the local profile holds only the institutional ID reference (no GPA, standing, program,
 *    transcript or enrolments; those stay in CampusCore and are read live).
 *  - Nothing is matched automatically. A record that is already linked, or an email that
 *    already has an EduNexusAI account, is refused; the administrator verifies and links
 *    that existing account instead (POST /sis/admin/identity/links).
 *  - The local user is created inside a transaction that also creates the CampusCore link
 *    (with an Idempotency-Key). If the link fails, the user is rolled back; if the commit
 *    fails after the link was made, the link is revoked. No onboarding baseline is applied.
 */
/** The identity.link capability must be effective (admin role + tenant + CampusCore scope/policy/preference). */
async function assertLinkCapability(s, admin) {
    let caps = await s.portal.adminCapabilities(admin); // admin role + tenant
    let linkCap = caps.operations.find((o) => o.operation === 'identity.link');
    if (linkCap && !linkCap.scopeGranted) {
      // A token keeps the scopes it was issued with. If a CampusCore administrator has just
      // added the scope to this client, a fresh token carries it, so re-check once.
      await s.adapter.client.getToken({ force: true });
      caps = await s.portal.adminCapabilities(admin);
      linkCap = caps.operations.find((o) => o.operation === 'identity.link');
    }
    if (!linkCap?.effective) {
      const fix = !linkCap?.scopeGranted
        ? ' In CampusCore: Admin \u2192 Developer & integrations \u2192 this EduNexusAI client \u2192 add the identity:write scope.'
        : !linkCap?.policyEnabled
          ? ' In CampusCore: Admin \u2192 Policies \u2192 allow identity link writes via the API.'
          : ' Re-enable "identity.link" under Integrations \u2192 CampusCore SIS \u2192 Overview (EduNexusAI write preferences).';
      throw new AppError(403, ErrorCode.FORBIDDEN, `${linkCap?.reason ?? 'Linking accounts is not permitted for this CampusCore connection.'}${fix}`, { provider: PROVIDER, sisCode: 'write_not_permitted' });
    }
}

export async function provisionAccount(auth, { recordType, sisRecordId, password, tierKey }) {
  return withSis(async (s) => {
    const admin = portalUser(auth);
    await assertLinkCapability(s, admin);

    const raw = (await s.adapter.client.get(`/${recordType === 'STUDENT' ? 'students' : 'faculty'}/${encodeURIComponent(sisRecordId)}`)).data;
    const record = recordType === 'STUDENT'
      ? { email: raw.email, firstName: raw.preferredName || raw.firstName, lastName: raw.lastName, institutionalId: raw.studentNumber, status: raw.status }
      : { email: raw.email, firstName: raw.firstName, lastName: raw.lastName, institutionalId: raw.employeeNumber, status: raw.status };
    if (!PROVISIONABLE[recordType].includes(record.status)) {
      throw badRequest(`This CampusCore ${recordType.toLowerCase()} record is ${String(record.status).toLowerCase().replace(/_/g, ' ')}, so no portal account is created. Resolve the record in CampusCore first.`, { sisStatus: record.status });
    }
    const email = String(record.email ?? '').trim().toLowerCase();
    if (!email) throw badRequest('The CampusCore record has no institutional email to use as the login.');

    const existingLinks = await s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, sisRecordId, status: 'ACTIVE' });
    if (existingLinks.data.length) {
      const owner = await prisma.user.findFirst({ where: { id: existingLinks.data[0].externalUserId, tenantId: auth.tenantId }, select: { id: true, email: true } });
      throw new AppError(409, ErrorCode.CONFLICT, `This CampusCore record is already linked to ${owner ? owner.email : 'another portal account'}.`, { provider: PROVIDER, sisCode: 'record_already_linked', portalUser: owner });
    }
    const clash = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: auth.tenantId, email } }, select: { id: true } });
    if (clash) {
      throw new AppError(409, ErrorCode.CONFLICT, 'An EduNexusAI account with this email already exists. Verify that it belongs to this person, then link it under Identity links instead of creating a second account.', { reason: 'EMAIL_IN_USE', userId: clash.id });
    }
    if (recordType === 'STUDENT' && (await prisma.studentProfile.findFirst({ where: { tenantId: auth.tenantId, studentNumber: record.institutionalId }, select: { id: true } }))) {
      throw conflict(`A local student profile already uses the ID ${record.institutionalId}. Resolve that profile before provisioning.`);
    }
    if (recordType === 'FACULTY' && (await prisma.facultyProfile.findFirst({ where: { tenantId: auth.tenantId, employeeNumber: record.institutionalId }, select: { id: true } }))) {
      throw conflict(`A local faculty profile already uses the ID ${record.institutionalId}. Resolve that profile before provisioning.`);
    }

    const roleKey = recordType === 'STUDENT' ? 'STUDENT' : 'FACULTY';
    const tier = recordType === 'STUDENT'
      ? (tierKey ? await prisma.studentTier.findFirst({ where: { tenantId: auth.tenantId, key: tierKey } }) : await prisma.studentTier.findFirst({ where: { tenantId: auth.tenantId }, orderBy: { rank: 'asc' } }))
      : null;
    if (tierKey && !tier) throw badRequest(`Unknown student tier: ${tierKey}`);

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    const summary = `Provision portal account ${email} for CampusCore ${recordType.toLowerCase()} ${sisRecordId}`;
    let link = null;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.create({
          // The administrator's password is temporary: the person replaces it at first sign-in.
          data: { id: userId, tenantId: auth.tenantId, email, passwordHash, passwordChangeRequired: true, firstName: record.firstName, lastName: record.lastName, status: 'ACTIVE' },
        });
        // The role is established by the verified SIS record link made in this same step.
        await grantRole(tx, { tenantId: auth.tenantId, userId, roleKey, source: 'SIS', grantedByUserId: auth.userId, evidence: { sisRecordId, institutionalId: record.institutionalId } });
        if (recordType === 'STUDENT') {
          // Portal anchor only: the academic columns stay empty because CampusCore owns them.
          await tx.studentProfile.create({ data: { tenantId: auth.tenantId, userId, tierId: tier?.id ?? null, studentNumber: record.institutionalId, academicStanding: null, currentTerm: null } });
        } else {
          await tx.facultyProfile.create({ data: { tenantId: auth.tenantId, userId, employeeNumber: record.institutionalId, title: null, department: null } });
        }
        link = await s.adapter.linkIdentity(
          { externalSystem: EXTERNAL_SYSTEM, externalUserId: userId, externalEmail: email, externalLabel: `${record.firstName} ${record.lastName}`, recordType, sisRecordId },
          { actingUser: s.portal.actingUser(admin), idempotencyKey: `provision-${userId}` },
        );
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (error) {
      // The user row was rolled back. Make sure no CampusCore link points at it.
      const orphan = link ?? (await s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, externalUserId: userId, status: 'ACTIVE' }).then((r) => r.data[0]).catch(() => null));
      if (orphan?.id) await s.adapter.revokeIdentityLink(orphan.id, 'Portal account provisioning did not complete; link withdrawn automatically.', { actingUser: s.portal.actingUser(admin) }).catch((e) => logger.warn('Could not withdraw orphan CampusCore link', { linkId: orphan.id, code: e.code ?? null }));
      await actorAudit(auth, 'SIS_ACCOUNT_PROVISION_REJECTED', `${summary} (rejected: ${error.code ?? 'error'})`, { outcome: 'REJECTED', sisCode: error.code ?? null, requestId: error.requestId ?? null }, sisRecordId);
      throw error;
    }
    s.portal.invalidate(userId);
    await syncMirror({ tenantId: auth.tenantId, userId }, { status: 'LINKED', recordType, sisId: sisRecordId }, recordType);
    await actorAudit(auth, 'SIS_ACCOUNT_PROVISIONED', summary, { outcome: 'ACCEPTED', userId, recordType, linkId: link?.id ?? null }, userId);
    await refreshDirectoryEntry(auth.tenantId, userId);
    return {
      user: { id: userId, email, firstName: record.firstName, lastName: record.lastName, roles: [roleKey] },
      sisRecord: { recordType, sisId: sisRecordId, institutionalId: record.institutionalId },
      link: link ? { id: link.id, status: link.status } : null,
      passwordChangeRequired: true,
    };
  });
}

/* ------------------------------------------------------ onboarding lookups */

const PROVISIONABLE_STATUSES = PROVISIONABLE;

/**
 * Read-only: CampusCore records for a person by email and/or institutional ID (or one record
 * by id), each with its current EduNexusAI link, plus whether this connection may create a
 * student and link accounts. States: OK, NOT_CONFIGURED, UNAVAILABLE.
 */
export async function lookupRecords(auth, { recordType, email, institutionalId, sisRecordId }) {
  if (!sisConfig().valid) return { state: 'NOT_CONFIGURED', records: [], capabilities: null, message: 'CampusCore SIS is not configured for this portal.' };
  try {
    return await withSis(async (s) => {
      const caps = await s.portal.adminCapabilities(portalUser(auth));
      const cap = (op) => { const c = caps.operations.find((o) => o.operation === op); return { effective: Boolean(c?.effective), reason: c?.reason ?? null }; };
      const norm = (v) => String(v ?? '').trim().toLowerCase();
      let raw = [];
      if (sisRecordId) {
        raw = [(await s.adapter.client.get(`/${recordType === 'STUDENT' ? 'students' : 'faculty'}/${encodeURIComponent(sisRecordId)}`)).data];
      } else if (recordType === 'STUDENT') {
        const seen = new Map();
        if (email) for (const r of (await s.adapter.client.get('/students', { email, pageSize: 5 })).data) seen.set(r.id, r);
        if (institutionalId) for (const r of (await s.adapter.client.get('/students', { studentNumber: institutionalId, pageSize: 5 })).data) seen.set(r.id, r);
        raw = [...seen.values()];
      } else {
        const seen = new Map();
        for (const term of [email, institutionalId].filter(Boolean)) {
          for (const r of (await s.adapter.client.get('/faculty', { search: term, pageSize: 25 })).data) {
            if ((email && norm(r.email) === norm(email)) || (institutionalId && r.employeeNumber === institutionalId)) seen.set(r.id, r);
          }
        }
        raw = [...seen.values()];
      }
      const records = [];
      for (const r of raw) {
        const links = await s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, sisRecordId: r.id, status: 'ACTIVE' });
        const linkedUserId = links.data[0]?.externalUserId ?? null;
        const owner = linkedUserId ? await prisma.user.findFirst({ where: { id: linkedUserId, tenantId: auth.tenantId }, select: { id: true, email: true, firstName: true, lastName: true } }) : null;
        records.push({
          recordType,
          sisId: r.id,
          institutionalId: recordType === 'STUDENT' ? r.studentNumber : r.employeeNumber,
          firstName: recordType === 'STUDENT' ? r.preferredName || r.firstName : r.firstName,
          lastName: r.lastName,
          email: r.email,
          status: r.status,
          provisionable: PROVISIONABLE_STATUSES[recordType].includes(r.status),
          program: r.program?.name ?? null,
          department: r.department?.name ?? null,
          linkedTo: linkedUserId ? { userId: linkedUserId, email: owner?.email ?? null, inThisPortal: Boolean(owner) } : null,
        });
      }
      return { state: 'OK', records, capabilities: { createStudent: cap('student.create'), linkIdentity: cap('identity.link') } };
    });
  } catch (error) {
    if (error.code === 'SIS_UNAVAILABLE') return { state: 'UNAVAILABLE', records: [], capabilities: null, message: error.message };
    throw error;
  }
}

/**
 * Add a relationship to an EXISTING account: link its CampusCore student or faculty record, create the
 * local record anchor (institutional number only; CampusCore owns the data) and grant the role, as one
 * step. A faculty member who becomes a student (or the reverse) keeps one account. CampusCore checks
 * that a second record belongs to the same person as the first (its person registry), and refuses
 * otherwise (CampusCore fixes such records with "same person"). Nothing is matched on email alone.
 */
export async function addRelationship(auth, { userId, recordType, sisRecordId, evidenceMismatchReason, tierKey }) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: auth.tenantId }, include: { studentProfile: true, facultyProfile: true, userRoles: { include: { role: true } } } });
  if (!user) throw badRequest('That EduNexusAI account does not belong to this institution.');
  const isStudent = recordType === 'STUDENT';
  const relation = isStudent ? 'studentProfile' : 'facultyProfile';
  return withSis(async (s) => {
    const admin = portalUser(auth);
    await assertLinkCapability(s, admin);
    const raw = (await s.adapter.client.get(`/${isStudent ? 'students' : 'faculty'}/${encodeURIComponent(sisRecordId)}`)).data;
    const number = isStudent ? raw.studentNumber : raw.employeeNumber;
    if (!PROVISIONABLE[recordType].includes(raw.status)) {
      throw badRequest(`This CampusCore ${recordType.toLowerCase()} record is ${String(raw.status).toLowerCase().replace(/_/g, ' ')}, so it cannot be linked. Resolve the record in CampusCore first.`, { sisStatus: raw.status });
    }
    const existing = user[relation];
    if (existing && existing[isStudent ? 'studentNumber' : 'employeeNumber'] !== number) {
      throw conflict(`This account already has a ${recordType.toLowerCase()} record (${existing[isStudent ? 'studentNumber' : 'employeeNumber']}) that is not this CampusCore record. Resolve it before linking another.`);
    }
    const clash = await (isStudent ? prisma.studentProfile : prisma.facultyProfile).findFirst({ where: { tenantId: auth.tenantId, [isStudent ? 'studentNumber' : 'employeeNumber']: number, userId: { not: user.id } }, select: { userId: true } });
    if (clash) throw conflict(`Another EduNexusAI account already holds the ${recordType.toLowerCase()} record ${number}.`);
    const tier = isStudent && !existing
      ? (tierKey ? await prisma.studentTier.findFirst({ where: { tenantId: auth.tenantId, key: tierKey } }) : await prisma.studentTier.findFirst({ where: { tenantId: auth.tenantId }, orderBy: { rank: 'asc' } }))
      : null;
    if (tierKey && isStudent && !existing && !tier) throw badRequest(`Unknown student tier: ${tierKey}`);
    const summary = `Link ${user.email} to CampusCore ${recordType.toLowerCase()} ${number}${evidenceMismatchReason ? ` (verified: ${evidenceMismatchReason})` : ''}`;
    let link = null;
    try {
      await prisma.$transaction(async (tx) => {
        if (!existing) {
          if (isStudent) await tx.studentProfile.create({ data: { tenantId: auth.tenantId, userId: user.id, tierId: tier?.id ?? null, studentNumber: number, academicStanding: null, currentTerm: null } });
          else await tx.facultyProfile.create({ data: { tenantId: auth.tenantId, userId: user.id, employeeNumber: number, title: null, department: null } });
        }
        await grantRole(tx, { tenantId: auth.tenantId, userId: user.id, roleKey: recordType, source: 'SIS', grantedByUserId: auth.userId, evidence: { sisRecordId, institutionalId: number } });
        await recordAudit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'ROLE_GRANTED', entityType: 'User', entityId: user.id, summary: `Granted ${recordType} (SIS): CampusCore record ${number} linked`, metadata: { roleKey: recordType, source: 'SIS', sisRecordId } }, tx);
        link = await s.adapter.linkIdentity(
          { externalSystem: EXTERNAL_SYSTEM, externalUserId: user.id, externalEmail: user.email, externalLabel: `${user.firstName} ${user.lastName}`, recordType, sisRecordId, evidenceMismatchReason },
          { actingUser: s.portal.actingUser(admin), idempotencyKey: `relationship-${user.id}-${recordType}-${sisRecordId}` },
        );
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (error) {
      const orphan = link ?? (await s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, externalUserId: user.id, recordType, status: 'ACTIVE' }).then((r) => r.data.find((l) => (l.sisRecord?.sisId ?? null) === sisRecordId)).catch(() => null));
      if (orphan?.id && !link) await s.adapter.revokeIdentityLink(orphan.id, 'Adding the relationship did not complete; link withdrawn automatically.', { actingUser: s.portal.actingUser(admin) }).catch(() => {});
      await actorAudit(auth, 'SIS_RELATIONSHIP_REJECTED', `${summary} (rejected: ${error.code ?? 'error'})`, { outcome: 'REJECTED', sisCode: error.code ?? null }, user.id);
      throw error;
    }
    s.portal.invalidate(user.id);
    await syncMirror({ tenantId: auth.tenantId, userId: user.id }, { status: 'LINKED', recordType, sisId: sisRecordId }, recordType);
    await actorAudit(auth, 'SIS_RELATIONSHIP_LINKED', summary, { outcome: 'ACCEPTED', recordType, linkId: link?.id ?? null, samePerson: link?.evidence?.samePerson ?? null }, user.id);
    await refreshDirectoryEntry(auth.tenantId, user.id);
    return { userId: user.id, recordType, institutionalId: number, linkId: link?.id ?? null, evidence: link?.evidence ?? null };
  });
}

/**
 * The CampusCore person (person registry) behind these institutional numbers, or null: not configured, unreachable,
 * no such person, numbers of different people, or a person CampusCore excludes from identity provisioning (the
 * People API does not offer them). Read-only; used to describe a portal account with institutional data.
 */
export async function institutionalPerson({ studentNumbers = [], employeeNumbers = [] }) {
  if (!sisConfig().valid || (!studentNumbers.length && !employeeNumbers.length)) return null;
  try {
    return await withSis(async (s) => {
      const people = new Map();
      for (const query of [...studentNumbers.map((n) => ({ studentNumber: n })), ...employeeNumbers.map((n) => ({ employeeNumber: n }))]) {
        for (const person of (await s.adapter.client.get('/people', query)).data) people.set(person.id, person);
      }
      return people.size === 1 ? [...people.values()][0] : null;
    });
  } catch (error) {
    logger.warn('CampusCore person lookup failed', { code: error.code ?? null });
    return null;
  }
}

/**
 * One portal account for one CampusCore person, linked in CampusCore to each of the person's eligible records (one
 * transaction locally; a CampusCore link already made is withdrawn if the account rolls back). No portal password:
 * the person signs in with the university ID. Shared by first sign-in (JIT) and the registry sync; the callers make
 * the identity checks. Returns the new user id.
 */
async function createPersonAccount(s, { tenant, person, eligible, email, via, actingUser, keyPrefix, rollbackReason }) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  // The record carrying the login address is linked first; CampusCore then accepts the other record because both
  // belong to the same person.
  const ordered = [...eligible].sort((a, b) => Number(norm(b.email) === email) - Number(norm(a.email) === email));
  const tier = ordered.some((r) => r.type === 'STUDENT') ? await prisma.studentTier.findFirst({ where: { tenantId: tenant.id }, orderBy: { rank: 'asc' } }) : null;
  const userId = randomUUID();
  const firstName = person.preferredName || person.firstName || 'University';
  const lastName = person.lastName || 'member';
  const links = [];
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, tenantId: tenant.id, email, passwordHash: null, passwordChangeRequired: false, firstName, lastName, status: 'ACTIVE' } });
      for (const r of ordered) {
        await grantRole(tx, { tenantId: tenant.id, userId, roleKey: r.type, source: 'SIS', evidence: { sisRecordId: r.sisId, institutionalId: r.number, personId: person.id, via } });
        if (r.type === 'STUDENT') await tx.studentProfile.create({ data: { tenantId: tenant.id, userId, tierId: tier?.id ?? null, studentNumber: r.number, academicStanding: null, currentTerm: null } });
        else await tx.facultyProfile.create({ data: { tenantId: tenant.id, userId, employeeNumber: r.number, title: null, department: null } });
      }
      for (const r of ordered) {
        links.push(await s.adapter.linkIdentity(
          { externalSystem: EXTERNAL_SYSTEM, externalUserId: userId, externalEmail: email, externalLabel: `${firstName} ${lastName}`, recordType: r.type, sisRecordId: r.sisId },
          { actingUser, idempotencyKey: `${keyPrefix}-${userId}-${r.type}` },
        ));
      }
    }, { timeout: 30_000, maxWait: 10_000 });
  } catch (error) {
    // The account was rolled back: withdraw any CampusCore link already made for it.
    const made = links.length ? links : (await s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, externalUserId: userId, status: 'ACTIVE' }).then((r) => r.data).catch(() => []));
    for (const l of made) await s.adapter.revokeIdentityLink(l.id, rollbackReason, { actingUser }).catch((e) => logger.warn('Could not withdraw orphan CampusCore link', { linkId: l.id, code: e.code ?? null }));
    throw error;
  }
  s.portal.invalidate(userId);
  for (const r of ordered) await syncMirror({ tenantId: tenant.id, userId }, { status: 'LINKED', recordType: r.type, sisId: r.sisId }, r.type);
  return userId;
}

/** CampusCore people whose person row or any record changed at or after `since` (CampusCore's incremental feed). */
export async function peopleChangedSince(since) {
  return withSis(async (s) => {
    const people = [];
    for (let page = 1; ; page += 1) {
      const res = await s.adapter.client.get('/people', { updatedSince: since.toISOString(), page, pageSize: 100 });
      people.push(...res.data);
      if (!res.data.length || page * 100 >= (res.pagination?.total ?? 0)) return people;
    }
  });
}

/**
 * Registry sync (CampusCore → EdunexusAI): a portal account for a CampusCore person who has none, so administrators
 * see new students and faculty under Users without importing them. Same account as first sign-in creates
 * (createPersonAccount; no password), and the person's later university sign-in finds it by the verified
 * institutional number and email (decideAccountLink), so no second account is ever made. Nothing is decided on
 * email alone: a person whose record is already linked, whose address or number is already held locally, or who has
 * no current relationship is skipped with a reason for an administrator. Returns { outcome, reason?, userId? }.
 */
export async function provisionFromRegistry({ tenant, personId }) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  return withSis(async (s) => {
    const person = (await s.adapter.client.get(`/people/${encodeURIComponent(personId)}`)).data;
    const base = { personNumber: person.personNumber };
    if (person.mergedInto) return { ...base, outcome: 'SKIPPED', reason: 'MERGED_PERSON' };
    const eligible = person.relationships.filter((r) => PROVISIONABLE[r.type]?.includes(r.status));
    if (!eligible.length) return { ...base, outcome: 'SKIPPED', reason: 'NO_ELIGIBLE_RECORD' };
    for (const r of person.relationships) {
      if ((await s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, sisRecordId: r.sisId, status: 'ACTIVE' })).data.length) return { ...base, outcome: 'SKIPPED', reason: 'ALREADY_LINKED' };
    }
    const email = norm(person.primaryEmail);
    if (!email) return { ...base, outcome: 'SKIPPED', reason: 'NO_EMAIL' };
    if (await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } }, select: { id: true } })) return { ...base, outcome: 'SKIPPED', reason: 'EMAIL_IN_USE' };
    for (const r of eligible) {
      const held = r.type === 'STUDENT'
        ? await prisma.studentProfile.findFirst({ where: { tenantId: tenant.id, studentNumber: r.number }, select: { id: true } })
        : await prisma.facultyProfile.findFirst({ where: { tenantId: tenant.id, employeeNumber: r.number }, select: { id: true } });
      if (held) return { ...base, outcome: 'SKIPPED', reason: 'NUMBER_IN_USE' };
    }
    const userId = await createPersonAccount(s, { tenant, person, eligible, email, via: 'CAMPUSCORE_SYNC', actingUser: `${EXTERNAL_SYSTEM}:registry-sync`, keyPrefix: 'sync', rollbackReason: 'Account creation from the CampusCore registry did not complete; link withdrawn automatically.' });
    await recordAudit({ tenantId: tenant.id, action: 'SIS_ACCOUNT_PROVISIONED', entityType: 'User', entityId: userId, summary: `Created portal account from the CampusCore registry for person ${person.personNumber} (${eligible.map((r) => `${r.type.toLowerCase()} ${r.number}`).join(', ')}); sign-in with the university ID`, metadata: { via: 'CAMPUSCORE_SYNC', personId: person.id, recordTypes: eligible.map((r) => r.type) } });
    await refreshDirectoryEntry(tenant.id, userId);
    return { ...base, outcome: 'CREATED', userId };
  });
}

/**
 * Institutional sign-in, first time, no portal account (JIT). Called only when the provider's switch is on and
 * no account matched the token's verified institutional numbers. CampusCore's person registry decides:
 *   - every claimed number must belong to ONE CampusCore person (else AMBIGUOUS_RECORDS);
 *   - the provider's VERIFIED email must be one of that person's institutional addresses (else EVIDENCE_MISMATCH);
 *   - at least one relationship must be current (else NO_ELIGIBLE_RECORD); every current one is provisioned, so a
 *     person who teaches and studies gets one account with both;
 *   - nobody may already hold the address or the records (EMAIL_IN_USE / RECORD_ALREADY_LINKED): an administrator
 *     links those instead. Nothing is decided on email alone, and no administrative role is ever granted.
 * The account has no portal password (institutional sign-in only). Returns { userId, ... } or { refused: REASON }.
 */
export async function provisionFromSignIn({ tenant, providerLabel, email, emailVerified, studentIds, employeeIds }) {
  if (!sisConfig().valid) return { refused: 'NO_MATCHING_RECORD' };
  if (!emailVerified) return { refused: 'EMAIL_NOT_VERIFIED' };
  const tokenEmail = String(email ?? '').trim().toLowerCase();
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  try {
    return await withSis(async (s) => {
      const people = new Map();
      for (const query of [...studentIds.map((n) => ({ studentNumber: n })), ...employeeIds.map((n) => ({ employeeNumber: n }))]) {
        for (const person of (await s.adapter.client.get('/people', query)).data) people.set(person.id, person);
      }
      if (!people.size) return { refused: 'NO_MATCHING_RECORD' };
      if (people.size > 1) return { refused: 'AMBIGUOUS_RECORDS' };
      const [person] = people.values();
      const holds = (type, number) => person.relationships.some((r) => r.type === type && r.number === number);
      if (!studentIds.every((n) => holds('STUDENT', n)) || !employeeIds.every((n) => holds('FACULTY', n))) return { refused: 'AMBIGUOUS_RECORDS' };
      if (!tokenEmail || !person.emails.map(norm).includes(tokenEmail)) return { refused: 'EVIDENCE_MISMATCH' };
      const eligible = person.relationships.filter((r) => PROVISIONABLE[r.type]?.includes(r.status));
      if (!eligible.length) return { refused: 'NO_ELIGIBLE_RECORD' };
      if (await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: tokenEmail } }, select: { id: true } })) return { refused: 'EMAIL_IN_USE' };
      for (const r of eligible) {
        if ((await s.adapter.listIdentityLinks({ externalSystem: EXTERNAL_SYSTEM, sisRecordId: r.sisId, status: 'ACTIVE' })).data.length) return { refused: 'RECORD_ALREADY_LINKED' };
      }
      const userId = await createPersonAccount(s, { tenant, person, eligible, email: tokenEmail, via: 'JIT_SIGN_IN', actingUser: `${EXTERNAL_SYSTEM}:jit-sign-in`, keyPrefix: 'jit', rollbackReason: 'Account creation at first sign-in did not complete; link withdrawn automatically.' });
      await recordAudit({ tenantId: tenant.id, actorUserId: userId, action: 'SIS_ACCOUNT_PROVISIONED', entityType: 'User', entityId: userId, summary: `Created portal account at first ${providerLabel} sign-in for CampusCore person ${person.personNumber} (${eligible.map((r) => `${r.type.toLowerCase()} ${r.number}`).join(', ')})`, metadata: { via: 'JIT_SIGN_IN', personId: person.id, recordTypes: eligible.map((r) => r.type) } });
      return { userId, personNumber: person.personNumber, recordTypes: eligible.map((r) => r.type) };
    });
  } catch (error) {
    if (error.code === 'SIS_UNAVAILABLE') return { refused: 'SIS_UNAVAILABLE' };
    // CampusCore refused a call: this connection may not read the person registry (people:read) or create links.
    if (error.status === 403) {
      logger.warn('JIT account creation not permitted by CampusCore', { sisCode: error.details?.sisCode ?? null });
      return { refused: 'JIT_NOT_PERMITTED' };
    }
    throw error;
  }
}

/**
 * Is this account's `recordType` relationship verified in CampusCore right now: linked, the record
 * active, and (when given) carrying institutional number `number`? Used as role evidence at
 * institutional sign-in. With no SIS configured, the local record is the record. Never throws:
 * an unreachable SIS means "not verified" (SIS_UNAVAILABLE), so nothing is granted on a guess.
 */
export async function verifyRelationship(auth, recordType, number = null) {
  if (!sisConfig().valid) return { verified: true, via: 'LOCAL_RECORD' };
  try {
    return await withSis(async (s) => {
      const identity = await resolveIdentity(s, auth, recordType);
      if (identity.status !== 'LINKED' || identity.recordType !== recordType) return { verified: false, reason: 'NO_SIS_LINK' };
      if (number && identity.institutionalId !== number) return { verified: false, reason: 'RECORD_MISMATCH' };
      if (!PROVISIONABLE[recordType].includes(identity.recordStatus)) return { verified: false, reason: 'RECORD_INACTIVE' };
      return { verified: true, via: 'CAMPUSCORE', sisId: identity.sisId };
    });
  } catch {
    return { verified: false, reason: 'SIS_UNAVAILABLE' };
  }
}

/** The CampusCore identity a portal account is linked to right now (live, not the mirror). */
export async function identityOf(auth, userId) {
  if (!sisConfig().valid) return { state: 'NOT_CONFIGURED' };
  try {
    return await withSis(async (s) => {
      await s.portal.adminCapabilities(portalUser(auth));
      const identity = await s.adapter.resolveIdentity(String(userId), { externalSystem: EXTERNAL_SYSTEM });
      await syncMirror({ tenantId: auth.tenantId, userId }, identity);
      const linked = identity.status === 'LINKED' || identity.status === 'LINKED_MULTIPLE';
      return { state: linked ? 'LINKED' : 'UNMAPPED', ...identity, links: identity.links ?? (identity.status === 'LINKED' ? [identity] : []) };
    });
  } catch (error) {
    if (error.code === 'SIS_UNAVAILABLE') return { state: 'UNAVAILABLE', message: error.message };
    throw error;
  }
}

/* --------------------------------------------- shared access for other modules */

export const sisConfigured = () => sisConfig().valid;

/**
 * Run `fn(adapter)` against CampusCore after institution verification, with SisError mapped to
 * HTTP errors. For integration services in other modules (e.g. Moodle course alignment); the
 * caller is responsible for its own authorisation checks.
 */
export function withCampusCore(fn) {
  return withSis((s) => fn(s.adapter, s));
}
