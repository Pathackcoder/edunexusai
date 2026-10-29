import { apiClient } from './client.js';

/**
 * Feddrick CMS, always through the EduNexusAI API (the browser never talks to the CMS and
 * never holds a CMS token). Content = published items for the signed-in user's audiences;
 * Studio = ADMIN-only editing.
 */
export const contentApi = {
  pages: (query) => apiClient.get('/content/pages', { query }),
  page: (slug) => apiClient.get(`/content/pages/${encodeURIComponent(slug)}`),
  dashboardLayout: (persona) => apiClient.get(`/content/dashboard-layouts/${persona}`),
  announcements: (query) => apiClient.get('/content/announcements', { query }),
  faqs: (query) => apiClient.get('/content/faqs', { query }),
  form: (id) => apiClient.get(`/content/forms/${encodeURIComponent(id)}`),
  submitForm: (id, body) => apiClient.post(`/content/forms/${encodeURIComponent(id)}/submissions`, body),
};

const S = '/studio';
export const studioApi = {
  meta: () => apiClient.get(`${S}/meta`),
  audit: () => apiClient.get(`${S}/audit`),
  list: (type, query) => apiClient.get(`${S}/${type}`, { query }),
  get: (type, id) => apiClient.get(`${S}/${type}/${encodeURIComponent(id)}`),
  create: (type, body) => apiClient.post(`${S}/${type}`, body),
  update: (type, id, body) => apiClient.put(`${S}/${type}/${encodeURIComponent(id)}`, body),
  remove: (type, id) => apiClient.delete(`${S}/${type}/${encodeURIComponent(id)}`),
  action: (type, id, action) => apiClient.post(`${S}/${type}/${encodeURIComponent(id)}/${action}`),
  dashboard: (persona) => apiClient.get(`${S}/dashboards/${persona}`),
  saveDashboard: (persona, layout) => apiClient.put(`${S}/dashboards/${persona}`, { layout }),
  dashboardAction: (persona, action) => apiClient.post(`${S}/dashboards/${persona}/${action}`),
  removeDashboard: (persona) => apiClient.delete(`${S}/dashboards/${persona}`),
  media: () => apiClient.get(`${S}/media`),
  uploadMedia: (body) => apiClient.post(`${S}/media`, body),
  schedule: (type, id) => apiClient.get(`${S}/${type}/${encodeURIComponent(id)}/schedule`),
  setSchedule: (type, id, body) => apiClient.put(`${S}/${type}/${encodeURIComponent(id)}/schedule`, body),
  testFormSubmission: (id, values) => apiClient.post(`${S}/form/${encodeURIComponent(id)}/test-submission`, { values }),
};
