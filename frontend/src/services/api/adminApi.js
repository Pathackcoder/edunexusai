import { apiClient } from './client.js';

export const adminApi = {
  getDashboard: () => apiClient.get('/admin/dashboard', { demoLatency: true }),

  listUsers: (params) => apiClient.get('/admin/users', { query: params }),
  getUser: (id) => apiClient.get(`/admin/users/${id}`),
  createUser: (payload) => apiClient.post('/admin/users', payload),
  /** Onboarding across EduNexusAI, CampusCore and Moodle (see backend modules/people). */
  lookupPerson: (body) => apiClient.post('/admin/people/lookup', body),
  onboardPerson: (body) => apiClient.post('/admin/people', body),
  personSystems: (userId) => apiClient.get(`/admin/people/${userId}/systems`),
  updateUser: (id, payload) => apiClient.patch(`/admin/users/${id}`, payload),
  // One account's access: roles (with records, links and sources), contexts, sign-in identities.
  getAccess: (id) => apiClient.get(`/admin/users/${id}/access`),
  addRole: (id, body) => apiClient.post(`/admin/users/${id}/roles`, body),
  removeRole: (id, role) => apiClient.post(`/admin/users/${id}/roles/${role}/remove`, { confirm: true }),
  linkRecord: (id, body) => apiClient.post(`/admin/users/${id}/relationships`, body),
  unlinkSignIn: (id, identityId) => apiClient.delete(`/admin/users/${id}/sign-in-identities/${identityId}`),
  linkSignIn: (id, body) => apiClient.post(`/admin/users/${id}/sign-in-identities`, body),
  // Institutional sign-in: identity providers and their role-mapping rules (no secrets).
  listIdentityProviders: () => apiClient.get('/admin/identity-providers'),
  createIdentityProvider: (body) => apiClient.post('/admin/identity-providers', body),
  updateIdentityProvider: (id, body) => apiClient.patch(`/admin/identity-providers/${id}`, body),
  testIdentityProvider: (id) => apiClient.post(`/admin/identity-providers/${id}/test`),
  listMappings: (id) => apiClient.get(`/admin/identity-providers/${id}/mappings`),
  createMapping: (id, body) => apiClient.post(`/admin/identity-providers/${id}/mappings`, body),
  updateMapping: (id, mappingId, body) => apiClient.patch(`/admin/identity-providers/${id}/mappings/${mappingId}`, body),
  deleteMapping: (id, mappingId) => apiClient.delete(`/admin/identity-providers/${id}/mappings/${mappingId}`),
  previewMapping: (id, claims) => apiClient.post(`/admin/identity-providers/${id}/preview`, { claims }),

  listRoles: () => apiClient.get('/admin/roles'),
  listTiers: () => apiClient.get('/admin/student-tiers'),

  getEntitlements: () => apiClient.get('/admin/widget-entitlements'),
  updateEntitlements: (updates) => apiClient.patch('/admin/widget-entitlements', { updates }),

  listIntegrations: () => apiClient.get('/admin/integrations'),
  listProviders: () => apiClient.get('/admin/integrations/providers'),
  getIntegration: (id) => apiClient.get(`/admin/integrations/${id}`),
  createIntegration: (payload) => apiClient.post('/admin/integrations', payload),
  updateIntegration: (id, payload) => apiClient.patch(`/admin/integrations/${id}`, payload),
  testIntegration: (id) => apiClient.post(`/admin/integrations/${id}/test`),
  syncIntegration: (id) => apiClient.post(`/admin/integrations/${id}/sync`),
  getIntegrationHealth: (id) => apiClient.get(`/admin/integrations/${id}/health`),
  getIntegrationLogs: (id, limit = 25) =>
    apiClient.get(`/admin/integrations/${id}/logs`, { query: { limit } }),
};

/** Operations workspace: the admin side of every cross-persona workflow. */
export const adminOpsApi = {
  listRequests: (params) => apiClient.get('/admin/requests', { query: params, demoLatency: true }),
  decideRequest: (id, status, note) => apiClient.patch(`/admin/requests/${id}/decision`, { status, note }),
  listTickets: (params) => apiClient.get('/admin/tickets', { query: params }),
  listForms: () => apiClient.get('/admin/forms'),
  createForm: (payload) => apiClient.post('/admin/forms', payload),
  setFormStatus: (id, status) => apiClient.patch(`/admin/forms/${id}/status`, { status }),
  listSubmissions: (formId) => apiClient.get(`/admin/forms/${formId}/submissions`),
  reviewSubmission: (id, status, note) => apiClient.patch(`/admin/form-submissions/${id}/review`, { status, note }),
  listBroadcasts: () => apiClient.get('/admin/broadcasts', { demoLatency: true }),
  previewAudience: (payload) => apiClient.post('/admin/broadcasts/preview', payload),
  saveBroadcast: (payload, id) => (id ? apiClient.patch(`/admin/broadcasts/${id}`, payload) : apiClient.post('/admin/broadcasts', payload)),
  deleteBroadcast: (id) => apiClient.delete(`/admin/broadcasts/${id}`),
  audit: (limit = 20) => apiClient.get('/admin/audit', { query: { limit }, demoLatency: true }),
  interventions: (status) => apiClient.get('/admin/interventions', { query: { status } }),
};
