import { apiClient } from './client.js';

/** Advising appointments and intervention (follow-up) flags. */
export const advisingApi = {
  advisors: () => apiClient.get('/advising/advisors'),
  slots: (advisorId) => apiClient.get('/advising/slots', { query: { advisorId } }),
  appointments: () => apiClient.get('/advising/appointments'),
  book: (payload) => apiClient.post('/advising/appointments', payload),
  reschedule: (id, slotId) => apiClient.post(`/advising/appointments/${id}/reschedule`, { slotId }),
  setStatus: (id, status) => apiClient.patch(`/advising/appointments/${id}/status`, { status }),
  mySlots: () => apiClient.get('/advising/my-slots'),
  createSlots: (payload) => apiClient.post('/advising/slots', payload),
  deleteSlot: (id) => apiClient.delete(`/advising/slots/${id}`),
};

export const interventionApi = {
  list: (status) => apiClient.get('/interventions', { query: { status } }),
  students: () => apiClient.get('/interventions/students'),
  create: (payload) => apiClient.post('/interventions', payload),
  update: (id, payload) => apiClient.patch(`/interventions/${id}`, payload),
};
