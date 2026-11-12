import { prisma } from '../../db/prisma.js';
import { resolveContextEntitlements, resolveEntitlements } from '../entitlements/entitlementService.js';
import { resolveRoleContexts } from './roleContexts.js';
import { toNumber } from '../../utils/format.js';
import { notFound } from '../../utils/errors.js';
import { analyticsConfig } from '../analytics/config.js';

/**
 * The payload behind GET /api/v1/auth/me.
 *
 * Shape note: the student branch intentionally mirrors the field names the existing
 * React screens already read (firstName, fullName, cumulativeGpa, emergencyContact, ...)
 * so the migration did not require rewriting those components. `roles`, `tier` and
 * `entitlements` are the new, additive parts that drive persona and widget selection.
 */
/**
 * Other university applications this person may open from the portal. CampusCore SIS is offered to
 * people with a verified CampusCore student or faculty record behind a role they hold, and to
 * administrators (registrar console). The entry only starts CampusCore's own university sign-in:
 * CampusCore decides, from its own account and roles, whether and what the person may do there.
 * A person with both records (a lecturer who also studies) gets one entry per area, each opening
 * that area directly (CampusCore's `returnTo`), because CampusCore holds both roles on one account.
 */
const CAMPUSCORE_AREAS = [
  { entityType: 'FACULTY', key: 'campuscore-faculty', label: 'CampusCore · Teaching', description: 'Your sections, rosters and grading in the student information system', returnTo: '/faculty' },
  { entityType: 'STUDENT', key: 'campuscore-student', label: 'CampusCore · Student records', description: 'Your registration, grades and documents in the student information system', returnTo: '/student' },
];
async function universityApps(user, roles) {
  const base = (process.env.CAMPUSCORE_PORTAL_URL ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) return [];
  const links = await prisma.externalIdentity.findMany({ where: { tenantId: user.tenantId, provider: 'CAMPUSCORE', internalId: user.id, status: 'ACTIVE' }, select: { entityType: true } });
  const areas = CAMPUSCORE_AREAS.filter((a) => roles.includes(a.entityType) && links.some((l) => l.entityType === a.entityType));
  const start = `${base}/api/app/auth/oidc/start`;
  if (areas.length > 1) return areas.map((a) => ({ key: a.key, label: a.label, description: a.description, url: `${start}?returnTo=${encodeURIComponent(a.returnTo)}` }));
  if (!areas.length && !roles.includes('ADMIN')) return [];
  return [{
    key: 'campuscore',
    label: 'CampusCore SIS',
    description: areas.length ? 'Your records in the student information system' : 'Registrar console (CampusCore staff account required)',
    url: start,
  }];
}

function collectingFor(user) {
  const config = analyticsConfig();
  if (!config.enabled || user.analyticsExcludedAt) return false;
  return user.tenant.analyticsEnabled || config.allowUserIds.includes(user.id);
}

export async function buildCurrentUser({ userId, signIn = null }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenant: true,
      userRoles: { include: { role: true } },
      studentProfile: {
        include: {
          tier: true,
          emergencyContacts: { orderBy: { isPrimary: 'desc' } },
        },
      },
      facultyProfile: true,
      staffProfile: true,
    },
  });
  if (!user) throw notFound('User not found.');

  const roles = user.userRoles.map((link) => link.role.key);
  const entitlements = await resolveEntitlements({
    tenantId: user.tenantId,
    roles,
    tierId: user.studentProfile?.tierId ?? null,
  });

  // One entry per community role (multi-role Phase 1). Additive: `persona`, `entitlements`
  // and the profile fields below keep their single-persona meaning for existing clients.
  const roleContexts = await resolveRoleContexts(user, roles, (context) =>
    resolveContextEntitlements({ tenantId: user.tenantId, context, tierId: user.studentProfile?.tierId ?? null }));

  const persona = roles.includes('ADMIN')
    ? 'ADMIN'
    : roles.includes('FACULTY')
      ? 'FACULTY'
      : 'STUDENT';

  const base = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    phone: user.phone,
    locale: user.locale,
    status: user.status,
    // A pending local password change applies to password sessions only; an institutional (SSO)
    // session never used the local password (the API does not block it either).
    passwordChangeRequired: user.passwordChangeRequired && signIn?.method !== 'SSO',
    signInMethod: signIn?.method ?? 'PASSWORD',
    // False for an account created at its first institutional sign-in: it has no portal password.
    hasPassword: Boolean(user.passwordHash),
    roles,
    persona,
    institution: user.tenant.name,
    tenant: {
      id: user.tenant.id,
      slug: user.tenant.slug,
      name: user.tenant.name,
      shortName: user.tenant.shortName,
    },
    appearance: { themeKey: user.tenant.appearanceTheme, fontKey: user.tenant.appearanceFont },
    tier: entitlements.tier,
    entitlements: entitlements.widgets,
    entitlementDetails: entitlements.widgetDetails,
    entitlementSource: entitlements.source,
    contexts: roleContexts.contexts,
    workspaces: roleContexts.workspaces,
    defaultContext: roleContexts.defaultContext,
    apps: await universityApps(user, roles),
    lastLoginAt: user.lastLoginAt,
    // Named permissions on top of the roles (e.g. analytics.view), and whether this person's portal use is
    // being measured right now. The browser tracker stays silent unless `collecting` is true.
    permissions: (await prisma.userPermission.findMany({ where: { tenantId: user.tenantId, userId: user.id }, select: { permission: true } })).map((row) => row.permission),
    analytics: { collecting: collectingFor(user) },
  };

  if (user.studentProfile) {
    const profile = user.studentProfile;
    const contact = profile.emergencyContacts[0] ?? null;
    return {
      ...base,
      // Student record identifier the UI prints as the student id.
      studentProfileId: profile.id,
      studentNumber: profile.studentNumber,
      preferredName: profile.preferredName,
      pronouns: profile.pronouns,
      pronounsVisibility: profile.pronounsVisibility,
      directoryVisible: profile.directoryVisible,
      degree: profile.degree,
      department: profile.department,
      academicStanding: profile.academicStanding,
      admitTerm: profile.admitTerm,
      currentTerm: profile.currentTerm,
      creditsCompleted: profile.creditsCompleted,
      totalCreditsRequired: profile.totalCreditsRequired,
      cumulativeGpa: toNumber(profile.cumulativeGpa),
      majorGpa: toNumber(profile.majorGpa),
      semesterGpa: toNumber(profile.semesterGpa),
      honors: profile.honors,
      interests: profile.interests ?? [],
      careerGoals: profile.careerGoals ?? [],
      address: profile.addressLine1,
      city: profile.city,
      state: profile.state,
      zipCode: profile.postalCode,
      emergencyContact: contact
        ? {
            name: contact.name,
            relationship: contact.relationship,
            phone: contact.phone,
            altPhone: contact.altPhone,
            email: contact.email,
          }
        : null,
    };
  }

  if (user.facultyProfile) {
    const profile = user.facultyProfile;
    const courseCount = await prisma.course.count({
      where: { tenantId: user.tenantId, instructorUserId: user.id },
    });
    return {
      ...base,
      facultyProfileId: profile.id,
      employeeNumber: profile.employeeNumber,
      title: profile.title,
      department: profile.department,
      officeLocation: profile.officeLocation,
      officeHours: profile.officeHours,
      bio: profile.bio,
      courseCount,
    };
  }

  if (user.staffProfile) {
    const profile = user.staffProfile;
    return {
      ...base,
      staffProfileId: profile.id,
      employeeNumber: profile.employeeNumber,
      title: profile.title,
      department: profile.department,
      officeLocation: profile.officeLocation,
    };
  }

  return base;
}
