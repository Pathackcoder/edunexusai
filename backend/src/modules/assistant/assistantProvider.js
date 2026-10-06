import { prisma } from '../../db/prisma.js';
import { formatCurrency, formatShortDate, toNumber } from '../../utils/format.js';
import { getDegreeProgress, getRecommendations } from '../planning/planningService.js';

/**
 * Assistant provider.
 *
 * Prototype implementation: intent matching over the user's own portal records plus
 * keyword retrieval over the institution's FAQ table. It answers only from data the
 * portal already holds and says so when it cannot help, then offers a human route
 * (support ticket). An LLM-backed provider can implement the same `respond()` contract
 * later — the route, persistence and UI do not change.
 */
export const PROVIDER = { key: 'portal-rules-v1', label: 'EdunexusAI Assistant (prototype)' };

const has = (text, ...words) => words.some((word) => text.includes(word));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INTENTS = [
  {
    key: 'greeting',
    test: (t) => /^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t),
    run: async ({ auth }) => ({
      text: `Hi ${auth.firstName}! I can look up your schedule, deadlines, balance, degree progress, advising and more. What do you need?`,
      actions: [],
    }),
  },
  {
    key: 'gpa',
    test: (t) => has(t, 'gpa', 'grade', 'grades', 'dean'),
    student: true,
    run: async ({ auth }) => {
      const profile = await prisma.studentProfile.findUnique({ where: { id: auth.studentProfileId } });
      const enrollments = await prisma.enrollment.findMany({ where: { studentProfileId: auth.studentProfileId }, include: { course: true } });
      const current = enrollments.map((row) => `${row.course.code} ${row.letterGrade ?? '—'}${row.percentage ? ` (${toNumber(row.percentage)}%)` : ''}`).join(', ');
      return {
        text: `Your cumulative GPA is ${toNumber(profile.cumulativeGpa)?.toFixed(2) ?? '—'} (major ${toNumber(profile.majorGpa)?.toFixed(2) ?? '—'}). Standing: ${profile.academicStanding ?? 'not recorded'}.${current ? ` Current courses: ${current}.` : ''}`,
        actions: [{ label: 'Grades & GPA', to: '/academics/grades' }, { label: 'Performance insights', to: '/academics/insights' }],
      };
    },
  },
  {
    key: 'schedule',
    test: (t) => has(t, 'class', 'schedule', 'lecture', 'today', 'tomorrow', 'next class', 'where is my'),
    student: true,
    run: async ({ auth, text }) => {
      const offset = text.includes('tomorrow') ? 1 : 0;
      const day = DAYS[(new Date().getDay() + offset) % 7];
      const courses = await prisma.course.findMany({ where: { enrollments: { some: { studentProfileId: auth.studentProfileId } } } });
      const todays = courses.filter((course) => (course.meetingDays ?? []).includes(day)).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
      return {
        text: todays.length
          ? `${offset ? 'Tomorrow' : 'Today'} (${day}) you have ${todays.map((course) => `${course.code} ${course.name} at ${course.timeLabel} in ${course.room}`).join('; ')}.`
          : `You have no classes ${offset ? 'tomorrow' : 'today'} (${day}).`,
        actions: [{ label: 'Course schedule', to: '/academics/schedule' }, { label: 'Campus map', to: '/campus/map' }],
      };
    },
  },
  {
    key: 'tuition',
    test: (t) => has(t, 'tuition', 'balance', 'bill', 'pay', 'owe', 'payment'),
    student: true,
    run: async ({ auth }) => {
      const account = await prisma.tuitionAccount.findUnique({ where: { studentProfileId: auth.studentProfileId } });
      if (!account) return { text: 'I could not find a bursar account for you.', actions: [{ label: 'Finance', to: '/finance/tuition' }] };
      return {
        text: `Your balance is ${formatCurrency(account.currentBalance)}, due ${formatShortDate(account.dueDate)} (${account.termLabel}).`,
        actions: [{ label: 'Pay or view statement', to: '/finance/tuition' }],
      };
    },
  },
  {
    key: 'assignments',
    test: (t) => has(t, 'assignment', 'due', 'deadline', 'homework', 'submit'),
    student: true,
    run: async ({ auth }) => {
      const assignments = await prisma.assignment.findMany({
        where: { dueDate: { gte: new Date() }, course: { enrollments: { some: { studentProfileId: auth.studentProfileId } } } },
        include: { course: true, submissions: { where: { studentProfileId: auth.studentProfileId } } },
        orderBy: { dueDate: 'asc' },
        take: 4,
      });
      const open = assignments.filter((row) => !row.submissions.some((sub) => ['Completed', 'Submitted'].includes(sub.status)));
      return {
        text: open.length
          ? `Coming up: ${open.map((row) => `${row.course.code} “${row.title}” due ${formatShortDate(row.dueDate)}`).join('; ')}.`
          : 'Nothing outstanding is due — you are all caught up.',
        actions: [{ label: 'Assignments', to: '/academics/assignments' }],
      };
    },
  },
  {
    key: 'aid',
    test: (t) => has(t, 'financial aid', 'scholarship', 'loan', 'disbursement'),
    student: true,
    run: async ({ auth }) => {
      const pkg = await prisma.financialAidPackage.findFirst({ where: { studentProfileId: auth.studentProfileId }, include: { awards: true } });
      return pkg
        ? { text: `Your ${pkg.awardYear} package totals ${formatCurrency(pkg.totalAwarded)} (${formatCurrency(pkg.disbursed)} disbursed, ${formatCurrency(pkg.scheduled)} scheduled). Status: ${pkg.status}.`, actions: [{ label: 'Financial aid', to: '/finance/financial-aid' }] }
        : { text: 'No financial aid package is on file.', actions: [{ label: 'Financial aid', to: '/finance/financial-aid' }] };
    },
  },
  {
    key: 'degree',
    test: (t) => has(t, 'degree', 'graduate', 'credits', 'requirement', 'remaining', 'how many'),
    student: true,
    run: async ({ auth }) => {
      const progress = await getDegreeProgress(auth.tenantId, auth.studentProfileId);
      const remaining = progress.remainingRequirements.map((req) => `${req.title} (${req.credits} cr)`).join(', ');
      return {
        text: `You have completed ${progress.completedCredits} of ${progress.totalRequired} credits (${progress.percentComplete}%), with ${progress.inProgressCredits} in progress.${remaining ? ` Still needed: ${remaining}.` : ' All requirements are covered once current courses finish.'}`,
        actions: [{ label: 'Degree progress', to: '/academics/degree-progress' }],
      };
    },
  },
  {
    key: 'recommend',
    test: (t) => has(t, 'recommend', 'which course', 'what course', 'should i take', 'elective'),
    student: true,
    run: async ({ auth }) => {
      const rec = await getRecommendations(auth.tenantId, auth.studentProfileId);
      const top = rec.recommendations.slice(0, 3);
      return {
        text: top.length
          ? `Based on your record and goals: ${top.map((course) => `${course.code} ${course.title} — ${course.reasons[0]?.text ?? 'good fit'}`).join('; ')}.`
          : 'Add your interests and career goals on the Recommendations page and I can suggest courses.',
        actions: [{ label: 'Course recommendations', to: '/academics/recommendations' }],
      };
    },
  },
  {
    key: 'advising',
    test: (t) => has(t, 'advisor', 'advising', 'appointment', 'meet my'),
    run: async ({ auth }) => {
      const next = await prisma.advisingAppointment.findFirst({
        where: { studentUserId: auth.userId, status: 'BOOKED', slot: { startsAt: { gte: new Date() } } },
        include: { slot: true, advisor: true },
        orderBy: { slot: { startsAt: 'asc' } },
      });
      return {
        text: next
          ? `Your next advising appointment is with ${next.advisor.firstName} ${next.advisor.lastName} on ${next.slot.startsAt.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} — ${next.topic}.`
          : 'You have no upcoming advising appointment. You can book a virtual slot in Advising.',
        actions: [{ label: 'Advising', to: '/academics/advising' }],
      };
    },
  },
  {
    key: 'requests',
    test: (t) => has(t, 'request', 'ticket', 'status of my', 'petition', 'address change', 'name change'),
    run: async ({ auth }) => {
      const [requests, tickets] = await Promise.all([
        prisma.serviceRequest.findMany({ where: { requesterUserId: auth.userId }, orderBy: { updatedAt: 'desc' }, take: 3 }),
        prisma.supportTicket.findMany({ where: { requesterUserId: auth.userId }, orderBy: { updatedAt: 'desc' }, take: 2 }),
      ]);
      const parts = [
        ...requests.map((row) => `${row.reference} (${row.title}) is ${row.status.replace('_', ' ').toLowerCase()}`),
        ...tickets.map((row) => `ticket ${row.reference} is ${row.status.replace('_', ' ').toLowerCase()}`),
      ];
      return {
        text: parts.length ? `Latest: ${parts.join('; ')}.` : 'You have no requests or support tickets on file.',
        actions: [{ label: 'My requests', to: '/help/requests' }, { label: 'Help desk tickets', to: '/help/tickets' }],
      };
    },
  },
  {
    key: 'jobs',
    test: (t) => has(t, 'job', 'internship', 'career', 'hiring', 'employ'),
    student: true,
    run: async () => ({ text: 'Internships and jobs from Career Services are listed in Jobs & Internships, ranked against your portfolio skills.', actions: [{ label: 'Jobs & internships', to: '/career/opportunities' }, { label: 'Skills portfolio', to: '/career/portfolio' }] }),
  },
  {
    key: 'clubs',
    test: (t) => has(t, 'club', 'group', 'society', 'organization'),
    student: true,
    run: async () => ({ text: 'Browse and join student groups and clubs, and see their upcoming events, in Groups & Clubs.', actions: [{ label: 'Groups & clubs', to: '/career/groups' }] }),
  },
  {
    key: 'rooms',
    test: (t) => has(t, 'study room', 'classroom', 'empty room', 'free room', 'room available'),
    run: async () => ({ text: 'Classroom availability shows which rooms are free right now and when they are next booked.', actions: [{ label: 'Classroom availability', to: '/campus/classrooms' }] }),
  },
  {
    key: 'map',
    test: (t) => has(t, 'map', 'building', 'where is', 'directions', 'located'),
    run: async () => ({ text: 'The campus map lists every building with hours, amenities and your classes highlighted.', actions: [{ label: 'Campus map', to: '/campus/map' }] }),
  },
  {
    key: 'thanks',
    test: (t) => /\b(thanks|thank you|cheers)\b/.test(t),
    run: async () => ({ text: 'Happy to help! Anything else?', actions: [] }),
  },
];

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'my', 'i', 'to', 'how', 'do', 'what', 'can', 'of', 'for', 'and', 'in', 'on', 'when', 'where', 'me']);

async function searchFaq(tenantId, text) {
  const terms = text.split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP.has(word));
  if (!terms.length) return null;
  const faqs = await prisma.faqItem.findMany({ where: { tenantId } });
  let best = null;
  for (const faq of faqs) {
    const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (faq.question.toLowerCase().includes(term) ? 2 : haystack.includes(term) ? 1 : 0), 0);
    if (score > (best?.score ?? 1)) best = { faq, score };
  }
  return best?.faq ?? null;
}

export async function respond({ auth, message }) {
  const text = message.toLowerCase().trim();
  const isStudent = Boolean(auth.studentProfileId);
  for (const intent of INTENTS) {
    if (intent.student && !isStudent) continue;
    if (intent.test(text)) return { ...(await intent.run({ auth, text })), intent: intent.key };
  }
  const faq = await searchFaq(auth.tenantId, text);
  if (faq) {
    return { text: `${faq.answer}`, actions: [{ label: 'Browse FAQs', to: '/help' }], intent: 'faq', citation: faq.question };
  }
  return {
    text: "I don't have an answer for that in the portal yet. A support specialist can help — open a help desk ticket and they'll reply here in the portal.",
    actions: [{ label: 'Open a support ticket', to: '/help/tickets?new=1' }, { label: 'Browse FAQs', to: '/help' }],
    intent: 'fallback',
  };
}

export const SUGGESTIONS = {
  STUDENT: ['What classes do I have today?', 'What is due this week?', 'How many credits do I have left?', 'Which courses should I take next?', 'What is my tuition balance?', 'When is my next advising appointment?'],
  FACULTY: ['Where is the campus map?', 'Is there a free classroom now?', 'What is the status of my requests?', 'How do I reset my password?'],
};
