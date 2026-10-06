import { loadFixture, parseTimestamp, utcDate } from './shared.js';

export async function seedFaqs(prisma, tenant) {
  const { faqCategories, faqData, supportContacts } = await loadFixture('faqs');

  for (const [index, category] of faqCategories.entries()) {
    await prisma.faqCategory.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: category.id } },
      create: { tenantId: tenant.id, key: category.id, label: category.label, sortOrder: index },
      update: { label: category.label },
    });
  }

  for (const [index, faq] of faqData.entries()) {
    await prisma.faqItem.upsert({
      where: { tenantId_externalKey: { tenantId: tenant.id, externalKey: faq.id } },
      create: {
        tenantId: tenant.id,
        externalKey: faq.id,
        categoryKey: faq.category,
        question: faq.question,
        answer: faq.answer,
        sortOrder: index,
      },
      update: { question: faq.question, answer: faq.answer },
    });
  }

  for (const [index, [key, contact]] of Object.entries(supportContacts).entries()) {
    await prisma.supportContact.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      create: {
        tenantId: tenant.id,
        key,
        title: contact.title,
        office: contact.office,
        hours: contact.hours,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        emergencyPhone: contact.emergencyPhone ?? null,
        dispatchPhone: contact.dispatchPhone ?? null,
        safeWalkPhone: contact.safeWalkPhone ?? null,
        sortOrder: index,
      },
      update: { title: contact.title },
    });
  }

  return { categories: faqCategories.length, items: faqData.length, contacts: Object.keys(supportContacts).length };
}

export async function seedCommunicationPreferences(prisma, tenant, user) {
  const { defaultCommunicationPreferences } = await loadFixture('communicationPreferences');

  for (const [index, category] of defaultCommunicationPreferences.entries()) {
    const row = await prisma.communicationCategory.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: category.id } },
      create: {
        tenantId: tenant.id,
        key: category.id,
        title: category.title,
        description: category.description,
        isMandatory: Boolean(category.isMandatory),
        sortOrder: index,
      },
      update: { title: category.title, description: category.description },
    });

    await prisma.communicationPreference.upsert({
      where: { userId_categoryId: { userId: user.id, categoryId: row.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        categoryId: row.id,
        email: category.channels.email,
        sms: category.channels.sms,
        push: category.channels.push,
      },
      update: {},
    });
  }

  return defaultCommunicationPreferences.length;
}

export async function seedProfileRequests(prisma, tenant, user) {
  const { defaultAddressChangeHistory, defaultNameChangeHistory } = await loadFixture('profileRequests');

  let created = 0;
  for (const request of defaultAddressChangeHistory) {
    await prisma.profileChangeRequest.upsert({
      where: { tenantId_reference: { tenantId: tenant.id, reference: request.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        reference: request.id,
        type: 'ADDRESS',
        status: 'APPROVED',
        oldValue: request.oldAddress,
        newValue: request.newAddress,
        effectiveDate: utcDate(request.effectiveDate),
        reviewerNotes: request.reviewerNotes,
        requestedAt: utcDate(request.requestDate) ?? new Date(),
      },
      update: {},
    });
    created += 1;
  }

  for (const request of defaultNameChangeHistory) {
    await prisma.profileChangeRequest.upsert({
      where: { tenantId_reference: { tenantId: tenant.id, reference: request.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        reference: request.id,
        type: 'NAME',
        status: 'PENDING',
        oldValue: request.oldName,
        newValue: request.newName,
        requestedAt: utcDate(request.requestDate) ?? new Date(),
      },
      update: {},
    });
    created += 1;
  }

  return created;
}

export async function seedNotifications(prisma, tenant, user) {
  const { initialNotificationsData } = await loadFixture('notifications');

  let created = 0;
  for (const notification of initialNotificationsData) {
    const existing = await prisma.notification.findFirst({
      where: { tenantId: tenant.id, userId: user.id, title: notification.title },
    });
    if (existing) continue;

    const createdAt = parseTimestamp(notification.timestamp) ?? new Date();
    await prisma.notification.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        title: notification.title,
        message: notification.message,
        category: notification.category,
        priority: notification.priority,
        link: notification.link,
        isRead: Boolean(notification.isRead),
        readAt: notification.isRead ? createdAt : null,
        sourceType: 'SYSTEM',
        createdAt,
      },
    });
    created += 1;
  }
  return created;
}
