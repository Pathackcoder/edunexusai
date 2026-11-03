import { stripHtml } from './canvasMapper.js';

/**
 * Canonical mapper: Moodle web-service payloads -> the DTOs the EduNexusAI frontend uses.
 *
 * Moodle answers with the service token's view of the site (a privileged account), so
 * anything shown to a student is filtered here to what a student could see in Moodle:
 * hidden courses, sections, activities and grade items are dropped. Links are only
 * returned when they point at the configured Moodle site.
 */

const toDate = (seconds) => (Number(seconds) > 0 ? new Date(Number(seconds) * 1000).toISOString() : null);

/** Keep a Moodle-supplied URL only if it belongs to the configured site. */
export function siteUrl(url, baseUrl) {
  if (!url || !baseUrl) return null;
  try {
    return new URL(url).origin === new URL(baseUrl).origin ? url : null;
  } catch {
    return null;
  }
}

export const courseUrl = (baseUrl, moodleCourseId) => `${baseUrl}/course/view.php?id=${encodeURIComponent(moodleCourseId)}`;

/** Moodle's front page is returned by core_course_get_courses as course id 1, format "site". */
export const isSiteCourse = (course) => course?.format === 'site' || Number(course?.id) === 1;

/**
 * Canonical LMS course. Built only from a live Moodle response; `externalCourseId` is
 * Moodle's id and is never assumed to equal an EduNexusAI course id.
 */
export function mapCourse(course, baseUrl) {
  return {
    provider: 'MOODLE',
    externalCourseId: String(course.id),
    moodleCourseId: Number(course.id),
    shortName: course.shortname ?? null,
    fullName: course.fullname ?? course.displayname ?? null,
    idNumber: course.idnumber || null,
    categoryId: course.categoryid ?? course.category ?? null,
    visible: Number(course.visible) === 1 && course.hidden !== true,
    format: course.format ?? null,
    summary: stripHtml(course.summary),
    startDate: toDate(course.startdate),
    endDate: toDate(course.enddate),
    enrolledUserCount: course.enrolledusercount ?? null,
    progress: typeof course.progress === 'number' ? Math.round(course.progress) : null,
    courseUrl: courseUrl(baseUrl, course.id),
  };
}

const visibleToStudents = (item) =>
  Number(item.visible ?? 1) === 1 && item.uservisible !== false && Number(item.visibleoncoursepage ?? 1) === 1;

export function mapContents(sections, baseUrl) {
  return (Array.isArray(sections) ? sections : [])
    .filter(visibleToStudents)
    .map((section) => ({
      sectionId: Number(section.id),
      name: section.name || 'Untitled section',
      summary: stripHtml(section.summary),
      activities: (section.modules ?? [])
        .filter(visibleToStudents)
        .filter((module) => module.modname !== 'label' || stripHtml(module.description))
        .map((module) => ({
          cmid: Number(module.id),
          instance: Number(module.instance),
          type: module.modname ?? null,
          typeLabel: module.modplural ? module.modplural.replace(/s$/, '') : module.modname,
          name: module.modname === 'label' ? stripHtml(module.description) : module.name,
          url: module.noviewlink ? null : siteUrl(module.url, baseUrl),
          dates: (module.dates ?? []).map((d) => ({ label: d.label, date: toDate(d.timestamp) })).filter((d) => d.date),
          // Availability restrictions are evaluated per user inside Moodle; the token's
          // view cannot say whether this student meets them, so the UI flags it.
          restricted: Boolean(module.availability),
        })),
    }));
}

export function mapAssignment(assignment, baseUrl) {
  return {
    assignmentId: Number(assignment.id),
    cmid: Number(assignment.cmid),
    moodleCourseId: Number(assignment.course),
    name: assignment.name ?? null,
    dueDate: toDate(assignment.duedate),
    cutoffDate: toDate(assignment.cutoffdate),
    opensAt: toDate(assignment.allowsubmissionsfromdate),
    maxGrade: Number(assignment.grade) > 0 ? Number(assignment.grade) : null,
    instructions: stripHtml(assignment.intro),
    ...submissionSettings(assignment.configs),
    url: `${baseUrl}/mod/assign/view.php?id=${encodeURIComponent(assignment.cmid)}`,
    // Teacher deep links for what Moodle's web services cannot do (edit settings, its grader UI).
    editUrl: `${baseUrl}/course/modedit.php?update=${encodeURIComponent(assignment.cmid)}`,
    graderUrl: `${baseUrl}/mod/assign/view.php?id=${encodeURIComponent(assignment.cmid)}&action=grading`,
  };
}

/** What a submission must contain, from the assignment's plugin configs (Moodle's own settings). */
export function submissionSettings(configs = []) {
  const value = (subtype, plugin, name) => configs.find((c) => c.subtype === subtype && c.plugin === plugin && c.name === name)?.value;
  const types = [];
  if (value('assignsubmission', 'onlinetext', 'enabled') === '1') types.push('ONLINE_TEXT');
  if (value('assignsubmission', 'file', 'enabled') === '1') types.push('FILE');
  return {
    submissionTypes: types,
    maxFiles: types.includes('FILE') ? Number(value('assignsubmission', 'file', 'maxfilesubmissions') ?? 0) || null : null,
    feedbackCommentsEnabled: value('assignfeedback', 'comments', 'enabled') === '1',
  };
}

/** A grade as Moodle stores it in an assignment: "-1.00000" or empty means not graded. */
export const parseAssignGrade = (raw) => {
  const n = Number(raw);
  return raw === null || raw === undefined || raw === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

/**
 * The student's view of one assignment: submission state from
 * mod_assign_get_submission_status and the RELEASED grade from the grade report (never
 * the possibly-unreleased grade inside the submission status).
 */
export function studentAssignmentState(assignment, submission, releasedGrade, now = Date.now()) {
  const submitted = submission?.submissionStatus === 'submitted';
  const due = assignment.dueDate ? new Date(assignment.dueDate).getTime() : null;
  let state;
  if (releasedGrade?.grade) state = 'GRADED';
  else if (submitted) state = submission.gradingStatus === 'graded' ? 'GRADED_NOT_RELEASED' : 'SUBMITTED';
  else if (!assignment.submissionTypes.length) state = 'NO_ONLINE_SUBMISSION';
  else if (submission?.submissionStatus === 'draft') state = 'DRAFT';
  else if (!submission) state = 'UNKNOWN';
  else state = 'NOT_SUBMITTED';
  return {
    state,
    overdue: Boolean(due && due < now && !submitted && assignment.submissionTypes.length > 0),
    grade: releasedGrade?.grade ?? null,
    percentage: releasedGrade?.percentage ?? null,
    feedback: releasedGrade?.feedback ?? null,
    gradedAt: releasedGrade?.gradedAt ?? null,
  };
}

/**
 * Submission state only. The grade inside mod_assign_get_submission_status may not be
 * released yet (marking workflow), so released grades come from the grade report, which
 * reports hidden items explicitly.
 */
export function mapSubmissionStatus(status) {
  const attempt = status?.lastattempt ?? {};
  const submission = attempt.submission ?? attempt.teamsubmission ?? null;
  return {
    submissionStatus: submission?.status ?? 'nosubmission',
    submittedAt: submission?.status === 'submitted' ? toDate(submission.timemodified) : null,
    gradingStatus: attempt.gradingstatus ?? null,
    locked: Boolean(attempt.locked),
  };
}

/**
 * Moodle's grade report returns display HTML (e.g. a "Pass" icon before the number when the
 * item has a grade to pass). Keep the text, and keep pass/fail as data rather than markup.
 */
const formattedText = (value) => {
  if (!value || value === '-') return null;
  const text = stripHtml(String(value)).trim();
  return text && text !== '-' ? text : null;
};
const passMark = (value) => (/title="Pass"/i.test(String(value ?? '')) ? true : /title="Fail"/i.test(String(value ?? '')) ? false : null);

export function mapGradeItems(report) {
  const usergrade = report?.usergrades?.[0];
  const items = (usergrade?.gradeitems ?? []).filter(
    (item) => !item.gradeishidden && !item.gradehiddenbydate && Number(item.hidden ?? 0) === 0,
  );
  const present = (item) => ({
    name: item.itemname || (item.itemtype === 'course' ? 'Course total' : 'Grade item'),
    type: item.itemtype ?? null,
    module: item.itemmodule ?? null,
    cmid: item.cmid ? Number(item.cmid) : null,
    grade: formattedText(item.gradeformatted),
    percentage: formattedText(item.percentageformatted),
    passed: passMark(item.gradeformatted),
    range: item.grademax != null ? `${Number(item.grademin ?? 0)}–${Number(item.grademax)}` : null,
    feedback: stripHtml(item.feedback),
    gradedAt: toDate(item.gradedategraded),
    pending: Boolean(item.gradeneedsupdate),
  });
  return {
    items: items.filter((item) => item.itemtype !== 'course').map(present),
    courseTotal: items.find((item) => item.itemtype === 'course') ? present(items.find((item) => item.itemtype === 'course')) : null,
  };
}

/**
 * Canonical LMS enrolment, from core_enrol_get_enrolled_users. `activeIds` is the set
 * returned with onlyactive=1, so participants missing from it are enrolled but not
 * currently active (suspended or outside the enrolment dates). `localOf` resolves a
 * Moodle user id to its verified EduNexusAI identity, or null when none is linked.
 */
export function mapEnrollment(participant, { moodleCourseId, activeIds, localOf }) {
  const local = localOf?.(Number(participant.id)) ?? null;
  return {
    provider: 'MOODLE',
    externalCourseId: String(moodleCourseId),
    moodleCourseId: Number(moodleCourseId),
    moodleUserId: Number(participant.id),
    localIdentity: local, // { entityType: 'STUDENT'|'FACULTY', internalId } or null
    roles: (participant.roles ?? []).map((r) => ({ roleId: Number(r.roleid), shortName: r.shortname })),
    status: activeIds ? (activeIds.has(Number(participant.id)) ? 'ACTIVE' : 'INACTIVE') : 'UNKNOWN',
  };
}

export function mapUser(user) {
  return {
    moodleUserId: Number(user.id),
    username: user.username ?? null,
    email: user.email ?? null,
    idNumber: user.idnumber || null,
    fullName: user.fullname ?? [user.firstname, user.lastname].filter(Boolean).join(' '),
    suspended: Boolean(Number(user.suspended ?? 0)),
    auth: user.auth ?? null,
  };
}

export function mapCategory(category) {
  return {
    categoryId: Number(category.id),
    name: stripHtml(category.name) ?? category.name,
    idNumber: category.idnumber || null,
    parentId: Number(category.parent ?? 0),
    courseCount: category.coursecount ?? null,
    visible: Number(category.visible ?? 1) === 1,
  };
}

export const moodleMapper = { submissionSettings, parseAssignGrade, studentAssignmentState, mapEnrollment, mapCourse, mapContents, mapAssignment, mapSubmissionStatus, mapGradeItems, mapUser, mapCategory, isSiteCourse, courseUrl, siteUrl };
