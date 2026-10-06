import { prisma } from '../../db/prisma.js';

/** FAQs and support contacts — institutional content owned by Edunexus. */
export async function getHelpContent(tenantId) {
  const [categories, items, contacts] = await Promise.all([
    prisma.faqCategory.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
    prisma.faqItem.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
    prisma.supportContact.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const supportContacts = {};
  for (const contact of contacts) {
    supportContacts[contact.key] = {
      title: contact.title,
      office: contact.office,
      hours: contact.hours,
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
      ...(contact.emergencyPhone ? { emergencyPhone: contact.emergencyPhone } : {}),
      ...(contact.dispatchPhone ? { dispatchPhone: contact.dispatchPhone } : {}),
      ...(contact.safeWalkPhone ? { safeWalkPhone: contact.safeWalkPhone } : {}),
    };
  }

  return {
    categories: categories.map((category) => ({ id: category.key, label: category.label })),
    faqs: items.map((item) => ({
      id: item.externalKey,
      category: item.categoryKey,
      question: item.question,
      answer: item.answer,
    })),
    supportContacts,
  };
}
