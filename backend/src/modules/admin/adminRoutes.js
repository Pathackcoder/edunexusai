import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as service from './adminService.js';
import {
  listEntitlementMatrix,
  listTiers,
  updateEntitlements,
} from '../entitlements/entitlementService.js';
import { getAdminDashboard } from '../dashboard/dashboardService.js';
import { adminOperationsRoutes } from '../workflows/workflowRoutes.js';
import { adminInterventionRoutes } from '../success/successRoutes.js';
import { recordAudit } from '../audit/auditService.js';

const idParam = z.object({ id: z.string().uuid('Expected a resource id.') });

const createUserSchema = z.object({
  email: z.string().trim().email('Enter a valid email.').max(200),
  // Prototype policy: long enough to be non-trivial, with a mixed character set.
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(200)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
    .regex(/[a-z]/, 'Password must contain a lowercase letter.')
    .regex(/\d/, 'Password must contain a number.'),
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  phone: z.string().trim().max(40).optional(),
  roles: z.array(z.enum(['STUDENT', 'FACULTY', 'ADMIN'])).min(1, 'Assign at least one role.'),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INVITED']).optional(),
  tierKey: z.string().trim().max(40).optional(),
  studentNumber: z.string().trim().max(40).optional(),
  employeeNumber: z.string().trim().max(40).optional(),
  degree: z.string().trim().max(160).optional(),
  department: z.string().trim().max(160).optional(),
  title: z.string().trim().max(120).optional(),
});

const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INVITED']).optional(),
  roles: z.array(z.enum(['STUDENT', 'FACULTY', 'ADMIN'])).min(1).optional(),
  tierKey: z.string().trim().max(40).nullable().optional(),
  password: z.string().min(12).max(200).optional(),
});

const userQuerySchema = z.object({
  role: z.enum(['STUDENT', 'FACULTY', 'ADMIN']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const entitlementUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        tierId: z.union([z.string().uuid('Expected a tier id.'), z.literal('FACULTY')]),
        widgetKey: z.string().trim().min(1).max(80),
        enabled: z.boolean(),
      }),
    )
    .min(1, 'Provide at least one entitlement change.'),
});

const PROVIDERS = ['MOCK_UNIVERSITY', 'CANVAS', 'BANNER', 'ETHOS', 'WORKDAY'];
const DOMAINS = [
  'COURSES',
  'ENROLLMENTS',
  'ASSIGNMENTS',
  'GRADES',
  'FINANCIAL_AID',
  'SCHEDULE',
  'STUDENTS',
];

const integrationBodySchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Key must be lowercase letters, numbers and hyphens.'),
  provider: z.enum(PROVIDERS),
  displayName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  mode: z.enum(['MOCK', 'LIVE', 'DISABLED']).optional(),
  baseUrl: z.string().trim().url('Base URL must be a valid URL.').max(400).optional().or(z.literal('')),
  apiVersion: z.string().trim().max(40).optional(),
  authType: z.enum(['NONE', 'API_KEY', 'BEARER_TOKEN', 'OAUTH2_CLIENT_CREDENTIALS', 'BASIC']).optional(),
  // A reference to a backend environment variable, never a secret value.
  credentialRef: z
    .string()
    .trim()
    .max(120)
    .regex(/^[A-Z0-9_]*$/, 'Credential reference must be an environment variable name.')
    .optional(),
  enabled: z.boolean().optional(),
  timeoutMs: z.coerce.number().int().min(500).max(60000).optional(),
  supportedDomains: z.array(z.enum(DOMAINS)).optional(),
});

const integrationUpdateSchema = integrationBodySchema.partial().omit({ key: true, provider: true });

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireRole('ADMIN'));

const tenantOf = (req) => req.auth.tenantId;

/* ----- Operations workspace: requests, tickets, forms, broadcasts, audit, interventions ----- */
adminRoutes.use(adminOperationsRoutes);
adminRoutes.use(adminInterventionRoutes);

/* ----- Dashboard ----- */
adminRoutes.get(
  '/dashboard',
  asyncHandler(async (req, res) => sendSuccess(res, await getAdminDashboard({ tenantId: tenantOf(req) }))),
);

/* ----- Users & roles ----- */
adminRoutes.get(
  '/users',
  validate({ query: userQuerySchema }),
  asyncHandler(async (req, res) => {
    const users = await service.listUsers(tenantOf(req), req.validatedQuery);
    return sendSuccess(res, users, { count: users.length });
  }),
);

adminRoutes.get(
  '/users/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await service.getUser(tenantOf(req), req.params.id))),
);

adminRoutes.post(
  '/users',
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.createUser(tenantOf(req), req.body), { status: 201 }),
  ),
);

adminRoutes.patch(
  '/users/:id',
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.updateUser(tenantOf(req), req.params.id, req.body)),
  ),
);

adminRoutes.get(
  '/roles',
  asyncHandler(async (_req, res) => sendSuccess(res, await service.listRoles())),
);

/* ----- Tiers & widget entitlements ----- */
adminRoutes.get(
  '/student-tiers',
  asyncHandler(async (req, res) => sendSuccess(res, await listTiers(tenantOf(req)))),
);

adminRoutes.get(
  '/widget-entitlements',
  asyncHandler(async (req, res) => sendSuccess(res, await listEntitlementMatrix(tenantOf(req)))),
);

adminRoutes.patch(
  '/widget-entitlements',
  validate({ body: entitlementUpdateSchema }),
  asyncHandler(async (req, res) => {
    const applied = await updateEntitlements(tenantOf(req), req.body.updates);
    await recordAudit({
      tenantId: tenantOf(req),
      actorUserId: req.auth.userId,
      action: 'ENTITLEMENTS_UPDATED',
      entityType: 'WidgetEntitlement',
      summary: `Widget entitlements updated (${applied.length} change${applied.length === 1 ? '' : 's'})`,
      metadata: { updates: req.body.updates },
    });
    const matrix = await listEntitlementMatrix(tenantOf(req));
    return sendSuccess(res, { applied, ...matrix }, { changed: applied.length });
  }),
);

/* ----- Integrations ----- */
adminRoutes.get(
  '/integrations',
  asyncHandler(async (req, res) => {
    const integrations = await service.adminListIntegrations(tenantOf(req));
    const summary = await service.adminIntegrationSummary(tenantOf(req));
    return sendSuccess(res, integrations, { count: integrations.length, summary });
  }),
);

adminRoutes.get(
  '/integrations/providers',
  asyncHandler(async (_req, res) => sendSuccess(res, service.adminProviders())),
);

adminRoutes.get(
  '/integrations/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.getIntegrationDetail(tenantOf(req), req.params.id)),
  ),
);

adminRoutes.post(
  '/integrations',
  validate({ body: integrationBodySchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.createIntegration(tenantOf(req), req.body), { status: 201 }),
  ),
);

adminRoutes.patch(
  '/integrations/:id',
  validate({ params: idParam, body: integrationUpdateSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.updateIntegration(tenantOf(req), req.params.id, req.body)),
  ),
);

adminRoutes.post(
  '/integrations/:id/test',
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.runIntegrationTest(tenantOf(req), req.params.id, req.auth.userId)),
  ),
);

adminRoutes.post(
  '/integrations/:id/sync',
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.runIntegrationSync(tenantOf(req), req.params.id, req.auth.userId)),
  ),
);

adminRoutes.get(
  '/integrations/:id/health',
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await service.getIntegrationHealth(tenantOf(req), req.params.id)),
  ),
);

adminRoutes.get(
  '/integrations/:id/logs',
  validate({
    params: idParam,
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(25) }),
  }),
  asyncHandler(async (req, res) => {
    const logs = await service.getIntegrationLogs(
      tenantOf(req),
      req.params.id,
      req.validatedQuery.limit,
    );
    return sendSuccess(res, logs, { count: logs.length });
  }),
);
