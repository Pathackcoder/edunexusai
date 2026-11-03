/**
 * Institutional identity policy: pure decisions, no I/O.
 *
 * External sign-in (an institution's identity provider) is EVIDENCE. It never grants an
 * administrative role, never proves on its own that an SIS record belongs to someone, and is
 * never matched on email alone. The functions below turn verified claims, an institution's
 * mapping rules and the person's verified records into decisions that the sign-in flow applies.
 *
 *   readClaim(claims, path)            dotted claim paths ("realm_access.roles", "groups")
 *   validateMappingRule(rule)          an institution's rule: external value -> community role
 *   mapExternalValues(values, rules)   which community roles the claims are evidence for
 *   resolveCommunityRoles(...)         which of those may be granted, given verified records
 *   decideAccountLink(...)             first sign-in: link to which account, or refuse why
 *   planRoleSync(...)                  which of its own role sources a sign-in grants or withdraws
 */

export const COMMUNITY_ROLES = ['STUDENT', 'FACULTY', 'STAFF', 'ALUMNI'];
export const ADMINISTRATIVE_ROLES = ['ADMIN'];

/**
 * What each community role needs before it may be granted from external evidence.
 *   SIS_RECORD   a verified, linked SIS record (student or faculty profile created through SIS
 *                provisioning). A claim alone is never enough.
 *   STAFF_RECORD a staff record; with no HR integration, the institution's identity provider is
 *                the trusted source of the employee number that establishes it.
 *   NONE         the institution's own assertion (e.g. an alumni affiliation) is the evidence.
 */
export const ROLE_EVIDENCE = { STUDENT: 'SIS_RECORD', FACULTY: 'SIS_RECORD', STAFF: 'STAFF_RECORD', ALUMNI: 'NONE' };

const norm = (value) => String(value ?? '').trim().toLowerCase();

/** Read a dotted claim path and return a flat list of non-empty strings. */
export function readClaim(claims, path) {
  if (!claims || !path) return [];
  let value = claims;
  for (const part of String(path).split('.')) {
    if (value == null || typeof value !== 'object') return [];
    value = value[part];
  }
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return list.filter((v) => typeof v === 'string' || typeof v === 'number').map((v) => String(v).trim()).filter(Boolean);
}

/** Validate one mapping rule. Returns { ok, rule } or { ok: false, errors }. */
export function validateMappingRule(input) {
  const errors = {};
  const externalValue = String(input?.externalValue ?? '').trim();
  const targetRole = String(input?.targetRole ?? '').trim().toUpperCase();
  if (!externalValue) errors.externalValue = 'Enter the value your identity provider sends.';
  else if (externalValue.length > 120) errors.externalValue = 'Use at most 120 characters.';
  if (ADMINISTRATIVE_ROLES.includes(targetRole)) errors.targetRole = 'Administrative roles are assigned in the portal, never from an identity provider.';
  else if (!COMMUNITY_ROLES.includes(targetRole)) errors.targetRole = `Choose one of ${COMMUNITY_ROLES.join(', ')}.`;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rule: { externalValue, targetRole, enabled: input?.enabled !== false } };
}

/**
 * Map external values (roles, groups, affiliations) to community roles with the institution's
 * enabled rules. Matching is exact after trimming and ignoring case. Values with no rule are
 * returned in `unknown`: they grant nothing and are reported for review.
 */
export function mapExternalValues(values, rules) {
  const active = (rules ?? []).filter((rule) => rule.enabled !== false && COMMUNITY_ROLES.includes(rule.targetRole));
  const mapped = new Map();
  const unknown = [];
  for (const value of [...new Set((values ?? []).map((v) => String(v).trim()).filter(Boolean))]) {
    const hits = active.filter((rule) => norm(rule.externalValue) === norm(value));
    if (!hits.length) unknown.push(value);
    for (const hit of hits) mapped.set(hit.targetRole, [...(mapped.get(hit.targetRole) ?? []), value]);
  }
  return { mapped, unknown };
}

/**
 * Decide which mapped community roles may be granted. `records` says which verified records the
 * account has: { student: bool, faculty: bool, staff: bool }. A role whose evidence is missing is
 * reported, not granted.
 */
export function resolveCommunityRoles(mapped, records = {}) {
  const granted = [];
  const withheld = [];
  for (const [role, values] of mapped) {
    const needs = ROLE_EVIDENCE[role];
    const has = needs === 'NONE' || (role === 'STUDENT' && records.student) || (role === 'FACULTY' && records.faculty) || (role === 'STAFF' && records.staff);
    if (has) granted.push({ role, values });
    else withheld.push({ role, values, reason: role === 'STAFF' ? 'NO_STAFF_RECORD' : `NO_VERIFIED_${role}_RECORD` });
  }
  return { granted, withheld };
}

/**
 * First sign-in: which EdunexusAI account (if any) an external identity belongs to.
 *
 * Inputs:
 *   existing      the account already linked to this issuer + subject, or null
 *   claims        { email, emailVerified, studentIds: [], employeeIds: [] } from the verified ID token
 *   matches       accounts whose VERIFIED institutional numbers equal a claimed number:
 *                 [{ userId, email, status, via: 'STUDENT_NUMBER' | 'EMPLOYEE_NUMBER', linkedSubject }]
 *                 (`linkedSubject`: that account is already linked to a different subject of this provider)
 *
 * The decision never uses email to choose an account. Email is a required cross-check only.
 */
export function decideAccountLink({ existing, claims, matches }) {
  if (existing) {
    if (existing.status !== 'ACTIVE') return { decision: 'REFUSE', reason: 'ACCOUNT_DISABLED' };
    return { decision: 'SIGN_IN', userId: existing.userId };
  }
  const numbers = [...(claims?.studentIds ?? []), ...(claims?.employeeIds ?? [])];
  if (!numbers.length) return { decision: 'REFUSE', reason: 'NO_INSTITUTIONAL_ID' };
  const userIds = [...new Set((matches ?? []).map((m) => m.userId))];
  if (!userIds.length) return { decision: 'REFUSE', reason: 'NO_MATCHING_RECORD' };
  if (userIds.length > 1) return { decision: 'REFUSE', reason: 'AMBIGUOUS_RECORDS' };
  const account = matches.find((m) => m.userId === userIds[0]);
  if (account.linkedSubject) return { decision: 'REFUSE', reason: 'ACCOUNT_LINKED_TO_ANOTHER_IDENTITY' };
  if (claims.emailVerified !== true) return { decision: 'REFUSE', reason: 'EMAIL_NOT_VERIFIED' };
  if (norm(claims.email) !== norm(account.email)) return { decision: 'REFUSE', reason: 'EVIDENCE_MISMATCH' };
  if (account.status !== 'ACTIVE') return { decision: 'REFUSE', reason: 'ACCOUNT_DISABLED' };
  return { decision: 'LINK', userId: account.userId, via: [...new Set(matches.map((m) => m.via))] };
}

/**
 * Which of THIS provider's role sources a sign-in grants and withdraws. `current`: community roles
 * this provider asserted before (its IDP sources); `desired`: roles granted by this sign-in. The
 * provider only ever adds or withdraws its own source; whether a role itself disappears is decided
 * by the role-assignment store (only a role this provider created, with no other source left).
 * Administrative roles are never part of the plan.
 */
export function planRoleSync({ current, desired }) {
  const want = new Set((desired ?? []).filter((role) => COMMUNITY_ROLES.includes(role)));
  return {
    grant: [...want],
    withdraw: [...new Set(current ?? [])].filter((role) => !want.has(role)),
  };
}
