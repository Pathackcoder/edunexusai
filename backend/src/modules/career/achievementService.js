import { prisma } from '../../db/prisma.js';
import { getDegreeProgress } from '../planning/planningService.js';

/**
 * Gamification. Badges are derived from records the student already has (submissions,
 * degree progress, memberships, portfolio, advising), so nothing has to be "awarded"
 * by hand and nothing can drift out of sync. Points and levels are presentation only;
 * they never feed an academic decision.
 */

const BADGES = [
  { key: 'first_submission', title: 'First Submission', description: 'Submit your first assignment through the portal.', tone: 'info', points: 25, metric: 'submissions', target: 1 },
  { key: 'consistent', title: 'Consistent Contributor', description: 'Submit five assignments.', tone: 'info', points: 60, metric: 'submissions', target: 5 },
  { key: 'deans_list', title: "Dean's List", description: 'Earn academic honours for a term.', tone: 'purple', points: 120, metric: 'honors', target: 1 },
  { key: 'halfway', title: 'Halfway There', description: 'Complete 50% of your degree credits.', tone: 'primary', points: 80, metric: 'degreePercent', target: 50 },
  { key: 'final_stretch', title: 'Final Stretch', description: 'Complete 75% of your degree credits.', tone: 'primary', points: 120, metric: 'degreePercent', target: 75 },
  { key: 'community', title: 'Community Builder', description: 'Join a student group or club.', tone: 'success', points: 40, metric: 'groups', target: 1 },
  { key: 'leader', title: 'Student Leader', description: 'Serve as an officer or lead of a group.', tone: 'success', points: 90, metric: 'leadership', target: 1 },
  { key: 'portfolio', title: 'Career Ready', description: 'Add four items to your skills portfolio, including a project.', tone: 'warning', points: 70, metric: 'portfolio', target: 4 },
  { key: 'planner', title: 'Planner', description: 'Book an advising appointment.', tone: 'campus', points: 40, metric: 'advising', target: 1 },
  { key: 'pathfinder', title: 'Pathfinder', description: 'Choose a learning path and complete a step.', tone: 'academic', points: 50, metric: 'pathSteps', target: 1 },
  { key: 'explorer', title: 'Opportunity Explorer', description: 'Save or apply to an internship or job.', tone: 'warning', points: 30, metric: 'opportunities', target: 1 },
  { key: 'synced', title: 'Always On Time', description: 'Connect an external calendar.', tone: 'neutral', points: 20, metric: 'calendar', target: 1 },
];

const LEVELS = ['Explorer', 'Achiever', 'Trailblazer', 'Luminary'];

export async function getAchievements(auth) {
  const profileId = auth.studentProfileId;
  const [submissions, profile, memberships, portfolio, appointments, pathSteps, saved, calendars, degree] = await Promise.all([
    prisma.assignmentSubmission.count({ where: { studentProfileId: profileId ?? '', status: { in: ['Completed', 'Submitted'] } } }),
    prisma.studentProfile.findFirst({ where: { userId: auth.userId }, select: { honors: true } }),
    prisma.groupMembership.findMany({ where: { userId: auth.userId, status: 'ACTIVE' }, select: { role: true } }),
    prisma.portfolioItem.findMany({ where: { userId: auth.userId }, select: { kind: true } }),
    prisma.advisingAppointment.count({ where: { studentUserId: auth.userId, status: { in: ['BOOKED', 'COMPLETED'] } } }),
    prisma.learningStepProgress.count({ where: { userId: auth.userId, status: 'COMPLETED' } }),
    prisma.savedOpportunity.count({ where: { userId: auth.userId } }),
    prisma.calendarConnection.count({ where: { userId: auth.userId, status: 'CONNECTED' } }),
    profileId ? getDegreeProgress(auth.tenantId, profileId).catch(() => null) : null,
  ]);

  const metrics = {
    submissions,
    honors: profile?.honors ? 1 : 0,
    degreePercent: degree?.percentComplete ?? 0,
    groups: memberships.length,
    leadership: memberships.filter((row) => row.role !== 'MEMBER').length,
    portfolio: portfolio.some((item) => item.kind === 'PROJECT') ? portfolio.length : Math.min(portfolio.length, 3),
    advising: appointments,
    pathSteps,
    opportunities: saved,
    calendar: calendars,
  };

  const badges = BADGES.map((badge) => {
    const value = metrics[badge.metric] ?? 0;
    return {
      key: badge.key,
      title: badge.title,
      description: badge.description,
      tone: badge.tone,
      points: badge.points,
      earned: value >= badge.target,
      progress: Math.min(100, Math.round((value / badge.target) * 100)),
      current: Math.min(value, badge.target),
      target: badge.target,
    };
  });
  const points = badges.filter((badge) => badge.earned).reduce((sum, badge) => sum + badge.points, 0);
  const levelIndex = Math.min(LEVELS.length - 1, Math.floor(points / 200));
  return {
    points,
    level: { index: levelIndex + 1, name: LEVELS[levelIndex], nextAt: levelIndex < LEVELS.length - 1 ? (levelIndex + 1) * 200 : null, progress: levelIndex < LEVELS.length - 1 ? Math.round(((points % 200) / 200) * 100) : 100 },
    earned: badges.filter((badge) => badge.earned).length,
    total: badges.length,
    badges,
    nextMilestones: badges.filter((badge) => !badge.earned).sort((a, b) => b.progress - a.progress).slice(0, 3),
  };
}
