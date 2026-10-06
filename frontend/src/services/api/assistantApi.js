import { apiClient } from './client.js';

export const assistantApi = {
  history: () => apiClient.get('/assistant/messages'),
  ask: (message) => apiClient.post('/assistant/messages', { message }),
  clear: () => apiClient.delete('/assistant/messages'),
};

export const calendarSyncApi = {
  status: () => apiClient.get('/calendar-sync'),
  connect: (provider, email) => apiClient.post(`/calendar-sync/${provider}/connect`, email ? { email } : {}),
  sync: (provider) => apiClient.post(`/calendar-sync/${provider}/sync`),
  disconnect: (provider) => apiClient.delete(`/calendar-sync/${provider}`),
};
