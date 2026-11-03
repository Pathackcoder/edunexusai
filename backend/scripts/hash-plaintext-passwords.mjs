/**
 * Hash any password rows left in plaintext by the retired development setting.
 *
 *   npm run passwords:hash-plaintext            # dry run: counts and accounts, changes nothing
 *   npm run passwords:hash-plaintext -- --apply # hash them (one transaction)
 *
 * The same password keeps working afterwards; only how it is stored changes. Prints account
 * emails and counts, never a password. Back up the database before --apply (pg_dump); to roll
 * back, restore that backup.
 */
import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { hashPassword, isBcryptHash } from '../src/modules/auth/passwords.js';

const apply = process.argv.includes('--apply');
const database = new URL(process.env.DATABASE_URL).pathname.slice(1);
const users = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true }, orderBy: { email: 'asc' } });
const plaintext = users.filter((u) => !isBcryptHash(u.passwordHash));

console.log(`Database: ${database}`);
console.log(`Accounts: ${users.length} · bcrypt: ${users.length - plaintext.length} · plaintext: ${plaintext.length}`);
for (const u of plaintext) console.log(`  plaintext  ${u.email}`);

if (!apply) {
  console.log(plaintext.length ? '\nDry run only. Re-run with --apply to hash these rows.' : '\nNothing to do.');
} else if (plaintext.length) {
  const updates = [];
  for (const u of plaintext) updates.push(prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(u.passwordHash) } }));
  await prisma.$transaction(updates);
  const after = await prisma.user.findMany({ where: { id: { in: plaintext.map((u) => u.id) } }, select: { passwordHash: true } });
  console.log(`\nHashed ${after.filter((u) => isBcryptHash(u.passwordHash)).length} of ${plaintext.length} account(s).`);
}
await prisma.$disconnect();
