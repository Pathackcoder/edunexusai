import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../utils/errors.js';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/** 404 for unmatched routes, so the frontend never receives Express' HTML page. */
export function notFoundHandler(req, res) {
  return sendError(res, {
    status: 404,
    code: ErrorCode.RESOURCE_NOT_FOUND,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Single exit point for every failure. Translates known error shapes into the standard
 * envelope and never leaks a stack trace or SQL detail to the client.
 */
export function errorHandler(error, req, res, _next) {
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error(error.message, { path: req.originalUrl });
    return sendError(res, {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (error instanceof ZodError) {
    return sendError(res, {
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed.',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return sendError(res, {
        status: 409,
        code: ErrorCode.CONFLICT,
        message: 'A record with these details already exists.',
        details: { fields: error.meta?.target ?? [] },
      });
    }
    if (error.code === 'P2025') {
      return sendError(res, {
        status: 404,
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: 'Resource not found.',
      });
    }
    logger.error('Database request failed', { prismaCode: error.code, path: req.originalUrl });
    return sendError(res, {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'A database error occurred.',
    });
  }

  if (error?.type === 'entity.parse.failed') {
    return sendError(res, {
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request body is not valid JSON.',
    });
  }

  logger.error(`Unhandled error: ${error?.message ?? 'unknown'}`, {
    path: req.originalUrl,
    stack: env.isProduction ? undefined : error?.stack,
  });

  return sendError(res, {
    status: 500,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred. Please try again.',
  });
}
