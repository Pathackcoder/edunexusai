import { prisma } from '../../db/prisma.js';
import { resolveEntitlements } from '../entitlements/entitlementService.js';
import { toNumber } from '../../utils/format.js';
import { notFound } from '../../utils/errors.js';

/**
 * The payload behind GET /api/v1/auth/me.
 *
 * Shape note: the student branch intentionally mirrors the field names the existing
 * React screens already read (firstName, fullName, cumulativeGpa, emergencyContact, ...)
 * so the migration did not require rewriting those components. `roles`, `tier` and
 * `entitlements` are the new, additive parts that drive persona and widget selection.
 */
export async function buildCurrentUser({ userId }) {
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
    roles,
    persona,
    institution: user.tenant.name,
    tenant: {
      id: user.tenant.id,
      slug: user.tenant.slug,
      name: user.tenant.name,
      shortName: user.tenant.shortName,
    },
    tier: entitlements.tier,
    entitlements: entitlements.widgets,
    entitlementDetails: entitlements.widgetDetails,
    entitlementSource: entitlements.source,
    lastLoginAt: user.lastLoginAt,
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
