import { prisma } from '../../db/prisma.js';
import { fetchFinancialAid } from '../../integrations/syncService.js';
import { formatCurrency, formatShortDate, toNumber } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';

/**
 * Financial aid is INTEGRATION-OWNED. The aid office system is the system of record, so
 * this module reads THROUGH the connector on every request — the read-through half of
 * the two patterns documented in docs/architecture.md.
 *
 * Because a demo must not go blank when a provider is down, a cached copy is kept in
 * PostgreSQL and used as a fallback. The response says which path produced it, and the
 * UI surfaces that as a "showing cached data" state rather than pretending it is live.
 */

function presentCanonicalAid(aid) {
  return {
    status: aid.status,
    applicationStatus: aid.applicationStatus,
    awardYear: aid.awardYear,
    lastUpdated: aid.lastUpdatedLabel,
    totalAidAwarded: aid.totalAwarded,
    formattedTotalAid: formatCurrency(aid.totalAwarded),
    summary: {
      totalAwarded: aid.totalAwarded,
      disbursed: aid.disbursed,
      scheduled: aid.scheduled,
    },
    awards: aid.awards.map((award) => ({
      id: award.reference,
      name: award.name,
      category: award.category,
      amount: award.amount,
      formattedAmount: formatCurrency(award.amount),
      term: award.termLabel,
      status: award.status,
      renewable: award.renewableLabel,
      description: award.description,
    })),
    disbursements: aid.disbursements.map((item) => ({
      date: item.disbursedOn,
      amount: formatCurrency(item.amount),
      status: item.status,
      appliedTo: item.appliedTo,
    })),
    requirements: aid.requirements.map((item) => ({
      title: item.title,
      status: item.status,
      date: item.completedOn,
    })),
  };
}

function presentCachedAid(pkg) {
  return {
    status: pkg.status,
    applicationStatus: pkg.applicationStatus,
    awardYear: pkg.awardYear,
    lastUpdated: pkg.lastUpdatedLabel,
    totalAidAwarded: toNumber(pkg.totalAwarded),
    formattedTotalAid: formatCurrency(pkg.totalAwarded),
    summary: {
      totalAwarded: toNumber(pkg.totalAwarded),
      disbursed: toNumber(pkg.disbursed),
      scheduled: toNumber(pkg.scheduled),
    },
    awards: pkg.awards.map((award) => ({
      id: award.reference,
      name: award.name,
      category: award.category,
      amount: toNumber(award.amount),
      formattedAmount: formatCurrency(award.amount),
      term: award.termLabel,
      status: award.status,
      renewable: award.renewableLabel,
      description: award.description,
    })),
    disbursements: pkg.disbursements.map((item) => ({
      date: formatShortDate(item.disbursedOn),
      amount: formatCurrency(item.amount),
      status: item.status,
      appliedTo: item.appliedTo,
    })),
    requirements: pkg.requirements.map((item) => ({
      title: item.title,
      status: item.status,
      date: formatShortDate(item.completedOn),
    })),
  };
}

async function loadCache(tenantId, studentProfileId) {
  return prisma.financialAidPackage.findFirst({
    where: { tenantId, studentProfileId },
    include: {
      awards: { orderBy: { sortOrder: 'asc' } },
      disbursements: { orderBy: { sortOrder: 'asc' } },
      requirements: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { awardYear: 'desc' },
  });
}

export async function getFinancialAid(tenantId, studentProfileId, { userId } = {}) {
  const identity = await prisma.externalIdentity.findFirst({
    where: {
      tenantId,
      provider: 'MOCK_UNIVERSITY',
      entityType: 'STUDENT',
      internalId: studentProfileId,
    },
  });

  if (identity) {
    try {
      const { record } = await fetchFinancialAid(tenantId, identity.externalId, { userId });
      // A null record from a healthy provider is "no package on file", which falls
      // through to the empty state below rather than to the cached copy.
      if (record) {
        return {
          ...presentCanonicalAid(record),
          meta: {
            source: 'INTEGRATION',
            sourceSystem: record.sourceSystem,
            live: true,
            retrievedAt: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      logger.warn('Financial aid read-through failed; serving the cached copy.', {
        message: error.message,
      });
    }
  }

  const cached = await loadCache(tenantId, studentProfileId);

  // Not every student has an aid package. That is an empty result, not a failure, so the
  // page renders a zeroed summary rather than an error panel.
  if (!cached) {
    return {
      status: 'No aid package',
      applicationStatus: 'Not applied',
      awardYear: null,
      lastUpdated: null,
      totalAidAwarded: 0,
      formattedTotalAid: formatCurrency(0),
      summary: { totalAwarded: 0, disbursed: 0, scheduled: 0 },
      awards: [],
      disbursements: [],
      requirements: [],
      meta: {
        source: 'NONE',
        live: false,
        hasPackage: false,
        message: 'No financial aid package is on file for this student.',
      },
    };
  }

  return {
    ...presentCachedAid(cached),
    meta: {
      source: 'DATABASE_CACHE',
      sourceSystem: cached.sourceSystem,
      live: false,
      degraded: true,
      message: 'The financial aid provider could not be reached. Showing the last synced copy.',
      retrievedAt: cached.lastSyncedAt,
    },
  };
}
