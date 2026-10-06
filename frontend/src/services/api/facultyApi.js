import { apiClient } from './client.js';

export const facultyApi = {
  getDashboard: () => apiClient.get('/faculty/dashboard'),
  getCourses: () => apiClient.get('/faculty/courses'),
  getRoster: (courseId) => apiClient.get(`/faculty/courses/${courseId}/students`),
  sendClassNotification: (courseId, payload) =>
    apiClient.post(`/faculty/courses/${courseId}/notifications`, payload),
  postAnnouncement: (courseId, payload) =>
    apiClient.post(`/faculty/courses/${courseId}/announcements`, payload),
  getAnnouncements: () => apiClient.get('/faculty/announcements'),
  getSchedule: () => apiClient.get('/faculty/schedule'),
};
