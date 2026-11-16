import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { currentViewAs, viewAsReadOnlyError } from '../modules/viewAs/viewAsContext.js';
import { logger } from '../utils/logger.js';

/**
 * View-As write guard. Inside a View-As request (an administrator viewing someone's portal, read-only) no query may
 * change data, whatever the route's HTTP method: a GET that would mark something read, stamp a "last opened" time or
 * create a default row is refused here instead. Outside View-As this adds one context lookup per write and nothing
 * else. The View-As module's own bookkeeping runs outside the context (viewAsContext.outsideViewAs).
 */
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany']);
const WRITING_SQL = /\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|copy|call|do)\b/i;
const sqlText = (args) => {
  const [first] = Array.isArray(args) ? args : [args];
  if (typeof first === 'string') return first;
  if (first?.strings) return first.strings.join(' ');
  if (Array.isArray(first)) return first.join(' ');
  return String(first?.sql ?? first?.text ?? '');
};
const refuse = (what) => {
  logger.warn('View-As write refused', { what, sessionId: currentViewAs()?.sessionId });
  throw viewAsReadOnlyError(what);
};

export const viewAsWriteGuard = {
  name: 'view-as-write-guard',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (WRITE_OPERATIONS.has(operation) && currentViewAs()) refuse(`${model}.${operation}`);
        return query(args);
      },
    },
    async $executeRaw({ args, query }) {
      if (currentViewAs()) refuse('$executeRaw');
      return query(args);
    },
    async $executeRawUnsafe({ args, query }) {
      if (currentViewAs()) refuse('$executeRawUnsafe');
      return query(args);
    },
    async $queryRaw({ args, query }) {
      if (currentViewAs() && WRITING_SQL.test(sqlText(args))) refuse('$queryRaw');
      return query(args);
    },
    async $queryRawUnsafe({ args, query }) {
      if (currentViewAs() && WRITING_SQL.test(sqlText(args))) refuse('$queryRawUnsafe');
      return query(args);
    },
  },
};

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
  }).$extends(viewAsWriteGuard);

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
