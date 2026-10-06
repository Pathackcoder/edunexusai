import { prisma } from '../db/prisma.js';
import { createConnector, getMapper, listProviders } from './registry.js';
import { hasCredential } from '../config/env.js';
import { AppError, ErrorCode, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Integration service — the only thing domain services are allowed to talk to when they
 * need external data.
 *
 *   Domain service -> IntegrationService -> Connector -> External system
 *                                        -> Canonical mapper -> canonical records
 *
 * Responsibilities:
 *   - resolve which integration serves a domain for a tenant
 *   - run the call, time it, and record health + a sync log row
 *   - never leak a credential or a provider field name upward
 */

export const SyncDomain = {
  COURSES: 'COURSES',
  ENROLLMENTS: 'ENROLLMENTS',
  ASSIGNMENTS: 'ASSIGNMENTS',
  GRADES: 'GRADES',
  FINANCIAL_AID: 'FINANCIAL_AID',
  SCHEDULE: 'SCHEDULE',
  STUDENTS: 'STUDENTS',
};

/** Strip secrets and internal columns before an integration row leaves the backend. */
export function presentIntegration(row) {
  return {
    id: row.id,
    key: row.key,
    provider: row.provider,
    displayName: row.displayName,
    description: row.description,
    mode: row.mode,
    baseUrl: row.baseUrl,
    apiVersion: row.apiVersion,
    authType: row.authType,
    // The NAME of the env var, plus whether it currently resolves. Never the value.
    credentialRef: row.credentialRef,
    credentialConfigured: hasCredential(row.credentialRef),
    enabled: row.enabled,
    timeoutMs: row.timeoutMs,
    supportedDomains: row.supportedDomains,
    status: row.status,
    health: {
      status: row.status,
      enabled: row.enabled,
      lastAttemptAt: row.lastAttemptAt,
      lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
      lastErrorMessage: row.lastErrorMessage,
      lastResponseTimeMs: row.lastResponseTimeMs,
      lastRecordCount: row.lastRecordCount,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listIntegrations(tenantId) {
  const rows = await prisma.integration.findMany({
    where: { tenantId },
    orderBy: [{ provider: 'asc' }, { key: 'asc' }],
  });
  return rows.map(presentIntegration);
}

export async function getIntegration(tenantId, id) {
  const row = await prisma.integration.findFirst({ where: { id, tenantId } });
  if (!row) throw notFound('Integration not found.');
  return row;
}

export async function getIntegrationByKey(tenantId, key) {
  const row = await prisma.integration.findFirst({ where: { tenantId, key } });
  if (!row) throw notFound(`Integration "${key}" is not registered for this institution.`);
  return row;
}

/** First enabled integration that declares support for a domain. */
export async function resolveIntegrationForDomain(tenantId, domain) {
  const row = await prisma.integration.findFirst({
    where: { tenantId, enabled: true, supportedDomains: { has: domain }, mode: { not: 'DISABLED' } },
    orderBy: { createdAt: 'asc' },
  });
  if (!row) {
    throw new AppError(
      409,
      ErrorCode.INTEGRATION_NOT_CONFIGURED,
      `No enabled integration serves ${domain} for this institution.`,
      { domain },
    );
  }
  return row;
}

export const availableProviders = listProviders;

/** Open a sync log row. */
async function startSyncLog({ tenantId, integrationId, operation, userId }) {
  return prisma.integrationSyncLog.create({
    data: {
      tenantId,
      integrationId,
      operation,
      status: 'RUNNING',
      startedAt: new Date(),
      triggeredByUserId: userId ?? null,
    },
  });
}

async function finishSyncLog(logId, { status, recordsProcessed = 0, errorMessage = null, startedAt }) {
  const completedAt = new Date();
  return prisma.integrationSyncLog.update({
    where: { id: logId },
    data: {
      status,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      recordsProcessed,
      errorMessage: errorMessage ? String(errorMessage).slice(0, 500) : null,
    },
  });
}

async function recordHealth(integrationId, { status, responseTimeMs, recordCount, errorMessage, success }) {
  return prisma.integration.update({
    where: { id: integrationId },
    data: {
      status,
      lastAttemptAt: new Date(),
      ...(success ? { lastSuccessfulSyncAt: new Date() } : {}),
      lastResponseTimeMs: responseTimeMs ?? null,
      lastRecordCount: recordCount ?? null,
      lastErrorMessage: success ? null : (errorMessage ? String(errorMessage).slice(0, 500) : null),
    },
  });
}

/**
 * Run one connector operation with health tracking and logging around it.
 *
 * @param {object}   args
 * @param {object}   args.integration  Integration row
 * @param {string}   args.operation    label stored on the sync log, e.g. 'COURSES.PULL'
 * @param {Function} args.run          (connector, mapper) => { records|record, durationMs }
 * @param {string}  [args.userId]      who triggered it
 */
export async function runIntegrationOperation({ integration, operation, run, userId, countOf }) {
  const log = await startSyncLog({
    tenantId: integration.tenantId,
    integrationId: integration.id,
    operation,
    userId,
  });
  const startedAt = log.startedAt;

  try {
    const connector = createConnector(integration);
    const mapper = (() => {
      try {
        return getMapper(integration.provider);
      } catch {
        return null; // placeholder providers have no mapper; `run` will fail cleanly
      }
    })();

    const result = await run(connector, mapper);
    const recordCount =
      typeof countOf === 'function'
        ? countOf(result)
        : Array.isArray(result?.records)
          ? result.records.length
          : result?.recordCount ?? (result?.record ? 1 : 0);

    await finishSyncLog(log.id, {
      status: 'SUCCESS',
      recordsProcessed: recordCount,
      startedAt,
    });
    await recordHealth(integration.id, {
      status: 'CONNECTED',
      responseTimeMs: result?.durationMs ?? null,
      recordCount,
      success: true,
    });

    return { ...result, recordCount };
  } catch (error) {
    await finishSyncLog(log.id, {
      status: 'FAILED',
      errorMessage: error.message,
      startedAt,
    });

    // A provider that is only configured (Banner/Ethos) is NOT_CONNECTED, not ERROR:
    // nothing is broken, it was simply never wired up.
    const status =
      error.code === ErrorCode.INTEGRATION_NOT_CONFIGURED ? 'NOT_CONNECTED' : 'ERROR';
    await recordHealth(integration.id, {
      status,
      errorMessage: error.message,
      success: false,
    });

    logger.warn(`Integration operation failed: ${operation}`, {
      integrationKey: integration.key,
      provider: integration.provider,
      message: error.message,
    });
    throw error;
  }
}

/** Admin "Test connection" button. */
export async function testIntegration({ integration, userId }) {
  const result = await runIntegrationOperation({
    integration,
    operation: 'HEALTH.TEST',
    userId,
    countOf: (r) => r?.recordCount ?? 0,
    run: (connector) => connector.testConnection(),
  });
  return {
    healthy: result.healthy ?? true,
    responseTimeMs: result.durationMs ?? null,
    recordCount: result.recordCount ?? 0,
    details: result.details ?? {},
  };
}

export async function listSyncLogs(tenantId, integrationId, { limit = 25 } = {}) {
  return prisma.integrationSyncLog.findMany({
    where: { tenantId, integrationId },
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      triggeredBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function tenantIntegrationSummary(tenantId) {
  const rows = await prisma.integration.findMany({ where: { tenantId } });
  return {
    total: rows.length,
    connected: rows.filter((r) => r.status === 'CONNECTED').length,
    notConnected: rows.filter((r) => r.status === 'NOT_CONNECTED' || r.status === 'NOT_CONFIGURED').length,
    errored: rows.filter((r) => r.status === 'ERROR' || r.status === 'DEGRADED').length,
    disabled: rows.filter((r) => !r.enabled).length,
  };
}
