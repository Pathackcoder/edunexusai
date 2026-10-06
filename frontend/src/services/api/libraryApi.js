import { apiClient } from './client.js';

export const libraryApi = {
  get: () => apiClient.get('/library'),
  renewLoan: (loanId) => apiClient.post(`/library/loans/${loanId}/renew`),
};
