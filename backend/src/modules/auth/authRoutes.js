import { Router } from 'express';
import * as controller from './authController.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { loginRateLimiter } from '../../middleware/rateLimit.js';
import { changePasswordSchema, loginSchema, logoutSchema, refreshSchema } from './authSchemas.js';

export const authRoutes = Router();

authRoutes.post('/login', loginRateLimiter, validate({ body: loginSchema }), controller.login);
authRoutes.post('/refresh', validate({ body: refreshSchema }), controller.refresh);
authRoutes.get('/me', requireAuth, controller.me);
authRoutes.post('/logout', requireAuth, validate({ body: logoutSchema }), controller.logout);
authRoutes.post('/password', loginRateLimiter, requireAuth, validate({ body: changePasswordSchema.extend({ refreshToken: logoutSchema.shape.refreshToken }) }), controller.changePassword);
