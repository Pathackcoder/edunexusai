import { apiClient } from './client.js';

/**
 * Academics. Courses, schedule, assignments, grades, announcements, calendar and
 * transcripts. Course and assignment records are provider-owned and arrive with a
 * `dataSource` block naming the system of record.
 */
export const academicApi = {
  getCourses: () => apiClient.get('/courses'),
  getCourse: (id) => apiClient.get(`/courses/${id}`),
  getSchedule: () => apiClient.get('/schedule'),

  getAssignments: () => apiClient.get('/assignments'),
  submitAssignment: (id, payload) => apiClient.post(`/assignments/${id}/submit`, payload ?? {}),

  getGrades: () => apiClient.get('/grades'),

  getAnnouncements: () => apiClient.get('/announcements'),
  markAnnouncementRead: (id) => apiClient.patch(`/announcements/${id}/read`),

  getCalendar: (category) => apiClient.get('/calendar', { query: { category } }),

  getTranscript: () => apiClient.get('/transcripts'),
  getTranscriptRequests: () => apiClient.get('/transcript-requests'),
  createTranscriptRequest: (payload) => apiClient.post('/transcript-requests', payload),

  getLms: () => apiClient.get('/academics/lms'),
};
