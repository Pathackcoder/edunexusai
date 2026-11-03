import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as authService from './authService.js';
import { buildCurrentUser } from '../users/sessionService.js';
import { endInstitutionalSession } from '../identity/ssoLogout.js';

export const login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body);
  const user = await buildCurrentUser({ userId: session.userId });
  return sendSuccess(res, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenType: session.tokenType,
    expiresIn: session.expiresIn,
    user,
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const session = await authService.refresh(req.body);
  return sendSuccess(res, session);
});

export const me = asyncHandler(async (req, res) => {
  const user = await buildCurrentUser({ userId: req.auth.userId, signIn: req.auth.signIn });
  return sendSuccess(res, { user });
});

export const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout({
    userId: req.auth.userId,
    refreshToken: req.body?.refreshToken,
  });
  // An institutional session ends here in every case; unless the person chose "EdunexusAI only", it also
  // ends at the provider (RP-initiated logout, which signs out the other apps too); the app follows this URL.
  const providerLogoutUrl = await endInstitutionalSession(req.auth, { everywhere: req.body?.everywhere !== false }).catch(() => null);
  return sendSuccess(res, { ...result, providerLogoutUrl });
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword({ userId: req.auth.userId, ...req.body });
  return sendSuccess(res, result);
});
