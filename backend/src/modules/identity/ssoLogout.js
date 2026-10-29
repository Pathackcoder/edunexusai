import { logoutUrl } from './oidcClient.js';
import { clientSecretFor, enabledProvider } from './providerService.js';
import { endSsoSessions, idTokenHint } from './ssoSessions.js';

const appBase = () => (process.env.OIDC_REDIRECT_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

/** The provider's end-session address for an SSO session (null when it has none). */
export async function providerLogoutUrl(auth, { hint = null } = {}) {
  if (auth.signIn?.method !== 'SSO' || !auth.signIn.provider) return null;
  const provider = await enabledProvider(auth.tenantId, auth.signIn.provider);
  if (!provider) return null;
  return logoutUrl(provider, { postLogoutRedirectUri: `${appBase()}/login`, idTokenHint: hint, clientSecret: clientSecretFor(provider) });
}

/**
 * Portal logout of an institutional session: the session's sso_sessions row is ended (its tokens stop
 * working everywhere) and the provider's end-session address is returned with the ID token as
 * id_token_hint, so the provider signs the person out without a confirmation page.
 */
export async function endInstitutionalSession(auth, { everywhere = true } = {}) {
  if (auth.signIn?.method !== 'SSO') return null;
  const hint = everywhere ? await idTokenHint(auth.signIn.sid, auth.userId).catch(() => null) : null;
  if (auth.signIn.sid) await endSsoSessions({ id: auth.signIn.sid, userId: auth.userId }, everywhere ? 'PORTAL_LOGOUT' : 'PORTAL_LOGOUT_LOCAL');
  return everywhere ? providerLogoutUrl(auth, { hint }).catch(() => null) : null;
}
