import { apiClient } from './client.js';

export const financeApi = {
  get: () => apiClient.get('/finance'),
  getPayments: () => apiClient.get('/finance/payments'),
  pay: ({ amount, methodType, methodDisplay }) =>
    apiClient.post('/finance/payments', { amount, methodType, methodDisplay }),
  /** Demo helper so the payment flow can be shown more than once. */
  reset: () => apiClient.post('/finance/reset'),
};

export const financialAidApi = {
  get: () => apiClient.get('/financial-aid'),
};
