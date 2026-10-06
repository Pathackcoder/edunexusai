import { apiClient } from './client.js';

export const planningApi = {
  degreeProgress: () => apiClient.get('/planning/degree-progress'),
  recommendations: () => apiClient.get('/planning/recommendations'),
  savePreferences: (payload) => apiClient.put('/planning/preferences', payload),
  learningPaths: () => apiClient.get('/planning/learning-paths'),
  activatePath: (id) => apiClient.post(`/planning/learning-paths/${id}/activate`),
  setStepStatus: (id, status) => apiClient.put(`/planning/learning-steps/${id}`, { status }),
  insights: () => apiClient.get('/planning/insights'),
};
