import { apiClient } from './client.js';

/**
 * The public (signed-out) site: /api/v1/public only, never with a token. The institution comes from
 * the deployment (VITE_PUBLIC_TENANT), as the login page's sign-in options do.
 */
export const PUBLIC_TENANT = import.meta.env?.VITE_PUBLIC_TENANT || 'demo-university';

export const publicApi = {
  home: (tenant) => apiClient.get(`/public/${encodeURIComponent(tenant)}/home`, { auth: false }),
  page: (tenant, slug) => apiClient.get(`/public/${encodeURIComponent(tenant)}/pages/${encodeURIComponent(slug)}`, { auth: false }),
};
