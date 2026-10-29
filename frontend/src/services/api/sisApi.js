import { apiClient } from './client.js';

/**
 * CampusCore SIS, through the EduNexusAI backend. Credentials and tokens never reach the
 * browser; the backend resolves the signed-in user's SIS identity itself.
 */
export const sisApi = {
  myProfile: () => apiClient.get('/sis/me/profile'),
  myOverview: (termId) => apiClient.get('/sis/me/overview', { query: termId ? { termId } : undefined }),
  calendar: (query) => apiClient.get('/sis/calendar', { query }),
  sections: (query) => apiClient.get('/sis/sections', { query }),
  facultyTeaching: () => apiClient.get('/sis/faculty/teaching'),
  facultyRoster: (sectionId) => apiClient.get(`/sis/faculty/sections/${encodeURIComponent(sectionId)}/roster`),
};

const ADMIN = '/sis/admin';
export const sisAdminApi = {
  health: () => apiClient.get(`${ADMIN}/health`),
  capabilities: () => apiClient.get(`${ADMIN}/capabilities`),
  setWritePreferences: (body) => apiClient.put(`${ADMIN}/write-preferences`, body),
  reference: () => apiClient.get(`${ADMIN}/reference`),
  students: (query) => apiClient.get(`${ADMIN}/students`, { query }),
  faculty: (query) => apiClient.get(`${ADMIN}/faculty`, { query }),
  provisionAccount: (body) => apiClient.post(`${ADMIN}/accounts`, body),
  student: (sisId) => apiClient.get(`${ADMIN}/students/${encodeURIComponent(sisId)}`),
  studentAudit: (sisId) => apiClient.get(`${ADMIN}/students/${encodeURIComponent(sisId)}/audit`),
  createStudent: (idempotencyKey, student) => apiClient.post(`${ADMIN}/students`, { idempotencyKey, student }),
  updateStudent: (sisId, etag, changes) => apiClient.patch(`${ADMIN}/students/${encodeURIComponent(sisId)}`, { etag, changes }),
  deactivateStudent: (sisId, body) => apiClient.post(`${ADMIN}/students/${encodeURIComponent(sisId)}/deactivate`, body),
  reconcile: (recordType) => apiClient.post(`${ADMIN}/identity/reconcile`, { recordType }),
  links: (query) => apiClient.get(`${ADMIN}/identity/links`, { query }),
  link: (body) => apiClient.post(`${ADMIN}/identity/links`, body),
  revokeLink: (linkId, body) => apiClient.post(`${ADMIN}/identity/links/${encodeURIComponent(linkId)}/revoke`, body),
};
