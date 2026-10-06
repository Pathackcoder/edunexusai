import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as authService from './authService.js';
import { buildCurrentUser } from '../users/sessionService.js';

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
  const user = await buildCurrentUser({ userId: req.auth.userId });
  return sendSuccess(res, { user });
});

export const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout({
    userId: req.auth.userId,
    refreshToken: req.body?.refreshToken,
  });
  return sendSuccess(res, result);
});
