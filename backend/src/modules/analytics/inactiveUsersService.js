import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { ROLE_KEYS } from '../../../../shared/analyticsCatalog.js';
import { utcTimestamp } from './rollupService.js';

/**
 * Accounts that have not signed in recently (Admin → Analytics → Overview and People & activity).
 *
 * This is the one person-level list in Analytics: names, addresses and institution ids, shown only to administrators
 * holding analytics.view, so an institution can follow up with people (mostly students) who have stopped using the
 * portal. It is built from the account's own sign-in record (users.lastLoginAt, set by authService.issueSession on
 * every successful password or institutional sign-in, never by a token refresh) and works whether or not usage
 * collection is on. It is not derived from usage tracking, and the date collection began is never used as a
 * substitute for a sign-in.
 *
 *   inactive   signed in at least once, but not in the last N days (5, 15 or 30)
 *   never      has an account but has never signed in
 *
 * Suspended accounts are left out unless asked for (they cannot sign in); accounts excluded from analytics (test and
 * service accounts) are always left out. While demo data is included, the synthetic people are listed too, flagged
 * `demo: true`; they are never portal accounts.
 */

export const INACTIVE_DAY_OPTIONS = [5, 15, 30];
export const inactiveQuerySchema = z.object({
  days: z.coerce.number().int().refine((value) => INACTIVE_DAY_OPTIONS.includes(value)).optional(),
  view: z.enum(['inactive', 'never']).optional(),
  role: z.enum(ROLE_KEYS).optional(),
  search: z.string().trim().max(80).optional(),
  includeSuspended: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().refine((value) => [10, 25, 50].includes(value)).optional(),
}).strict();

const DAY_MS = 86_400_000;
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

/** Everyone the list may show, real and (when included) synthetic, in one shape. */
function people({ tenantId, demo }) {
  const real = Prisma.sql`
    SELECT u."id", u."firstName", u."lastName", u."email", u."status"::text AS status, u."lastLoginAt", u."createdAt",
      COALESCE(sp."studentNumber", fp."employeeNumber", stp."employeeNumber") AS "institutionId",
      COALESCE((SELECT array_agg(r."key"::text ORDER BY r."key") FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."roleId" WHERE ur."userId" = u."id"), '{}') AS roles,
      false AS demo
    FROM "users" u
    LEFT JOIN "student_profiles" sp ON sp."userId" = u."id"
    LEFT JOIN "faculty_profiles" fp ON fp."userId" = u."id"
    LEFT JOIN "staff_profiles" stp ON stp."userId" = u."id"
    WHERE u."tenantId" = ${tenantId} AND u."analyticsExcludedAt" IS NULL`;
  if (!demo) return real;
  return Prisma.sql`${real}
    UNION ALL
    SELECT d."id", d."firstName", d."lastName", d."email", d."status", d."lastLoginAt", d."createdAt", d."institutionId",
      (SELECT array_agg(r::text ORDER BY r) FROM unnest(d."rolesHeld") r), true AS demo
    FROM "analytics_demo_people" d WHERE d."tenantId" = ${tenantId}`;
}

export async function inactiveUsersReport({ tenantId, demo }, query = {}, { now = new Date() } = {}) {
  const days = query.days ?? 5;
  const view = query.view ?? 'inactive';
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const search = query.search ? query.search : null;
  const cutoff = (n) => utcTimestamp(new Date(now.getTime() - n * DAY_MS));

  const filters = Prisma.sql`
    ${query.includeSuspended === 'true' ? Prisma.empty : Prisma.sql`AND p.status <> 'SUSPENDED'`}
    ${query.role ? Prisma.sql`AND ${query.role} = ANY(p.roles)` : Prisma.empty}
    ${search ? Prisma.sql`AND (p."firstName" || ' ' || p."lastName" ILIKE ${likePattern(search)} OR p."email" ILIKE ${likePattern(search)} OR p."institutionId" ILIKE ${likePattern(search)})` : Prisma.empty}`;
  const base = Prisma.sql`FROM (${people({ tenantId, demo })}) p WHERE true ${filters}`;
  const which = view === 'never' ? Prisma.sql`AND p."lastLoginAt" IS NULL` : Prisma.sql`AND p."lastLoginAt" < ${cutoff(days)}`;

  const [counts] = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE p."lastLoginAt" < ${cutoff(5)})::int AS "d5",
           count(*) FILTER (WHERE p."lastLoginAt" < ${cutoff(15)})::int AS "d15",
           count(*) FILTER (WHERE p."lastLoginAt" < ${cutoff(30)})::int AS "d30",
           count(*) FILTER (WHERE p."lastLoginAt" IS NULL)::int AS never,
           count(*)::int AS accounts,
           count(*) FILTER (WHERE p.demo)::int AS "demoAccounts"
    ${base}`;
  const order = view === 'never' ? Prisma.sql`p."createdAt" ASC, p."lastName", p."firstName"` : Prisma.sql`p."lastLoginAt" ASC, p."lastName", p."firstName"`;
  const rows = await prisma.$queryRaw`
    SELECT p."id", p."firstName", p."lastName", p."email", p.status, p."lastLoginAt", p."createdAt", p."institutionId", p.roles, p.demo
    ${base} ${which} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const total = view === 'never' ? counts.never : counts[`d${days}`];

  return {
    view, days, page, pageSize, total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts: { 5: counts.d5, 15: counts.d15, 30: counts.d30, never: counts.never },
    accounts: counts.accounts,
    demoIncluded: Boolean(demo),
    demoAccounts: counts.demoAccounts,
    asOf: now,
    rows: rows.map((row) => ({
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
      email: row.email,
      institutionId: row.institutionId ?? null,
      roles: row.roles ?? [],
      status: row.status,
      lastLoginAt: row.lastLoginAt,
      daysSinceLogin: row.lastLoginAt ? Math.floor((now.getTime() - new Date(row.lastLoginAt).getTime()) / DAY_MS) : null,
      createdAt: row.createdAt,
      demo: row.demo,
    })),
  };
}
