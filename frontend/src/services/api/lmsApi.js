import { apiClient } from './client.js';

/**
 * Moodle LMS. Students read their own data (the server resolves their Moodle account);
 * administrators manage links, courses, enrolments and operations. No Moodle credential
 * ever reaches the browser.
 */
const ADMIN = '/lms/admin/moodle';

export const lmsApi = {
  myMoodleCourses: () => apiClient.get('/lms/me/moodle/courses'),
  myMoodleCourse: (moodleCourseId) => apiClient.get(`/lms/me/moodle/courses/${encodeURIComponent(moodleCourseId)}`),
  myMoodleAssignments: () => apiClient.get('/lms/me/moodle/assignments'),
  myMoodleGrades: () => apiClient.get('/lms/me/moodle/grades'),
  /** My CampusCore classes, each with the Moodle course that delivers it (if any). */
  mySisClasses: () => apiClient.get('/lms/me/sis-classes'),
};

/** Faculty: Moodle courses they teach, authorised per course by their live Moodle role. */
const FACULTY = '/lms/faculty/moodle';
export const facultyMoodleApi = {
  /** My CampusCore teaching sections with the Moodle course that delivers each (if any). */
  sisClasses: () => apiClient.get('/lms/faculty/moodle/sis-classes'),
  courses: () => apiClient.get(`${FACULTY}/courses`),
  course: (courseId) => apiClient.get(`${FACULTY}/courses/${courseId}`),
  submissions: (courseId, assignmentId) => apiClient.get(`${FACULTY}/courses/${courseId}/assignments/${assignmentId}/submissions`),
  saveGrade: (courseId, assignmentId, moodleUserId, body) => apiClient.put(`${FACULTY}/courses/${courseId}/assignments/${assignmentId}/grades/${moodleUserId}`, body),
};

export const moodleAdminApi = {
  status: () => apiClient.get(`${ADMIN}/status`),
  test: () => apiClient.post(`${ADMIN}/test`),
  categories: () => apiClient.get(`${ADMIN}/categories`),
  courses: () => apiClient.get(`${ADMIN}/courses`),
  createCourse: (body) => apiClient.post(`${ADMIN}/courses`, body),
  updateCourse: (id, body) => apiClient.patch(`${ADMIN}/courses/${id}`, body),
  hideCourse: (id) => apiClient.post(`${ADMIN}/courses/${id}/hide`),
  showCourse: (id) => apiClient.post(`${ADMIN}/courses/${id}/show`),
  deleteCourse: (id, confirmShortName) => apiClient.delete(`${ADMIN}/courses/${id}`, { body: { confirmShortName } }),
  linkCourse: (id, courseId) => apiClient.put(`${ADMIN}/courses/${id}/link`, { courseId }),
  unlinkCourse: (id) => apiClient.delete(`${ADMIN}/courses/${id}/link`),
  enrolments: (id) => apiClient.get(`${ADMIN}/courses/${id}/enrolments`),
  enrol: (id, studentProfileId) => apiClient.post(`${ADMIN}/courses/${id}/enrolments`, { studentProfileId }),
  endEnrolment: (id, body) => apiClient.post(`${ADMIN}/courses/${id}/enrolments/end`, body),
  students: (search) => apiClient.get(`${ADMIN}/students`, { query: search ? { search } : undefined }),
  linkStudent: (studentProfileId, moodleUserId) => apiClient.post(`${ADMIN}/students/${studentProfileId}/link`, moodleUserId ? { moodleUserId } : {}),
  unlinkStudent: (studentProfileId) => apiClient.delete(`${ADMIN}/students/${studentProfileId}/link`),
  provisionStudent: (studentProfileId, sendWelcomeEmail) => apiClient.post(`${ADMIN}/students/${studentProfileId}/provision`, { sendWelcomeEmail }),
  setSuspended: (studentProfileId, suspended) => apiClient.post(`${ADMIN}/students/${studentProfileId}/suspension`, { suspended }),
  readRosters: () => apiClient.post(`${ADMIN}/rosters/read`),
  /** New one-time Moodle password (shown once, change forced at next Moodle login). */
  sisSections: (query) => apiClient.get(`${ADMIN}/sis-sections`, { query }),
  linkSisSection: (sisSectionId, moodleCourseId) => apiClient.put(`${ADMIN}/sis-sections/${encodeURIComponent(sisSectionId)}`, { moodleCourseId }),
  unlinkSisSection: (sisSectionId) => apiClient.delete(`${ADMIN}/sis-sections/${encodeURIComponent(sisSectionId)}`),
  sisSectionPlan: (sisSectionId) => apiClient.get(`${ADMIN}/sis-sections/${encodeURIComponent(sisSectionId)}/plan`),
  applySisSectionPlan: (sisSectionId) => apiClient.post(`${ADMIN}/sis-sections/${encodeURIComponent(sisSectionId)}/apply`),
  personSisPlan: (userId) => apiClient.get(`${ADMIN}/people/${userId}/sis-plan`),
  applyPersonSisPlan: (userId) => apiClient.post(`${ADMIN}/people/${userId}/sis-plan/apply`),
  issueOneTimePassword: (entityType, profileId) => apiClient.post(`${ADMIN}/people/${entityType}/${profileId}/one-time-password`),
  profileMoodle: (entityType, profileId) => apiClient.get(`${ADMIN}/profiles/${entityType}/${profileId}`),
  linkProfile: (entityType, profileId, moodleUserId) => apiClient.post(`${ADMIN}/profiles/${entityType}/${profileId}/link`, moodleUserId ? { moodleUserId } : {}),
  unlinkProfile: (entityType, profileId) => apiClient.delete(`${ADMIN}/profiles/${entityType}/${profileId}/link`),
  provisionProfile: (entityType, profileId, credentials) => apiClient.post(`${ADMIN}/people/${entityType}/${profileId}/provision`, { credentials }),
  onboardStudent: (studentProfileId, courseIds) => apiClient.post(`${ADMIN}/students/${studentProfileId}/onboard`, { courseIds }),
  operations: (status) => apiClient.get(`${ADMIN}/operations`, { query: status ? { status } : undefined }),
  retryOperation: (id) => apiClient.post(`${ADMIN}/operations/${id}/retry`),
};
