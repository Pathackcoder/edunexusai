import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, onSessionExpired, ssoApi, tokenStore } from '../services/api';
import { clearSisProfile } from '../hooks/useSisProfile';
import { activeContextsOf, canIn, hasActiveContext, isMultiRole, unlinkedContextsOf, workspacesOf } from './roleContexts';
import { flushAnalytics } from '../analytics/index.js';

// Roles and record links can change while a tab is open (an administrator adds a role, a record is
// linked). The API applies such changes on the next request; the UI re-reads the session when the
// window regains focus, at most this often.
const SESSION_REFRESH_MS = 60_000;

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

  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (!tokenStore.hasSession() || Date.now() - last < SESSION_REFRESH_MS) return;
      last = Date.now();
      authApi.getCurrentUser().then(setUser, () => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // The API client tells us when a refresh failed, so the UI can drop to the login page.
  useEffect(() => onSessionExpired(() => { clearSisProfile(); setUser(null); }), []);

  const login = useCallback(async (email, password) => {
    setError(null);
    clearSisProfile();
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

  /** Finish an institutional sign-in: exchange the single-use code for the normal session. */
  const completeSsoSignIn = useCallback(async (code) => {
    setError(null);
    clearSisProfile();
    try {
      const authenticated = await ssoApi.exchange(code);
      setUser(authenticated);
      return { success: true, user: authenticated };
    } catch (caught) {
      return { success: false, error: caught?.message ?? 'Sign-in failed.' };
    }
  }, []);

  const logout = useCallback(async ({ everywhere = true } = {}) => {
    // Send any queued usage events while the session token still works.
    await flushAnalytics();
    const providerLogoutUrl = await authApi.logout({ everywhere });
    clearSisProfile();
    setUser(null);
    // Unless the person chose "EdunexusAI only", a university sign-in also ends there (and in the other apps).
    if (providerLogoutUrl) window.location.assign(providerLogoutUrl);
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
      completeSsoSignIn,
      logout,
      refreshUser: loadCurrentUser,

      // Persona and entitlement helpers. Components ask these questions instead of
      // inspecting an email address or hardcoding a name.
      roles,
      persona: user?.persona ?? null,
      // A student or faculty experience needs the role AND its verified record (an ACTIVE
      // context); a role whose record is not linked yet shows nothing of that experience.
      isStudent: hasActiveContext(user, 'student'),
      isFaculty: hasActiveContext(user, 'faculty'),
      isAdmin: roles.includes('ADMIN'),
      hasRole: (...allowed) => allowed.some((role) => roles.includes(role)),
      tier: user?.tier ?? null,
      entitlements,
      /** Is this widget enabled for the signed-in user's tier? */
      can: (widgetKey) => entitlements.includes(widgetKey),
      // Role contexts (one per community role with a verified record) and admin workspaces.
      contexts: activeContextsOf(user),
      unlinkedContexts: unlinkedContextsOf(user),
      workspaces: workspacesOf(user),
      isMultiRole: isMultiRole(user),
      hasContext: (key) => hasActiveContext(user, key),
      /** Is this widget offered in that context? Only the context's own entitlements count. */
      canIn: (contextKey, widgetKey) => canIn(user, contextKey, widgetKey),
    };
  }, [user, initialising, error, login, completeSsoSignIn, logout, loadCurrentUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
