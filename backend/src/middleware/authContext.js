/**
 * The request context (`req.auth`) for a user record. Shared by requireAuth (the signed-in person) and View-As (the
 * person whose portal an administrator is viewing), so both produce exactly the same fields from the same record.
 */
export const AUTH_USER_INCLUDE = {
  userRoles: { include: { role: true } },
  studentProfile: { include: { tier: true } },
  facultyProfile: true,
  staffProfile: true,
  tenant: { select: { id: true, slug: true, name: true, shortName: true, isActive: true, analyticsEnabled: true } },
};

export function authContextFor(user, { roles = user.userRoles.map((link) => link.role.key), signIn, analytics, tokenExpiresAt = null }) {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    tenantSlug: user.tenant.slug,
    tenantName: user.tenant.name,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles,
    tierKey: user.studentProfile?.tier?.key ?? null,
    tierId: user.studentProfile?.tierId ?? null,
    studentProfileId: user.studentProfile?.id ?? null,
    facultyProfileId: user.facultyProfile?.id ?? null,
    staffProfileId: user.staffProfile?.id ?? null,
    // How this session started: PASSWORD, or SSO with the institution's provider key (VIEW_AS for a View-As subject).
    signIn,
    // Portal analytics: has the institution switched collection on, and is this account excluded from it?
    analytics: analytics ?? { tenantEnabled: user.tenant.analyticsEnabled, excluded: Boolean(user.analyticsExcludedAt) },
    // Seconds since the epoch at which this access token stops being valid.
    tokenExpiresAt,
  };
}
