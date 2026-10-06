import { loadFixture } from './shared.js';
import { syncOpportunities } from '../../src/modules/career/careerService.js';
import { resolveAudience } from '../../src/modules/workflows/broadcastService.js';

/**
 * Advanced features + cross-persona workflows.
 *
 * Idempotent like the rest of the seed: every row is keyed (reference, slug, code,
 * unique pair) and skipped or upserted on re-run, so `npm run db:seed` never
 * duplicates demo data and never overwrites what users created through the app.
 */

const HOUR = 3_600_000;
const ago = (hours) => new Date(Date.now() - hours * HOUR);

async function usersByEmail(prisma, tenant) {
  const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, include: { studentProfile: true, userRoles: { include: { role: true } } } });
  return new Map(users.map((user) => [user.email, user]));
}

async function admins(prisma, tenant) {
  const rows = await prisma.user.findMany({ where: { tenantId: tenant.id, userRoles: { some: { role: { key: 'ADMIN' } } } }, select: { id: true } });
  return rows.map((row) => row.id);
}

/* ------------------------------------------------------------------------- */

export async function seedPlanning(prisma, tenant) {
  const { catalog, requirements, learningPaths } = await loadFixture('planning');
  for (const course of catalog) {
    const data = {
      title: course.title,
      credits: course.credits ?? 4,
      department: 'Computer Science & Engineering',
      level: course.level,
      description: course.description,
      topics: course.topics,
      careerTags: course.careerTags,
      prerequisites: course.prerequisites,
      termsOffered: course.termsOffered,
    };
    await prisma.catalogCourse.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: course.code } },
      create: { tenantId: tenant.id, code: course.code, ...data },
      update: data,
    });
  }
  for (const [index, req] of requirements.entries()) {
    const data = { title: req.title, description: req.description, creditsRequired: req.creditsRequired, courseCodes: req.courseCodes, sortOrder: index };
    await prisma.degreeRequirement.upsert({
      where: { tenantId_program_category: { tenantId: tenant.id, program: req.program, category: req.category } },
      create: { tenantId: tenant.id, program: req.program, category: req.category, ...data },
      update: data,
    });
  }
  for (const path of learningPaths) {
    const row = await prisma.learningPath.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: path.key } },
      create: { tenantId: tenant.id, key: path.key, title: path.title, description: path.description, careerGoal: path.careerGoal },
      update: { title: path.title, description: path.description, careerGoal: path.careerGoal },
    });
    for (const [index, step] of path.steps.entries()) {
      const data = { stage: step.stage, title: step.title, kind: step.kind, description: step.description ?? null, courseCode: step.courseCode ?? null, resourceUrl: step.resourceUrl ?? null, estimatedHours: step.estimatedHours ?? null };
      await prisma.learningPathStep.upsert({
        where: { pathId_sortOrder: { pathId: row.id, sortOrder: index + 1 } },
        create: { pathId: row.id, sortOrder: index + 1, ...data },
        update: data,
      });
    }
  }
  return { catalog: catalog.length, requirements: requirements.length, paths: learningPaths.length };
}

export async function seedCommunity(prisma, tenant) {
  const { groups, memberships, events, portfolio, preferences } = await loadFixture('community');
  const users = await usersByEmail(prisma, tenant);
  const groupIds = {};
  for (const group of groups) {
    const { slug, ...data } = group;
    const row = await prisma.studentGroup.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug } },
      create: { tenantId: tenant.id, slug, ...data },
      update: data,
    });
    groupIds[slug] = row.id;
  }
  let members = 0;
  for (const membership of memberships) {
    const user = users.get(membership.email);
    if (!user) continue;
    await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: groupIds[membership.group], userId: user.id } },
      create: { groupId: groupIds[membership.group], userId: user.id, role: membership.role, status: 'ACTIVE' },
      update: {},
    });
    members += 1;
  }
  // Events are relative to today; only create them when the group has none upcoming.
  for (const event of events) {
    const groupId = groupIds[event.group];
    const exists = await prisma.groupEvent.findFirst({ where: { groupId, title: event.title, startsAt: { gte: new Date() } } });
    if (exists) continue;
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + event.inDays);
    startsAt.setHours(event.hour, 0, 0, 0);
    await prisma.groupEvent.create({ data: { groupId, title: event.title, startsAt, location: event.location } });
  }
  let items = 0;
  for (const [email, list] of Object.entries(portfolio)) {
    const user = users.get(email);
    if (!user || (await prisma.portfolioItem.count({ where: { userId: user.id } })) > 0) continue;
    for (const [index, item] of list.entries()) {
      await prisma.portfolioItem.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          kind: item.kind,
          title: item.title,
          subtitle: item.subtitle ?? null,
          description: item.description ?? null,
          level: item.level ?? null,
          tags: item.tags ?? [],
          url: item.url ?? null,
          startDate: item.startDate ? new Date(item.startDate) : null,
          endDate: item.endDate ? new Date(item.endDate) : null,
          sortOrder: index,
        },
      });
      items += 1;
    }
  }
  for (const [email, prefs] of Object.entries(preferences)) {
    const user = users.get(email);
    if (user?.studentProfile && !user.studentProfile.interests?.length) {
      await prisma.studentProfile.update({ where: { id: user.studentProfile.id }, data: prefs });
    }
  }
  const opportunities = await syncOpportunities(tenant.id, { force: true });
  return { groups: groups.length, members, portfolioItems: items, opportunities: opportunities.synced };
}

export async function seedCampusMap(prisma, tenant) {
  const { buildings } = await loadFixture('campus-map');
  let rooms = 0;
  for (const building of buildings) {
    const data = { name: building.name, category: building.category, description: building.description, address: building.address, hours: building.hours, amenities: building.amenities, mapX: building.x, mapY: building.y };
    const row = await prisma.campusBuilding.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: building.code } },
      create: { tenantId: tenant.id, code: building.code, ...data },
      update: data,
    });
    for (const room of building.rooms) {
      const roomData = { name: room.name, capacity: room.capacity, roomType: room.type, features: room.features };
      await prisma.classroom.upsert({
        where: { buildingId_roomNumber: { buildingId: row.id, roomNumber: room.room } },
        create: { buildingId: row.id, roomNumber: room.room, ...roomData },
        update: roomData,
      });
      rooms += 1;
    }
  }
  return { buildings: buildings.length, rooms };
}

/** Advising availability for every faculty advisor over the next two working weeks. */
export async function seedAdvising(prisma, tenant) {
  const advisors = await prisma.user.findMany({ where: { tenantId: tenant.id, userRoles: { some: { role: { key: 'FACULTY' } } } }, include: { facultyProfile: true } });
  const slots = [];
  for (const advisor of advisors) {
    const day = new Date();
    let made = 0;
    while (made < 10) {
      day.setDate(day.getDate() + 1);
      if ([0, 6].includes(day.getDay())) continue;
      made += 1;
      for (const [hour, minute, mode] of [[9, 0, 'VIRTUAL'], [9, 30, 'VIRTUAL'], [14, 0, 'VIRTUAL'], [15, 30, 'IN_PERSON']]) {
        const startsAt = new Date(day);
        startsAt.setHours(hour, minute, 0, 0);
        slots.push({
          tenantId: tenant.id,
          advisorUserId: advisor.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          mode,
          location: mode === 'IN_PERSON' ? advisor.facultyProfile?.officeLocation ?? 'Advising Center, Administration Hall' : 'Virtual meeting',
        });
      }
    }
  }
  const created = await prisma.advisingSlot.createMany({ data: slots, skipDuplicates: true });

  // One upcoming appointment so the advisor side is populated.
  const maya = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'student.advanced@edunexus.ai' } });
  if (maya && advisors[0] && (await prisma.advisingAppointment.count({ where: { studentUserId: maya.id } })) === 0) {
    const slot = await prisma.advisingSlot.findFirst({
      where: { advisorUserId: advisors[0].id, mode: 'VIRTUAL', startsAt: { gt: new Date(Date.now() + 2 * 86_400_000) }, appointments: { none: {} } },
      orderBy: { startsAt: 'asc' },
    });
    if (slot) {
      const appt = await prisma.advisingAppointment.create({
        data: { tenantId: tenant.id, slotId: slot.id, studentUserId: maya.id, advisorUserId: advisors[0].id, topic: 'Spring 2027 course plan & capstone topic', notes: 'Would like to discuss HCI electives.' },
      });
      await prisma.advisingAppointment.update({ where: { id: appt.id }, data: { meetingUrl: `https://meet.edunexus.ai/advising/${appt.id.slice(0, 8)}` } });
    }
  }
  return { slots: created.count, advisors: advisors.length };
}

/* ------------------------------------------------------------------------- */
/* Operations workspace                                                        */
/* ------------------------------------------------------------------------- */

const LABELS = { PENDING: 'Pending', IN_REVIEW: 'In Review', NEEDS_INFO: 'Needs Information', APPROVED: 'Approved', REJECTED: 'Rejected' };
const CATEGORY = {
  SYLLABUS_REVISION: 'Content',
  FEE_WAIVER: 'Finance',
  ANNOUNCEMENT_APPROVAL: 'Announcements',
  ENROLLMENT_VERIFICATION: 'Records',
  ROOM_BOOKING: 'Facilities',
};

export async function seedOperations(prisma, tenant) {
  const ops = await loadFixture('operations');
  const users = await usersByEmail(prisma, tenant);
  const adminIds = await admins(prisma, tenant);
  const adminId = adminIds[0] ?? null;
  const counts = { requests: 0, tickets: 0, forms: 0, resources: 0, broadcasts: 0, interventions: 0 };

  for (const item of ops.requests) {
    const user = users.get(item.email);
    if (!user) continue;
    if (await prisma.serviceRequest.findUnique({ where: { tenantId_reference: { tenantId: tenant.id, reference: item.reference } } })) continue;
    const role = user.userRoles.some((link) => link.role.key === 'FACULTY') ? 'FACULTY' : 'STUDENT';
    const createdAt = ago(item.hoursAgo);
    const decided = item.decidedHoursAgo != null ? ago(item.decidedHoursAgo) : null;
    const final = ['APPROVED', 'REJECTED'].includes(item.status);
    const request = await prisma.serviceRequest.create({
      data: {
        tenantId: tenant.id,
        reference: item.reference,
        requesterUserId: user.id,
        requesterRole: role,
        type: item.type,
        category: CATEGORY[item.type] ?? 'General',
        title: item.title,
        description: item.description,
        details: item.details,
        priority: item.priority,
        status: item.status,
        decisionNote: item.decisionNote ?? null,
        decidedByUserId: final ? adminId : null,
        decidedAt: final ? decided : null,
        createdAt,
        events: {
          create: [
            { actorUserId: user.id, action: 'SUBMITTED', toStatus: 'PENDING', createdAt },
            ...(item.status !== 'PENDING'
              ? [{ actorUserId: adminId, action: item.status === 'NEEDS_INFO' ? 'INFO_REQUESTED' : item.status, fromStatus: 'PENDING', toStatus: item.status, note: item.decisionNote ?? null, createdAt: decided ?? createdAt }]
              : []),
          ],
        },
      },
    });
    if (item.status !== 'PENDING') {
      await prisma.notification.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          title: `${item.title} — ${LABELS[item.status]}`,
          message: `${item.reference}.${item.decisionNote ? ` Note from the administrator: ${item.decisionNote}` : ''}`,
          category: 'administrative',
          priority: item.status === 'NEEDS_INFO' ? 'high' : 'normal',
          link: '/help/requests',
          sourceType: 'SERVICE_REQUEST',
          sourceRefId: request.id,
          createdByUserId: adminId,
          createdAt: decided ?? createdAt,
        },
      });
      if (final) {
        await prisma.auditLog.create({
          data: { tenantId: tenant.id, actorUserId: adminId, action: `REQUEST_${item.status}`, entityType: 'ServiceRequest', entityId: request.id, summary: `${item.reference} ${item.status.toLowerCase()} (${item.title})`, createdAt: decided },
        });
      }
    }
    counts.requests += 1;
  }

  for (const item of ops.tickets) {
    const user = users.get(item.email);
    if (!user) continue;
    if (await prisma.supportTicket.findUnique({ where: { tenantId_reference: { tenantId: tenant.id, reference: item.reference } } })) continue;
    const createdAt = new Date(Date.now() - item.minutesAgo * 60_000);
    await prisma.supportTicket.create({
      data: {
        tenantId: tenant.id,
        reference: item.reference,
        requesterUserId: user.id,
        assignedToUserId: item.status === 'IN_PROGRESS' ? adminId : null,
        category: item.category,
        subject: item.subject,
        description: item.description,
        priority: item.priority,
        status: item.status,
        createdAt,
        messages: { create: (item.replies ?? []).map((reply) => ({ authorUserId: reply.staff ? adminId : user.id, body: reply.body, isStaffReply: reply.staff, createdAt: new Date(createdAt.getTime() + 20 * 60_000) })) },
      },
    });
    counts.tickets += 1;
  }

  const forms = {};
  for (const item of ops.forms) {
    const closesAt = new Date(Date.now() + item.closesInDays * 86_400_000);
    const existing = await prisma.portalForm.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: item.slug } } });
    forms[item.slug] = existing
      ? existing
      : await prisma.portalForm.create({
          data: {
            tenantId: tenant.id,
            slug: item.slug,
            title: item.title,
            description: item.description,
            category: item.category,
            audience: item.audience,
            fields: item.fields,
            status: item.status,
            requiresReview: item.requiresReview,
            closesAt,
            createdByUserId: adminId,
            publishedAt: item.status === 'PUBLISHED' ? ago(72) : null,
          },
        });
    if (!existing) counts.forms += 1;
  }
  for (const item of ops.submissions) {
    const user = users.get(item.email);
    const form = forms[item.form];
    if (!user || !form) continue;
    await prisma.formSubmission.upsert({
      where: { formId_userId: { formId: form.id, userId: user.id } },
      create: { tenantId: tenant.id, formId: form.id, userId: user.id, answers: item.answers, status: 'ACKNOWLEDGED' },
      update: {},
    });
  }

  for (const item of ops.resources) {
    const owner = item.ownerEmail ? users.get(item.ownerEmail) : null;
    const exists = await prisma.portalResource.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: item.slug } } });
    if (exists) continue;
    await prisma.portalResource.create({
      data: {
        tenantId: tenant.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        category: item.category,
        audience: item.audience,
        ownerRole: owner ? 'FACULTY' : 'ADMIN',
        url: item.url ?? null,
        fileLabel: item.fileLabel,
        content: item.content ?? null,
        status: item.status,
        viewCount: item.viewCount ?? 0,
        publishedAt: item.status === 'PUBLISHED' ? ago((item.publishedDaysAgo ?? 1) * 24) : null,
        createdByUserId: owner?.id ?? adminId,
      },
    });
    counts.resources += 1;
  }

  for (const item of ops.broadcasts) {
    const exists = await prisma.communicationBroadcast.findFirst({ where: { tenantId: tenant.id, title: item.title } });
    if (exists) continue;
    const recipients = await resolveAudience(tenant.id, { audienceType: item.audienceType, audienceValue: null }, prisma);
    const sentAt = item.status === 'SENT' ? ago(item.hoursAgo) : null;
    const broadcast = await prisma.communicationBroadcast.create({
      data: {
        tenantId: tenant.id,
        title: item.title,
        message: item.message,
        category: item.category,
        priority: item.priority,
        audienceType: item.audienceType,
        audienceLabel: item.audienceLabel,
        channels: item.channels,
        status: item.status,
        scheduledFor: item.status === 'SCHEDULED' ? new Date(Date.now() + item.inHours * HOUR) : null,
        sentAt,
        recipientCount: recipients.length,
        createdByUserId: adminId,
        createdAt: sentAt ?? new Date(),
      },
    });
    if (item.status === 'SENT') {
      await prisma.notification.createMany({
        data: recipients.map((userId) => ({
          tenantId: tenant.id,
          userId,
          title: item.title,
          message: item.message,
          category: item.category,
          priority: item.priority,
          link: '/notifications',
          sourceType: 'BROADCAST',
          sourceRefId: broadcast.id,
          createdByUserId: adminId,
          createdAt: sentAt,
        })),
      });
      await prisma.auditLog.create({
        data: { tenantId: tenant.id, actorUserId: adminId, action: 'BROADCAST_SENT', entityType: 'CommunicationBroadcast', entityId: broadcast.id, summary: `Broadcast sent to ${recipients.length} recipient(s): ${item.title}`, createdAt: sentAt },
      });
    }
    counts.broadcasts += 1;
  }

  const courses = await prisma.course.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true } });
  for (const item of ops.interventions) {
    const creator = users.get(item.creator);
    const student = item.student ? users.get(item.student)?.studentProfile : null;
    if (!creator || (item.student && !student)) continue;
    const exists = await prisma.studentIntervention.findFirst({ where: { tenantId: tenant.id, title: item.title, createdByUserId: creator.id } });
    if (exists) continue;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (item.dueInDays ?? 7));
    await prisma.studentIntervention.create({
      data: {
        tenantId: tenant.id,
        studentProfileId: student?.id ?? null,
        subjectLabel: student ? null : item.subject ?? null,
        courseId: courses.find((course) => course.code === item.course)?.id ?? null,
        createdByUserId: creator.id,
        type: item.type,
        title: item.title,
        note: item.note ?? null,
        status: item.status,
        dueDate,
      },
    });
    counts.interventions += 1;
  }
  return counts;
}

/**
 * Legacy domain requests (address/name petitions, transcript orders) created before the
 * unified queue existed get their ServiceRequest twin, so the Admin Operations
 * Workspace shows every request a student has ever filed.
 */
export async function linkLegacyRequests(prisma, tenant) {
  let linked = 0;
  const profileRequests = await prisma.profileChangeRequest.findMany({ where: { tenantId: tenant.id }, include: { user: true } });
  for (const change of profileRequests) {
    if (await prisma.serviceRequest.findFirst({ where: { sourceType: 'PROFILE_CHANGE', sourceId: change.id } })) continue;
    const status = change.status;
    const final = ['APPROVED', 'REJECTED'].includes(status);
    await prisma.serviceRequest.create({
      data: {
        tenantId: tenant.id,
        reference: `REQ-${change.reference}`,
        requesterUserId: change.userId,
        requesterRole: 'STUDENT',
        type: change.type === 'ADDRESS' ? 'ADDRESS_CHANGE' : 'NAME_CHANGE',
        category: 'Profile',
        title: `${change.type === 'ADDRESS' ? 'Address change' : 'Legal name change'} ${change.reference}`,
        description: change.type === 'ADDRESS' ? `Change address of record to: ${change.newValue}` : `Change legal name to ${change.newValue}. Reason: ${change.reason ?? '—'}`,
        details: { petition: change.reference, current: change.oldValue, requested: change.newValue },
        status,
        decisionNote: change.reviewerNotes,
        decidedByUserId: final ? change.reviewedByUserId : null,
        decidedAt: final ? change.updatedAt : null,
        sourceType: 'PROFILE_CHANGE',
        sourceId: change.id,
        createdAt: change.requestedAt,
        events: {
          create: [
            { actorUserId: change.userId, action: 'SUBMITTED', toStatus: 'PENDING', createdAt: change.requestedAt },
            ...(status !== 'PENDING' ? [{ action: status, fromStatus: 'PENDING', toStatus: status, note: change.reviewerNotes, createdAt: change.updatedAt }] : []),
          ],
        },
      },
    });
    linked += 1;
  }

  const transcriptStatus = (value) => (/deliver|complet|sent|approved/i.test(value) ? 'APPROVED' : /reject|cancel/i.test(value) ? 'REJECTED' : /review/i.test(value) ? 'IN_REVIEW' : 'PENDING');
  const transcripts = await prisma.transcriptRequest.findMany({ where: { tenantId: tenant.id }, include: { studentProfile: true } });
  for (const order of transcripts) {
    if (await prisma.serviceRequest.findFirst({ where: { sourceType: 'TRANSCRIPT', sourceId: order.id } })) continue;
    const status = transcriptStatus(order.status);
    await prisma.serviceRequest.create({
      data: {
        tenantId: tenant.id,
        reference: `REQ-${order.reference}`,
        requesterUserId: order.studentProfile.userId,
        requesterRole: 'STUDENT',
        type: 'TRANSCRIPT',
        category: 'Records',
        title: `Official transcript ${order.reference}`,
        description: `${order.copies} ${order.deliveryType} cop${order.copies === 1 ? 'y' : 'ies'} to ${order.recipient}.`,
        details: { transcriptReference: order.reference, deliveryType: order.deliveryType, recipient: order.recipient, copies: order.copies },
        status,
        decidedAt: ['APPROVED', 'REJECTED'].includes(status) ? order.updatedAt : null,
        sourceType: 'TRANSCRIPT',
        sourceId: order.id,
        createdAt: order.requestDate,
        events: {
          create: [
            { actorUserId: order.studentProfile.userId, action: 'SUBMITTED', toStatus: 'PENDING', createdAt: order.requestDate },
            ...(status !== 'PENDING' ? [{ action: status, fromStatus: 'PENDING', toStatus: status, note: `Registrar status: ${order.status}`, createdAt: order.updatedAt }] : []),
          ],
        },
      },
    });
    linked += 1;
  }
  return linked;
}
