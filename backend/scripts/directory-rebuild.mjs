// Rebuild People Search from the portal accounts and their CampusCore records (see modules/people/directorySync.js).
//   npm run directory:rebuild -- [--tenant demo-university]
// Entries without an account (hand-made or legacy) are removed; one entry per listed account is written.
import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { rebuildDirectory } from '../src/modules/people/directorySync.js';

const i = process.argv.indexOf('--tenant');
const slug = i >= 0 ? process.argv[i + 1] : process.env.KEYCLOAK_DIRECTORY_TENANT || process.env.SIS_TENANT_KEY || 'demo-university';
const tenant = await prisma.tenant.findUnique({ where: { slug } });
if (!tenant) { console.error(`No tenant ${slug}.`); process.exit(1); }
const { removedUnlinked, listed } = await rebuildDirectory(tenant.id);
console.log(`People Search (${slug}): removed ${removedUnlinked} entries without an account; ${listed.length} listed`);
for (const e of listed) console.log(`  ${e.userId}  ${e.name}  [${e.roles.join(', ')}]`);
await prisma.$disconnect();
