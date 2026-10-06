import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { checkDatabase } from '../../db/prisma.js';
import { env } from '../../config/env.js';

export const healthRoutes = Router();

/**
 * Liveness + database readiness. Unauthenticated on purpose: this is what a load
 * balancer or a developer checks first, and it must answer before anything else works.
 */
healthRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const database = await checkDatabase();
    const status = database.connected ? 'ok' : 'degraded';
    return res.status(database.connected ? 200 : 503).json({
      status,
      database: database.connected ? 'connected' : 'disconnected',
      ...(database.connected ? {} : { databaseError: 'Unable to reach PostgreSQL.' }),
      service: 'edunexusai-api',
      version: '1.0.0',
      environment: env.nodeEnv,
      academicReadMode: env.integrations.academicReadMode,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }),
);
