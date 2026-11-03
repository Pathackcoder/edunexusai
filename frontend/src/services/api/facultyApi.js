import { apiClient } from './client.js';

export const facultyApi = {
  getDashboard: () => apiClient.get('/faculty/dashboard', { demoLatency: true }),
  getCourses: () => apiClient.get('/faculty/courses'),
  getRoster: (courseId) => apiClient.get(`/faculty/courses/${courseId}/students`),
  sendClassNotification: (courseId, payload) =>
    apiClient.post(`/faculty/courses/${courseId}/notifications`, payload),
  postAnnouncement: (courseId, payload) =>
    apiClient.post(`/faculty/courses/${courseId}/announcements`, payload),
  getAnnouncements: () => apiClient.get('/faculty/announcements'),
  getSchedule: () => apiClient.get('/faculty/schedule'),
  // Gradebook (instructor of record only)
  getGradebookCourses: () => apiClient.get('/faculty/gradebook/courses'),
  getGradebook: (courseId) => apiClient.get(`/faculty/courses/${courseId}/gradebook`),
  saveScores: (courseId, scores) => apiClient.put(`/faculty/courses/${courseId}/gradebook/scores`, { scores }),
  publishGrades: (courseId, body = {}) => apiClient.post(`/faculty/courses/${courseId}/gradebook/publish`, body),
  saveGradingSettings: (courseId, body) => apiClient.put(`/faculty/courses/${courseId}/gradebook/settings`, body),
};
