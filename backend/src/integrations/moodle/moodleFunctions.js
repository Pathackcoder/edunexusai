/**
 * Moodle external functions this integration knows how to use, why, and how essential
 * each one is. The live list of functions a token may call comes from
 * core_webservice_get_site_info; this catalogue explains each one and drives the
 * admin configuration checklist.
 *
 *   group READ_CORE      enabled on the current service and verified against the live site
 *   group LINKING        required before student accounts can be linked safely
 *   group ADMIN_WRITE    required for provisioning, course management and enrolment
 *   group LEARNER_DETAIL required for assignments, submission status and grades
 *   group OPTIONAL       useful later; not needed for the MVP
 *   group NOT_RECOMMENDED available in Moodle but deliberately not used by default
 *   group FACULTY_GRADING required for the faculty submission review and grading view
 *   group UNSUPPORTED_WITH_SERVICE_TOKEN listed so the checklist explains what cannot be
 *         done through a shared service token, and why
 *
 * Parameter and response shapes for functions outside READ_CORE follow the Moodle web
 * service API documentation; they have not been exercised against this site because the
 * service did not expose them yet. `liveVerified` marks the functions that have been
 * exercised against the live site (2026-10-11 seed run and read checks).
 */
export const MOODLE_FUNCTIONS = {
  core_webservice_get_site_info: {
    group: 'READ_CORE',
    purpose: 'Connection test, Moodle version, and the list of functions the token may call.',
    capabilities: [],
    liveVerified: true,
  },
  core_course_get_courses: {
    group: 'READ_CORE',
    purpose: 'List Moodle courses for the admin course view and duplicate checks before creating a course.',
    capabilities: ['moodle/course:view', 'moodle/course:viewhiddencourses'],
    liveVerified: true,
  },
  core_enrol_get_users_courses: {
    group: 'READ_CORE',
    purpose: 'The Moodle courses a linked student is enrolled in.',
    capabilities: ['moodle/course:viewparticipants'],
    liveVerified: true,
  },
  core_course_get_contents: {
    group: 'READ_CORE',
    purpose: 'Sections and activities of a course (filtered server-side to what students can see).',
    capabilities: ['moodle/course:view'],
    liveVerified: true,
  },
  core_course_get_course_module_by_instance: {
    group: 'READ_CORE',
    purpose: 'Resolve an activity instance to its course module and link. Enabled; not used by the MVP screens.',
    capabilities: [],
    liveVerified: true,
  },
  core_user_get_users_by_field: {
    group: 'LINKING',
    purpose: 'Look up a Moodle account by id, email, username or ID number, to verify a link and to prevent duplicate accounts.',
    capabilities: ['moodle/user:viewdetails', 'moodle/user:viewhiddendetails'],
    liveVerified: true,
  },
  core_user_create_users: {
    group: 'ADMIN_WRITE',
    purpose: 'Provision a Moodle account for an existing EduNexusAI student.',
    capabilities: ['moodle/user:create'],
    liveVerified: true,
  },
  core_user_update_users: {
    group: 'ADMIN_WRITE',
    purpose: 'Suspend or reactivate a Moodle account (preferred over deletion).',
    capabilities: ['moodle/user:update'],
    liveVerified: false,
  },
  core_course_get_categories: {
    group: 'ADMIN_WRITE',
    purpose: 'List course categories so a new course is created in a category that exists.',
    capabilities: ['moodle/category:viewcourselist'],
    liveVerified: true,
  },
  core_course_create_courses: {
    group: 'ADMIN_WRITE',
    purpose: 'Create a Moodle course shell.',
    capabilities: ['moodle/course:create'],
    liveVerified: true,
  },
  core_course_update_courses: {
    group: 'ADMIN_WRITE',
    purpose: 'Edit course details and hide/show a course (the safe alternative to deletion).',
    capabilities: ['moodle/course:update', 'moodle/course:visibility'],
    liveVerified: false,
  },
  enrol_manual_enrol_users: {
    group: 'ADMIN_WRITE',
    purpose: 'Enrol a linked student through the course’s manual enrolment instance, or suspend that enrolment.',
    capabilities: ['enrol/manual:enrol'],
    liveVerified: true,
  },
  enrol_manual_unenrol_users: {
    group: 'ADMIN_WRITE',
    purpose: 'Remove a manual enrolment (only when explicitly requested; suspension is the default).',
    capabilities: ['enrol/manual:unenrol'],
    liveVerified: false,
  },
  core_enrol_get_enrolled_users: {
    group: 'ADMIN_WRITE',
    purpose: 'Course participant list for the admin enrolment view, and discovery of the student role id.',
    capabilities: ['moodle/course:viewparticipants', 'moodle/course:enrolreview'],
    liveVerified: true,
  },
  mod_assign_get_assignments: {
    group: 'LEARNER_DETAIL',
    purpose: 'Assignments and due dates in a student’s courses.',
    capabilities: ['mod/assign:view'],
    liveVerified: true,
  },
  mod_assign_get_submission_status: {
    group: 'LEARNER_DETAIL',
    purpose: 'Submission and grading status of one assignment for one student.',
    capabilities: ['mod/assign:view', 'mod/assign:viewgrades'],
    liveVerified: false,
  },
  gradereport_user_get_grade_items: {
    group: 'LEARNER_DETAIL',
    purpose: 'Released grades and feedback for one student in one course (hidden items are filtered out).',
    capabilities: ['gradereport/user:view', 'moodle/grade:viewall'],
    liveVerified: true,
  },
  mod_assign_get_submissions: {
    group: 'FACULTY_GRADING',
    purpose: 'Faculty view of every student submission (status, time) in an assignment.',
    capabilities: ['mod/assign:grade', 'mod/assign:viewgrades'],
    liveVerified: false,
  },
  mod_assign_get_grades: {
    group: 'FACULTY_GRADING',
    purpose: 'Faculty view of the grades stored in an assignment, to confirm a saved grade.',
    capabilities: ['mod/assign:viewgrades'],
    liveVerified: false,
  },
  mod_assign_save_grade: {
    group: 'FACULTY_GRADING',
    purpose: 'Save a faculty member\u2019s grade and written feedback for one student (after EduNexusAI checks they teach the course).',
    // Written feedback also needs the "Feedback comments" type enabled on the assignment.
    capabilities: ['mod/assign:grade'],
    liveVerified: false,
  },
  mod_assign_save_submission: {
    group: 'UNSUPPORTED_WITH_SERVICE_TOKEN',
    purpose: 'Saves a submission for the token\u2019s OWN user only (no userid parameter), so a shared service token cannot submit on a student\u2019s behalf. Students submit in Moodle until per-user tokens/SSO exist.',
    capabilities: [],
    liveVerified: false,
  },
  core_courseformat_create_module: {
    group: 'UNSUPPORTED_WITH_SERVICE_TOKEN',
    purpose: 'Moodle core has no web service that creates an assignment with its settings (name, instructions, due date, submission types). Faculty create assignments in Moodle; they appear here automatically.',
    capabilities: [],
    liveVerified: false,
  },
  core_completion_get_activities_completion_status: {
    group: 'OPTIONAL',
    purpose: 'Per-student activity completion for a progress indicator.',
    capabilities: ['report/progress:view'],
    liveVerified: false,
  },
  core_course_get_courses_by_field: {
    group: 'OPTIONAL',
    purpose: 'Targeted course lookup by shortname or ID number on large sites.',
    capabilities: ['moodle/course:view'],
    liveVerified: false,
  },
  core_course_delete_courses: {
    group: 'NOT_RECOMMENDED',
    purpose: 'Irreversible course deletion. Only if you need hard deletion; additionally gated by MOODLE_ALLOW_COURSE_DELETE.',
    capabilities: ['moodle/course:delete'],
    liveVerified: false,
  },
  core_calendar_get_calendar_upcoming_view: {
    group: 'NOT_RECOMMENDED',
    purpose: 'Returns events for the token’s own user, not for a given student, so it cannot show a student’s deadlines through a service token. Deadlines come from assignment due dates instead.',
    capabilities: [],
    liveVerified: false,
  },
};

export const functionsInGroup = (...groups) =>
  Object.entries(MOODLE_FUNCTIONS)
    .filter(([, meta]) => groups.includes(meta.group))
    .map(([name]) => name);

/** Checklist for the admin UI and docs: what is enabled now, what is still needed. */
export function capabilityChecklist(enabled) {
  const set = enabled instanceof Set ? enabled : new Set(enabled ?? []);
  return Object.entries(MOODLE_FUNCTIONS).map(([name, meta]) => ({
    name,
    group: meta.group,
    purpose: meta.purpose,
    capabilities: meta.capabilities,
    enabled: set.has(name),
    liveVerified: meta.liveVerified,
  }));
}
