import { apiClient } from './client.js';

/** Admin → Analytics (reports need the named analytics.view permission; the server decides). */
export const analyticsApi = {
  report: (section, params) => apiClient.get(`/admin/analytics/${section}`, { query: params }),
  pageDetail: (pageKey, params) => apiClient.get(`/admin/analytics/pages/${pageKey}`, { query: params }),
  refresh: () => apiClient.post('/admin/analytics/refresh', {}),
  setCollection: (enabled, noticeConfirmed = false) => apiClient.put('/admin/analytics/settings', { enabled, noticeConfirmed }),
  listAccess: () => apiClient.get('/admin/analytics/access'),
  setAccess: (userId, granted) => apiClient.put(`/admin/analytics/access/${userId}`, { granted }),
  live: () => apiClient.get('/admin/analytics/live'),
  concurrency: (window) => apiClient.get('/admin/analytics/concurrency', { query: { window } }),
  inactiveUsers: (params) => apiClient.get('/admin/analytics/inactive-users', { query: params }),
  setDemo: (enabled) => apiClient.put('/admin/analytics/demo', { enabled }),
  regenerateDemo: () => apiClient.post('/admin/analytics/demo/regenerate', {}),
};
