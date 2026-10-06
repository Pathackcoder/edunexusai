/**
 * Runs once before the suite (`npm run pretest`): applies migrations to the test
 * database and seeds it. Keeping this out of the test files means the eight test
 * processes do not each re-seed, and cannot race each other while doing it.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is not set. Copy .env.example to .env.');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'test' };
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: BACKEND_ROOT, env, stdio: 'inherit', encoding: 'utf8' });

console.log('Preparing the test database…');
run('npx', ['prisma', 'migrate', 'deploy']);
run('node', ['prisma/seed.js']);
console.log('Test database ready.\n');
