/**
 * View-As access from the command line: who may use View-As (read-only support access to a student's or faculty
 * member's portal) at an institution. Every change is written to the audit trail as made by this script.
 *
 *   node scripts/view-as-access.mjs list   --tenant <slug>
 *   node scripts/view-as-access.mjs grant  --tenant <slug> --email <administrator email>            (dry run)
 *   node scripts/view-as-access.mjs grant  --tenant <slug> --email <administrator email> --apply
 *   node scripts/view-as-access.mjs revoke --tenant <slug> --email <administrator email> --apply
 *
 * Only an active account that holds ADMIN in that institution can be granted it. Revoking ends that administrator's
 * open View-As sessions on their next request (the permission is re-checked on every request).
 */
import { parseArgs } from 'node:util';
import { prisma } from '../src/db/prisma.js';
import { recordAudit } from '../src/modules/audit/auditService.js';

const { positionals, values } = parseArgs({ allowPositionals: true, options: { tenant: { type: 'string' }, email: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const [command] = positionals;
const PERMISSION = 'users.view_as';
const fail = (message) => { console.error(message); process.exitCode = 1; };

try {
  if (!['list', 'grant', 'revoke'].includes(command) || !values.tenant) {
    fail('Usage: node scripts/view-as-access.mjs <list|grant|revoke> --tenant <slug> [--email <email>] [--apply]');
  } else {
    const tenant = await prisma.tenant.findUnique({ where: { slug: values.tenant } });
    if (!tenant) fail(`No institution with slug "${values.tenant}".`);
    else if (command === 'list') {
      const admins = await prisma.user.findMany({ where: { tenantId: tenant.id, userRoles: { some: { role: { key: 'ADMIN' } } } }, select: { email: true, status: true, permissions: { where: { permission: PERMISSION } } }, orderBy: { email: 'asc' } });
      for (const admin of admins) console.log(`${admin.permissions.length ? 'VIEW-AS' : 'no     '} ${admin.email} (${admin.status})`);
    } else if (!values.email) fail('--email is required.');
    else {
      const user = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: values.email.trim().toLowerCase() } }, include: { userRoles: { include: { role: true } } } });
      if (!user) fail(`No account ${values.email} at ${tenant.slug}.`);
      else if (command === 'grant' && !user.userRoles.some((link) => link.role.key === 'ADMIN')) fail(`${user.email} is not an administrator; View-As is only given to administrators.`);
      else if (command === 'grant' && user.status !== 'ACTIVE') fail(`${user.email} is ${user.status}; View-As is only given to active accounts.`);
      else if (!values.apply) console.log(`Dry run: would ${command} ${PERMISSION} for ${user.firstName} ${user.lastName} <${user.email}> (account ${user.id}) at ${tenant.slug} (${tenant.id}). Add --apply to do it.`);
      else if (command === 'grant') {
        await prisma.userPermission.upsert({ where: { userId_permission: { userId: user.id, permission: PERMISSION } }, create: { tenantId: tenant.id, userId: user.id, permission: PERMISSION }, update: {} });
        await recordAudit({ tenantId: tenant.id, action: 'VIEW_AS_ACCESS_GRANTED', entityType: 'User', entityId: user.id, summary: `View-As access granted to ${user.firstName} ${user.lastName} (administration script)` });
        console.log(`Granted ${PERMISSION} to ${user.email}.`);
      } else {
        const { count } = await prisma.userPermission.deleteMany({ where: { tenantId: tenant.id, userId: user.id, permission: PERMISSION } });
        if (count) await recordAudit({ tenantId: tenant.id, action: 'VIEW_AS_ACCESS_REVOKED', entityType: 'User', entityId: user.id, summary: `View-As access withdrawn from ${user.firstName} ${user.lastName} (administration script)` });
        console.log(count ? `Withdrew ${PERMISSION} from ${user.email}.` : `${user.email} had no View-As access.`);
      }
    }
  }
} finally {
  await prisma.$disconnect();
}
