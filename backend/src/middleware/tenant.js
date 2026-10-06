import { unauthenticated } from '../utils/errors.js';

/**
 * Tenant context.
 *
 * The tenant is derived from the authenticated user only, never from client input.
 * Services receive it as an explicit argument and put it in every `where` clause.
 *
 * ADR-002 (docs/decisions.md): this prototype uses a shared schema with a `tenantId`
 * discriminator. Because no query runs without a tenant scope, moving to
 * schema-per-institution later means changing how the connection/schema is chosen in
 * one place rather than rewriting the services.
 */
export function tenantContext(req, _res, next) {
  if (!req.auth?.tenantId) return next(unauthenticated());
  req.tenantId = req.auth.tenantId;
  return next();
}

/** Convenience accessor used by controllers. */
export function getTenantId(req) {
  if (!req.auth?.tenantId) throw unauthenticated();
  return req.auth.tenantId;
}

/** Build the standard tenant scope for a Prisma `where`. */
export const scoped = (tenantId, where = {}) => ({ tenantId, ...where });
