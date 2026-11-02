import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { recordAudit } from '../audit/auditService.js';
import { mapExternalValues, readClaim, validateMappingRule } from './identityPolicy.js';
import { clearProviderConfigurations, providerConfiguration } from './oidcClient.js';

/**
 * Institutional identity providers and their role-mapping rules, per tenant.
 *
 * Secrets: a provider row never holds its client secret. `clientSecretEnv` names the server
 * environment variable that does (or, in a future deployment, the secret-manager entry exposed as
 * one). Only names starting with OIDC_CLIENT_SECRET_ are accepted, so a provider can never be pointed
 * at another server secret (which the token request would otherwise send to the provider). The value
 * is read only when talking to the provider and never returned by any API.
 */

const KEY = /^[a-z0-9][a-z0-9-]{1,39}$/;
const CLAIM = /^[A-Za-z_][\w:-]{0,63}(\.[A-Za-z_][\w:-]{0,63}){0,4}$/;
const SECRET_ENV = /^OIDC_CLIENT_SECRET_[A-Z0-9_]{1,40}$/;
const production = () => process.env.NODE_ENV === 'production';

export const clientSecretFor = (provider) => (provider.clientSecretEnv ? process.env[provider.clientSecretEnv] || null : null);

export function presentProvider(p) {
  return {
    id: p.id,
    key: p.key,
    displayName: p.displayName,
    issuer: p.issuer,
    clientId: p.clientId,
    clientSecretEnv: p.clientSecretEnv,
    secretConfigured: Boolean(clientSecretFor(p)),
    scopes: p.scopes,
    studentIdClaim: p.studentIdClaim,
    employeeIdClaim: p.employeeIdClaim,
    employeeIdEstablishesStaff: p.employeeIdEstablishesStaff,
    jitProvisioning: p.jitProvisioning,
    enabled: p.enabled,
    allowInsecureHttp: p.allowInsecureHttp,
    mappingCount: p._count?.roleMappings ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Validate a provider definition (complete for create, partial for update). */
export function validateProvider(input, { partial = false } = {}) {
  const errors = {};
  const out = {};
  const has = (k) => input[k] !== undefined;
  const need = (k) => !partial || has(k);
  if (need('key')) { const v = String(input.key ?? '').trim(); if (!KEY.test(v)) errors.key = 'Use 2–40 lowercase letters, digits and dashes.'; else out.key = v; }
  if (need('displayName')) { const v = String(input.displayName ?? '').trim(); if (!v || v.length > 80) errors.displayName = 'Give the sign-in option a name (at most 80 characters).'; else out.displayName = v; }
  if (need('issuer')) {
    const v = String(input.issuer ?? '').trim().replace(/\/+$/, '');
    let url = null;
    try { url = new URL(v); } catch { /* reported below */ }
    if (!url || !['https:', 'http:'].includes(url.protocol)) errors.issuer = 'Enter the provider’s issuer URL.';
    else out.issuer = v;
  }
  if (need('clientId')) { const v = String(input.clientId ?? '').trim(); if (!v || v.length > 200) errors.clientId = 'Enter the client id registered with the provider.'; else out.clientId = v; }
  if (has('clientSecretEnv')) {
    const v = input.clientSecretEnv === null ? null : String(input.clientSecretEnv).trim();
    if (v && !SECRET_ENV.test(v)) errors.clientSecretEnv = 'Use a server variable named OIDC_CLIENT_SECRET_<NAME> (letters, digits, underscores).';
    else out.clientSecretEnv = v || null;
  }
  if (has('scopes')) { const v = String(input.scopes ?? '').trim(); if (!/^openid(\s+[\w:.-]+){0,10}$/.test(v)) errors.scopes = 'Scopes must start with "openid".'; else out.scopes = v; }
  for (const k of ['studentIdClaim', 'employeeIdClaim']) {
    if (!has(k)) continue;
    const v = input[k] === null || input[k] === '' ? null : String(input[k]).trim();
    if (v && !CLAIM.test(v)) errors[k] = 'Use a claim name or a dotted path such as "student_number".';
    else out[k] = v;
  }
  for (const k of ['enabled', 'employeeIdEstablishesStaff', 'jitProvisioning', 'allowInsecureHttp']) if (has(k)) out[k] = input[k] === true;
  if (out.allowInsecureHttp && production()) errors.allowInsecureHttp = 'Plain-http providers are only for local development.';
  if (out.issuer?.startsWith('http:') && !(out.allowInsecureHttp ?? input.allowInsecureHttp)) errors.issuer = 'The issuer must use https (plain http only for a development provider marked as such).';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, provider: out };
}

const invalid = (errors) => badRequest('Check the highlighted fields.', { fieldErrors: errors });

async function loadProvider(tenantId, id) {
  const provider = await prisma.identityProvider.findFirst({ where: { id, tenantId }, include: { _count: { select: { roleMappings: true } } } });
  if (!provider) throw notFound('Identity provider not found.');
  return provider;
}

export async function listProviders(tenantId) {
  const rows = await prisma.identityProvider.findMany({ where: { tenantId }, include: { _count: { select: { roleMappings: true } } }, orderBy: { createdAt: 'asc' } });
  return rows.map(presentProvider);
}

export async function createProvider(tenantId, input, { actorUserId }) {
  const checked = validateProvider(input);
  if (!checked.ok) throw invalid(checked.errors);
  if (await prisma.identityProvider.findFirst({ where: { tenantId, key: checked.provider.key } })) throw conflict('Another sign-in option already uses this key.');
  const row = await prisma.identityProvider.create({ data: { tenantId, ...checked.provider } });
  await recordAudit({ tenantId, actorUserId, action: 'IDENTITY_PROVIDER_CREATED', entityType: 'IdentityProvider', entityId: row.id, summary: `Added sign-in option ${row.displayName} (${row.issuer})` });
  return presentProvider(await loadProvider(tenantId, row.id));
}

export async function updateProvider(tenantId, id, input, { actorUserId }) {
  const current = await loadProvider(tenantId, id);
  const checked = validateProvider({ allowInsecureHttp: current.allowInsecureHttp, issuer: current.issuer, ...input }, { partial: true });
  if (!checked.ok) throw invalid(checked.errors);
  delete checked.provider.key; // the key is part of sign-in links and stays fixed
  const row = await prisma.identityProvider.update({ where: { id }, data: checked.provider });
  clearProviderConfigurations();
  const changed = Object.keys(checked.provider).filter((k) => String(checked.provider[k]) !== String(current[k]));
  await recordAudit({ tenantId, actorUserId, action: 'IDENTITY_PROVIDER_UPDATED', entityType: 'IdentityProvider', entityId: id, summary: `Updated sign-in option ${row.displayName}: ${changed.join(', ') || 'no changes'}` });
  return presentProvider(await loadProvider(tenantId, id));
}

/** Reach the provider and read its discovery document (no secret is sent). */
export async function testProvider(tenantId, id) {
  const provider = await loadProvider(tenantId, id);
  try {
    const config = await providerConfiguration(provider, { clientSecret: clientSecretFor(provider) });
    const meta = config.serverMetadata();
    return { ok: true, issuer: meta.issuer, authorization: Boolean(meta.authorization_endpoint), token: Boolean(meta.token_endpoint), endSession: Boolean(meta.end_session_endpoint), pkceS256: (meta.code_challenge_methods_supported ?? []).includes('S256'), secretConfigured: Boolean(clientSecretFor(provider)) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/* ------------------------------------------------------------------ mapping rules */

const presentMapping = (m) => ({ id: m.id, claim: m.claim, externalValue: m.externalValue, targetRole: m.targetRole, enabled: m.enabled, note: m.note, createdAt: m.createdAt, updatedAt: m.updatedAt });

function validateMapping(input, { partial = false } = {}) {
  const errors = {};
  const out = {};
  if (!partial || input.claim !== undefined) {
    const claim = String(input.claim ?? '').trim();
    if (!CLAIM.test(claim)) errors.claim = 'Use a claim name or a dotted path such as "realm_access.roles".';
    else out.claim = claim;
  }
  if (!partial || input.externalValue !== undefined || input.targetRole !== undefined) {
    const rule = validateMappingRule({ externalValue: input.externalValue, targetRole: input.targetRole });
    if (!rule.ok) Object.assign(errors, rule.errors);
    else { out.externalValue = rule.rule.externalValue; out.targetRole = rule.rule.targetRole; }
  }
  if (input.enabled !== undefined) out.enabled = input.enabled === true;
  if (input.note !== undefined) out.note = input.note ? String(input.note).trim().slice(0, 200) : null;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, mapping: out };
}

export async function listMappings(tenantId, providerId) {
  await loadProvider(tenantId, providerId);
  return (await prisma.identityRoleMapping.findMany({ where: { tenantId, providerId }, orderBy: [{ claim: 'asc' }, { externalValue: 'asc' }] })).map(presentMapping);
}

export async function createMapping(tenantId, providerId, input, { actorUserId }) {
  const provider = await loadProvider(tenantId, providerId);
  const checked = validateMapping(input);
  if (!checked.ok) throw invalid(checked.errors);
  const exists = await prisma.identityRoleMapping.findFirst({ where: { providerId, claim: checked.mapping.claim, externalValue: checked.mapping.externalValue, targetRole: checked.mapping.targetRole } });
  if (exists) throw conflict('This rule already exists.');
  const row = await prisma.identityRoleMapping.create({ data: { tenantId, providerId, createdByUserId: actorUserId, ...checked.mapping } });
  await recordAudit({ tenantId, actorUserId, action: 'IDENTITY_MAPPING_CREATED', entityType: 'IdentityRoleMapping', entityId: row.id, summary: `${provider.displayName}: ${row.claim} = "${row.externalValue}" → ${row.targetRole}` });
  return presentMapping(row);
}

export async function updateMapping(tenantId, providerId, mappingId, input, { actorUserId }) {
  const provider = await loadProvider(tenantId, providerId);
  const current = await prisma.identityRoleMapping.findFirst({ where: { id: mappingId, providerId, tenantId } });
  if (!current) throw notFound('Mapping rule not found.');
  const checked = validateMapping({ claim: current.claim, externalValue: current.externalValue, targetRole: current.targetRole, ...input }, { partial: true });
  if (!checked.ok) throw invalid(checked.errors);
  const row = await prisma.identityRoleMapping.update({ where: { id: mappingId }, data: checked.mapping });
  await recordAudit({ tenantId, actorUserId, action: 'IDENTITY_MAPPING_UPDATED', entityType: 'IdentityRoleMapping', entityId: row.id, summary: `${provider.displayName}: ${row.claim} = "${row.externalValue}" → ${row.targetRole}${row.enabled ? '' : ' (disabled)'}` });
  return presentMapping(row);
}

export async function deleteMapping(tenantId, providerId, mappingId, { actorUserId }) {
  const provider = await loadProvider(tenantId, providerId);
  const current = await prisma.identityRoleMapping.findFirst({ where: { id: mappingId, providerId, tenantId } });
  if (!current) throw notFound('Mapping rule not found.');
  await prisma.identityRoleMapping.delete({ where: { id: mappingId } });
  await recordAudit({ tenantId, actorUserId, action: 'IDENTITY_MAPPING_DELETED', entityType: 'IdentityRoleMapping', entityId: mappingId, summary: `${provider.displayName}: removed ${current.claim} = "${current.externalValue}" → ${current.targetRole}` });
  return { deleted: true };
}

/**
 * Map claims with this provider's enabled rules: { mapped: Map(role -> values), unknown: [values] }.
 * Only claims named by a rule are read; their values without a rule are reported as unknown.
 */
export function evaluateClaims(claims, rules) {
  const mapped = new Map();
  const unknown = [];
  const byClaim = new Map();
  for (const rule of rules.filter((r) => r.enabled !== false)) byClaim.set(rule.claim, [...(byClaim.get(rule.claim) ?? []), rule]);
  for (const [claim, claimRules] of byClaim) {
    const result = mapExternalValues(readClaim(claims, claim), claimRules);
    for (const [role, values] of result.mapped) mapped.set(role, [...new Set([...(mapped.get(role) ?? []), ...values.map((v) => `${claim}=${v}`)])]);
    unknown.push(...result.unknown.map((v) => `${claim}=${v}`));
  }
  return { mapped, unknown };
}

/** Admin "what would happen": evaluate sample claims against the current rules (nothing is stored). */
export async function previewMapping(tenantId, providerId, claims) {
  await loadProvider(tenantId, providerId);
  const rules = await prisma.identityRoleMapping.findMany({ where: { tenantId, providerId } });
  const { mapped, unknown } = evaluateClaims(claims ?? {}, rules);
  return { mapped: Object.fromEntries(mapped), unknown, note: 'Student and Faculty are granted only with the verified SIS record; Staff only with a staff record (or the provider’s staff policy). Unknown values grant nothing.' };
}

/* --------------------------------------------------------------- runtime lookups */

export async function tenantBySlug(slug) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  return tenant?.isActive ? tenant : null;
}

/** Enabled sign-in options of an institution (public: key and name only). */
export async function enabledProviders(tenantSlug) {
  const tenant = await tenantBySlug(tenantSlug);
  if (!tenant) return [];
  const rows = await prisma.identityProvider.findMany({ where: { tenantId: tenant.id, enabled: true }, orderBy: { createdAt: 'asc' } });
  return rows.map((p) => ({ key: p.key, displayName: p.displayName, tenant: tenant.slug }));
}

export async function enabledProvider(tenantId, key) {
  return prisma.identityProvider.findFirst({ where: { tenantId, key, enabled: true } });
}
