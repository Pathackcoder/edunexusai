import { createHash } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { keycloakDirectoryConfig } from '../../config/env.js';
import { AppError, ErrorCode, forbidden, integrationError, integrationNotConfigured } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { KeycloakAdminClient, KeycloakDirectoryError } from '../../integrations/keycloak/KeycloakAdminClient.js';
import { resolveContextEntitlements } from '../entitlements/entitlementService.js';
import { COMMUNITY_ROLES } from '../identity/identityPolicy.js';
import { evaluateClaims } from '../identity/providerService.js';

/**
 * Campus Directory: people search over the institution's Keycloak realm (read-only).
 *
 *   portal ──► GET /api/v1/campus/directory (session + audience check) ──► this service
 *          ──► Keycloak Admin REST API as the directory service account (client credentials)
 *
 * Field owners: name and email come from Keycloak; the Student / Faculty / Staff / Alumni labels are
 * the person's Keycloak realm roles read through this institution's own "Sign-in & role mapping"
 * rules (claim realm_access.roles). A label says what the identity provider asserts, not that an SIS
 * record was verified; nothing academic is read from Keycloak. Nothing is created, linked, merged or
 * changed: portal accounts, SIS records, role assignments and tiers are untouched, and people who
 * exist only in the portal or the SIS do not appear here.
 */

const MAX_OFFSET = 10_000; // deep paging beyond this is refused; search narrows instead
const PAGE_TTL_MS = 30_000;
const ROLES_TTL_MS = 60_000;
const SERVICE_ACCOUNTS_TTL_MS = 5 * 60_000;
const CACHE_LIMIT = 500;
// The audience of the existing People Search: faculty, staff, alumni and administrators; students when
// their tier includes the directory feature.
const MEMBER_ROLES = ['FACULTY', 'STAFF', 'ALUMNI', 'ADMIN'];

let client = null;
let clientKey = null;
const pages = new Map();
const roles = new Map();
let serviceAccounts = null; // { at, rows }

const cacheGet = (map, key, ttl) => {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  map.delete(key);
  return undefined;
};
const cacheSet = (map, key, value) => {
  if (map.size >= CACHE_LIMIT) map.delete(map.keys().next().value);
  map.set(key, { at: Date.now(), value });
};

/** Forget the client and every cached answer (configuration change, tests). */
export function resetDirectoryClient() {
  client = null;
  clientKey = null;
  pages.clear();
  roles.clear();
  serviceAccounts = null;
}

function directoryClient(config) {
  const secret = process.env.KEYCLOAK_DIRECTORY_CLIENT_SECRET;
  const key = createHash('sha256').update([config.baseUrl, config.realm, config.clientId, secret].join('|')).digest('hex');
  if (!client || clientKey !== key) {
    resetDirectoryClient();
    client = new KeycloakAdminClient({ baseUrl: config.baseUrl, realm: config.realm, clientId: config.clientId, clientSecret: secret, timeoutMs: config.timeoutMs, logger });
    clientKey = key;
  }
  return client;
}

/** The backend's audience rule; the sidebar shows the link to the same people. */
export async function assertDirectoryAccess(auth) {
  if (auth.roles.some((role) => MEMBER_ROLES.includes(role))) return;
  if (auth.roles.includes('STUDENT')) {
    const { widgets } = await resolveContextEntitlements({ tenantId: auth.tenantId, context: 'student', tierId: auth.tierId });
    if (widgets.includes('feature.directory')) return;
  }
  throw forbidden('The Campus Directory is not available for your account.');
}

/** User input -> Keycloak `search` (infix match on username, first name, last name and email). */
export const searchTerm = (value) => String(value ?? '').replace(/[*"\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const text = (value, max = 100) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const email = (value) => (typeof value === 'string' && /^[^\s@]{1,64}@[^\s@]{1,255}$/.test(value.trim()) ? value.trim().toLowerCase() : null);
// A stable, opaque key for the browser: not Keycloak's internal user id.
const personKey = (realm, id) => createHash('sha256').update(`${realm}:${id}`).digest('base64url').slice(0, 16);

/** Directory labels from realm roles, using this institution's mapping rules for realm_access.roles. */
export function affiliationsFor(realmRoles, rules) {
  const { mapped } = evaluateClaims({ realm_access: { roles: realmRoles } }, rules);
  return COMMUNITY_ROLES.filter((role) => mapped.has(role));
}

export function presentPerson(realm, user, affiliations) {
  const firstName = text(user.firstName);
  const lastName = text(user.lastName);
  return {
    key: personKey(realm, user.id),
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(' ') || null,
    email: email(user.email),
    // null: the labels could not be read for this person right now (shown neutrally, not guessed).
    affiliations,
  };
}

async function labelRules(tenantId, providerKey) {
  if (!providerKey) return [];
  const provider = await prisma.identityProvider.findFirst({ where: { tenantId, key: providerKey }, select: { id: true } });
  if (!provider) return [];
  return prisma.identityRoleMapping.findMany({ where: { tenantId, providerId: provider.id, claim: 'realm_access.roles', enabled: true } });
}

async function rolesOf(kc, users) {
  const out = new Map();
  const queue = [...users];
  const worker = async () => {
    for (let user = queue.shift(); user; user = queue.shift()) {
      const cacheKey = `${kc.realm}:${user.id}`;
      let names = cacheGet(roles, cacheKey, ROLES_TTL_MS);
      if (!names) {
        try {
          names = await kc.effectiveRealmRoles(user.id);
          cacheSet(roles, cacheKey, names);
        } catch (error) {
          if (error instanceof KeycloakDirectoryError && error.code === 'forbidden') throw error;
          names = null; // this person only: no labels rather than a failed page
        }
      }
      out.set(user.id, names);
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, users.length) }, worker));
  return out;
}

async function serviceAccountsOf(kc) {
  if (serviceAccounts && Date.now() - serviceAccounts.at < SERVICE_ACCOUNTS_TTL_MS) return serviceAccounts.rows;
  const rows = await kc.serviceAccounts();
  serviceAccounts = { at: Date.now(), rows };
  return rows;
}

function toAppError(error) {
  if (!(error instanceof KeycloakDirectoryError)) return error;
  logger.warn('[keycloak-directory] request failed', { code: error.code, status: error.status });
  if (error.code === 'unreachable' || error.code === 'timeout') return new AppError(503, ErrorCode.INTEGRATION_ERROR, 'The Campus Directory is temporarily unavailable. Please try again in a moment.', { reason: 'DIRECTORY_UNAVAILABLE' });
  if (error.code === 'credentials_rejected') return integrationError('The Campus Directory could not sign in to the identity provider. An administrator needs to check its service-account settings.', { reason: 'DIRECTORY_CREDENTIALS_REJECTED' });
  if (error.code === 'forbidden') return integrationError('The Campus Directory service account is missing read permission in the identity provider.', { reason: 'DIRECTORY_PERMISSION_MISSING' });
  return integrationError('The identity provider sent an unexpected answer to the Campus Directory.', { reason: 'DIRECTORY_UPSTREAM_ERROR' });
}

/**
 * One page of enabled people in the institution's realm.
 * Returns { people, page, pageSize, total, hasMore, source, labels }.
 */
export async function searchCampusDirectory(auth, { search, page = 1, pageSize = 20 } = {}) {
  await assertDirectoryAccess(auth);
  const config = keycloakDirectoryConfig();
  if (!config.valid || config.tenantSlug !== auth.tenantSlug) {
    throw integrationNotConfigured('The Campus Directory is not connected to your institution’s identity provider yet.', auth.roles.includes('ADMIN') ? { problems: config.valid ? ['KEYCLOAK_DIRECTORY_TENANT names another institution.'] : config.problems } : undefined);
  }
  const term = searchTerm(search);
  const first = (page - 1) * pageSize;
  if (first + pageSize > MAX_OFFSET) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Too many pages: narrow the search instead.');

  const cacheKey = `${auth.tenantId}|${term.toLowerCase()}|${page}|${pageSize}`;
  const cached = cacheGet(pages, cacheKey, PAGE_TTL_MS);
  if (cached) return cached;

  const kc = directoryClient(config);
  try {
    const query = term ? `*${term}*` : undefined;
    const [raw, count, accounts, rules] = await Promise.all([
      kc.listUsers({ search: query, first, max: pageSize }),
      kc.countUsers({ search: query }),
      serviceAccountsOf(kc),
      labelRules(auth.tenantId, config.providerKey),
    ]);
    const hidden = new Set(accounts.map((a) => a.id));
    // Keycloak counts service accounts in an unfiltered count; a search already leaves them out.
    const hiddenInCount = term ? 0 : accounts.length;
    const users = raw.filter((u) => u && typeof u.id === 'string' && u.enabled !== false && !hidden.has(u.id));
    const realmRoles = rules.length ? await rolesOf(kc, users) : new Map();
    const people = users.map((u) => presentPerson(config.realm, u, rules.length ? (realmRoles.get(u.id) ? affiliationsFor(realmRoles.get(u.id), rules) : null) : []));
    const result = {
      people,
      page,
      pageSize,
      total: Math.max(0, count - hiddenInCount),
      // Offsets are Keycloak's (hidden rows included), so the raw count decides whether a next page exists.
      hasMore: first + pageSize < count,
      source: 'KEYCLOAK',
      labels: rules.length > 0,
    };
    cacheSet(pages, cacheKey, result);
    return result;
  } catch (error) {
    throw toAppError(error);
  }
}
