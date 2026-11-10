import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { startCampusCoreStub } from './helpers/campuscoreStub.js';
import { resetSisClient } from '../src/modules/sis/sisService.js';

/**
 * Tuition & Accounts with CampusCore connected: the account is read from CampusCore (finance:read) for the signed-in
 * student's verified link only; no account is an empty state, not an error; the portal records no payments. Every
 * call goes to the in-process CampusCore stub.
 */

const CLIENT_ID = 'cc_stubclient0042';
const CLIENT_SECRET = 'ccs_stub_secret_value_do_not_leak_0042';
const ENV_KEYS = ['SIS_PROVIDER', 'CAMPUSCORE_BASE_URL', 'CAMPUSCORE_CLIENT_ID', 'CAMPUSCORE_CLIENT_SECRET', 'CAMPUSCORE_EXPECTED_INSTITUTION', 'SIS_TENANT_KEY', 'CAMPUSCORE_TIMEOUT_MS'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let sis;
let prisma;

const ACCOUNT = {
  id: 'acct-1', accountNumber: 'BUR-1-2026FA', status: 'OPEN', standing: 'BALANCE_DUE', currency: 'USD', isDemo: true,
  student: { id: 'stu-maya' }, term: { id: 'term-fa', code: '2026FA', name: 'Fall 2026' }, dueDate: '2099-12-01',
  totals: { charges: '6075.00', payments: '2000.00', credits: '1000.00', refunds: '0.00', adjustments: '0.00', balance: '3075.00' },
  deadlines: { next: { kind: 'INVOICE', label: 'Invoice INV-1', dueDate: '2099-12-01', amount: '6075.00' }, upcoming: [], overdue: [] },
  entries: [
    { id: 'e1', reference: 'TXN-1', type: 'CHARGE', direction: 'DEBIT', amount: '5600.00', signedAmount: '5600.00', description: 'Tuition (16 credits × 350.00)', category: 'TUITION', effectiveDate: '2026-09-01', status: 'POSTED', isDemo: true },
    { id: 'e2', reference: 'TXN-2', type: 'CHARGE', direction: 'DEBIT', amount: '475.00', signedAmount: '475.00', description: 'Fees', category: 'OTHER', effectiveDate: '2026-09-01', status: 'POSTED', isDemo: true },
    { id: 'e3', reference: 'PAY-1', type: 'PAYMENT', direction: 'CREDIT', amount: '2000.00', signedAmount: '-2000.00', description: 'Simulated payment (demo data, no money moved)', method: 'Simulated (demo)', effectiveDate: '2026-09-15', status: 'POSTED', isDemo: true },
    { id: 'e4', reference: 'TXN-3', type: 'CREDIT', direction: 'CREDIT', amount: '1000.00', signedAmount: '-1000.00', description: 'Scholarship (illustrative)', effectiveDate: '2026-09-01', status: 'POSTED', isDemo: true },
  ],
  invoices: [{ id: 'inv-1', number: 'INV-1', status: 'ISSUED', issuedAt: '2026-09-01T00:00:00Z', dueDate: '2099-12-01', total: '6075.00', isDemo: true, lines: [{ description: 'Tuition', amount: '5600.00', reference: 'TXN-1' }] }],
};

before(async () => {
  sis = await startCampusCoreStub({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  Object.assign(process.env, { SIS_PROVIDER: 'campuscore', CAMPUSCORE_BASE_URL: sis.url, CAMPUSCORE_CLIENT_ID: CLIENT_ID, CAMPUSCORE_CLIENT_SECRET: CLIENT_SECRET, CAMPUSCORE_EXPECTED_INSTITUTION: 'feddrick', SIS_TENANT_KEY: 'demo-university', CAMPUSCORE_TIMEOUT_MS: '2000' });
  resetSisClient();
  ({ prisma } = await import('../src/db/prisma.js'));
  const maya = await prisma.user.findFirst({ where: { email: 'student.advanced@edunexus.ai' } });
  const amit = await prisma.user.findFirst({ where: { email: 'student@edunexus.ai' } });
  sis.link(maya.id, 'STUDENT', 'stu-maya');
  sis.link(amit.id, 'STUDENT', [...sis.state.students.keys()].find((k) => k !== 'stu-maya'));
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  resetSisClient();
  await sis.close();
  await closeTestServer();
});

describe('Tuition & Accounts from CampusCore', () => {
  it('without finance:read the account is an error to retry, never a false "no account"', async () => {
    const res = await api('/finance', { token: await login('advanced') });
    assert.ok(res.status >= 400, `got ${res.status}`);
  });

  it('reads the signed-in student\'s own account, with totals and transactions from the SIS ledger', async () => {
    sis.state.scopes.push('finance:read');
    sis.state.accounts.set('stu-maya', ACCOUNT);
    resetSisClient();
    const res = await api('/finance', { token: await login('advanced') });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const a = res.body.data;
    assert.equal(a.source, 'campuscore');
    assert.equal(a.hasAccount, true);
    assert.equal(a.currentBalance, 3075);
    assert.deepEqual([a.totals.charges, a.totals.payments, a.totals.credits], [6075, 2000, 1000]);
    assert.equal(a.isDemo, true);
    assert.equal(a.paymentsEnabled, false);
    assert.equal(a.transactions[0].id, 'TXN-3', 'newest first');
    assert.equal(a.transactions.at(-1).runningBalance, 5600, 'running balance in posting order');
    assert.equal(a.transactions[0].runningBalance, 3075);
    assert.equal(a.breakdown.length, 2);
  });

  it('a student without an account gets a calm empty state', async () => {
    const res = await api('/finance', { token: await login('student') });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.hasAccount, false);
    assert.equal(res.body.data.state, 'NO_ACCOUNT');
  });

  it('the dashboard widget uses the same CampusCore account', async () => {
    const res = await api('/dashboard/student', { token: await login('advanced') });
    assert.equal(res.status, 200);
    const panel = res.body.data.panels?.['dashboard.tuition'];
    if (panel) assert.equal(panel.data.currentBalance, 3075);
  });

  it('records no payment in the portal: payments belong to Student Accounts in CampusCore', async () => {
    const res = await api('/finance/payments', { method: 'POST', token: await login('advanced'), body: { amount: 100 } });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /Student Accounts/);
  });
});
