import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ErrorCode } from '../utils/errors.js';

/** Brute-force guard on the credential endpoint. Disabled under tests. */
export const loginRateLimiter = rateLimit({
  windowMs: env.rateLimit.loginWindowMs,
  max: env.isTest ? 10_000 : env.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    },
  },
});

/** Light global ceiling so a runaway client cannot saturate the dev server. */
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: env.isTest ? 100_000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests. Please slow down.' },
  },
});
