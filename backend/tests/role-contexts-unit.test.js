import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { communityAudiences, resolveRoleContexts } from '../src/modules/users/roleContexts.js';

/**
 * Role-context rules for every community role, without the database. The STAFF and ALUMNI role
 * keys do not exist in the database yet (migration pending), so these rules are exercised here
 * with plain objects; student/faculty behaviour is also covered end to end in role-contexts.test.js.
 */

const widgets = { student: ['dashboard.schedule'], faculty: ['faculty.summary'], staff: ['staff.announcements'], alumni: ['alumni.calendar'] };
const resolver = async (key) => ({ tier: key === 'student' ? { key: 'STANDARD' } : null, widgets: widgets[key] ?? [] });
const keys = (result) => result.contexts.map((c) => `${c.key}:${c.status}`);

describe('community contexts', () => {
  it('Staff + Alumni: two contexts, each with its own widgets and no academic record', async () => {
    const result = await resolveRoleContexts({ staffProfile: { id: 'staff-1' } }, ['STAFF', 'ALUMNI'], resolver);
    assert.deepEqual(keys(result), ['staff:ACTIVE', 'alumni:ACTIVE']);
    assert.deepEqual(result.contexts.find((c) => c.key === 'staff').entitlements, ['staff.announcements']);
    assert.deepEqual(result.contexts.find((c) => c.key === 'alumni').entitlements, ['alumni.calendar']);
    assert.equal(result.contexts.find((c) => c.key === 'alumni').profileId, null);
    assert.equal(result.defaultContext, 'staff');
  });

  it('STAFF without a staff record is UNLINKED with no widgets', async () => {
    const result = await resolveRoleContexts({}, ['STAFF'], resolver);
    const staff = result.contexts[0];
    assert.equal(staff.status, 'UNLINKED');
    assert.equal(staff.reason, 'NO_STAFF_RECORD');
    assert.deepEqual(staff.entitlements, []);
    assert.equal(result.defaultContext, null);
  });

  it('Student + Faculty + Staff: three contexts, faculty first (legacy persona precedence)', async () => {
    const user = { studentProfile: { id: 's' }, facultyProfile: { id: 'f' }, staffProfile: { id: 'st' } };
    const result = await resolveRoleContexts(user, ['STUDENT', 'FACULTY', 'STAFF'], resolver);
    assert.deepEqual(keys(result), ['faculty:ACTIVE', 'student:ACTIVE', 'staff:ACTIVE']);
    assert.equal(result.defaultContext, 'faculty');
  });

  it('an administrator is a workspace; a staff record alone does not make an admin a staff member', async () => {
    const result = await resolveRoleContexts({ staffProfile: { id: 'admin-staff-record' } }, ['ADMIN'], resolver);
    assert.deepEqual(result.contexts, []);
    assert.deepEqual(result.workspaces, ['admin']);
  });

  it('audiences follow every community role held', () => {
    assert.deepEqual(communityAudiences(['STUDENT']), ['STUDENT']);
    assert.deepEqual(communityAudiences(['STUDENT', 'FACULTY']), ['FACULTY', 'STUDENT']);
    assert.deepEqual(communityAudiences(['STAFF', 'ALUMNI', 'ADMIN']), ['STAFF', 'ALUMNI']);
    assert.deepEqual(communityAudiences(['ADMIN']), []);
  });
});
