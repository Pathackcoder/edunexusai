import { z } from 'zod';
import { prisma } from '../../../db/prisma.js';
import { badRequest, notFound } from '../../../utils/errors.js';
import { defineTool } from './registry.js';
import { addDaysIso, formatWhen, localDate, sisReason, unavailable } from './helpers.js';
import { listDirectory } from '../../campus/campusService.js';
import * as chat from '../../chat/chatService.js';
import { publishMessage } from '../../chat/chatSocket.js';
import * as sis from '../../sis/sisService.js';
import { publishedAnnouncements } from '../../cms/cmsService.js';
import { TICKET_CATEGORIES, createTicket, listMyTickets } from '../../workflows/ticketService.js';
import { listMyRequests } from '../../workflows/requestService.js';
import { listNotifications } from '../../notifications/notificationService.js';
import { updateProfile } from '../../profile/profileService.js';
import { buildCurrentUser } from '../../users/sessionService.js';
import { listMyAppointments, setAppointmentStatus } from '../../success/advisingService.js';
import { logger } from '../../../utils/logger.js';

/**
 * Tools every persona can use: People Search, messaging, calendar and campus news, help, support tickets,
 * notifications, appointments and the person's own profile. Each calls the service behind the matching portal screen.
 */

/* --------------------------------------------------------------------- people */

defineTool({
  name: 'search_people',
  label: 'Searching People Search',
  roles: 'ANY',
  kind: 'read',
  description:
    'Search the campus People Search directory (people visible to everyone at the institution) by name, department or role. Returns profile references for messaging. Use it to resolve a person before proposing a message. Contact details and private records are not included.',
  input: z.object({
    query: z.string().trim().min(2).max(80).describe('Name, department or role to look for, e.g. "Rahul" or "Computer Science".'),
    type: z.enum(['student', 'faculty', 'staff']).optional().describe('Limit to one kind of person.'),
  }),
  async run({ auth }, { query, type }) {
    const { people } = await listDirectory(auth.tenantId, { search: query, type }, auth.userId);
    return {
      data: {
        matches: people.slice(0, 10).map((p) => ({ profileRef: p.profileId, name: p.name, type: p.type, role: p.role, department: p.department, canMessage: p.canMessage, isYou: p.isYou })),
        more: people.length > 10,
      },
    };
  },
});

/** The person behind a People Search entry, as messaging allows it (same rules as chat.openDirectConversation). */
async function messageRecipient(auth, profileRef) {
  const profile = await prisma.directoryProfile.findFirst({
    where: { id: profileRef, tenantId: auth.tenantId, isVisible: true },
    select: { name: true, type: true, role: true, department: true, user: { select: { id: true, status: true, tenantId: true } } },
  });
  const user = profile?.user;
  if (!user || user.tenantId !== auth.tenantId || user.status !== 'ACTIVE') throw notFound('This person cannot receive messages on EdunexusAI.');
  if (user.id === auth.userId) throw badRequest('You cannot send a message to yourself.');
  return profile;
}

defineTool({
  name: 'send_direct_message',
  label: 'Preparing a message',
  roles: 'ANY',
  kind: 'action',
  description:
    'Propose a one-to-one portal message to a person found with search_people (profileRef). This does NOT send: it shows the person a preview with Confirm and Cancel. Write the message in the first person, as the user, ready to send.',
  input: z.object({
    profileRef: z.string().uuid().describe('profileRef from search_people.'),
    message: z.string().trim().min(1).max(chat.MAX_MESSAGE_LENGTH).describe('The full message text.'),
  }),
  async prepare({ auth }, { profileRef, message }) {
    const recipient = await messageRecipient(auth, profileRef);
    const body = chat.normaliseBody(message);
    return {
      payload: { profileRef, body },
      preview: {
        kind: 'message',
        title: `Message to ${recipient.name}`,
        fields: [
          { label: 'To', value: `${recipient.name}${recipient.role ? ` · ${recipient.role}` : ''}${recipient.department ? ` · ${recipient.department}` : ''}` },
          { label: 'Delivered as', value: 'Portal message (Messages)' },
        ],
        body,
        confirmLabel: 'Send message',
      },
    };
  },
  async execute({ auth, actionId }, { profileRef, body }) {
    await messageRecipient(auth, profileRef);
    const conversation = await chat.openDirectConversation(auth, { profileId: profileRef });
    const sent = await chat.sendMessage(auth, conversation.id, { body, clientId: `nexora-${actionId}` });
    if (!sent.duplicate) await publishMessage(auth, sent).catch((error) => logger.warn('[nexora] realtime announcement failed', { code: error?.code }));
    return {
      result: { conversationId: conversation.id, sentAt: sent.message.createdAt, recipient: conversation.participant?.name ?? null },
      summary: `Message sent to ${conversation.participant?.name ?? 'the recipient'}.`,
    };
  },
});

/* ------------------------------------------------------------ calendar & news */

defineTool({
  name: 'get_academic_calendar',
  label: 'Reading the academic calendar',
  roles: 'ANY',
  kind: 'read',
  description: 'Institution-wide academic calendar from CampusCore: term dates, exam periods, holidays, deadlines and campus events.',
  input: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date (YYYY-MM-DD). Defaults to today.'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date (YYYY-MM-DD). Defaults to 60 days after the start.'),
    category: z.enum(['EVENT', 'ACADEMIC', 'HOLIDAY', 'EXAM', 'DEADLINE']).optional().describe('Only one category, e.g. EXAM for exam periods.'),
  }),
  async run({ auth, tz, now }, { from, to, category }) {
    const start = from ?? localDate(now, tz);
    const end = to ?? addDaysIso(start, 60);
    let items;
    try {
      items = await sis.calendar(auth, { from: start, to: end, category });
    } catch (error) {
      return unavailable(sisReason('UNAVAILABLE', 'calendar'), { code: error.code ?? null });
    }
    const list = (Array.isArray(items) ? items : []).slice(0, 40);
    return { data: { from: start, to: end, events: list.map((e) => ({ title: e.title, category: e.category, startDate: e.startDate, endDate: e.endDate ?? null, description: e.description ?? null })) } };
  },
});

defineTool({
  name: 'get_campus_news',
  label: 'Reading campus news',
  roles: 'ANY',
  kind: 'read',
  description: 'Published campus news and notices for this person\'s audience (from the institution\'s CMS).',
  input: z.object({ limit: z.number().int().min(1).max(10).default(6) }),
  async run({ auth }, { limit }) {
    try {
      const rows = await publishedAnnouncements(auth, { limit });
      return { data: { items: rows.map((r) => ({ title: r.title, summary: r.summary ?? null, category: r.category ?? null, publishedAt: r.publishedAt ?? r.publishAt ?? null })) } };
    } catch {
      return unavailable('Campus news is not available right now.');
    }
  },
});

/* ---------------------------------------------------------------------- help */

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'my', 'i', 'to', 'how', 'do', 'what', 'can', 'of', 'for', 'and', 'in', 'on', 'when', 'where', 'me']);

defineTool({
  name: 'search_help_center',
  label: 'Searching the help center',
  roles: 'ANY',
  kind: 'read',
  description: 'Search the institution\'s help center FAQs (policies, how-tos, IT, registration, billing).',
  input: z.object({ query: z.string().trim().min(2).max(200) }),
  async run({ auth }, { query }) {
    const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    const faqs = await prisma.faqItem.findMany({ where: { tenantId: auth.tenantId }, select: { question: true, answer: true, categoryKey: true } });
    const scored = faqs
      .map((faq) => {
        const q = faq.question.toLowerCase();
        const all = `${q} ${faq.answer.toLowerCase()}`;
        return { faq, score: terms.reduce((sum, t) => sum + (q.includes(t) ? 2 : all.includes(t) ? 1 : 0), 0) };
      })
      .filter((row) => row.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return { data: { results: scored.map(({ faq }) => ({ question: faq.question, answer: faq.answer, category: faq.categoryKey })) } };
  },
});

defineTool({
  name: 'create_support_ticket',
  label: 'Preparing a support ticket',
  roles: ['STUDENT', 'FACULTY'],
  kind: 'action',
  description: 'Propose a help desk ticket for the user. This does NOT submit: the person reviews a preview and confirms.',
  input: z.object({
    category: z.enum(TICKET_CATEGORIES),
    subject: z.string().trim().min(4).max(200),
    description: z.string().trim().min(10).max(5000).describe('What happened, written for the help desk.'),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
  }),
  async prepare(_ctx, input) {
    return {
      payload: input,
      preview: {
        kind: 'ticket',
        title: 'New help desk ticket',
        fields: [
          { label: 'Category', value: input.category },
          { label: 'Subject', value: input.subject },
          { label: 'Priority', value: input.priority.charAt(0) + input.priority.slice(1).toLowerCase() },
        ],
        body: input.description,
        confirmLabel: 'Submit ticket',
      },
    };
  },
  async execute({ auth }, payload) {
    const ticket = await createTicket(auth, { ...payload, attachments: [] });
    return { result: { reference: ticket.reference ?? ticket.id, status: ticket.status }, summary: ticket.reference ? `Ticket ${ticket.reference} submitted to the help desk.` : 'Ticket submitted to the help desk.' };
  },
});

defineTool({
  name: 'get_my_support_requests',
  label: 'Checking your requests',
  roles: ['STUDENT', 'FACULTY'],
  kind: 'read',
  description: 'The user\'s own help desk tickets and service requests with their status.',
  input: z.object({}),
  async run({ auth }) {
    const [{ tickets }, requests] = await Promise.all([listMyTickets(auth), listMyRequests(auth)]);
    const reqs = Array.isArray(requests) ? requests : requests?.requests ?? [];
    return {
      data: {
        tickets: tickets.slice(0, 10).map((t) => ({ reference: t.reference, subject: t.subject, category: t.category, status: t.status, updated: t.updatedAt ?? null })),
        requests: reqs.slice(0, 10).map((r) => ({ reference: r.reference, title: r.title, type: r.type, status: r.status })),
      },
    };
  },
});

/* -------------------------------------------------------------- notifications */

defineTool({
  name: 'get_my_notifications',
  label: 'Checking notifications',
  roles: 'ANY',
  kind: 'read',
  description: 'The user\'s recent portal notifications (newest first).',
  input: z.object({ unreadOnly: z.boolean().default(true) }),
  async run({ auth, tz }, { unreadOnly }) {
    const rows = await listNotifications(auth.tenantId, auth.userId, { unreadOnly });
    const list = (Array.isArray(rows) ? rows : rows?.notifications ?? []).slice(0, 12);
    return { data: { notifications: list.map((n) => ({ title: n.title, message: n.message, category: n.category, read: n.isRead ?? n.read ?? null, when: formatWhen(n.createdAt, tz) })) } };
  },
});

/* --------------------------------------------------------------- appointments */

defineTool({
  name: 'get_my_appointments',
  label: 'Checking appointments',
  roles: ['STUDENT', 'FACULTY'],
  kind: 'read',
  description: 'The user\'s advising appointments (as a student, or as the advisor for faculty): upcoming and recent.',
  input: z.object({}),
  async run({ auth, tz }) {
    const { upcoming, past } = await listMyAppointments(auth);
    const present = (a) => ({ appointmentRef: a.id, when: formatWhen(a.startsAt, tz), topic: a.topic, status: a.status, mode: a.mode, location: a.location, with: auth.userId === a.student.id ? a.advisor.name : a.student.name });
    return { data: { upcoming: upcoming.map(present), recent: past.slice(0, 5).map(present) } };
  },
});

defineTool({
  name: 'cancel_advising_appointment',
  label: 'Preparing a cancellation',
  roles: ['STUDENT', 'FACULTY'],
  kind: 'action',
  description: 'Propose cancelling one of the user\'s upcoming advising appointments (appointmentRef from get_my_appointments). The person confirms before anything changes; the other side is notified.',
  input: z.object({ appointmentRef: z.string().uuid() }),
  async prepare({ auth, tz }, { appointmentRef }) {
    const { upcoming } = await listMyAppointments(auth);
    const appt = upcoming.find((a) => a.id === appointmentRef);
    if (!appt) throw notFound('That upcoming appointment was not found among yours.');
    return {
      payload: { appointmentRef },
      preview: {
        kind: 'cancel_appointment',
        title: 'Cancel advising appointment',
        fields: [
          { label: 'When', value: formatWhen(appt.startsAt, tz) },
          { label: 'With', value: auth.userId === appt.student.id ? appt.advisor.name : appt.student.name },
          { label: 'Topic', value: appt.topic },
        ],
        confirmLabel: 'Cancel appointment',
        tone: 'danger',
      },
    };
  },
  async execute({ auth, tz }, { appointmentRef }) {
    const appt = await setAppointmentStatus(auth, appointmentRef, 'CANCELLED');
    return { result: { status: appt.status }, summary: `Appointment on ${formatWhen(appt.startsAt, tz)} cancelled.` };
  },
});

/* -------------------------------------------------------------------- profile */

defineTool({
  name: 'get_my_profile',
  label: 'Reading your profile',
  roles: 'ANY',
  kind: 'read',
  description: 'The user\'s own portal profile: name, email, phone and, for students, preferred name, pronouns, interests and career goals.',
  input: z.object({}),
  async run({ auth }) {
    // Only self-service fields: the deprecated local academic columns on the session user are never read here.
    const me = await buildCurrentUser({ userId: auth.userId });
    return {
      data: {
        name: me.fullName,
        email: me.email,
        phone: me.phone ?? null,
        preferredName: me.preferredName ?? null,
        pronouns: me.pronouns ?? null,
        interests: me.interests ?? null,
        careerGoals: me.careerGoals ?? null,
        editableHere: auth.studentProfileId ? ['phone', 'preferredName', 'pronouns', 'interests', 'careerGoals'] : ['phone'],
        changedThroughRequests: 'Legal name and address of record change through a request the registrar approves (Profile → Personal information).',
      },
    };
  },
});

defineTool({
  name: 'update_my_profile',
  label: 'Preparing a profile update',
  roles: 'ANY',
  kind: 'action',
  description:
    'Propose changes to the user\'s own self-service profile fields. The person reviews old → new values and confirms. Students can change phone, preferredName, pronouns, interests, careerGoals; other roles only phone. Legal name and address are not changeable here.',
  input: z.object({
    phone: z.string().trim().max(40).optional(),
    preferredName: z.string().trim().max(80).optional(),
    pronouns: z.string().trim().max(40).optional(),
    interests: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    careerGoals: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  }),
  async prepare({ auth }, input) {
    const allowed = auth.studentProfileId ? ['phone', 'preferredName', 'pronouns', 'interests', 'careerGoals'] : ['phone'];
    const changes = Object.fromEntries(Object.entries(input).filter(([key, value]) => value !== undefined && allowed.includes(key)));
    const refused = Object.keys(input).filter((key) => input[key] !== undefined && !allowed.includes(key));
    if (!Object.keys(changes).length) throw badRequest(refused.length ? `These fields cannot be changed for your account: ${refused.join(', ')}.` : 'Nothing to change.');
    const me = await buildCurrentUser({ userId: auth.userId });
    const current = { phone: me.phone, preferredName: me.preferredName, pronouns: me.pronouns, interests: me.interests, careerGoals: me.careerGoals };
    const show = (v) => (Array.isArray(v) ? v.join(', ') || '—' : v || '—');
    const LABEL = { phone: 'Phone', preferredName: 'Preferred name', pronouns: 'Pronouns', interests: 'Interests', careerGoals: 'Career goals' };
    return {
      payload: changes,
      preview: {
        kind: 'profile',
        title: 'Update your profile',
        fields: Object.entries(changes).map(([key, value]) => ({ label: LABEL[key], value: `${show(current[key])} → ${show(value)}` })),
        confirmLabel: 'Save changes',
      },
    };
  },
  async execute({ auth }, changes) {
    await updateProfile(auth.tenantId, auth.userId, changes);
    return { result: { updated: Object.keys(changes) }, summary: 'Profile updated.' };
  },
});
