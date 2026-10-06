import { app } from './app.js';
import { env } from './config/env.js';
import { checkDatabase, disconnect } from './db/prisma.js';
import { logger } from './utils/logger.js';

const server = app.listen(env.port, async () => {
  const database = await checkDatabase();
  logger.info(`EdunexusAI API listening on http://localhost:${env.port}`);
  logger.info(`  API base    http://localhost:${env.port}/api/v1`);
  logger.info(`  Swagger UI  http://localhost:${env.port}/api-docs`);
  logger.info(`  Health      http://localhost:${env.port}/api/v1/health`);
  logger.info(`  Database    ${database.connected ? 'connected' : 'NOT CONNECTED'}`);
  logger.info(`  Read mode   academics=${env.integrations.academicReadMode}`);
  if (!database.connected) {
    logger.error(
      'PostgreSQL is unreachable. Check DATABASE_URL and that the DBngin instance is running.',
    );
  }
});

/** Close connections cleanly so `node --watch` restarts do not leak them. */
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down.`);
  server.close(async () => {
    await disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});
