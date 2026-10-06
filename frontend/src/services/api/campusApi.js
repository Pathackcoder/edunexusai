import { apiClient } from './client.js';

export const campusApi = {
  getSafety: () => apiClient.get('/campus-safety'),
  getMap: () => apiClient.get('/campus/map'),
  getClassrooms: (params) => apiClient.get('/campus/classrooms', { query: params }),
};

export const supportApi = {
  getHelp: () => apiClient.get('/help'),
};
