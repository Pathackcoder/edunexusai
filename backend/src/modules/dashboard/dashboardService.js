import { prisma } from '../../db/prisma.js';
import { resolveEntitlements } from '../entitlements/entitlementService.js';
import * as academics from '../academics/academicsService.js';
import * as finance from '../finance/financeService.js';
import * as financialAid from '../financialAid/financialAidService.js';
import * as notifications from '../notifications/notificationService.js';
import * as campus from '../campus/campusService.js';
import { toNumber } from '../../utils/format.js';
import * as planning from '../planning/planningService.js';
import { listMyRequests } from '../workflows/requestService.js';
import { listMyTickets } from '../workflows/ticketService.js';
import { listMyAppointments } from '../success/advisingService.js';
import { getAchievements } from '../career/achievementService.js';
import { listOpportunities } from '../career/careerService.js';
import { getLayout } from './layoutService.js';
import { logger } from '../../utils/logger.js';

/**
 * Dashboard aggregation.
 *
 * One request returns everything the dashboard needs, and only the widgets the caller is
 * entitled to. The frontend renders `widgets` in the order given and looks each panel up
 * by key — it does not decide for itself what a persona or a tier may see.
 *
 * Each panel is loaded independently and a failing panel degrades to an error marker
 * instead of taking the whole dashboard down with it.
 */

async function settle(key, loader) {
  try {
    return { key, status: 'ok', data: await loader() };
  } catch (error) {
    logger.warn(`Dashboard panel failed: ${key}`, { message: error.message });
    return {
      key,
      status: 'error',
      error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message },
      data: null,
    };
  }
}

export async function getStudentDashboard({ tenantId, userId, studentProfileId, tierId, roles }) {
  const entitlements = await resolveEntitlements({ tenantId, roles, tierId });
  const permitted = new Set(entitlements.widgets);

  const profile = await prisma.studentProfile.findFirst({
    where: { tenantId, id: studentProfileId },
    include: { user: true },
  });

  const wanted = [];
  const add = (key, loader) => {
    if (permitted.has(key)) wanted.push(settle(key, loader));
  };

  add('dashboard.schedule', () => academics.getScheduleForDay(tenantId, studentProfileId));
  add('dashboard.progress', () => academics.getGrades(tenantId, studentProfileId));
  add('dashboard.tuition', () => finance.getFinance(tenantId, studentProfileId));
  add('dashboard.assignments', () => academics.listAssignments(tenantId, studentProfileId));
  add('dashboard.financial_aid', () => financialAid.getFinancialAid(tenantId, studentProfileId, { userId }));
  add('dashboard.announcements', () => academics.listAnnouncements(tenantId, { userId, studentProfileId }));
  add('dashboard.notifications', () => notifications.listNotifications(tenantId, userId));
  add('dashboard.library', () => campus.getLibrary(tenantId, studentProfileId));
  add('dashboard.calendar', () => academics.listAcademicEvents(tenantId));

  // Advanced-feature panels. Each one is a summary of a full page.
  const auth = { tenantId, userId, studentProfileId, roles, firstName: profile?.user?.firstName };
  add('dashboard.degree_progress', async () => {
    const progress = await planning.getDegreeProgress(tenantId, studentProfileId);
    return {
      program: progress.program,
      totalRequired: progress.totalRequired,
      completedCredits: progress.completedCredits,
      inProgressCredits: progress.inProgressCredits,
      remainingCredits: progress.remainingCredits,
      percentComplete: progress.percentComplete,
      projectedPercent: progress.projectedPercent,
      categories: progress.categories.map((cat) => ({ title: cat.title, required: cat.creditsRequired, completed: cat.creditsCompleted, inProgress: cat.creditsInProgress })),
    };
  });
  add('dashboard.requests', async () => {
    const [requests, tickets] = await Promise.all([listMyRequests(auth), listMyTickets(auth)]);
    return {
      summary: requests.summary,
      recent: requests.requests.slice(0, 3).map((row) => ({ id: row.id, reference: row.reference, title: row.title, status: row.status, statusLabel: row.statusLabel, updatedAt: row.updatedAt })),
      openTickets: tickets.tickets.filter((ticket) => ticket.isOpen).length,
      awaitingReply: tickets.tickets.filter((ticket) => ticket.status === 'AWAITING_USER').length,
    };
  });
  add('dashboard.advising', async () => (await listMyAppointments(auth)).upcoming.slice(0, 2));
  add('dashboard.achievements', async () => {
    const result = await getAchievements(auth);
    return { points: result.points, level: result.level, earned: result.earned, total: result.total, recent: result.badges.filter((badge) => badge.earned).slice(-3), next: result.nextMilestones[0] ?? null };
  });
  add('dashboard.learning_path', async () => {
    const { paths } = await planning.getLearningPaths(tenantId, studentProfileId);
    const path = paths.find((item) => item.isActive) ?? paths.find((item) => item.recommended) ?? null;
    return path
      ? { id: path.id, title: path.title, isActive: path.isActive, progress: path.progress, currentStage: path.currentStage, completedSteps: path.completedSteps, totalSteps: path.totalSteps, nextStep: path.steps.find((step) => step.status !== 'COMPLETED') ?? null }
      : null;
  });
  add('dashboard.opportunities', async () => (await listOpportunities(auth)).recommended.slice(0, 3));

  const settled = await Promise.all(wanted);
  const panels = {};
  for (const panel of settled) panels[panel.key] = panel;

  return {
    persona: 'STUDENT',
    greetingName: profile?.user?.firstName ?? null,
    term: profile?.currentTerm ?? null,
    tier: entitlements.tier,
    widgets: entitlements.widgetDetails
      .filter((widget) => widget.category === 'dashboard')
      .map((widget) => widget.key),
    entitlements: entitlements.widgets,
    layout: (await getLayout({ userId }, 'student')).order,
    panels,
  };
}

/** Faculty dashboard: the courses they teach and the state of each roster. */
export async function getFacultyDashboard({ tenantId, userId }) {
  const courses = await prisma.course.findMany({
    where: { tenantId, instructorUserId: userId },
    include: {
      _count: { select: { enrollments: true, assignments: true } },
      term: true,
    },
    orderBy: { code: 'asc' },
  });

  const courseIds = courses.map((course) => course.id);

  const [announcements, upcomingAssignments] = await Promise.all([
    prisma.announcement.findMany({
      where: { tenantId, OR: [{ authorUserId: userId }, { courseId: { in: courseIds } }] },
      include: { course: true },
      orderBy: { postedAt: 'desc' },
      take: 5,
    }),
    prisma.assignment.findMany({
      where: { tenantId, courseId: { in: courseIds }, dueDate: { gte: new Date() } },
      include: { course: true },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
  ]);

  return {
    persona: 'FACULTY',
    entitlements: (await resolveEntitlements({ tenantId, roles: ['FACULTY'] })).widgets,
    layout: (await getLayout({ userId }, 'faculty')).order,
    courses: courses.map((course) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      term: course.term?.name ?? null,
      credits: course.credits,
      officeHours: course.officeHours,
      room: course.room,
      days: course.meetingDays ?? [],
      time: course.timeLabel,
      enrolledCount: course._count.enrollments,
      assignmentCount: course._count.assignments,
      dataSource: {
        system: course.sourceSystem,
        externalId: course.externalId,
        lastSyncedAt: course.lastSyncedAt,
      },
    })),
    totals: {
      courses: courses.length,
      students: courses.reduce((sum, course) => sum + course._count.enrollments, 0),
    },
    announcements: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      courseCode: announcement.course?.code ?? null,
      postedAt: announcement.postedAt,
      tags: announcement.tags,
    })),
    upcomingAssignments: upcomingAssignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      courseCode: assignment.course.code,
      dueDate: assignment.dueDate,
      points: assignment.points,
    })),
  };
}

/** Admin dashboard: tenant counts, persona counts and integration health at a glance. */
export async function getAdminDashboard({ tenantId }) {
  const [
    userCount,
    studentCount,
    facultyCount,
    courseCount,
    enrollmentCount,
    integrations,
    recentLogs,
    tiers,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.studentProfile.count({ where: { tenantId } }),
    prisma.facultyProfile.count({ where: { tenantId } }),
    prisma.course.count({ where: { tenantId } }),
    prisma.enrollment.count({ where: { tenantId } }),
    prisma.integration.findMany({ where: { tenantId }, orderBy: { key: 'asc' } }),
    prisma.integrationSyncLog.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: 8,
      include: { integration: { select: { displayName: true, key: true } } },
    }),
    prisma.studentTier.findMany({
      where: { tenantId },
      include: { _count: { select: { students: true } } },
      orderBy: { rank: 'asc' },
    }),
  ]);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const [openRequests, openTickets, formsToReview, openInterventions] = await Promise.all([
    prisma.serviceRequest.count({ where: { tenantId, status: { in: ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'] } } }),
    prisma.supportTicket.count({ where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_USER'] } } }),
    prisma.formSubmission.count({ where: { tenantId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, form: { requiresReview: true } } }),
    prisma.studentIntervention.count({ where: { tenantId, status: { not: 'RESOLVED' }, type: { not: 'TASK' } } }),
  ]);

  return {
    persona: 'ADMIN',
    operations: { openRequests, openTickets, formsToReview, openInterventions },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      domain: tenant.domain,
      timezone: tenant.timezone,
    },
    counts: {
      users: userCount,
      students: studentCount,
      faculty: facultyCount,
      courses: courseCount,
      enrollments: enrollmentCount,
    },
    tiers: tiers.map((tier) => ({
      key: tier.key,
      name: tier.name,
      studentCount: tier._count.students,
    })),
    integrationHealth: integrations.map((integration) => ({
      id: integration.id,
      key: integration.key,
      provider: integration.provider,
      displayName: integration.displayName,
      mode: integration.mode,
      enabled: integration.enabled,
      status: integration.status,
      lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
      lastAttemptAt: integration.lastAttemptAt,
      lastRecordCount: integration.lastRecordCount,
      lastResponseTimeMs: integration.lastResponseTimeMs,
      lastErrorMessage: integration.lastErrorMessage,
    })),
    recentSyncLogs: recentLogs.map((log) => ({
      id: log.id,
      integration: log.integration.displayName,
      integrationKey: log.integration.key,
      operation: log.operation,
      status: log.status,
      startedAt: log.startedAt,
      durationMs: log.durationMs,
      recordsProcessed: log.recordsProcessed,
      errorMessage: log.errorMessage,
    })),
  };
}

/** Route the caller to the dashboard for their persona. */
export async function getDashboard(auth) {
  if (auth.roles.includes('ADMIN')) return getAdminDashboard(auth);
  if (auth.roles.includes('FACULTY')) return getFacultyDashboard(auth);
  return getStudentDashboard(auth);
}
