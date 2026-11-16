import { apiClient } from './client.js';

/**
 * View-As: read-only support access to a student's or faculty member's portal.
 * The admin-side calls run in the administrator's own tab; `current` and `end` run in the View-As tab itself.
 */
export const viewAsApi = {
  eligibility: (userId) => apiClient.get(`/admin/view-as/targets/${userId}`),
  start: ({ userId, persona, reason }) => apiClient.post('/admin/view-as/sessions', { userId, ...(persona ? { persona } : {}), reason }),
  mySessions: () => apiClient.get('/admin/view-as/sessions'),
  endSession: (id) => apiClient.post(`/admin/view-as/sessions/${id}/end`),
  current: () => apiClient.get('/view-as/current'),
  end: () => apiClient.delete('/view-as/current'),
};
