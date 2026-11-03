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

  /** Ends the session. Returns the institution's sign-out address when the session came from it. */
  // `everywhere` (institutional sign-in only): false leaves the university sign-in and other apps open.
  async logout({ everywhere = true } = {}) {
    try {
      const result = await apiClient.post('/auth/logout', { refreshToken: tokenStore.getRefreshToken() ?? undefined, everywhere });
      return result?.providerLogoutUrl ?? null;
    } catch {
      return null;
    } finally {
      tokenStore.clear();
    }
  },

  /** Replace the signed-in user's password (required after an administrator-issued one). */
  changePassword(currentPassword, newPassword) {
    return apiClient.post('/auth/password', { currentPassword, newPassword, refreshToken: tokenStore.getRefreshToken() ?? undefined });
  },

  hasSession: () => tokenStore.hasSession(),
};
