/**
 * Canonical mapper: Mock University SIS -> EdunexusAI domain model.
 *
 * This is the boundary that keeps provider vocabulary out of the product. Nothing
 * downstream of this file knows the words `sis_course_id`, `subject_code`,
 * `catalog_number`, `credit_hours` or `meeting_pattern`.
 *
 *   sis_course_id                      -> externalId
 *   subject_code + catalog_number      -> code            ("CS" + "501" = "CS 501")
 *   course_title                       -> name
 *   credit_hours                       -> credits
 *   meeting_pattern.meeting_days_long  -> meetingDays
 *   instructor_of_record.display_name  -> instructorName
 *
 * Swapping the Mock University API for Banner or Workday means writing a sibling mapper
 * that targets the same canonical shape. The React app is unaffected either way.
 */

const SOURCE = 'MOCK_UNIVERSITY';

export const courseCodeOf = (record) =>
  `${record.subject_code} ${record.catalog_number}`.trim();

export function mapCourse(record) {
  const meeting = record.meeting_pattern ?? {};
  const instructor = record.instructor_of_record ?? {};
  const publication = record.publication_attributes ?? {};
  return {
    sourceSystem: SOURCE,
    externalId: record.sis_course_id,
    termCode: record.term_code,
    termName: record.term_description,
    code: courseCodeOf(record),
    name: record.course_title,
    credits: Number(record.credit_hours) || 0,
    description: record.catalog_description ?? null,
    room: meeting.building_room ?? null,
    meetingDays: meeting.meeting_days_long ?? [],
    dayCodes: meeting.meeting_days ?? [],
    timeLabel: meeting.time_display ?? null,
    startTime: meeting.begin_time ?? null,
    endTime: meeting.end_time ?? null,
    instructorName: instructor.display_name ?? null,
    instructorEmail: instructor.institution_email ?? null,
    officeHours: instructor.scheduled_office_hours ?? null,
    colorHex: publication.accent_color ?? null,
    bgColorHex: publication.surface_color ?? null,
    borderColorHex: publication.outline_color ?? null,
    syllabusUrl: publication.syllabus_uri ?? null,
  };
}

export function mapEnrollment(record) {
  return {
    sourceSystem: SOURCE,
    externalId: record.sis_registration_id,
    externalCourseId: record.sis_course_id,
    externalStudentId: record.sis_student_id,
    status: record.registration_status_desc ?? 'Enrolled',
    letterGrade: record.current_grade_code ?? null,
    percentage: record.current_percent_score ?? null,
    gradePoints: record.quality_points ?? null,
    gradeComponents: (record.grade_components ?? []).map((component) => ({
      displayKey: component.component_key,
      label: humanizeComponentKey(component.component_key),
      scoreLabel: component.component_score,
      sortOrder: component.display_sequence ?? 0,
    })),
  };
}

export function mapAssignment(record) {
  const grader = record.grader_summary ?? {};
  return {
    sourceSystem: SOURCE,
    externalId: record.lms_assignment_id,
    externalCourseId: record.sis_course_id,
    title: record.assignment_name,
    description: record.assignment_description ?? null,
    dueDate: record.due_at ? new Date(record.due_at) : null,
    dueTimeLabel: record.due_time_display ?? null,
    points: Number(record.points_possible) || 0,
    submissionType: record.submission_types ?? null,
    weightLabel: record.grade_weight_display ?? null,
    providerSubmission: {
      externalStudentId: grader.sis_student_id ?? null,
      isGraded: grader.workflow_state === 'graded',
      score: grader.entered_score ?? null,
    },
  };
}

export function mapAcademicHistory(record) {
  if (!record) return null;
  return {
    sourceSystem: SOURCE,
    externalStudentId: record.sis_student_id,
    cumulativeGpa: record.cumulative_gpa ?? null,
    majorGpa: record.major_gpa ?? null,
    semesterGpa: record.term_gpa ?? null,
    creditsCompleted: record.earned_credit_hours ?? 0,
    creditsRequired: record.required_credit_hours ?? 0,
    academicStanding: record.academic_standing_desc ?? null,
    honors: record.honors_desc ?? null,
    pastTerms: (record.prior_terms ?? []).map((term) => ({
      term: term.term_description,
      gpa: term.term_gpa,
      credits: term.term_credit_hours,
    })),
  };
}

export function mapFinancialAid(record) {
  if (!record) return null;
  return {
    sourceSystem: SOURCE,
    externalStudentId: record.sis_student_id,
    awardYear: record.aid_year,
    status: record.packaging_status_desc,
    applicationStatus: record.application_status_desc,
    lastUpdatedLabel: record.last_packaged_date ?? null,
    totalAwarded: Number(record.total_offered_amount) || 0,
    disbursed: Number(record.total_disbursed_amount) || 0,
    scheduled: Number(record.total_scheduled_amount) || 0,
    awards: (record.fund_awards ?? []).map((award, index) => ({
      reference: award.fund_code,
      name: award.fund_title,
      category: award.fund_type_desc,
      amount: Number(award.offered_amount) || 0,
      termLabel: award.award_period_desc ?? null,
      status: award.award_status_desc,
      renewableLabel: award.renewal_condition_desc ?? null,
      description: award.fund_description ?? null,
      sortOrder: index,
    })),
    disbursements: (record.disbursement_schedule ?? []).map((item, index) => ({
      disbursedOn: item.scheduled_date,
      amount: Number(item.scheduled_amount) || 0,
      status: item.disbursement_status_desc,
      appliedTo: item.applied_to_desc ?? null,
      sortOrder: index,
    })),
    requirements: (record.tracking_requirements ?? []).map((item, index) => ({
      title: item.requirement_title,
      status: item.requirement_status_desc,
      completedOn: item.satisfied_date ?? null,
      sortOrder: index,
    })),
  };
}

export function mapStudent(record) {
  if (!record) return null;
  return {
    sourceSystem: SOURCE,
    externalId: record.sis_student_id,
    email: record.institution_email,
    firstName: record.legal_first_name,
    lastName: record.legal_last_name,
    degree: record.primary_program_desc ?? null,
    department: record.primary_college_desc ?? null,
    academicStanding: record.enrollment_status_desc ?? null,
    cumulativeGpa: record.cumulative_gpa ?? null,
    majorGpa: record.major_gpa ?? null,
    creditsCompleted: record.earned_credit_hours ?? 0,
    totalCreditsRequired: record.program_credit_hours_required ?? 0,
  };
}

/** "projectMilestones" -> "Project Milestones" for display labels. */
export function humanizeComponentKey(key = '') {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const mockUniversityMapper = {
  mapCourse,
  mapEnrollment,
  mapAssignment,
  mapAcademicHistory,
  mapFinancialAid,
  mapStudent,
  courseCodeOf,
};
