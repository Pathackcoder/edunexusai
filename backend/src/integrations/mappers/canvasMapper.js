/**
 * Canonical mapper: Canvas LMS -> EdunexusAI domain model.
 *
 *   id            -> externalId      (Canvas numeric course id)
 *   course_code   -> code            ("CS 501")
 *   name          -> name
 *   due_at        -> dueDate
 *   sis_user_id   -> externalStudentId
 *
 * Canvas does not publish credit hours or a registrar meeting pattern, so those canonical
 * fields come back null. The merge policy in integrationService decides what to do with a
 * null from a secondary provider: it never overwrites a populated value from the system
 * of record.
 */

const SOURCE = 'CANVAS';

export function mapCourse(record) {
  return {
    sourceSystem: SOURCE,
    externalId: String(record.id),
    code: (record.course_code ?? '').trim() || null,
    name: record.name ?? null,
    credits: null,
    description: null,
    room: null,
    meetingDays: [],
    dayCodes: [],
    timeLabel: null,
    startTime: null,
    endTime: null,
    instructorName: record.teachers?.[0]?.display_name ?? null,
    instructorEmail: null,
    officeHours: null,
    lmsUrl: record.id ? `/courses/${record.id}` : null,
    enrolledCount: record.total_students ?? null,
    workflowState: record.workflow_state ?? null,
    sisCourseId: record.sis_course_id ?? null,
  };
}

export function mapAssignment(record) {
  return {
    sourceSystem: SOURCE,
    externalId: String(record.id),
    externalCourseId: String(record.course_id),
    title: record.name ?? null,
    description: stripHtml(record.description),
    dueDate: record.due_at ? new Date(record.due_at) : null,
    dueTimeLabel: record.due_at ? formatDueTime(record.due_at) : null,
    points: Number(record.points_possible) || 0,
    submissionType: (record.submission_types ?? []).join(', ') || null,
    weightLabel: null,
    lmsUrl: record.html_url ?? null,
  };
}

export function mapEnrollment(record) {
  return {
    sourceSystem: SOURCE,
    externalId: String(record.id),
    externalCourseId: String(record.course_id),
    externalStudentId: record.sis_user_id ?? String(record.user_id),
    studentName: record.user?.name ?? null,
    status: record.enrollment_state === 'active' ? 'Enrolled' : (record.enrollment_state ?? 'Unknown'),
    letterGrade: record.grades?.current_grade ?? null,
    percentage: record.grades?.current_score ?? null,
    gradePoints: null,
    gradeComponents: [],
  };
}

/** Canvas assignment descriptions are HTML; the UI renders plain text. */
export function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function formatDueTime(iso) {
  const date = new Date(iso);
  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

export const canvasMapper = { mapCourse, mapAssignment, mapEnrollment, stripHtml };
