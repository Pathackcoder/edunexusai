import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { formatTimeAgo } from '../../utils/format.js';
import { CALENDAR_PROVIDERS, calendarProviderAdapter } from '../../integrations/adapters/calendarProviderAdapter.js';

/**
 * External calendar sync (Google / Outlook). The connection state is persisted per
 * user; the provider handshake and push are simulated by the adapter.
 */

async function portalEvents(auth) {
  const now = new Date();
  const [academic, advising, groupEvents, courses] = await Promise.all([
    prisma.academicEvent.count({ where: { tenantId: auth.tenantId, eventDate: { gte: now } } }),
    prisma.advisingAppointment.count({ where: { tenantId: auth.tenantId, status: 'BOOKED', OR: [{ studentUserId: auth.userId }, { advisorUserId: auth.userId }] } }),
    prisma.groupEvent.count({ where: { startsAt: { gte: now }, group: { memberships: { some: { userId: auth.userId, status: 'ACTIVE' } } } } }),
    auth.studentProfileId
      ? prisma.enrollment.count({ where: { studentProfileId: auth.studentProfileId } })
      : prisma.course.count({ where: { tenantId: auth.tenantId, instructorUserId: auth.userId } }),
  ]);
  return { academic, advising, groupEvents, classMeetings: courses, total: academic + advising + groupEvents + courses };
}

async function status(auth) {
  const rows = await prisma.calendarConnection.findMany({ where: { userId: auth.userId } });
  const events = await portalEvents(auth);
  return {
    providers: Object.values(CALENDAR_PROVIDERS).map((provider) => {
      const row = rows.find((item) => item.provider === provider.key);
      return {
        key: provider.key,
        label: provider.label,
        status: row?.status ?? 'DISCONNECTED',
        accountEmail: row?.status === 'CONNECTED' ? row.accountEmail : null,
        lastSyncedAt: row?.lastSyncedAt ?? null,
        lastSyncedLabel: row?.lastSyncedAt ? formatTimeAgo(row.lastSyncedAt) : null,
        eventsSynced: row?.eventsSynced ?? 0,
      };
    }),
    available: events,
    mode: 'SIMULATED',
  };
}

async function sync(auth, provider) {
  const events = await portalEvents(auth);
  const result = await calendarProviderAdapter.pushEvents(provider, new Array(events.total).fill(null));
  await prisma.calendarConnection.update({
    where: { userId_provider: { userId: auth.userId, provider } },
    data: { lastSyncedAt: new Date(), eventsSynced: result.pushed },
  });
}

const providerParam = z.object({ provider: z.enum(Object.keys(CALENDAR_PROVIDERS)) });

export const calendarSyncRoutes = Router();
calendarSyncRoutes.use(requireAuth);
calendarSyncRoutes.get('/', asyncHandler(async (req, res) => sendSuccess(res, await status(req.auth))));
calendarSyncRoutes.post(
  '/:provider/connect',
  validate({ params: providerParam, body: z.object({ email: z.string().trim().email('Enter the calendar account email.').max(160).optional() }) }),
  asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const linked = await calendarProviderAdapter.connect(provider, { email: req.body.email ?? req.auth.email });
    await prisma.calendarConnection.upsert({
      where: { userId_provider: { userId: req.auth.userId, provider } },
      create: { tenantId: req.auth.tenantId, userId: req.auth.userId, provider, status: 'CONNECTED', accountEmail: linked.accountEmail },
      update: { status: 'CONNECTED', accountEmail: linked.accountEmail },
    });
    await sync(req.auth, provider);
    return sendSuccess(res, await status(req.auth));
  }),
);
calendarSyncRoutes.post(
  '/:provider/sync',
  validate({ params: providerParam }),
  asyncHandler(async (req, res) => {
    await sync(req.auth, req.params.provider);
    return sendSuccess(res, await status(req.auth));
  }),
);
calendarSyncRoutes.delete(
  '/:provider',
  validate({ params: providerParam }),
  asyncHandler(async (req, res) => {
    await prisma.calendarConnection.updateMany({ where: { userId: req.auth.userId, provider: req.params.provider }, data: { status: 'DISCONNECTED' } });
    return sendSuccess(res, await status(req.auth));
  }),
);
