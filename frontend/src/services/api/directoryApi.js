import { apiClient } from './client.js';

export const directoryApi = {
  search: ({ search, type, department } = {}) =>
    apiClient.get('/directory', { query: { search, type, department } }),
};
