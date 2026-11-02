import { apiClient, tokenStore } from './client.js';

/**
 * Institutional sign-in (OpenID Connect). The browser goes to the provider through the API's start
 * address (a full-page navigation); the API returns to /auth/sso/complete with a single-use code,
 * which is exchanged here for the same session a password sign-in produces.
 */
export const ssoApi = {
  providers: (tenant) => apiClient.get('/auth/oidc/providers', { query: tenant ? { tenant } : undefined, auth: false }),
  startUrl: (tenant, key, returnTo = '/dashboard') => `${apiClient.baseUrl}/auth/oidc/${encodeURIComponent(tenant)}/${encodeURIComponent(key)}/start?returnTo=${encodeURIComponent(returnTo)}`,
  async exchange(code) {
    const data = await apiClient.post('/auth/oidc/exchange', { code }, { auth: false });
    tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.user;
  },
};

/** Messages for the reason codes the API puts on /login?sso_error=… (no identity details). */
export const SSO_ERROR_MESSAGES = {
  NO_INSTITUTIONAL_ID: 'Your university account did not include an institutional ID, so it cannot be matched to a portal account. Contact the help desk.',
  NO_MATCHING_RECORD: 'We could not find a portal account for your university record. Contact the registrar or help desk to be set up.',
  AMBIGUOUS_RECORDS: 'Your university identifiers point to more than one portal account. The help desk needs to resolve this before you can sign in.',
  EVIDENCE_MISMATCH: 'Your university details do not match the portal account for your record. Contact the help desk.',
  EMAIL_NOT_VERIFIED: 'Your university account’s email address is not verified yet.',
  ACCOUNT_DISABLED: 'This portal account is not active. Contact the help desk.',
  ACCOUNT_LINKED_TO_ANOTHER_IDENTITY: 'This portal account is already linked to a different university sign-in. Contact the help desk.',
  IDENTITY_BELONGS_ELSEWHERE: 'This university sign-in belongs to a different institution or sign-in option.',
  NO_ACCESS: 'Your university account does not currently give you access to this portal.',
  NO_ELIGIBLE_RECORD: 'Your university records are not currently active, so no portal account was created. Contact the registrar.',
  EMAIL_IN_USE: 'A portal account already uses your university email address. The help desk needs to link it to your university sign-in.',
  RECORD_ALREADY_LINKED: 'Your university record is already linked to another portal account. Contact the help desk.',
  JIT_NOT_PERMITTED: 'Your portal account could not be created automatically. Contact the help desk to be set up.',
  SIS_UNAVAILABLE: 'The student information system is not responding, so your portal account could not be set up. Please try again shortly.',
  CANCELLED: 'Sign-in was cancelled.',
  EXPIRED: 'The sign-in took too long. Please try again.',
  INVALID_REQUEST: 'The sign-in could not be completed. Please start again.',
  UNKNOWN_PROVIDER: 'That sign-in option is not available.',
  PROVIDER_UNAVAILABLE: 'Your university’s sign-in service is not responding right now. Please try again, or use your portal password.',
  PROVIDER_ERROR: 'Your university’s sign-in service reported an error.',
  VERIFICATION_FAILED: 'The sign-in response could not be verified, so you were not signed in.',
  SIGN_IN_FAILED: 'Sign-in failed. Please try again.',
};
