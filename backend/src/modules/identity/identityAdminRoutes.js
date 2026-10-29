import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import * as providers from './providerService.js';

/**
 * Institutional sign-in administration (mounted under /admin, which already requires ADMIN):
 * sign-in options and their institution-specific role-mapping rules. Secrets are never accepted or
 * returned here; a provider only names the server variable that holds its client secret.
 */
export const identityAdminRoutes = Router();

const tenantOf = (req) => req.auth.tenantId;
const actor = (req) => ({ actorUserId: req.auth.userId });
const idParam = z.object({ id: z.string().uuid() });
const mappingParam = z.object({ id: z.string().uuid(), mappingId: z.string().uuid() });
const providerBody = z.object({
  key: z.string().optional(),
  displayName: z.string().optional(),
  issuer: z.string().optional(),
  clientId: z.string().optional(),
  clientSecretEnv: z.string().nullable().optional(),
  scopes: z.string().optional(),
  studentIdClaim: z.string().nullable().optional(),
  employeeIdClaim: z.string().nullable().optional(),
  employeeIdEstablishesStaff: z.boolean().optional(),
  enabled: z.boolean().optional(),
  allowInsecureHttp: z.boolean().optional(),
}).strict();
const mappingBody = z.object({ claim: z.string().optional(), externalValue: z.string().optional(), targetRole: z.string().optional(), enabled: z.boolean().optional(), note: z.string().nullable().optional() }).strict();

identityAdminRoutes.get('/identity-providers', asyncHandler(async (req, res) => sendSuccess(res, await providers.listProviders(tenantOf(req)))));
identityAdminRoutes.post('/identity-providers', validate({ body: providerBody }), asyncHandler(async (req, res) => sendSuccess(res, await providers.createProvider(tenantOf(req), req.body, actor(req)), { status: 201 })));
identityAdminRoutes.patch('/identity-providers/:id', validate({ params: idParam, body: providerBody }), asyncHandler(async (req, res) => sendSuccess(res, await providers.updateProvider(tenantOf(req), req.params.id, req.body, actor(req)))));
identityAdminRoutes.post('/identity-providers/:id/test', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await providers.testProvider(tenantOf(req), req.params.id))));

identityAdminRoutes.get('/identity-providers/:id/mappings', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await providers.listMappings(tenantOf(req), req.params.id))));
identityAdminRoutes.post('/identity-providers/:id/mappings', validate({ params: idParam, body: mappingBody }), asyncHandler(async (req, res) => sendSuccess(res, await providers.createMapping(tenantOf(req), req.params.id, req.body, actor(req)), { status: 201 })));
identityAdminRoutes.patch('/identity-providers/:id/mappings/:mappingId', validate({ params: mappingParam, body: mappingBody }), asyncHandler(async (req, res) => sendSuccess(res, await providers.updateMapping(tenantOf(req), req.params.id, req.params.mappingId, req.body, actor(req)))));
identityAdminRoutes.delete('/identity-providers/:id/mappings/:mappingId', validate({ params: mappingParam }), asyncHandler(async (req, res) => sendSuccess(res, await providers.deleteMapping(tenantOf(req), req.params.id, req.params.mappingId, actor(req)))));
identityAdminRoutes.post(
  '/identity-providers/:id/preview',
  validate({ params: idParam, body: z.object({ claims: z.record(z.any()) }).strict() }),
  asyncHandler(async (req, res) => sendSuccess(res, await providers.previewMapping(tenantOf(req), req.params.id, req.body.claims))),
);
