/**
 * Role contexts: one entry per COMMUNITY role a person holds (multi-role Phase 1).
 *
 * A person with several relationships to the institution (for example a faculty member who
 * is also a postgraduate student) has ONE account and one context per relationship. Each
 * context carries its own entitlements and the local record (profile) its data comes from,
 * so a student widget never reads teaching data and a faculty widget never reads the
 * person's own grades.
 *
 * Rules:
 * - A context is ACTIVE only when its record exists. Holding the role alone is not proof of
 *   a record: without one the context is UNLINKED, has no entitlements and no data endpoint
 *   will serve it (requireStudentProfile / requireFacultyProfile answer 404).
 * - ADMIN is an administrative workspace, never a community context. It grants nothing
 *   inside the student or faculty contexts.
 * - The order below is also the precedence of the legacy single `persona` (faculty before
 *   student), so `defaultContext` agrees with what a single-persona client already shows.
 *
 * Guest / prospective visitors are not account roles (public content needs no sign-in).
 */

export const COMMUNITY_CONTEXTS = [
  { key: 'faculty', role: 'FACULTY', profile: 'facultyProfile', audience: 'FACULTY', dashboard: { endpoint: '/faculty/dashboard', layoutKey: 'faculty' } },
  { key: 'student', role: 'STUDENT', profile: 'studentProfile', audience: 'STUDENT', dashboard: { endpoint: '/dashboard/student', layoutKey: 'student' } },
  // Staff need a staff record. Alumni need none: the institution's assertion is the evidence, and
  // the alumni context shows no academic records. Both activate once the STAFF / ALUMNI role keys
  // exist (database migration pending); until then nobody holds these roles.
  { key: 'staff', role: 'STAFF', profile: 'staffProfile', audience: 'STAFF', dashboard: { endpoint: null, layoutKey: 'staff' } },
  { key: 'alumni', role: 'ALUMNI', profile: null, audience: 'ALUMNI', dashboard: { endpoint: null, layoutKey: 'alumni' } },
];

export const ADMIN_WORKSPACES = [{ key: 'admin', role: 'ADMIN' }];

/** Workflow audiences (forms, resources) for every community role held, in context order. */
export const communityAudiences = (roles = []) =>
  COMMUNITY_CONTEXTS.filter((context) => roles.includes(context.role)).map((context) => context.audience);

/**
 * Contexts for a user record that includes `studentProfile` and `facultyProfile`.
 * `resolveEntitlementsFor(contextKey)` supplies each ACTIVE context's widgets.
 */
export async function resolveRoleContexts(user, roles, resolveEntitlementsFor) {
  const contexts = [];
  for (const definition of COMMUNITY_CONTEXTS) {
    if (!roles.includes(definition.role)) continue;
    const profile = definition.profile ? user[definition.profile] ?? null : { id: null };
    if (!profile) {
      contexts.push({ key: definition.key, role: definition.role, status: 'UNLINKED', reason: `NO_${definition.role}_RECORD`, profileId: null, tier: null, entitlements: [], dashboard: definition.dashboard });
      continue;
    }
    const resolved = await resolveEntitlementsFor(definition.key);
    contexts.push({ key: definition.key, role: definition.role, status: 'ACTIVE', profileId: profile.id, tier: resolved.tier, entitlements: resolved.widgets, dashboard: definition.dashboard });
  }
  const workspaces = ADMIN_WORKSPACES.filter((workspace) => roles.includes(workspace.role)).map((workspace) => workspace.key);
  const defaultContext = contexts.find((context) => context.status === 'ACTIVE')?.key ?? null;
  return { contexts, workspaces, defaultContext };
}
