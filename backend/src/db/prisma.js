import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Single Prisma instance for the process. Reused across hot reloads so `node --watch`
 * does not exhaust the connection pool.
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__edunexusPrisma ??
  new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
    log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProduction) globalForPrisma.__edunexusPrisma = prisma;

/** Used by GET /api/v1/health. */
export async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (error) {
    return { connected: false, message: error.message };
  }
}

export async function disconnect() {
  await prisma.$disconnect();
}
