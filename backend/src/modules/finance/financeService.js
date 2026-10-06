import { prisma } from '../../db/prisma.js';
import { notFound } from '../../utils/errors.js';
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
 * Tuition is Edunexus-owned: the portal accepts the payment, so the portal is the system
 * of record for the account balance, the charge breakdown and the transaction history.
 * A production deployment would post the payment on to the institution's bursar system
 * through a connector; that call would live behind IntegrationService exactly like the
 * academic reads do.
 */

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

export async function listPayments(tenantId, studentProfileId) {
  const account = await loadAccount(tenantId, studentProfileId);
  return presentAccount(account).transactions;
}

/** Demo helper used by the "Reset demo balance" control the prototype already has. */
export async function resetFinance(tenantId, studentProfileId) {
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
