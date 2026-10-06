import { apiClient } from './client.js';

export const careerApi = {
  opportunities: (params) => apiClient.get('/career/opportunities', { query: params }),
  setOpportunityStatus: (id, status) => apiClient.put(`/career/opportunities/${id}/status`, { status }),

  portfolio: () => apiClient.get('/career/portfolio'),
  addPortfolioItem: (payload) => apiClient.post('/career/portfolio', payload),
  updatePortfolioItem: (id, payload) => apiClient.patch(`/career/portfolio/${id}`, payload),
  deletePortfolioItem: (id) => apiClient.delete(`/career/portfolio/${id}`),

  groups: () => apiClient.get('/career/groups'),
  joinGroup: (id) => apiClient.post(`/career/groups/${id}/join`),
  leaveGroup: (id) => apiClient.post(`/career/groups/${id}/leave`),
  decideMembership: (id, membershipId, approve) => apiClient.post(`/career/groups/${id}/members/${membershipId}`, { approve }),
  createGroupEvent: (id, payload) => apiClient.post(`/career/groups/${id}/events`, payload),

  achievements: () => apiClient.get('/career/achievements'),
};
