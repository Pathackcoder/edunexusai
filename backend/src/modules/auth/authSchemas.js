import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').max(255),
  password: z.string().min(1, 'Password is required.').max(200),
  tenantSlug: z.string().trim().min(1).max(100).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'A refresh token is required.'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});
