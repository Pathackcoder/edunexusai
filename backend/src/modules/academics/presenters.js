import {
  formatShortDate,
  formatTimeAgo,
  formatTimestamp,
  toIsoDate,
  toNumber,
} from '../../utils/format.js';

/**
 * Presenters map canonical database rows onto the exact field names the existing React
 * screens read. Keeping this translation in one file per module is what allowed the UI to
 * be switched from dummy imports to live API data without redesigning components.
 */

/** Course row (+ the caller's enrollment, when there is one) -> course view model. */
export function presentCourse(course, enrollment = null) {
  return {
    id: course.id,
    code: course.code,
    courseCode: course.code,
    name: course.name,
    courseName: course.name,
    instructor: course.instructorName,
    instructorEmail: course.instructorEmail,
    officeHours: course.officeHours,
    room: course.room,
    credits: course.credits,
    days: course.meetingDays ?? [],
    dayCodes: course.dayCodes ?? [],
    time: course.timeLabel,
    startTime: course.startTime,
    endTime: course.endTime,
    color: course.colorHex,
    bgColor: course.bgColorHex,
    borderColor: course.borderColorHex,
    syllabusUrl: course.syllabusUrl ?? '#',
    lmsUrl: course.lmsUrl ?? null,
    description: course.description,
    currentGrade: enrollment?.letterGrade ?? null,
    letterGrade: enrollment?.letterGrade ?? null,
    percentage: toNumber(enrollment?.percentage),
    // Provenance travels with the record so the UI can show where a course came from.
    dataSource: {
      system: course.sourceSystem,
      externalId: course.externalId,
      lastSyncedAt: course.lastSyncedAt,
    },
  };
}

/** Urgency bucket drives the badge colour on assignment cards. */
export function deriveUrgency({ status, dueDate, now = new Date() }) {
  if (status === 'Completed' || status === 'Submitted') return 'completed';
  if (!dueDate) return 'upcoming';
  const days = Math.ceil((new Date(dueDate).getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days <= 2) return 'due-soon';
  return 'upcoming';
}

export function presentAssignment(assignment, submission = null, now = new Date()) {
  const status = submission?.status ?? 'Pending';
  return {
    id: assignment.id,
    courseId: assignment.courseId,
    courseCode: assignment.course?.code ?? null,
    courseName: assignment.course?.name ?? null,
    title: assignment.title,
    dueDate: toIsoDate(assignment.dueDate),
    formattedDueDate: formatShortDate(assignment.dueDate),
    dueTime: assignment.dueTimeLabel,
    points: assignment.points,
    status,
    urgency: deriveUrgency({ status, dueDate: assignment.dueDate, now }),
    description: assignment.description,
    submissionType: assignment.submissionType,
    weight: assignment.weightLabel,
    score: submission?.score ?? null,
    submittedAt: submission?.submittedAt ?? null,
    dataSource: {
      system: assignment.sourceSystem,
      externalId: assignment.externalId,
      lastSyncedAt: assignment.lastSyncedAt,
    },
  };
}

export function presentAnnouncement(announcement, { isRead }) {
  return {
    id: announcement.id,
    courseId: announcement.courseId,
    courseCode: announcement.course?.code ?? null,
    courseName: announcement.course?.name ?? null,
    title: announcement.title,
    author: announcement.authorName,
    postedAt: formatTimeAgo(announcement.postedAt),
    date: formatTimestamp(announcement.postedAt),
    isRead,
    content: announcement.content,
    tags: announcement.tags ?? [],
  };
}

export function presentAcademicEvent(event) {
  return {
    id: event.externalKey || event.id,
    title: event.title,
    date: toIsoDate(event.eventDate),
    startTime: event.startTime,
    endTime: event.endTime,
    category: event.category,
    location: event.location,
    description: event.description,
    isImportant: event.isImportant,
  };
}

/** Enrollment + grade components -> the per-course block on the Grades page. */
export function presentGradedCourse(enrollment) {
  const breakdown = {};
  for (const component of enrollment.gradeComponents ?? []) {
    breakdown[component.displayKey] = component.scoreLabel;
  }
  return {
    courseCode: enrollment.course.code,
    courseName: enrollment.course.name,
    credits: enrollment.course.credits,
    letterGrade: enrollment.letterGrade,
    gradePoints: toNumber(enrollment.gradePoints),
    percentage: toNumber(enrollment.percentage),
    instructor: enrollment.course.instructorName,
    breakdown,
  };
}

export function presentTranscriptTerm(term) {
  return {
    term: term.termLabel,
    level: term.level,
    termGpa: term.termGpaLabel ?? toNumber(term.termGpa),
    cumulativeGpa: toNumber(term.cumulativeGpa),
    creditsAttempted: term.creditsAttempted,
    creditsEarned: term.creditsEarnedLabel ?? term.creditsEarned,
    academicStanding: term.academicStanding,
    isInProgress: term.isInProgress,
    courses: (term.courses ?? []).map((course) => ({
      code: course.code,
      title: course.title,
      credits: course.credits,
      grade: course.grade,
      points: course.pointsLabel ?? toNumber(course.points),
    })),
  };
}

export function presentTranscriptRequest(request) {
  return {
    id: request.reference,
    requestId: request.id,
    requestDate: toIsoDate(request.requestDate),
    deliveryType: request.deliveryType,
    recipient: request.recipient,
    recipientEmail: request.recipientEmail,
    copies: request.copies,
    status: request.status,
    fee: request.feeLabel,
  };
}
