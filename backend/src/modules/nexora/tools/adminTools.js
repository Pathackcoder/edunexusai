import { z } from 'zod';
import { prisma } from '../../../db/prisma.js';
import { badRequest } from '../../../utils/errors.js';
import { defineTool } from './registry.js';
import { formatWhen, unavailable } from './helpers.js';
import * as sis from '../../sis/sisService.js';
import * as moodle from '../../lms/moodleService.js';
import { getAdminDashboard } from '../../dashboard/dashboardService.js';
import { resolveAudience, saveBroadcast } from '../../workflows/broadcastService.js';
import { adminListTickets } from '../../workflows/ticketService.js';
import { adminListRequests } from '../../workflows/requestService.js';
import { ANALYTICS_VIEW } from '../../analytics/accessService.js';
import { featuresReport, overviewReport, pagesReport, reportContext } from '../../analytics/reportService.js';

/**
 * Administrator tools. They use the same services as the Admin workspace, which already scope everything to the
 * administrator's own institution. Usage analytics additionally needs the named analytics.view permission, exactly
 * like Admin → Analytics, and reports only what collection has recorded.
 */

const ADMIN = ['ADMIN'];

const STATUSES = ['ACTIVE', 'ADMITTED', 'APPLICANT', 'LEAVE_OF_ABSENCE', 'SUSPENDED', 'WITHDRAWN', 'GRADUATED'];

defineTool({
  name: 'get_enrollment_statistics',
  label: 'Gathering enrollment statistics',
  roles: ADMIN,
  kind: 'read',
  description: 'Institution enrollment statistics: CampusCore student counts by record status, and portal account counts (students, faculty, tiers).',
  input: z.object({}),
  async run({ auth }) {
    const portal = await getAdminDashboard({ tenantId: auth.tenantId });
    let campuscore = null;
    try {
      const counts = await Promise.all(STATUSES.map(async (status) => [status, (await sis.searchStudents(auth, { status, page: 1, pageSize: 1 })).total ?? null]));
      campuscore = Object.fromEntries(counts);
    } catch {
      campuscore = { unavailable: 'CampusCore SIS is not reachable right now.' };
    }
    return {
      data: {
        campuscoreStudentsByStatus: campuscore,
        portalAccounts: portal.counts,
        studentTiers: portal.tiers,
        openOperations: portal.operations,
      },
    };
  },
});

defineTool({
  name: 'search_sis_students',
  label: 'Searching CampusCore students',
  roles: ADMIN,
  kind: 'read',
  description: 'Search CampusCore student records by name, email or student number (administrator view): status, program, level, standing, registration hold and whether a portal account is linked. No grades.',
  input: z.object({
    search: z.string().trim().min(2).max(100),
    status: z.enum(STATUSES).optional(),
  }),
  async run({ auth }, { search, status }) {
    const result = await sis.searchStudents(auth, { search, status, page: 1, pageSize: 15 });
    return {
      data: {
        total: result.total,
        students: result.items.map((s) => ({ name: s.displayName, studentId: s.institutionalId, email: s.email, status: s.enrollmentStatus, program: s.program?.name ?? null, level: s.level, standing: s.standing, registrationHold: s.hasRegistrationHold, portalAccount: Boolean(s.portalAccount) })),
      },
    };
  },
});

defineTool({
  name: 'find_students_with_registration_holds',
  label: 'Finding registration holds',
  roles: ADMIN,
  kind: 'read',
  description: 'Active CampusCore students who have a registration hold (an unmet registration requirement). CampusCore reports that a hold exists, not its reason.',
  input: z.object({}),
  async run({ auth }) {
    const held = [];
    let scanned = 0;
    let total = null;
    for (let page = 1; page <= 10; page += 1) {
      const result = await sis.searchStudents(auth, { status: 'ACTIVE', page, pageSize: 100 });
      total = result.total;
      scanned += result.items.length;
      held.push(...result.items.filter((s) => s.hasRegistrationHold));
      if (page >= (result.totalPages ?? 1)) break;
    }
    return {
      data: {
        activeStudents: total,
        scanned,
        withHolds: held.length,
        students: held.slice(0, 50).map((s) => ({ name: s.displayName, studentId: s.institutionalId, program: s.program?.name ?? null, level: s.level, portalAccount: Boolean(s.portalAccount) })),
        holdReasonsAvailable: false,
      },
    };
  },
});

defineTool({
  name: 'summarize_support_queue',
  label: 'Summarizing the support queue',
  roles: ADMIN,
  kind: 'read',
  description: 'Outstanding help desk tickets and service requests: counts, priorities, unassigned work, average resolution time and the oldest open items.',
  input: z.object({}),
  async run({ auth, tz }) {
    const [tickets, requests] = await Promise.all([adminListTickets(auth, { status: 'OPEN' }), adminListRequests(auth, { status: 'OPEN', limit: 50 })]);
    const byCategory = {};
    for (const t of tickets.tickets) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    const oldest = [...tickets.tickets].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, 6);
    return {
      data: {
        tickets: { ...tickets.summary, byCategory, oldestOpen: oldest.map((t) => ({ reference: t.reference, subject: t.subject, category: t.category, priority: t.priority, status: t.status, opened: formatWhen(t.createdAt, tz) })) },
        requests: { summary: requests.summary, oldestOpen: requests.requests.slice(-6).map((r) => ({ reference: r.reference, title: r.title, type: r.type, status: r.status })) },
      },
    };
  },
});

defineTool({
  name: 'get_portal_usage_report',
  label: 'Reading portal analytics',
  roles: ADMIN,
  kind: 'read',
  description: 'Portal usage analytics (aggregates only, no individuals): overview (active users, visits), pages (most visited) or features (most used). Needs the analytics.view permission, as Admin → Analytics does.',
  input: z.object({
    report: z.enum(['overview', 'pages', 'features']).default('overview'),
    range: z.enum(['7d', '30d', '90d']).default('30d'),
  }),
  async run({ auth }, { report, range }) {
    const grant = await prisma.userPermission.findFirst({ where: { tenantId: auth.tenantId, userId: auth.userId, permission: ANALYTICS_VIEW }, select: { id: true } });
    if (!grant) return unavailable('Your account has not been given access to portal analytics (the analytics.view permission). An administrator who has it can grant it.');
    const ctx = await reportContext(auth.tenantId, { range });
    const build = { overview: overviewReport, pages: pagesReport, features: featuresReport }[report];
    const data = await build(ctx);
    return { data: { report, range, from: ctx.from, to: ctx.to, collecting: ctx.collecting, collectionStartedOn: ctx.startedOn, result: data } };
  },
});

defineTool({
  name: 'find_inactive_lms_students',
  label: 'Checking LMS activity',
  roles: ADMIN,
  kind: 'read',
  description: 'Students enrolled in Moodle courses who have not opened any of their Moodle courses in the last N days (or never), from Moodle\'s own last-access data.',
  input: z.object({ days: z.number().int().min(1).max(365).default(14) }),
  async run({ auth, tz, now }, { days }) {
    let access;
    try {
      access = await moodle.studentCourseAccess(auth.tenantId);
    } catch {
      return unavailable('Moodle is not reachable right now.');
    }
    if (!access.accessReported) return unavailable('Moodle does not report course last-access times to this portal\'s integration account, so inactivity cannot be measured.');
    const cutoff = now.getTime() - days * 86_400_000;
    const inactive = access.students.filter((s) => !s.lastAccess || Date.parse(s.lastAccess) < cutoff);
    return {
      data: {
        days,
        enrolledStudents: access.students.length,
        inactive: inactive.length,
        students: inactive.slice(0, 40).map((s) => ({ name: s.fullName, lastAccess: s.lastAccess ? formatWhen(s.lastAccess, tz) : 'Never', courses: s.courses, portalLinked: Boolean(s.localIdentity) })),
      },
    };
  },
});

defineTool({
  name: 'list_announcement_audiences',
  label: 'Listing audiences',
  roles: ADMIN,
  kind: 'read',
  description: 'Departments and programs recorded on portal profiles, for targeting a campus announcement by DEPARTMENT or PROGRAM.',
  input: z.object({}),
  async run({ auth }) {
    const [studentDepts, facultyDepts, programs] = await Promise.all([
      prisma.studentProfile.findMany({ where: { tenantId: auth.tenantId, department: { not: null } }, select: { department: true }, distinct: ['department'] }),
      prisma.facultyProfile.findMany({ where: { tenantId: auth.tenantId, department: { not: null } }, select: { department: true }, distinct: ['department'] }),
      prisma.studentProfile.findMany({ where: { tenantId: auth.tenantId, degree: { not: null } }, select: { degree: true }, distinct: ['degree'] }),
    ]);
    return {
      data: {
        audienceTypes: ['ALL_STUDENTS', 'ALL_FACULTY', 'ALL_CAMPUS', 'DEPARTMENT', 'PROGRAM'],
        departments: [...new Set([...studentDepts, ...facultyDepts].map((r) => r.department).filter(Boolean))].sort(),
        programs: programs.map((r) => r.degree).filter(Boolean).sort(),
      },
    };
  },
});

const AUDIENCE_LABEL = { ALL_STUDENTS: 'All students', ALL_FACULTY: 'All faculty', ALL_CAMPUS: 'Everyone on campus', DEPARTMENT: 'Department', PROGRAM: 'Program' };

defineTool({
  name: 'send_campus_announcement',
  label: 'Preparing an announcement',
  roles: ADMIN,
  kind: 'action',
  description:
    'Propose an institutional announcement through the Communication Center (in-app notification to every active person in the audience). Shows the resolved recipient count; nothing is sent until the administrator confirms. DEPARTMENT and PROGRAM need audienceValue (see list_announcement_audiences).',
  input: z.object({
    title: z.string().trim().min(3).max(200),
    message: z.string().trim().min(3).max(4000),
    audienceType: z.enum(['ALL_STUDENTS', 'ALL_FACULTY', 'ALL_CAMPUS', 'DEPARTMENT', 'PROGRAM']),
    audienceValue: z.string().trim().min(2).max(200).optional(),
    priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
    category: z.enum(['academic', 'administrative', 'emergency', 'events', 'general']).default('administrative'),
  }),
  async prepare({ auth }, input) {
    if (['DEPARTMENT', 'PROGRAM'].includes(input.audienceType) && !input.audienceValue) throw badRequest(`Name the ${input.audienceType.toLowerCase()} to send to.`);
    const audience = { audienceType: input.audienceType, audienceValue: input.audienceValue ?? null };
    const recipients = (await resolveAudience(auth.tenantId, audience)).length;
    if (!recipients) throw badRequest('No active portal users match this audience, so there is no one to send it to.');
    const audienceLabel = input.audienceValue ? `${AUDIENCE_LABEL[input.audienceType]}: ${input.audienceValue}` : AUDIENCE_LABEL[input.audienceType];
    return {
      payload: { ...input, audienceValue: input.audienceValue ?? null, audienceLabel },
      preview: {
        kind: 'announcement',
        title: input.priority === 'urgent' ? 'Urgent campus announcement' : 'Campus announcement',
        fields: [
          { label: 'Audience', value: `${audienceLabel} · ${recipients} recipient${recipients === 1 ? '' : 's'}` },
          { label: 'Priority', value: input.priority },
          { label: 'Category', value: input.category },
          { label: 'Channel', value: 'In-app notification (Communication Center)' },
          { label: 'Title', value: input.title },
        ],
        body: input.message,
        confirmLabel: 'Send announcement',
        tone: input.priority === 'urgent' ? 'danger' : undefined,
      },
    };
  },
  async execute({ auth }, payload) {
    // saveBroadcast resolves the audience again, writes the notifications and the BROADCAST_SENT audit entry.
    const lists = await saveBroadcast(auth, { action: 'SEND', title: payload.title, message: payload.message, category: payload.category, priority: payload.priority, audienceType: payload.audienceType, audienceValue: payload.audienceValue, audienceLabel: payload.audienceLabel, channels: ['IN_APP'] });
    const sent = lists.sent.find((b) => b.title === payload.title);
    return { result: { broadcastId: sent?.id ?? null, recipients: sent?.recipients ?? null, status: sent ? 'SENT' : 'UNKNOWN' }, summary: sent ? `Announcement sent to ${sent.recipients} recipient${sent.recipients === 1 ? '' : 's'}.` : 'The announcement was submitted; check the Communication Center for its status.' };
  },
});
