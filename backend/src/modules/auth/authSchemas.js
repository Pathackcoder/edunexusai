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
  // Institutional (SSO) sessions only: false signs out of EdunexusAI and leaves the university sign-in
  // (and other apps using it) open; true, the default, also ends the university sign-in everywhere.
  everywhere: z.boolean().optional(),
});

/** One password policy for every password EduNexusAI sets (admin-created, provisioned, changed). */
export const passwordPolicy = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(200)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/\d/, 'Password must contain a number.');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordPolicy,
});
