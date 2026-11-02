// Exact identity consistency between the university identity provider (Keycloak) and EduNexusAI, by immutable ids:
//   - every human Keycloak user (not a service account) has exactly one EduNexusAI account linked by its OIDC `sub`
//     (federated_identities.subject = the Keycloak user id) for the institution's sign-in option;
//   - every EduNexusAI account has exactly one such link, to an existing Keycloak user;
//   - every Student/Faculty role has its CampusCore link (no "SIS link missing");
//   - People Search lists exactly the active accounts, one entry each, and nothing without an account.
// Read-only. Uses the read-only directory client (KEYCLOAK_DIRECTORY_*). Exit 0 when consistent, 2 when not, 1 on error.
//   npm run identity:consistency [-- --json]
import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { keycloakDirectoryConfig } from '../src/config/env.js';
import { KeycloakAdminClient } from '../src/integrations/keycloak/KeycloakAdminClient.js';

const config = keycloakDirectoryConfig();
if (!config.valid) { console.error(`Not configured: ${config.problems.join(' ')}`); process.exit(1); }
const tenant = await prisma.tenant.findUnique({ where: { slug: config.tenantSlug } });
const provider = await prisma.identityProvider.findFirst({ where: { tenantId: tenant?.id, issuer: `${config.baseUrl}/realms/${config.realm}` } });
if (!tenant || !provider) { console.error('The tenant or its sign-in option for this realm was not found.'); process.exit(1); }

const keycloak = new KeycloakAdminClient({ baseUrl: config.baseUrl, realm: config.realm, clientId: config.clientId, clientSecret: process.env.KEYCLOAK_DIRECTORY_CLIENT_SECRET, timeoutMs: config.timeoutMs });
const kcUsers = [];
for (let first = 0; ; first += 100) {
  const page = await keycloak.get('/users', { first, max: 100, briefRepresentation: true });
  kcUsers.push(...page);
  if (page.length < 100) break;
}
const serviceAccounts = new Set((await keycloak.serviceAccounts()).map((s) => s.id));
const humans = kcUsers.filter((u) => !serviceAccounts.has(u.id));
const accounts = await prisma.user.findMany({ where: { tenantId: tenant.id }, include: { userRoles: { include: { role: true } } } });
const links = await prisma.federatedIdentity.findMany({ where: { tenantId: tenant.id, providerId: provider.id } });
const mirror = await prisma.externalIdentity.findMany({ where: { tenantId: tenant.id, provider: 'CAMPUSCORE', status: 'ACTIVE' } });
const directory = await prisma.directoryProfile.findMany({ where: { tenantId: tenant.id } });

const problems = [];
const pairs = [];
const kcById = new Map(humans.map((u) => [u.id, u]));
const accountById = new Map(accounts.map((a) => [a.id, a]));
for (const u of humans) {
  const l = links.filter((x) => x.subject === u.id);
  if (l.length !== 1) problems.push({ problem: l.length ? 'KEYCLOAK_USER_LINKED_MORE_THAN_ONCE' : 'KEYCLOAK_USER_WITHOUT_PORTAL_ACCOUNT', keycloakId: u.id, username: u.username });
  else if (!accountById.has(l[0].userId)) problems.push({ problem: 'LINK_TO_MISSING_PORTAL_ACCOUNT', keycloakId: u.id, userId: l[0].userId });
}
for (const a of accounts) {
  const l = links.filter((x) => x.userId === a.id);
  const roles = a.userRoles.map((r) => r.role.key).sort();
  if (l.length !== 1) problems.push({ problem: l.length ? 'PORTAL_ACCOUNT_LINKED_MORE_THAN_ONCE' : 'PORTAL_ACCOUNT_WITHOUT_KEYCLOAK_IDENTITY', userId: a.id, email: a.email });
  else if (!kcById.has(l[0].subject)) problems.push({ problem: 'LINK_TO_MISSING_KEYCLOAK_USER', userId: a.id, sub: l[0].subject });
  else pairs.push({ sub: l[0].subject, username: kcById.get(l[0].subject).username, userId: a.id, roles, linkMethod: l[0].linkMethod });
  for (const r of ['STUDENT', 'FACULTY']) {
    if (roles.includes(r) && !mirror.some((m) => m.internalId === a.id && m.entityType === r)) problems.push({ problem: 'SIS_LINK_MISSING', userId: a.id, role: r });
  }
  if (a.status === 'ACTIVE' && directory.filter((d) => d.userId === a.id).length !== 1) problems.push({ problem: 'NOT_IN_PEOPLE_SEARCH', userId: a.id });
}
for (const d of directory) if (!d.userId || !accountById.has(d.userId)) problems.push({ problem: 'PEOPLE_SEARCH_ENTRY_WITHOUT_ACCOUNT', directoryId: d.id, name: d.name });
for (const l of links) if (!kcById.has(l.subject) && !problems.some((p) => p.sub === l.subject)) problems.push({ problem: 'LINK_TO_MISSING_KEYCLOAK_USER', userId: l.userId, sub: l.subject });

const report = { realm: config.realm, tenant: tenant.slug, keycloakHumans: humans.length, serviceAccounts: serviceAccounts.size, portalAccounts: accounts.length, peopleSearch: directory.length, consistent: problems.length === 0, pairs, problems };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Realm ${report.realm} ↔ tenant ${report.tenant}: ${report.keycloakHumans} Keycloak people (+${report.serviceAccounts} service accounts), ${report.portalAccounts} portal accounts, ${report.peopleSearch} People Search entries`);
  for (const p of pairs) console.log(`  ✓ ${p.sub}  ${p.username.padEnd(18)} ↔ ${p.userId}  ${p.roles.join('+')}  (${p.linkMethod})`);
  for (const p of problems) console.log(`  ✗ ${p.problem}  ${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'problem')))}`);
  console.log(report.consistent ? 'CONSISTENT: every person exists once on each side, linked by their sub.' : `NOT CONSISTENT: ${problems.length} problem(s).`);
}
await prisma.$disconnect();
process.exit(report.consistent ? 0 : 2);
