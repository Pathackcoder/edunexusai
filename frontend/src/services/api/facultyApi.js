import { apiClient } from './client.js';

export const facultyApi = {
  getDashboard: () => apiClient.get('/faculty/dashboard', { demoLatency: true }),
  // CampusCore teaching assignments, each with its announcement owner (CampusCore or Moodle).
  getSections: () => apiClient.get('/faculty/sections'),
  // Local EduNexusAI course records (demo data), for the local gradebook and follow-ups.
  getCourses: () => apiClient.get('/faculty/courses'),
  getRoster: (courseId) => apiClient.get(`/faculty/courses/${courseId}/students`),
  sendClassNotification: (courseId, payload) =>
    apiClient.post(`/faculty/courses/${courseId}/notifications`, payload),
  // Class announcements on the faculty member's sections, from the system that owns each section.
  getAnnouncements: () => apiClient.get('/faculty/announcements'),
  // Publish to a CampusCore-owned section as the signed-in faculty member ({ title, body, pinned, idempotencyKey }).
  publishAnnouncement: (sectionId, payload) =>
    apiClient.post(`/faculty/sections/${encodeURIComponent(sectionId)}/announcements`, payload),
  getSchedule: () => apiClient.get('/faculty/schedule'),
  // Gradebook (instructor of record only)
  getGradebookCourses: () => apiClient.get('/faculty/gradebook/courses'),
  getGradebook: (courseId) => apiClient.get(`/faculty/courses/${courseId}/gradebook`),
  saveScores: (courseId, scores) => apiClient.put(`/faculty/courses/${courseId}/gradebook/scores`, { scores }),
  publishGrades: (courseId, body = {}) => apiClient.post(`/faculty/courses/${courseId}/gradebook/publish`, body),
  saveGradingSettings: (courseId, body) => apiClient.put(`/faculty/courses/${courseId}/gradebook/settings`, body),
};
