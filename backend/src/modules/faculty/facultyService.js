import { prisma } from '../../db/prisma.js';
import { notifyCourse } from '../notifications/notificationService.js';
import { forbidden, notFound } from '../../utils/errors.js';
import { toNumber } from '../../utils/format.js';

/**
 * Faculty experience — an experience layer over the LMS/SIS, not a replacement for one.
 * Faculty see what they teach and can reach their class; they do not grade or author
 * coursework here.
 */

/** A faculty member may only act on a course they are the instructor of record for. */
async function assertTeaches(tenantId, userId, courseId, { allowAdmin = false, roles = [] } = {}) {
  const course = await prisma.course.findFirst({ where: { tenantId, id: courseId } });
  if (!course) throw notFound('Course not found.');
  const isAdmin = allowAdmin && roles.includes('ADMIN');
  if (course.instructorUserId !== userId && !isAdmin) {
    throw forbidden('You are not the instructor of record for this course.');
  }
  return course;
}

export async function listMyCourses(tenantId, userId) {
  const courses = await prisma.course.findMany({
    where: { tenantId, instructorUserId: userId },
    include: { term: true, _count: { select: { enrollments: true, assignments: true } } },
    orderBy: { code: 'asc' },
  });

  return courses.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name,
    term: course.term?.name ?? null,
    credits: course.credits,
    room: course.room,
    days: course.meetingDays ?? [],
    time: course.timeLabel,
    officeHours: course.officeHours,
    enrolledCount: course._count.enrollments,
    assignmentCount: course._count.assignments,
    dataSource: {
      system: course.sourceSystem,
      externalId: course.externalId,
      lastSyncedAt: course.lastSyncedAt,
    },
  }));
}

export async function getRoster(tenantId, userId, courseId, { roles = [] } = {}) {
  const course = await assertTeaches(tenantId, userId, courseId, { allowAdmin: true, roles });

  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, courseId },
    include: {
      studentProfile: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, tier: true },
      },
    },
    orderBy: { studentProfile: { studentNumber: 'asc' } },
  });

  return {
    course: {
      id: course.id,
      code: course.code,
      name: course.name,
      room: course.room,
      time: course.timeLabel,
      days: course.meetingDays ?? [],
    },
    enrolledCount: enrollments.length,
    students: enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      userId: enrollment.studentProfile.user.id,
      studentNumber: enrollment.studentProfile.studentNumber,
      name: `${enrollment.studentProfile.user.firstName} ${enrollment.studentProfile.user.lastName}`,
      email: enrollment.studentProfile.user.email,
      program: enrollment.studentProfile.degree,
      tier: enrollment.studentProfile.tier?.key ?? null,
      status: enrollment.status,
      letterGrade: enrollment.letterGrade,
      percentage: toNumber(enrollment.percentage),
    })),
  };
}

/**
 * Send a notification to every student enrolled in a course.
 * This writes real Notification rows, so the students see it on their next poll.
 */
export async function sendClassNotification(
  tenantId,
  userId,
  courseId,
  { title, message, priority },
  { roles = [] } = {},
) {
  const course = await assertTeaches(tenantId, userId, courseId, { allowAdmin: true, roles });

  const result = await notifyCourse({
    tenantId,
    courseId,
    createdByUserId: userId,
    title,
    message,
    priority: priority ?? 'normal',
    link: '/notifications',
  });

  return {
    courseId: course.id,
    courseCode: course.code,
    notificationsCreated: result.created,
    recipientCount: result.created,
    title,
  };
}

/** Post a course announcement, visible to everyone enrolled. */
export async function createAnnouncement(
  tenantId,
  userId,
  courseId,
  { title, content, tags },
  { roles = [] } = {},
) {
  const course = await assertTeaches(tenantId, userId, courseId, { allowAdmin: true, roles });
  const author = await prisma.user.findUnique({ where: { id: userId } });

  const announcement = await prisma.announcement.create({
    data: {
      tenantId,
      courseId,
      authorUserId: userId,
      authorName: `Dr. ${author.firstName} ${author.lastName}`,
      title,
      content,
      tags: tags ?? [],
      audience: 'COURSE',
      postedAt: new Date(),
    },
  });

  return {
    id: announcement.id,
    courseId: course.id,
    courseCode: course.code,
    title: announcement.title,
    content: announcement.content,
    tags: announcement.tags,
    postedAt: announcement.postedAt,
  };
}

export async function listMyAnnouncements(tenantId, userId) {
  const announcements = await prisma.announcement.findMany({
    where: { tenantId, authorUserId: userId },
    include: { course: true },
    orderBy: { postedAt: 'desc' },
    take: 25,
  });
  return announcements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    courseCode: announcement.course?.code ?? null,
    courseName: announcement.course?.name ?? null,
    tags: announcement.tags,
    postedAt: announcement.postedAt,
  }));
}

/** Teaching timetable for the week. */
export async function getTeachingSchedule(tenantId, userId) {
  const courses = await prisma.course.findMany({
    where: { tenantId, instructorUserId: userId },
    orderBy: { startTime: 'asc' },
  });
  return courses.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name,
    room: course.room,
    days: course.meetingDays ?? [],
    dayCodes: course.dayCodes ?? [],
    time: course.timeLabel,
    startTime: course.startTime,
    endTime: course.endTime,
    color: course.colorHex,
    bgColor: course.bgColorHex,
    borderColor: course.borderColorHex,
  }));
}
