/**
 * Builds the mock external university dataset from the snapshots taken off the original
 * frontend dummy modules (scripts/extracted at the repo root).
 *
 * The output deliberately uses SIS/LMS-native field names (`sis_course_id`,
 * `subject_code`, `catalog_number`, `credit_hours`, ...) rather than EdunexusAI names.
 * That is the point: the backend's canonical mapper has to do real translation work, and
 * no provider-shaped field can reach the React app.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const EXTRACTED = resolve(here, '..', '..', 'scripts', 'extracted');
const OUT = resolve(here, '..', 'data');

const read = async (name) => JSON.parse(await readFile(resolve(EXTRACTED, name), 'utf8'));

const courses = (await read('courses.json')).coursesData;
const assignments = (await read('assignments.json')).assignmentsData;
const grades = (await read('grades.json')).gradesSummaryData;
const aid = (await read('financialAid.json')).financialAidData;
const student = (await read('studentData.json')).defaultStudentData;

const TERM = { term_code: 'FALL2026', term_description: 'Fall Semester 2026', academic_year: '2026-2027' };
const SIS_STUDENT_ID = '0098421';
const DAY_TO_SIS = { Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'R', Friday: 'F' };

/** Fixture money arrives both as numbers and as display strings ("$3,610.00"). */
const money = (value) => {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const splitCode = (code) => {
  const [subject, number] = code.split(/\s+/);
  return { subject_code: subject, catalog_number: number };
};

// --- Students -------------------------------------------------------------------
/**
 * A realistic cohort. The first entry is the primary demo student; the rest give faculty
 * rosters a believable size. Every one of these is registered in the SIS only — the
 * EdunexusAI seed provisions matching portal accounts by reading this list through the
 * connector, which is how a real onboarding would work.
 */
const COHORT = [
  ['Maya', 'Lin', 'student.advanced@edunexus.ai', 'B.S. in Software Engineering', 'UG', 3.91, 3.95, 102, 120],
  ['Devon', 'Brooks', 'd.brooks@student.edunexus.ai', 'Ph.D. in Applied Mathematics', 'GR', 3.88, 3.92, 76, 90],
  ['Sophia', 'Martinez', 's.martinez@student.edunexus.ai', 'M.S. in Embedded Systems', 'GR', 3.74, 3.80, 40, 64],
  ['Ethan', 'Powell', 'e.powell@student.edunexus.ai', 'M.S. in Computer Science', 'GR', 3.52, 3.61, 32, 64],
  ['Priya', 'Raman', 'p.raman@student.edunexus.ai', 'M.S. in Computer Science', 'GR', 3.95, 3.98, 52, 64],
  ['Jordan', 'Okafor', 'j.okafor@student.edunexus.ai', 'M.S. in Data Science', 'GR', 3.41, 3.55, 28, 64],
  ['Hannah', 'Kim', 'h.kim@student.edunexus.ai', 'M.S. in Computer Science', 'GR', 3.67, 3.72, 44, 64],
  ['Luis', 'Fernandez', 'l.fernandez@student.edunexus.ai', 'M.S. in Cybersecurity', 'GR', 3.58, 3.64, 36, 64],
  ['Grace', 'Oyelaran', 'g.oyelaran@student.edunexus.ai', 'M.S. in Computer Science', 'GR', 3.83, 3.88, 48, 64],
  ['Noah', 'Bergstrom', 'n.bergstrom@student.edunexus.ai', 'M.S. in Distributed Systems', 'GR', 3.29, 3.40, 24, 64],
  ['Aisha', 'Mahmood', 'a.mahmood@student.edunexus.ai', 'M.S. in Computer Science', 'GR', 3.76, 3.81, 40, 64],
];

const students = [
  {
    sis_student_id: SIS_STUDENT_ID,
    banner_pidm: 884210,
    institution_email: student.email,
    legal_first_name: student.firstName,
    legal_last_name: student.lastName,
    primary_program_desc: student.degree,
    primary_college_desc: student.department,
    student_level: 'GR',
    admit_term_code: 'FALL2025',
    enrollment_status_desc: student.academicStanding,
    cumulative_gpa: student.cumulativeGpa,
    major_gpa: student.majorGpa,
    earned_credit_hours: student.creditsCompleted,
    program_credit_hours_required: student.totalCreditsRequired,
  },
  ...COHORT.map(([first, last, email, program, level, gpa, majorGpa, earned, required], index) => ({
    sis_student_id: String(98507 + index * 13).padStart(7, '0'),
    banner_pidm: 884507 + index * 13,
    institution_email: email,
    legal_first_name: first,
    legal_last_name: last,
    primary_program_desc: program,
    primary_college_desc: 'Department of Computer Science & Engineering',
    student_level: level,
    admit_term_code: level === 'UG' ? 'FALL2023' : 'FALL2025',
    enrollment_status_desc: 'Good Standing',
    cumulative_gpa: gpa,
    major_gpa: majorGpa,
    earned_credit_hours: earned,
    program_credit_hours_required: required,
  })),
];

// --- Course catalogue / sections ------------------------------------------------
const sisCourses = courses.map((course, index) => ({
  sis_course_id: `SIS-CRS-${1000 + index}`,
  crn: String(20410 + index * 7),
  ...splitCode(course.code),
  course_title: course.name,
  credit_hours: course.credits,
  catalog_description: course.description,
  ...TERM,
  meeting_pattern: {
    meeting_days: course.days.map((day) => DAY_TO_SIS[day] ?? day.slice(0, 1)),
    meeting_days_long: course.days,
    begin_time: course.startTime,
    end_time: course.endTime,
    time_display: course.time,
    building_room: course.room,
  },
  instructor_of_record: {
    display_name: course.instructor,
    institution_email: course.instructorEmail,
    scheduled_office_hours: course.officeHours,
  },
  // Presentation hints the registrar system carries for the published timetable.
  publication_attributes: {
    accent_color: course.color,
    surface_color: course.bgColor,
    outline_color: course.borderColor,
    syllabus_uri: course.syllabusUrl,
  },
  status: 'ACTIVE',
}));

const courseIdByCode = new Map(
  sisCourses.map((c) => [`${c.subject_code}${c.catalog_number}`, c.sis_course_id]),
);
const resolveCourseId = (courseId) => courseIdByCode.get(courseId.replace(/\s+/g, '')) ?? null;

// --- Registrations (enrollments) ------------------------------------------------
const gradeByCode = new Map(grades.currentCourses.map((c) => [c.courseCode.replace(/\s+/g, ''), c]));

const sisEnrollments = sisCourses.map((course, index) => {
  const key = `${course.subject_code}${course.catalog_number}`;
  const graded = gradeByCode.get(key);
  return {
    sis_registration_id: `SIS-REG-${5000 + index}`,
    sis_student_id: SIS_STUDENT_ID,
    sis_course_id: course.sis_course_id,
    crn: course.crn,
    ...TERM,
    registration_status_desc: 'Registered',
    credit_hours: course.credit_hours,
    midterm_grade_code: graded?.letterGrade ?? null,
    current_grade_code: graded?.letterGrade ?? null,
    current_percent_score: graded?.percentage ?? null,
    quality_points: graded?.gradePoints ?? null,
    grade_components: Object.entries(graded?.breakdown ?? {}).map(([key2, value], i) => ({
      component_key: key2,
      component_score: value,
      display_sequence: i,
    })),
  };
});

/**
 * Register the cohort. CS 501 is the demonstration course, so everyone takes it; the
 * remaining sections get a rotating subset. This is what gives the faculty roster and
 * the "notify the whole class" action a realistic size.
 */
const LETTER_SCALE = [
  ['A', 95.8, 4.0], ['A-', 91.4, 3.7], ['B+', 88.2, 3.3],
  ['A', 94.1, 4.0], ['B', 84.6, 3.0], ['A-', 90.7, 3.7],
];

let cohortSeq = 7000;
for (const [studentIndex, sisStudent] of students.slice(1).entries()) {
  // Everyone is registered for the first section; others are spread across the rest.
  const sections = [sisCourses[0], ...sisCourses.slice(1).filter((_, i) => (studentIndex + i) % 2 === 0)];
  for (const course of sections) {
    const [grade, percent, points] = LETTER_SCALE[(studentIndex + sections.indexOf(course)) % LETTER_SCALE.length];
    sisEnrollments.push({
      sis_registration_id: `SIS-REG-${cohortSeq++}`,
      sis_student_id: sisStudent.sis_student_id,
      sis_course_id: course.sis_course_id,
      crn: course.crn,
      ...TERM,
      registration_status_desc: 'Registered',
      credit_hours: course.credit_hours,
      midterm_grade_code: grade,
      current_grade_code: grade,
      current_percent_score: percent,
      quality_points: points,
      grade_components: [],
    });
  }
}

// --- Coursework (assignments) ---------------------------------------------------
const sisAssignments = assignments.map((assignment, index) => ({
  lms_assignment_id: `LMS-ASG-${7000 + index}`,
  sis_course_id: resolveCourseId(assignment.courseCode),
  assignment_name: assignment.title,
  assignment_description: assignment.description,
  due_at: `${assignment.dueDate}T23:59:00Z`,
  due_time_display: assignment.dueTime,
  points_possible: assignment.points,
  submission_types: assignment.submissionType,
  grade_weight_display: assignment.weight,
  published: true,
  // Grader state is provider-side; Edunexus keeps its own submission overlay.
  grader_summary: {
    sis_student_id: SIS_STUDENT_ID,
    workflow_state: assignment.status === 'Completed' ? 'graded' : 'unsubmitted',
    entered_score: assignment.score ?? null,
  },
}));

// --- Term GPA history -----------------------------------------------------------
const sisAcademicHistory = {
  sis_student_id: SIS_STUDENT_ID,
  cumulative_gpa: grades.cumulativeGpa,
  major_gpa: grades.majorGpa,
  term_gpa: grades.semesterGpa,
  earned_credit_hours: grades.creditsCompleted,
  required_credit_hours: grades.creditsRequired,
  academic_standing_desc: grades.academicStanding,
  honors_desc: grades.honors,
  prior_terms: grades.pastTerms.map((term) => ({
    term_description: term.term,
    term_gpa: term.gpa,
    term_credit_hours: term.credits,
  })),
};

// --- Financial aid --------------------------------------------------------------
const sisFinancialAid = {
  sis_student_id: SIS_STUDENT_ID,
  aid_year: aid.awardYear,
  packaging_status_desc: aid.status,
  application_status_desc: aid.applicationStatus,
  last_packaged_date: aid.lastUpdated,
  total_offered_amount: money(aid.summary.totalAwarded),
  total_disbursed_amount: money(aid.summary.disbursed),
  total_scheduled_amount: money(aid.summary.scheduled),
  fund_awards: aid.awards.map((award) => ({
    fund_code: award.id,
    fund_title: award.name,
    fund_type_desc: award.category,
    offered_amount: money(award.amount),
    award_period_desc: award.term,
    award_status_desc: award.status,
    renewal_condition_desc: award.renewable,
    fund_description: award.description,
  })),
  disbursement_schedule: aid.disbursements.map((item) => ({
    scheduled_date: item.date,
    scheduled_amount: money(item.amount),
    disbursement_status_desc: item.status,
    applied_to_desc: item.appliedTo,
  })),
  tracking_requirements: aid.requirements.map((item) => ({
    requirement_title: item.title,
    requirement_status_desc: item.status,
    satisfied_date: item.date,
  })),
};

// --- Canvas-compatible projection ----------------------------------------------
// Mirrors the real Canvas LMS REST shapes so CanvasConnector can be exercised
// end-to-end without a live Canvas tenant. Field names follow the public Canvas API.
const canvasCourses = sisCourses.map((course, index) => ({
  id: 1100 + index,
  sis_course_id: `${course.subject_code}${course.catalog_number}-FALL2026`,
  name: course.course_title,
  course_code: `${course.subject_code} ${course.catalog_number}`,
  workflow_state: 'available',
  enrollment_term_id: 42,
  start_at: '2026-09-02T08:00:00Z',
  end_at: '2026-12-18T17:00:00Z',
  teachers: [{ id: 900 + index, display_name: course.instructor_of_record.display_name }],
  total_students: sisEnrollments.filter((e) => e.sis_course_id === course.sis_course_id).length,
}));

const canvasAssignments = sisAssignments
  .filter((a) => a.sis_course_id)
  .map((assignment, index) => {
    const course = sisCourses.find((c) => c.sis_course_id === assignment.sis_course_id);
    const canvasCourse = canvasCourses.find(
      (c) => c.course_code === `${course.subject_code} ${course.catalog_number}`,
    );
    return {
      id: 5200 + index,
      course_id: canvasCourse.id,
      name: assignment.assignment_name,
      description: assignment.assignment_description,
      due_at: assignment.due_at,
      points_possible: assignment.points_possible,
      submission_types: ['online_upload'],
      published: true,
      html_url: `https://canvas.example.edu/courses/${canvasCourse.id}/assignments/${5200 + index}`,
    };
  });

const canvasUserIds = new Map(students.map((s, i) => [s.sis_student_id, 3001 + i]));
const studentNames = new Map(
  students.map((s) => [s.sis_student_id, `${s.legal_first_name} ${s.legal_last_name}`]),
);

const canvasEnrollments = sisEnrollments.map((enrollment, index) => {
  const course = sisCourses.find((c) => c.sis_course_id === enrollment.sis_course_id);
  const canvasCourse = canvasCourses.find(
    (c) => c.course_code === `${course.subject_code} ${course.catalog_number}`,
  );
  const canvasUserId = canvasUserIds.get(enrollment.sis_student_id) ?? 3999;
  return {
    id: 7700 + index,
    course_id: canvasCourse.id,
    user_id: canvasUserId,
    type: 'StudentEnrollment',
    role: 'StudentEnrollment',
    enrollment_state: 'active',
    sis_user_id: enrollment.sis_student_id,
    grades: {
      current_grade: enrollment.current_grade_code,
      current_score: enrollment.current_percent_score,
    },
    user: {
      id: canvasUserId,
      name: studentNames.get(enrollment.sis_student_id) ?? 'Unknown Student',
      sis_user_id: enrollment.sis_student_id,
    },
  };
});

await mkdir(OUT, { recursive: true });
const files = {
  'terms.json': [TERM],
  'students.json': students,
  'courses.json': sisCourses,
  'enrollments.json': sisEnrollments,
  'assignments.json': sisAssignments,
  'academic-history.json': sisAcademicHistory,
  'financial-aid.json': sisFinancialAid,
  'canvas-courses.json': canvasCourses,
  'canvas-assignments.json': canvasAssignments,
  'canvas-enrollments.json': canvasEnrollments,
};

for (const [name, payload] of Object.entries(files)) {
  await writeFile(resolve(OUT, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`wrote data/${name}`);
}
console.log('\nmock external dataset rebuilt');
