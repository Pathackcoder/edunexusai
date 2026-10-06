import { prisma } from '../../db/prisma.js';
import { formatShortDate, formatTimeAgo, toIsoDate } from '../../utils/format.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { careerServicesAdapter } from '../../integrations/adapters/careerServicesAdapter.js';
import { notifyUsers } from '../notifications/notificationService.js';

/**
 * Career & community: job/internship board (career-services adapter → PostgreSQL),
 * skills portfolio, and student groups/clubs.
 */

const STALE_MS = 6 * 60 * 60 * 1000;

/** Pull the external feed into canonical rows when the cached copy is stale. */
export async function syncOpportunities(tenantId, { force = false } = {}) {
  const latest = await prisma.careerOpportunity.findFirst({ where: { tenantId }, orderBy: { lastSyncedAt: 'desc' }, select: { lastSyncedAt: true } });
  if (!force && latest?.lastSyncedAt && Date.now() - latest.lastSyncedAt.getTime() < STALE_MS) return { synced: 0, cached: true };
  const postings = await careerServicesAdapter.fetchPostings();
  const now = new Date();
  for (const posting of postings) {
    await prisma.careerOpportunity.upsert({
      where: { tenantId_externalKey: { tenantId, externalKey: posting.externalKey } },
      create: { tenantId, ...posting, sourceSystem: careerServicesAdapter.key, lastSyncedAt: now },
      update: { ...posting, lastSyncedAt: now },
    });
  }
  return { synced: postings.length, cached: false };
}

async function skillProfile(auth) {
  const [items, profile] = await Promise.all([
    prisma.portfolioItem.findMany({ where: { userId: auth.userId }, select: { kind: true, title: true, tags: true } }),
    prisma.studentProfile.findFirst({ where: { userId: auth.userId }, select: { interests: true, careerGoals: true } }),
  ]);
  const terms = new Set();
  for (const item of items) {
    if (item.kind === 'SKILL') terms.add(item.title.toLowerCase());
    for (const tag of item.tags) terms.add(tag.toLowerCase());
  }
  for (const value of [...(profile?.interests ?? []), ...(profile?.careerGoals ?? [])]) terms.add(value.toLowerCase());
  return terms;
}

export async function listOpportunities(auth, { type, search, workMode } = {}) {
  await syncOpportunities(auth.tenantId);
  const [rows, saved, terms] = await Promise.all([
    prisma.careerOpportunity.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(type && type !== 'ALL' ? { type } : {}),
        ...(workMode && workMode !== 'ALL' ? { workMode } : {}),
        ...(search
          ? { OR: ['title', 'company', 'field', 'location'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) }
          : {}),
      },
      orderBy: { postedAt: 'desc' },
    }),
    prisma.savedOpportunity.findMany({ where: { userId: auth.userId } }),
    skillProfile(auth),
  ]);
  const opportunities = rows.map((row) => {
    const matched = row.skills.filter((skill) => [...terms].some((term) => term.includes(skill.toLowerCase()) || skill.toLowerCase().includes(term)));
    const fieldHit = [...terms].some((term) => term.includes(row.field.toLowerCase()) || row.field.toLowerCase().includes(term));
    const relevance = Math.min(100, matched.length * 25 + (fieldHit ? 25 : 0));
    const mine = saved.find((item) => item.opportunityId === row.id);
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      company: row.company,
      location: row.location,
      workMode: row.workMode,
      field: row.field,
      skills: row.skills,
      matchedSkills: matched,
      relevance,
      recommended: relevance >= 50,
      description: row.description,
      compensation: row.compensation,
      deadline: toIsoDate(row.deadline),
      deadlineLabel: row.deadline ? formatShortDate(row.deadline) : 'Rolling',
      applyUrl: row.applyUrl,
      postedAgo: formatTimeAgo(row.postedAt),
      saveStatus: mine?.status ?? null,
      source: row.sourceSystem,
    };
  });
  return {
    opportunities,
    recommended: [...opportunities].filter((row) => row.recommended).sort((a, b) => b.relevance - a.relevance).slice(0, 4),
    source: { label: careerServicesAdapter.label, lastSyncedAt: rows[0]?.lastSyncedAt ?? null },
    counts: { saved: saved.filter((row) => row.status === 'SAVED').length, applied: saved.filter((row) => row.status === 'APPLIED').length },
  };
}

export async function setOpportunityStatus(auth, id, status) {
  const opportunity = await prisma.careerOpportunity.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!opportunity) throw notFound('Opportunity not found.');
  if (status === 'NONE') {
    await prisma.savedOpportunity.deleteMany({ where: { userId: auth.userId, opportunityId: id } });
  } else {
    await prisma.savedOpportunity.upsert({
      where: { userId_opportunityId: { userId: auth.userId, opportunityId: id } },
      create: { userId: auth.userId, opportunityId: id, status },
      update: { status },
    });
  }
  return { id, saveStatus: status === 'NONE' ? null : status };
}

/* ----- skills portfolio ----- */

const presentItem = (item) => ({
  id: item.id,
  kind: item.kind,
  title: item.title,
  subtitle: item.subtitle,
  description: item.description,
  level: item.level,
  tags: item.tags,
  url: item.url,
  startDate: toIsoDate(item.startDate),
  endDate: toIsoDate(item.endDate),
  sortOrder: item.sortOrder,
});

export async function getPortfolio(auth) {
  const [items, user] = await Promise.all([
    prisma.portfolioItem.findMany({ where: { userId: auth.userId }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { firstName: true, lastName: true, email: true, studentProfile: { select: { degree: true, department: true, cumulativeGpa: true, honors: true, interests: true, careerGoals: true } } },
    }),
  ]);
  const presented = items.map(presentItem);
  return {
    owner: {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      program: user.studentProfile?.degree,
      department: user.studentProfile?.department,
      honors: user.studentProfile?.honors,
      interests: user.studentProfile?.interests ?? [],
      careerGoals: user.studentProfile?.careerGoals ?? [],
    },
    skills: presented.filter((item) => item.kind === 'SKILL'),
    projects: presented.filter((item) => item.kind === 'PROJECT'),
    experience: presented.filter((item) => item.kind === 'EXPERIENCE'),
    achievements: presented.filter((item) => item.kind === 'ACHIEVEMENT'),
    completeness: Math.min(100, ['SKILL', 'PROJECT', 'EXPERIENCE', 'ACHIEVEMENT'].reduce((sum, kind) => sum + (items.some((item) => item.kind === kind) ? 25 : 0), 0)),
  };
}

const itemData = (payload) => ({
  kind: payload.kind,
  title: payload.title,
  subtitle: payload.subtitle || null,
  description: payload.description || null,
  level: payload.kind === 'SKILL' ? payload.level ?? 3 : null,
  tags: payload.tags ?? [],
  url: payload.url || null,
  startDate: payload.startDate ? new Date(payload.startDate) : null,
  endDate: payload.endDate ? new Date(payload.endDate) : null,
});

export async function addPortfolioItem(auth, payload) {
  await prisma.portfolioItem.create({ data: { tenantId: auth.tenantId, userId: auth.userId, ...itemData(payload) } });
  return getPortfolio(auth);
}

export async function updatePortfolioItem(auth, id, payload) {
  const item = await prisma.portfolioItem.findFirst({ where: { id, userId: auth.userId } });
  if (!item) throw notFound('Portfolio item not found.');
  await prisma.portfolioItem.update({ where: { id }, data: itemData({ ...presentItem(item), ...payload, kind: item.kind }) });
  return getPortfolio(auth);
}

export async function deletePortfolioItem(auth, id) {
  const item = await prisma.portfolioItem.findFirst({ where: { id, userId: auth.userId } });
  if (!item) throw notFound('Portfolio item not found.');
  await prisma.portfolioItem.delete({ where: { id } });
  return getPortfolio(auth);
}

/* ----- groups & clubs ----- */

const groupInclude = (userId) => ({
  memberships: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
  events: { where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, take: 5 },
});

function presentGroup(group, userId) {
  const active = group.memberships.filter((row) => row.status === 'ACTIVE');
  const mine = group.memberships.find((row) => row.userId === userId);
  const canManage = mine?.status === 'ACTIVE' && ['OFFICER', 'LEAD'].includes(mine.role);
  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    category: group.category,
    description: group.description,
    meetingInfo: group.meetingInfo,
    location: group.location,
    advisorName: group.advisorName,
    colorHex: group.colorHex,
    isOpen: group.isOpen,
    memberCount: active.length,
    membership: mine ? { role: mine.role, status: mine.status, joinedAt: mine.joinedAt } : null,
    canManage,
    leaders: active.filter((row) => row.role !== 'MEMBER').map((row) => ({ name: `${row.user.firstName} ${row.user.lastName}`, role: row.role })),
    pendingMembers: canManage
      ? group.memberships.filter((row) => row.status === 'PENDING').map((row) => ({ membershipId: row.id, userId: row.userId, name: `${row.user.firstName} ${row.user.lastName}` }))
      : [],
    upcomingEvents: group.events.map((event) => ({ id: event.id, title: event.title, description: event.description, startsAt: event.startsAt, location: event.location })),
  };
}

export async function listGroups(auth) {
  const groups = await prisma.studentGroup.findMany({ where: { tenantId: auth.tenantId }, include: groupInclude(auth.userId), orderBy: { name: 'asc' } });
  const presented = groups.map((group) => presentGroup(group, auth.userId));
  return {
    groups: presented,
    myGroups: presented.filter((group) => group.membership),
    categories: [...new Set(presented.map((group) => group.category))].sort(),
  };
}

async function loadGroup(auth, id) {
  const group = await prisma.studentGroup.findFirst({ where: { id, tenantId: auth.tenantId }, include: groupInclude(auth.userId) });
  if (!group) throw notFound('Group not found.');
  return group;
}

const officerIds = (group) => group.memberships.filter((row) => row.status === 'ACTIVE' && row.role !== 'MEMBER').map((row) => row.userId);

export async function joinGroup(auth, id) {
  const group = await loadGroup(auth, id);
  if (group.memberships.some((row) => row.userId === auth.userId)) throw badRequest('You are already a member or have a pending request.');
  const status = group.isOpen ? 'ACTIVE' : 'PENDING';
  await prisma.groupMembership.create({ data: { groupId: id, userId: auth.userId, status } });
  await notifyUsers({
    tenantId: auth.tenantId,
    userIds: officerIds(group),
    title: status === 'ACTIVE' ? `${auth.firstName} ${auth.lastName} joined ${group.name}` : `Membership request for ${group.name}`,
    message: status === 'ACTIVE' ? 'A new member joined your group.' : `${auth.firstName} ${auth.lastName} asked to join. Review it in Groups & Clubs.`,
    category: 'campus',
    priority: 'low',
    link: '/career/groups',
    sourceType: 'GROUP',
    sourceRefId: id,
    createdByUserId: auth.userId,
  });
  return presentGroup(await loadGroup(auth, id), auth.userId);
}

export async function leaveGroup(auth, id) {
  const group = await loadGroup(auth, id);
  const mine = group.memberships.find((row) => row.userId === auth.userId);
  if (!mine) throw badRequest('You are not a member of this group.');
  if (mine.role === 'LEAD' && officerIds(group).length === 1) throw badRequest('Hand over leadership before leaving — you are the only lead.');
  await prisma.groupMembership.delete({ where: { id: mine.id } });
  return presentGroup(await loadGroup(auth, id), auth.userId);
}

async function requireOfficer(auth, id) {
  const group = await loadGroup(auth, id);
  if (!officerIds(group).includes(auth.userId)) throw forbidden('Only group officers can do that.');
  return group;
}

export async function decideMembership(auth, id, membershipId, approve) {
  const group = await requireOfficer(auth, id);
  const row = group.memberships.find((item) => item.id === membershipId && item.status === 'PENDING');
  if (!row) throw notFound('Membership request not found.');
  if (approve) await prisma.groupMembership.update({ where: { id: membershipId }, data: { status: 'ACTIVE', joinedAt: new Date() } });
  else await prisma.groupMembership.delete({ where: { id: membershipId } });
  await notifyUsers({
    tenantId: auth.tenantId,
    userIds: [row.userId],
    title: approve ? `Welcome to ${group.name}` : `${group.name} membership request`,
    message: approve ? 'Your membership request was approved.' : 'Your membership request was not approved this time.',
    category: 'campus',
    link: '/career/groups',
    sourceType: 'GROUP',
    sourceRefId: id,
    createdByUserId: auth.userId,
  });
  return presentGroup(await loadGroup(auth, id), auth.userId);
}

export async function createGroupEvent(auth, id, { title, description, startsAt, location }) {
  const group = await requireOfficer(auth, id);
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime()) || when <= new Date()) throw badRequest('Choose a future date and time.');
  await prisma.groupEvent.create({ data: { groupId: id, title, description: description ?? null, startsAt: when, location: location ?? group.location } });
  await notifyUsers({
    tenantId: auth.tenantId,
    userIds: group.memberships.filter((row) => row.status === 'ACTIVE' && row.userId !== auth.userId).map((row) => row.userId),
    title: `${group.name}: ${title}`,
    message: `${when.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} · ${location ?? group.location ?? 'TBA'}`,
    category: 'campus',
    link: '/career/groups',
    sourceType: 'GROUP_EVENT',
    sourceRefId: id,
    createdByUserId: auth.userId,
  });
  return presentGroup(await loadGroup(auth, id), auth.userId);
}
