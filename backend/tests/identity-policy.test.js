import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideAccountLink,
  mapExternalValues,
  planRoleSync,
  readClaim,
  resolveCommunityRoles,
  validateMappingRule,
} from '../src/modules/identity/identityPolicy.js';

/** Institutional identity policy (pure): mapping, evidence, first-login linking, role sync. */

describe('claims', () => {
  it('reads dotted paths and flattens to strings', () => {
    const claims = { realm_access: { roles: ['learner', 'offline_access'] }, groups: '/staff', affiliation: ['member', 7] };
    assert.deepEqual(readClaim(claims, 'realm_access.roles'), ['learner', 'offline_access']);
    assert.deepEqual(readClaim(claims, 'groups'), ['/staff']);
    assert.deepEqual(readClaim(claims, 'affiliation'), ['member', '7']);
    assert.deepEqual(readClaim(claims, 'missing.path'), []);
    assert.deepEqual(readClaim({ a: { b: { c: 1 } } }, 'a.b'), [], 'objects are not values');
  });
});

describe('institution-specific mapping rules', () => {
  it('accepts community roles only; administrative roles can never be mapped', () => {
    assert.equal(validateMappingRule({ externalValue: 'learner', targetRole: 'STUDENT' }).ok, true);
    assert.equal(validateMappingRule({ externalValue: 'alumni', targetRole: 'alumni' }).rule.targetRole, 'ALUMNI');
    const admin = validateMappingRule({ externalValue: 'it-admins', targetRole: 'ADMIN' });
    assert.equal(admin.ok, false);
    assert.match(admin.errors.targetRole, /never from an identity provider/);
    assert.equal(validateMappingRule({ externalValue: 'x', targetRole: 'CMS_EDITOR' }).ok, false);
    assert.equal(validateMappingRule({ externalValue: '  ', targetRole: 'STUDENT' }).ok, false);
  });

  it('maps different institutions’ vocabularies to the same roles, and reports unknown values', () => {
    const feddrick = [{ externalValue: 'student', targetRole: 'STUDENT' }, { externalValue: 'faculty', targetRole: 'FACULTY' }];
    const lakeshore = [{ externalValue: 'learner', targetRole: 'STUDENT' }, { externalValue: 'employee', targetRole: 'STAFF' }];
    assert.deepEqual([...mapExternalValues(['Student', 'faculty'], feddrick).mapped.keys()].sort(), ['FACULTY', 'STUDENT']);
    const result = mapExternalValues(['learner', 'employee', 'cms-editor', 'offline_access'], lakeshore);
    assert.deepEqual([...result.mapped.keys()].sort(), ['STAFF', 'STUDENT']);
    assert.deepEqual(result.unknown, ['cms-editor', 'offline_access'], 'unknown values grant nothing');
  });

  it('ignores disabled rules and any rule that targets a non-community role', () => {
    const rules = [{ externalValue: 'staff', targetRole: 'STAFF', enabled: false }, { externalValue: 'root', targetRole: 'ADMIN' }];
    const result = mapExternalValues(['staff', 'root'], rules);
    assert.equal(result.mapped.size, 0);
    assert.deepEqual(result.unknown, ['staff', 'root']);
  });

  it('one value may be evidence for several roles (e.g. an "employee" who is faculty)', () => {
    const rules = [{ externalValue: 'employee', targetRole: 'FACULTY' }, { externalValue: 'employee', targetRole: 'STAFF' }];
    assert.deepEqual([...mapExternalValues(['employee'], rules).mapped.keys()].sort(), ['FACULTY', 'STAFF']);
  });
});

describe('evidence: a claim alone never grants a record-backed role', () => {
  const mapped = new Map([['STUDENT', ['learner']], ['FACULTY', ['employee']], ['STAFF', ['employee']], ['ALUMNI', ['alumni']]]);

  it('grants only roles whose verified records exist', () => {
    const { granted, withheld } = resolveCommunityRoles(mapped, { student: true, faculty: false, staff: false });
    assert.deepEqual(granted.map((g) => g.role).sort(), ['ALUMNI', 'STUDENT']);
    assert.deepEqual(withheld.map((w) => [w.role, w.reason]).sort(), [['FACULTY', 'NO_VERIFIED_FACULTY_RECORD'], ['STAFF', 'NO_STAFF_RECORD']]);
  });

  it('an "employee" claim never makes anyone an administrator', () => {
    const { granted } = resolveCommunityRoles(mapExternalValues(['employee'], [{ externalValue: 'employee', targetRole: 'STAFF' }]).mapped, { staff: true });
    assert.deepEqual(granted.map((g) => g.role), ['STAFF']);
  });
});

describe('first sign-in account linking', () => {
  const claims = { email: 'rahul@feddrick.edu', emailVerified: true, studentIds: ['S-55821'], employeeIds: ['E-1029'] };
  const rahul = (via, extra = {}) => ({ userId: 'u-rahul', email: 'rahul@feddrick.edu', status: 'ACTIVE', via, ...extra });

  it('links when every claimed institutional number points to the same account and the verified email agrees', () => {
    const result = decideAccountLink({ existing: null, claims, matches: [rahul('STUDENT_NUMBER'), rahul('EMPLOYEE_NUMBER')] });
    assert.deepEqual(result, { decision: 'LINK', userId: 'u-rahul', via: ['STUDENT_NUMBER', 'EMPLOYEE_NUMBER'] });
  });

  it('signs a linked identity straight in, unless the account is disabled', () => {
    assert.deepEqual(decideAccountLink({ existing: { userId: 'u-1', status: 'ACTIVE' }, claims, matches: [] }), { decision: 'SIGN_IN', userId: 'u-1' });
    assert.equal(decideAccountLink({ existing: { userId: 'u-1', status: 'SUSPENDED' }, claims, matches: [] }).reason, 'ACCOUNT_DISABLED');
  });

  it('never links on email alone', () => {
    const emailOnly = { email: 'rahul@feddrick.edu', emailVerified: true, studentIds: [], employeeIds: [] };
    assert.equal(decideAccountLink({ existing: null, claims: emailOnly, matches: [] }).reason, 'NO_INSTITUTIONAL_ID');
  });

  it('refuses missing, ambiguous, mismatched, unverified, disabled and already-linked cases', () => {
    assert.equal(decideAccountLink({ existing: null, claims, matches: [] }).reason, 'NO_MATCHING_RECORD');
    assert.equal(decideAccountLink({ existing: null, claims, matches: [rahul('STUDENT_NUMBER'), { ...rahul('EMPLOYEE_NUMBER'), userId: 'u-other' }] }).reason, 'AMBIGUOUS_RECORDS');
    assert.equal(decideAccountLink({ existing: null, claims: { ...claims, email: 'someone@feddrick.edu' }, matches: [rahul('STUDENT_NUMBER')] }).reason, 'EVIDENCE_MISMATCH');
    assert.equal(decideAccountLink({ existing: null, claims: { ...claims, emailVerified: false }, matches: [rahul('STUDENT_NUMBER')] }).reason, 'EMAIL_NOT_VERIFIED');
    assert.equal(decideAccountLink({ existing: null, claims, matches: [rahul('STUDENT_NUMBER', { status: 'SUSPENDED' })] }).reason, 'ACCOUNT_DISABLED');
    assert.equal(decideAccountLink({ existing: null, claims, matches: [rahul('STUDENT_NUMBER', { linkedSubject: true })] }).reason, 'ACCOUNT_LINKED_TO_ANOTHER_IDENTITY');
  });
});

describe('role synchronisation on sign-in', () => {
  it('grants every role this sign-in establishes and withdraws only this provider\'s stale sources', () => {
    const plan = planRoleSync({ current: ['FACULTY', 'ALUMNI'], desired: ['STUDENT', 'FACULTY'] });
    assert.deepEqual(plan.grant.sort(), ['FACULTY', 'STUDENT']);
    assert.deepEqual(plan.withdraw, ['ALUMNI']);
  });

  it('never grants an administrative role, whatever is asked', () => {
    assert.deepEqual(planRoleSync({ current: [], desired: ['ADMIN', 'STAFF'] }).grant, ['STAFF']);
  });

  it('an empty assertion withdraws everything this provider granted, and nothing else', () => {
    assert.deepEqual(planRoleSync({ current: ['STUDENT'], desired: [] }), { grant: [], withdraw: ['STUDENT'] });
  });
});
