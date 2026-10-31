import { apiClient } from './client.js';

export const directoryApi = {
  search: ({ search, type, department } = {}) =>
    apiClient.get('/directory', { query: { search, type, department } }),
  // Campus Directory: the institution's identity provider, searched and paged by the backend.
  campus: ({ search, page, pageSize } = {}) =>
    apiClient.get('/campus/directory', { query: { search, page, pageSize } }),
};
