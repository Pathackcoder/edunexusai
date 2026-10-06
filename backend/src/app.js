import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { apiV1 } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { openApiDocument } from './docs/openapi.js';
import { sendSuccess } from './utils/apiResponse.js';

/**
 * Express application. Kept separate from the listener in server.js so tests can mount
 * it on an ephemeral port without starting the real server.
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers. The API serves JSON plus the Swagger UI, so CSP is relaxed only
  // enough for swagger-ui's inline styles.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  /**
   * CORS is an explicit allow-list from the environment. Never `origin: '*'`, because
   * requests carry an Authorization header.
   */
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser callers (curl, tests) send no Origin header.
        if (!origin) return callback(null, true);
        if (env.cors.origins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );

  // Large enough for up to three 1 MB supporting documents sent as base64.
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (!env.isTest) {
    app.use(morgan(env.logLevel));
  }

  app.use('/api', apiRateLimiter);

  // Service index, so hitting the root tells a developer where to go.
  app.get('/', (_req, res) =>
    sendSuccess(res, {
      service: 'EdunexusAI API',
      version: '1.0.0',
      documentation: '/api-docs',
      health: '/api/v1/health',
      apiBase: '/api/v1',
    }),
  );

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'EdunexusAI API',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
  );
  app.get('/api-docs.json', (_req, res) => res.json(openApiDocument));

  app.use('/api/v1', apiV1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
