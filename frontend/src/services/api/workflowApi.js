import { apiClient, tokenStore } from './client.js';

/** Requests, help desk tickets, forms, resources and attachments (requester side). */
export const workflowApi = {
  requestTypes: () => apiClient.get('/requests/types'),
  listRequests: () => apiClient.get('/requests', { demoLatency: true }),
  getRequest: (id) => apiClient.get(`/requests/${id}`),
  createRequest: (payload) => apiClient.post('/requests', payload),
  respondToRequest: (id, payload) => apiClient.post(`/requests/${id}/respond`, payload),
  cancelRequest: (id) => apiClient.post(`/requests/${id}/cancel`),

  listTickets: () => apiClient.get('/support/tickets', { demoLatency: true }),
  getTicket: (id) => apiClient.get(`/support/tickets/${id}`),
  createTicket: (payload) => apiClient.post('/support/tickets', payload),
  replyToTicket: (id, body) => apiClient.post(`/support/tickets/${id}/messages`, { body }),
  setTicketStatus: (id, status, note) => apiClient.patch(`/support/tickets/${id}/status`, { status, note }),

  listForms: () => apiClient.get('/forms'),
  submitForm: (id, answers) => apiClient.post(`/forms/${id}/submissions`, { answers }),

  listResources: (params) => apiClient.get('/resources', { query: params }),
  openResource: (id) => apiClient.get(`/resources/${id}`),
  listManagedResources: () => apiClient.get('/resources/manage', { demoLatency: true }),
  createResource: (payload) => apiClient.post('/resources', payload),
  updateResource: (id, payload) => apiClient.patch(`/resources/${id}`, payload),

  /** Authenticated download: fetch as a blob and hand it to the browser. */
  async downloadAttachment(file) {
    const response = await fetch(`${apiClient.baseUrl}/attachments/${file.id}`, {
      headers: { Authorization: `Bearer ${tokenStore.getAccessToken()}` },
    });
    if (!response.ok) throw new Error('Could not download the attachment.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
