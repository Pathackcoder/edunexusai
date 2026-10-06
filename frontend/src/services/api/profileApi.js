import { apiClient } from './client.js';

export const profileApi = {
  get: () => apiClient.get('/profile').then((data) => data.user),
  update: (payload) => apiClient.patch('/profile', payload).then((data) => data.user),

  getRequests: () => apiClient.get('/profile/requests'),
  requestAddressChange: (payload) => apiClient.post('/profile/address-change', payload),
  requestNameChange: (payload) => apiClient.post('/profile/name-change', payload),

  getCommunicationPreferences: () => apiClient.get('/profile/communication-preferences'),
  updateCommunicationPreferences: (preferences) =>
    apiClient.patch('/profile/communication-preferences', { preferences }),
};
