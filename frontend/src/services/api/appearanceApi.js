import { apiClient } from './client.js';

/** Institution portal appearance (theme + typography preset keys). */
export const appearanceApi = {
  get: () => apiClient.get('/appearance'),
  update: (body) => apiClient.put('/appearance', body),
};
