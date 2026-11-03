import { apiClient } from './client.js';

/** Institution portal appearance (theme + typography preset keys, and the institution's logo). */
export const appearanceApi = {
  get: () => apiClient.get('/appearance'),
  update: (body) => apiClient.put('/appearance', body),
  // The institution logo (administrators): upload or replace it, or go back to the bundled default.
  uploadLogo: (dataBase64) => apiClient.put('/appearance/logo', { dataBase64 }),
  resetLogo: () => apiClient.delete('/appearance/logo'),
};
