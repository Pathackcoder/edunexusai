import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { institutionalPerson } from '../sis/sisService.js';

/**
 * People Search is derived, never a separate source of people: one entry per active portal account, described by
 * the institution's records. CampusCore (the person registry) supplies the name, institutional email, faculty title
 * and department, and student programme; the account supplies who the person is and their roles. A person who
 * teaches and studies is one entry with both roles. People CampusCore excludes from identity provisioning, accounts
 * whose institutional record cannot be found, and entries without an account are not listed.
 *
 * Entries are refreshed when an account is created or gains a relationship, and in full by `npm run directory:rebuild`.
 */

const ROLE_TYPES = { FACULTY: 'faculty', STUDENT: 'student', STAFF: 'staff', ADMIN: 'staff' };
const TYPE_ORDER = ['faculty', 'staff', 'student'];
const AVATAR = ['#1e3a8a', '#0f766e', '#7c2d12', '#4c1d95', '#155e75', '#9f1239'];

const accountInclude = { userRoles: { include: { role: true } }, studentProfile: true, facultyProfile: true, staffProfile: true };

/** The entry an account should have, or null when it should not be listed. */
async function describe(user) {
  const roleKeys = user.userRoles.map((ur) => ur.role.key);
  const roles = [...new Set(roleKeys.map((k) => ROLE_TYPES[k]).filter(Boolean))].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  if (user.status !== 'ACTIVE' || !roles.length) return null;
  const institutional = roleKeys.includes('STUDENT') || roleKeys.includes('FACULTY');
  let name = `${user.firstName} ${user.lastName}`;
  let email = user.email;
  let role = roleKeys.includes('ADMIN') ? 'Platform Administrator' : roles.includes('staff') ? 'Staff' : null;
  let department = null;
  let program = null;
  let externalKey = `user:${user.id}`;
  let location = null;
  let officeHours = null;
  let phone = null;
  if (institutional) {
    const person = await institutionalPerson({
      studentNumbers: user.studentProfile ? [user.studentProfile.studentNumber] : [],
      employeeNumbers: user.facultyProfile ? [user.facultyProfile.employeeNumber] : [],
    });
    if (!person) return null;
    const faculty = person.relationships.find((r) => r.type === 'FACULTY' && r.current);
    const student = person.relationships.find((r) => r.type === 'STUDENT' && r.current);
    name = `${person.preferredName || person.firstName} ${person.lastName}`;
    email = person.primaryEmail ?? user.email;
    role = [faculty?.title, student && `Student${student.program ? `, ${student.program}` : ''}`].filter(Boolean).join(' · ') || null;
    department = faculty?.department ?? null;
    program = student?.program ?? null;
    externalKey = `person:${person.personNumber}`;
  }
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarBg = AVATAR[[...user.id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
  return { externalKey, type: roles[0], roles, name, email, role, department, program, location, officeHours, phone, initials, avatarBg, isVisible: true };
}

/** Create, update or remove one account's entry. Best effort: never fails the caller. */
export async function refreshDirectoryEntry(tenantId, userId) {
  try {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, include: accountInclude });
    const entry = user ? await describe(user) : null;
    if (!entry) {
      await prisma.directoryProfile.deleteMany({ where: { tenantId, userId } });
      return null;
    }
    // One entry per person: an entry this account already owns is updated; any other entry with the same key is replaced.
    // `NOT: { userId }` alone never matches entries whose account was deleted (userId NULL), which then block the upsert.
    await prisma.directoryProfile.deleteMany({ where: { tenantId, externalKey: entry.externalKey, OR: [{ userId: null }, { NOT: { userId } }] } });
    return await prisma.directoryProfile.upsert({ where: { userId }, update: entry, create: { tenantId, userId, ...entry } });
  } catch (error) {
    logger.warn('People Search entry not refreshed', { code: error.code ?? null });
    return null;
  }
}

/** Rebuild the whole directory of a tenant from its accounts. Returns what changed. */
export async function rebuildDirectory(tenantId) {
  const removedUnlinked = (await prisma.directoryProfile.deleteMany({ where: { tenantId, userId: null } })).count;
  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true } });
  const listed = [];
  for (const { id } of users) {
    const entry = await refreshDirectoryEntry(tenantId, id);
    if (entry) listed.push({ userId: id, name: entry.name, roles: entry.roles });
  }
  return { removedUnlinked, listed };
}
