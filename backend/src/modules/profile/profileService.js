import { prisma } from '../../db/prisma.js';
import { buildReference, toIsoDate } from '../../utils/format.js';
import { notFound } from '../../utils/errors.js';
import { buildCurrentUser } from '../users/sessionService.js';
import { createRequest } from '../workflows/requestService.js';

/**
 * Profile self-service.
 *
 * Fields a student may change directly (contact details, pronouns, preferences) are
 * updated in place. Fields of record (legal name, address of record) go through a
 * ProfileChangeRequest that a registrar approves — which is why those two are POSTs that
 * create a request rather than PATCHes that mutate the record.
 */

export async function updateProfile(tenantId, userId, payload) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { studentProfile: true },
  });
  if (!user) throw notFound('User not found.');

  const userData = {};
  if (payload.phone !== undefined) userData.phone = payload.phone;
  if (payload.firstName !== undefined) userData.firstName = payload.firstName;
  if (payload.lastName !== undefined) userData.lastName = payload.lastName;
  if (payload.locale !== undefined) userData.locale = payload.locale;
  if (Object.keys(userData).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: userData });
  }

  if (user.studentProfile) {
    const profileData = {};
    for (const [field, column] of Object.entries({
      preferredName: 'preferredName',
      pronouns: 'pronouns',
      pronounsVisibility: 'pronounsVisibility',
      directoryVisible: 'directoryVisible',
      city: 'city',
      state: 'state',
      zipCode: 'postalCode',
      address: 'addressLine1',
      interests: 'interests',
      careerGoals: 'careerGoals',
    })) {
      if (payload[field] !== undefined) profileData[column] = payload[field];
    }
    if (Object.keys(profileData).length > 0) {
      await prisma.studentProfile.update({ where: { id: user.studentProfile.id }, data: profileData });
    }

    if (payload.emergencyContact) {
      const existing = await prisma.emergencyContact.findFirst({
        where: { studentProfileId: user.studentProfile.id, isPrimary: true },
      });
      const data = {
        name: payload.emergencyContact.name,
        relationship: payload.emergencyContact.relationship,
        phone: payload.emergencyContact.phone,
        altPhone: payload.emergencyContact.altPhone,
        email: payload.emergencyContact.email,
      };
      if (existing) {
        await prisma.emergencyContact.update({ where: { id: existing.id }, data });
      } else {
        await prisma.emergencyContact.create({
          data: { ...data, studentProfileId: user.studentProfile.id, isPrimary: true },
        });
      }
    }
  }

  return buildCurrentUser({ userId });
}

function presentChangeRequest(request) {
  const base = {
    id: request.reference,
    requestId: request.id,
    type: request.type,
    requestDate: toIsoDate(request.requestedAt),
    status: statusLabel(request.status),
    rawStatus: request.status,
    effectiveDate: toIsoDate(request.effectiveDate),
    reviewerNotes: request.reviewerNotes,
    reason: request.reason,
  };
  // The existing screens read oldAddress/newAddress and oldName/newName.
  return request.type === 'ADDRESS'
    ? { ...base, oldAddress: request.oldValue, newAddress: request.newValue }
    : { ...base, oldName: request.oldValue, newName: request.newValue };
}

const statusLabel = (status) =>
  ({ PENDING: 'Pending', IN_REVIEW: 'In Review', NEEDS_INFO: 'Needs Information', APPROVED: 'Approved', REJECTED: 'Rejected' })[status] ??
  status;

export async function listChangeRequests(tenantId, userId) {
  const requests = await prisma.profileChangeRequest.findMany({
    where: { tenantId, userId },
    orderBy: { requestedAt: 'desc' },
  });
  const presented = requests.map(presentChangeRequest);
  return {
    all: presented,
    addressRequests: presented.filter((request) => request.type === 'ADDRESS'),
    nameRequests: presented.filter((request) => request.type === 'NAME'),
  };
}

export async function createAddressChangeRequest(tenantId, userId, payload) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { studentProfile: true },
  });
  if (!user) throw notFound('User not found.');

  const profile = user.studentProfile;
  const oldAddress = profile
    ? [profile.addressLine1, profile.city, profile.state, profile.postalCode].filter(Boolean).join(', ')
    : null;
  const newAddress = [payload.addressLine1, payload.city, payload.state, payload.postalCode]
    .filter(Boolean)
    .join(', ');

  // The petition and its entry in the administrator's queue are written together, so the
  // registrar always sees what the student sees.
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.profileChangeRequest.create({
      data: {
        tenantId,
        userId,
        reference: buildReference('ADR'),
        type: 'ADDRESS',
        status: 'PENDING',
        oldValue: oldAddress,
        newValue: newAddress,
        reason: payload.reason ?? null,
        documentRef: payload.documentRef ?? null,
        effectiveDate: payload.effectiveDate ? new Date(payload.effectiveDate) : null,
      },
    });
    await createRequest(
      {
        tenantId,
        userId,
        roles: ['STUDENT'],
        type: 'ADDRESS_CHANGE',
        title: `Address change ${created.reference}`,
        description: `Change address of record to: ${newAddress}${payload.reason ? `. Reason: ${payload.reason}` : ''}`,
        details: {
          petition: created.reference,
          currentAddress: oldAddress,
          addressLine1: payload.addressLine1,
          city: payload.city,
          state: payload.state,
          postalCode: payload.postalCode,
          effectiveDate: payload.effectiveDate ?? null,
          documentRef: payload.documentRef ?? null,
        },
        attachments: payload.attachments ?? [],
        sourceType: 'PROFILE_CHANGE',
        sourceId: created.id,
      },
      tx,
    );
    await tx.notification.create({
      data: {
        tenantId,
        userId,
        title: 'Address change request submitted',
        message: `Request ${created.reference} is pending registrar review. You will be notified once it is processed.`,
        category: 'administrative',
        priority: 'normal',
        link: '/profile/requests',
        sourceType: 'PROFILE_REQUEST',
        sourceRefId: created.id,
      },
    });
    return created;
  });

  return presentChangeRequest(request);
}

export async function createNameChangeRequest(tenantId, userId, payload) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw notFound('User not found.');

  const newName = [payload.firstName, payload.middleName, payload.lastName].filter(Boolean).join(' ');
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.profileChangeRequest.create({
      data: {
        tenantId,
        userId,
        reference: buildReference('NAM'),
        type: 'NAME',
        status: 'PENDING',
        oldValue: `${user.firstName} ${user.lastName}`,
        newValue: newName,
        reason: payload.reason ?? null,
        documentRef: payload.documentRef ?? null,
      },
    });
    await createRequest(
      {
        tenantId,
        userId,
        roles: ['STUDENT'],
        type: 'NAME_CHANGE',
        title: `Legal name change ${created.reference}`,
        description: `Change legal name from ${created.oldValue} to ${newName}. Reason: ${payload.reason}`,
        details: {
          petition: created.reference,
          currentName: created.oldValue,
          firstName: payload.firstName,
          middleName: payload.middleName ?? null,
          lastName: payload.lastName,
          documentRef: payload.documentRef ?? null,
        },
        attachments: payload.attachments ?? [],
        sourceType: 'PROFILE_CHANGE',
        sourceId: created.id,
      },
      tx,
    );
    await tx.notification.create({
      data: {
        tenantId,
        userId,
        title: 'Legal name change request submitted',
        message: `Request ${created.reference} is pending registrar review. Supporting documentation may be requested.`,
        category: 'administrative',
        priority: 'normal',
        link: '/profile/requests',
        sourceType: 'PROFILE_REQUEST',
        sourceRefId: created.id,
      },
    });
    return created;
  });

  return presentChangeRequest(request);
}

/** COMMUNICATION PREFERENCES -------------------------------------------------- */

export async function listCommunicationPreferences(tenantId, userId) {
  const categories = await prisma.communicationCategory.findMany({
    where: { tenantId },
    include: { preferences: { where: { userId } } },
    orderBy: { sortOrder: 'asc' },
  });

  return categories.map((category) => {
    const preference = category.preferences[0];
    return {
      id: category.key,
      categoryId: category.id,
      title: category.title,
      description: category.description,
      isMandatory: category.isMandatory,
      channels: {
        // A mandatory category is always on, whatever is stored.
        email: category.isMandatory ? true : (preference?.email ?? true),
        sms: category.isMandatory ? true : (preference?.sms ?? false),
        push: category.isMandatory ? true : (preference?.push ?? true),
      },
    };
  });
}

export async function updateCommunicationPreferences(tenantId, userId, updates) {
  for (const update of updates) {
    const category = await prisma.communicationCategory.findFirst({
      where: { tenantId, key: update.categoryKey },
    });
    if (!category || category.isMandatory) continue; // mandatory alerts cannot be disabled

    await prisma.communicationPreference.upsert({
      where: { userId_categoryId: { userId, categoryId: category.id } },
      create: {
        tenantId,
        userId,
        categoryId: category.id,
        email: update.email ?? true,
        sms: update.sms ?? false,
        push: update.push ?? true,
      },
      update: {
        ...(update.email !== undefined ? { email: update.email } : {}),
        ...(update.sms !== undefined ? { sms: update.sms } : {}),
        ...(update.push !== undefined ? { push: update.push } : {}),
      },
    });
  }
  return listCommunicationPreferences(tenantId, userId);
}
