import { apiClient } from './client.js';

/** One call returns the whole dashboard for whichever persona is signed in. */
export const dashboardApi = {
  get: () => apiClient.get('/dashboard', { demoLatency: true }),
  /** Per-user widget order for drag-and-drop dashboards ("student" | "faculty"). */
  getLayout: (key) => apiClient.get(`/dashboard/layout/${key}`),
  saveLayout: (key, order) => apiClient.put(`/dashboard/layout/${key}`, { order }),
  resetLayout: (key) => apiClient.delete(`/dashboard/layout/${key}`),
};
