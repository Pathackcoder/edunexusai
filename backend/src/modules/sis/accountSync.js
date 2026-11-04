import { prisma } from '../../db/prisma.js';
import { accountSyncConfig, sisConfig } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { peopleChangedSince, provisionFromRegistry } from './sisService.js';

/**
 * Registry sync: CampusCore → EdunexusAI accounts.
 *
 * CampusCore owns the person registry. Its own worker gives every person a university account in Keycloak; this job
 * gives every provisionable person a portal account (no password: they sign in with the university ID), so a student
 * or faculty member created in CampusCore appears under Administration → Users without anyone importing them.
 *
 *   every intervalMs: CampusCore /people?updatedSince=<cursor>   (its incremental feed; excluded people never appear)
 *     └─ each person ─► sis.provisionFromRegistry   (same account as first sign-in creates; skips anyone already
 *                                                    linked, or whose address / number is held locally)
 *   cursor = start of the last pass that completed without a failure (integration_sync_logs, operation ACCOUNT_SYNC),
 *   with a minute of overlap; a failed person is retried on the next pass. Re-running never duplicates an account.
 *
 * The person's later university sign-in links this account to their Keycloak identity by the verified institutional
 * number and email (identityPolicy.decideAccountLink), exactly as for any pre-existing account.
 */

const OPERATION = 'ACCOUNT_SYNC';
const OVERLAP_MS = 60_000;

async function context() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: sisConfig().tenantKey } });
  const integration = tenant ? await prisma.integration.findFirst({ where: { tenantId: tenant.id, provider: 'CAMPUSCORE' }, orderBy: { createdAt: 'asc' } }) : null;
  return { tenant, integration };
}

/** One pass. Returns { results, since } (results: one entry per changed person), or { skipped: REASON }. */
export async function runAccountSync({ now = new Date() } = {}) {
  if (!sisConfig().valid) return { skipped: 'SIS_NOT_CONFIGURED' };
  const { tenant, integration } = await context();
  if (!tenant || !integration) return { skipped: 'NO_CAMPUSCORE_INTEGRATION' };
  const last = await prisma.integrationSyncLog.findFirst({ where: { integrationId: integration.id, operation: OPERATION, status: 'SUCCESS' }, orderBy: { startedAt: 'desc' } });
  const configured = accountSyncConfig().since;
  if (!last && !configured) {
    // First run with no starting point: start from now, so the historical registry is never swept.
    await prisma.integrationSyncLog.create({ data: { tenantId: tenant.id, integrationId: integration.id, operation: OPERATION, status: 'SUCCESS', startedAt: now, completedAt: now, durationMs: 0, recordsProcessed: 0, outcome: 'EMPTY' } });
    return { results: [], since: now };
  }
  const since = last ? new Date(last.startedAt.getTime() - OVERLAP_MS) : configured;
  let people;
  try {
    people = await peopleChangedSince(since);
  } catch (error) {
    await prisma.integrationSyncLog.create({ data: { tenantId: tenant.id, integrationId: integration.id, operation: OPERATION, status: 'FAILED', startedAt: now, completedAt: new Date(), outcome: error.status === 403 ? 'PERMISSION_DENIED' : 'NETWORK', errorMessage: String(error.message).slice(0, 500) } });
    throw error;
  }
  const results = [];
  for (const person of people) {
    try {
      results.push(await provisionFromRegistry({ tenant, personId: person.id }));
    } catch (error) {
      results.push({ personNumber: person.personNumber, outcome: 'FAILED', reason: error.details?.sisCode ?? error.code ?? 'ERROR', message: String(error.message).slice(0, 200) });
    }
  }
  const created = results.filter((r) => r.outcome === 'CREATED').length;
  const failed = results.filter((r) => r.outcome === 'FAILED');
  const summary = { status: failed.length ? 'PARTIAL' : 'SUCCESS', completedAt: new Date(), durationMs: Date.now() - now.getTime(), recordsProcessed: created, outcome: failed.length ? 'PARTIAL' : people.length ? 'RECORDS' : 'EMPTY', errorMessage: failed.length ? failed.map((f) => `${f.personNumber}: ${f.reason}`).join('; ').slice(0, 500) : null };
  if (!people.length && !failed.length && last) {
    // Nothing changed: move the existing cursor instead of writing a row every interval.
    await prisma.integrationSyncLog.update({ where: { id: last.id }, data: { ...summary, startedAt: now } });
  } else {
    await prisma.integrationSyncLog.create({ data: { tenantId: tenant.id, integrationId: integration.id, operation: OPERATION, startedAt: now, ...summary } });
  }
  return { results, since };
}

/** Starts the periodic job (server.js). Returns { stop } or null when disabled. */
export function startAccountSyncWorker({ log = logger } = {}) {
  const config = accountSyncConfig();
  if (!config.enabled) return null;
  let timer = null;
  let stopped = false;
  const tick = async () => {
    try {
      const { results = [], skipped } = await runAccountSync();
      if (skipped) log.warn('CampusCore account sync skipped', { reason: skipped });
      for (const r of results.filter((x) => x.outcome !== 'SKIPPED' || x.reason !== 'ALREADY_LINKED')) log.info('CampusCore account sync', { personNumber: r.personNumber, outcome: r.outcome, reason: r.reason ?? null });
    } catch (error) {
      log.warn('CampusCore account sync pass failed', { code: error.code ?? error.name ?? 'error' });
    }
    if (!stopped) timer = setTimeout(tick, config.intervalMs);
  };
  timer = setTimeout(tick, 5_000);
  log.info(`CampusCore account sync started (every ${Math.round(config.intervalMs / 1000)}s)`);
  return { stop: () => { stopped = true; clearTimeout(timer); } };
}
