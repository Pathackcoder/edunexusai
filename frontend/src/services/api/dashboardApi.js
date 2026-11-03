import { apiClient } from './client.js';

/** One call returns the whole dashboard for whichever persona is signed in. */
export const dashboardApi = {
  get: () => apiClient.get('/dashboard', { demoLatency: true }),
  /** The caller's own student dashboard (student context), also for people who teach. */
  getStudent: () => apiClient.get('/dashboard/student', { demoLatency: true }),
  /** Per-user widget order for drag-and-drop dashboards ("student" | "faculty"). */
  getLayout: (key) => apiClient.get(`/dashboard/layout/${key}`),
  saveLayout: (key, order) => apiClient.put(`/dashboard/layout/${key}`, { order }),
  resetLayout: (key) => apiClient.delete(`/dashboard/layout/${key}`),
};
