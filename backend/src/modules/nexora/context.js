import { prisma } from '../../db/prisma.js';
import * as sis from '../sis/sisService.js';

/**
 * The time zone Nexora shows times in: the institution's own setting, else CampusCore's institution time zone,
 * else UTC. Cached briefly per tenant.
 */
const cache = new Map();

const valid = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export async function institutionTimezone(tenantId) {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < 600_000) return hit.value;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  let value = tenant?.timezone && valid(tenant.timezone) ? tenant.timezone : null;
  if (!value) {
    const fromSis = await sis.timezone();
    value = fromSis && valid(fromSis) ? fromSis : 'UTC';
  }
  cache.set(tenantId, { value, at: Date.now() });
  return value;
}

/** The context every tool receives. Identity is the authenticated session, nothing else. */
export async function toolContext(auth, extra = {}) {
  return { auth, tz: await institutionTimezone(auth.tenantId), now: new Date(), ...extra };
}
