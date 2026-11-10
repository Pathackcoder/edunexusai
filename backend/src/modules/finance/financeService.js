import { prisma } from '../../db/prisma.js';
import { AppError, ErrorCode, notFound } from '../../utils/errors.js';
import * as sis from '../sis/sisService.js';
import {
  buildReference,
  daysUntil,
  formatCurrency,
  formatLongDate,
  formatShortDate,
  toIsoDate,
  toNumber,
} from '../../utils/format.js';

/**
 * Where tuition lives depends on the deployment:
 *   - With CampusCore connected (SIS_PROVIDER=campuscore), CampusCore SIS is the system of record. The student's
 *     account (totals, ledger, invoices, deadlines) is read live through the SIS connector for the signed-in
 *     student's verified identity; nothing is copied or stored here. The portal records no payments: Student
 *     Accounts records them in CampusCore.
 *   - Without a SIS, the local TuitionAccount tables below are the (demo) record, as before.
 */
const PAYMENTS_NOTE = 'Payments are recorded by the Student Accounts office in CampusCore SIS. Online payment is not available in the portal.';
const sisMode = () => sis.sisConfigured();
// CampusCore dates are calendar days (YYYY-MM-DD); format them at midday UTC so no timezone shifts the day.
const day = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`) : null);
const TYPE_LABEL = { CHARGE: 'Charge', PAYMENT: 'Payment', CREDIT: 'Credit', REFUND: 'Refund', ADJUSTMENT: 'Adjustment', REVERSAL: 'Reversal' };

function withRunningBalance(transactions) {
  let cents = 0;
  return transactions.map((t) => { cents += Math.round(t.signedAmount * 100); return { ...t, runningBalance: cents / 100 }; });
}

function presentSisAccount(a) {
  const balance = a.totals.balance;
  const due = a.nextDeadline?.dueDate ?? a.dueDate;
  const charges = a.transactions.filter((t) => t.type === 'CHARGE' && t.status === 'POSTED');
  return {
    source: 'campuscore',
    state: 'OK',
    hasAccount: true,
    accountId: a.source.id,
    accountNumber: a.accountNumber,
    accountStatus: a.status,
    standing: a.standing,
    isDemo: a.isDemo,
    currency: a.currency,
    currentBalance: balance,
    formattedBalance: formatCurrency(balance),
    totals: a.totals,
    dueDate: formatLongDate(day(due)),
    dueDateIso: due ?? null,
    status: statusLabel(balance, day(due)),
    term: a.term.name,
    termCode: a.term.code,
    nextDeadline: a.nextDeadline ? { ...a.nextDeadline, formattedDate: formatLongDate(day(a.nextDeadline.dueDate)) } : null,
    overdue: a.overdue,
    breakdown: charges.map((t) => ({ label: t.description, amount: t.amount, category: t.category })),
    // Newest first, as the portal lists them; runningBalance is the balance after each entry in posting order.
    transactions: withRunningBalance(a.transactions).reverse().map((t) => ({
      id: t.reference,
      date: formatShortDate(day(t.date)),
      dateIso: t.date,
      description: t.description,
      amount: t.amount,
      signedAmount: t.signedAmount,
      direction: t.direction,
      paymentMethod: t.method,
      status: t.status === 'REVERSED' ? 'Reversed' : 'Posted',
      type: TYPE_LABEL[t.type] ?? t.type,
      isDemo: t.isDemo,
      runningBalance: t.runningBalance,
    })),
    invoices: a.invoices,
    paymentsEnabled: false,
    paymentsNote: PAYMENTS_NOTE,
  };
}

const NO_ACCOUNT_MESSAGE = {
  NO_ACCOUNT: 'No charges have been assessed for you yet.',
  UNMAPPED: 'Your portal account is not linked to a student record yet. Contact the registrar.',
  NOT_A_STUDENT: 'This account has no student record.',
};

/** The signed-in student's account. Reads CampusCore when connected; otherwise the local (demo) record. */
export async function getStudentFinance(auth) {
  if (!sisMode()) return getFinance(auth.tenantId, auth.studentProfileId);
  const r = await sis.studentFinance(auth);
  if (r.state === 'OK') return presentSisAccount(r.account);
  // Not an error: an empty state the widget can show calmly.
  return { source: 'campuscore', state: r.state, hasAccount: false, message: NO_ACCOUNT_MESSAGE[r.state] ?? r.message ?? null, currentBalance: 0, formattedBalance: formatCurrency(0), breakdown: [], transactions: [], invoices: [], paymentsEnabled: false, paymentsNote: PAYMENTS_NOTE };
}

const paymentsUnavailable = () => new AppError(409, ErrorCode.CONFLICT, PAYMENTS_NOTE, { reason: 'PAYMENTS_RECORDED_IN_SIS' });

function statusLabel(balance, dueDate) {
  if (balance <= 0) return 'Paid in Full';
  const days = daysUntil(dueDate);
  if (days === null) return 'Payment due';
  if (days < 0) return `Overdue by ${Math.abs(days)} days`;
  if (days === 0) return 'Due today';
  return `Due in ${days} days`;
}

function presentAccount(account) {
  const balance = toNumber(account.currentBalance);
  return {
    accountId: account.id,
    currentBalance: balance,
    formattedBalance: formatCurrency(balance),
    dueDate: formatLongDate(account.dueDate),
    dueDateIso: toIsoDate(account.dueDate),
    status: statusLabel(balance, account.dueDate),
    academicYear: account.academicYear,
    term: account.termLabel,
    breakdown: (account.charges ?? []).map((charge) => ({
      label: charge.label,
      amount: toNumber(charge.amount),
    })),
    transactions: (account.payments ?? []).map((payment) => ({
      id: payment.reference,
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
      transactionId: payment.transactionRef,
      date: formatShortDate(payment.paidAt),
      description: payment.description,
      amount: toNumber(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      type: payment.type,
    })),
  };
}

async function loadAccount(tenantId, studentProfileId) {
  const account = await prisma.tuitionAccount.findFirst({
    where: { tenantId, studentProfileId },
    include: {
      charges: { orderBy: { sortOrder: 'asc' } },
      payments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!account) throw notFound('No tuition account exists for this student.');
  return account;
}

export async function getFinance(tenantId, studentProfileId) {
  return presentAccount(await loadAccount(tenantId, studentProfileId));
}

/**
 * Record a payment. The balance decrement and the transaction insert happen in one
 * transaction so a partial write cannot leave the account inconsistent.
 */
export async function createPayment(tenantId, studentProfileId, { amount, methodType, methodDisplay }) {
  if (sisMode()) throw paymentsUnavailable();
  const account = await loadAccount(tenantId, studentProfileId);
  const current = toNumber(account.currentBalance);
  const paid = Number(amount);
  const nextBalance = Math.max(0, Number((current - paid).toFixed(2)));

  const reference = buildReference('TX');
  const receiptNumber = `ENX-${Math.floor(1000 + Math.random() * 9000)}`;

  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        tenantId,
        tuitionAccountId: account.id,
        reference,
        receiptNumber,
        transactionRef: reference,
        description: `Online Tuition Payment (${methodType ?? 'Card'})`,
        amount: paid,
        paymentMethod: methodDisplay ?? 'Card payment',
        status: 'Completed',
        type: 'Payment',
        paidAt: new Date(),
      },
    }),
    prisma.tuitionAccount.update({
      where: { id: account.id },
      data: {
        currentBalance: nextBalance,
        statusLabel: statusLabel(nextBalance, account.dueDate),
      },
    }),
    // A payment produces a notification, as it did in the prototype — but now the
    // notification is a database row, not browser state.
    prisma.notification.create({
      data: {
        tenantId,
        userId: (await prisma.studentProfile.findUnique({ where: { id: studentProfileId } })).userId,
        title: `Tuition Payment of ${formatCurrency(paid)} Successful`,
        message: `Your payment was processed under Transaction ID ${reference}. Receipt ${receiptNumber} is now archived in your records.`,
        category: 'finance',
        priority: 'normal',
        link: '/finance',
        sourceType: 'PAYMENT',
      },
    }),
  ]);

  const refreshed = await loadAccount(tenantId, studentProfileId);

  return {
    success: true,
    transactionId: payment.transactionRef,
    receiptNumber: payment.receiptNumber,
    amountPaid: paid,
    newBalance: nextBalance,
    transaction: {
      id: payment.reference,
      receiptNumber: payment.receiptNumber,
      transactionId: payment.transactionRef,
      date: formatShortDate(payment.paidAt),
      description: payment.description,
      amount: toNumber(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      type: payment.type,
    },
    account: presentAccount(refreshed),
  };
}

export async function listPayments(tenantId, studentProfileId, auth) {
  if (sisMode()) {
    const account = await getStudentFinance(auth);
    return account.transactions.filter((t) => t.type === 'Payment');
  }
  const account = await loadAccount(tenantId, studentProfileId);
  return presentAccount(account).transactions;
}

/** Demo helper used by the "Reset demo balance" control the prototype already has. */
export async function resetFinance(tenantId, studentProfileId) {
  if (sisMode()) throw paymentsUnavailable();
  const account = await loadAccount(tenantId, studentProfileId);
  const opening = toNumber(account.openingBalance);
  await prisma.payment.deleteMany({
    where: {
      tuitionAccountId: account.id,
      type: 'Payment',
      description: { contains: 'Online Tuition Payment' },
    },
  });
  await prisma.tuitionAccount.update({
    where: { id: account.id },
    data: { currentBalance: opening, statusLabel: statusLabel(opening, account.dueDate) },
  });
  return presentAccount(await loadAccount(tenantId, studentProfileId));
}
