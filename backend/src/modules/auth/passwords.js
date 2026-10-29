import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Password storage for EduNexusAI login accounts: always bcrypt.
 *
 * A development-only plaintext mode existed briefly. Rows written in that period are still
 * accepted at login (so nobody is locked out) and are re-hashed on that successful login;
 * `npm run passwords:hash-plaintext` hashes any that remain without waiting for a login.
 * The column keeps its name (`passwordHash`); renaming it would be a destructive migration.
 */

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export const isBcryptHash = (stored) => typeof stored === 'string' && BCRYPT_HASH.test(stored);

/** The value to store in users.passwordHash for a new or changed password. */
export async function hashPassword(password) {
  return bcrypt.hash(password, env.bcryptRounds);
}

/** Compare a submitted password with the stored value (a bcrypt hash, or a legacy plaintext row). */
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  if (isBcryptHash(stored)) return bcrypt.compare(password, stored);
  const a = crypto.createHash('sha256').update(String(password)).digest();
  const b = crypto.createHash('sha256').update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}

/** True for a legacy plaintext row, which is re-hashed after the next successful login. */
export const needsRehash = (stored) => !isBcryptHash(stored);

/** Keeps a failed lookup about as slow as a real comparison, so accounts cannot be enumerated. */
export async function burnComparison(password) {
  await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
}

/** A random temporary password that satisfies both EduNexusAI's and Moodle's default policies. */
export function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${body}aA7#`;
}
