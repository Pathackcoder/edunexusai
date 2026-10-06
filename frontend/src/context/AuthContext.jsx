import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, onSessionExpired, tokenStore } from '../services/api';

const AuthContext = createContext(null);

/**
 * Session state.
 *
 * Before: a boolean in localStorage, credentials compared in the browser, and the "user"
 * read from a dummy module.
 * Now: credentials are verified by the backend, the session is a JWT, and the user —
 * including roles, tier and widget entitlements — comes from GET /auth/me.
 *
 * `initialising` matters: on a reload there is a token but no user yet, and routing must
 * wait for /auth/me rather than bouncing a signed-in user to the login screen.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initialising, setInitialising] = useState(() => tokenStore.hasSession());
  const [error, setError] = useState(null);

  const loadCurrentUser = useCallback(async () => {
    if (!tokenStore.hasSession()) {
      setUser(null);
      setInitialising(false);
      return null;
    }
    try {
      const current = await authApi.getCurrentUser();
      setUser(current);
      return current;
    } catch (caught) {
      // A token that no longer resolves is not a session.
      if (caught?.isAuthError) tokenStore.clear();
      setUser(null);
      setError(caught?.isAuthError ? null : caught);
      return null;
    } finally {
      setInitialising(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  // The API client tells us when a refresh failed, so the UI can drop to the login page.
  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const authenticated = await authApi.login(email, password);
      setUser(authenticated);
      return { success: true, user: authenticated };
    } catch (caught) {
      return {
        success: false,
        error: caught?.message ?? 'Sign-in failed. Please try again.',
        code: caught?.code,
      };
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const roles = user?.roles ?? [];
    const entitlements = user?.entitlements ?? [];
    return {
      user,
      isAuthenticated: Boolean(user),
      initialising,
      error,
      login,
      logout,
      refreshUser: loadCurrentUser,

      // Persona and entitlement helpers. Components ask these questions instead of
      // inspecting an email address or hardcoding a name.
      roles,
      persona: user?.persona ?? null,
      isStudent: roles.includes('STUDENT'),
      isFaculty: roles.includes('FACULTY'),
      isAdmin: roles.includes('ADMIN'),
      hasRole: (...allowed) => allowed.some((role) => roles.includes(role)),
      tier: user?.tier ?? null,
      entitlements,
      /** Is this widget enabled for the signed-in user's tier? */
      can: (widgetKey) => entitlements.includes(widgetKey),
    };
  }, [user, initialising, error, login, logout, loadCurrentUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
