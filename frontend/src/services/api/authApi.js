import { apiClient, tokenStore } from './client.js';

/** Authentication and session. */
export const authApi = {
  async login(email, password) {
    const data = await apiClient.post('/auth/login', { email, password }, { auth: false });
    tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.user;
  },

  getCurrentUser() {
    return apiClient.get('/auth/me').then((data) => data.user);
  },

  async logout() {
    try {
      await apiClient.post('/auth/logout', { refreshToken: tokenStore.getRefreshToken() ?? undefined });
    } finally {
      tokenStore.clear();
    }
  },

  hasSession: () => tokenStore.hasSession(),
};
