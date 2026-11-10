import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Badge } from '../common/Badge';
import { MetricLabel } from '../common/Section';
import { EmptyState } from '../common/EmptyState';

/**
 * The student's account as CampusCore SIS keeps it: every figure here comes from CampusCore's ledger (charges,
 * payments, credits, reversals), read for the signed-in student only. Nothing is computed from local records.
 */
const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const longDate = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const STANDING = {
  SETTLED: { label: 'Settled', variant: 'success' },
  CREDIT_BALANCE: { label: 'Credit balance', variant: 'success' },
  BALANCE_DUE: { label: 'Payment due', variant: 'warning' },
  PAST_DUE: { label: 'Past due', variant: 'danger' },
};
// Same colours as the dashboard widget: charges amber, payments green, credits purple.
const TYPE_VARIANT = { Charge: 'warning', Payment: 'success', Credit: 'purple', Refund: 'neutral', Adjustment: 'neutral', Reversal: 'danger' };
const shortDate = (iso, fallback) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : fallback);

const Row = ({ label, value, strong, tone }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong ? 600 : 400 }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, color: tone ?? 'text.primary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</Typography>
  </Stack>
);

export const SisAccountView = ({ account }) => {
  if (!account.hasAccount) {
    return (
      <Card sx={{ p: 3 }}>
        <EmptyState title="Nothing owed" description={account.message ?? 'No charges have been assessed for you yet.'} />
      </Card>
    );
  }
  const standing = STANDING[account.standing] ?? STANDING.BALANCE_DUE;
  const t = account.totals;
  return (
    <Stack spacing={{ xs: 2, md: 2.5 }}>
      {account.isDemo && (
        <Card sx={{ p: 2, bgcolor: 'background.subtle' }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Illustrative data.</strong> This account was created to demonstrate the Student Accounts integration. Its fees, payment and
            scholarship are simulated: no money has been charged or received.
          </Typography>
        </Card>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 2, md: 2.5 } }}>
        <Card sx={{ p: { xs: 2.25, sm: 2.75 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <MetricLabel>Outstanding balance</MetricLabel>
            <Badge variant={standing.variant} dot>{standing.label}</Badge>
          </Stack>
          <Typography variant="metric" component="strong" sx={{ fontSize: { xs: '2rem', md: '2.25rem' }, color: account.currentBalance > 0 ? 'text.primary' : 'success.main' }}>
            {account.formattedBalance}
          </Typography>
          <Stack spacing={0.75}>
            <Row label="Payment due by" value={account.currentBalance > 0 ? longDate(account.nextDeadline?.dueDate ?? account.dueDateIso) : 'Nothing due'} />
            <Row label="Term" value={account.term} />
            <Row label="Account" value={account.accountNumber} />
            <Row label="Account status" value={account.accountStatus === 'OPEN' ? 'Open' : account.accountStatus === 'ON_HOLD' ? 'On hold' : 'Closed'} />
          </Stack>
          {account.overdue?.length > 0 && (
            <Typography variant="caption" color="error.main">Past due: {account.overdue.map((d) => `${d.label} (${longDate(d.dueDate)})`).join(', ')}</Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 'auto' }}>{account.paymentsNote}</Typography>
        </Card>

        <Card sx={{ p: { xs: 2.25, sm: 2.75 }, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <MetricLabel>Assessed fees</MetricLabel>
          {account.breakdown.length === 0 && <Typography variant="body2" color="text.secondary">No fees assessed.</Typography>}
          {account.breakdown.map((c, i) => <Row key={i} label={c.label} value={usd(c.amount)} />)}
          <Divider sx={{ borderStyle: 'dashed' }} />
          <Row label="Total assessed" value={usd(t.charges)} strong />
          {t.payments !== 0 && <Row label="Payments" value={`−${usd(t.payments)}`} tone="success.main" />}
          {t.credits !== 0 && <Row label="Scholarships & credits" value={`−${usd(t.credits)}`} tone="success.main" />}
          {t.refunds !== 0 && <Row label="Refunds" value={usd(t.refunds)} />}
          {t.adjustments !== 0 && <Row label="Adjustments" value={usd(t.adjustments)} />}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 'auto', pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2">Balance</Typography>
            <Typography variant="metric" component="span" sx={{ fontSize: '1.375rem' }}>{usd(t.balance)}</Typography>
          </Stack>
        </Card>
      </Box>

      {account.invoices.length > 0 && (
        <Card sx={{ p: { xs: 2.25, sm: 2.75 } }}>
          <MetricLabel sx={{ mb: 1.5 }}>Invoices</MetricLabel>
          <Stack spacing={2}>
            {account.invoices.map((inv) => (
              <Box key={inv.number} sx={{ p: 1.75, border: 1, borderColor: 'divider', borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">{inv.number}</Typography>
                  <Typography variant="caption" color="text.secondary">Issued {longDate(String(inv.issuedAt).slice(0, 10))} · due {longDate(inv.dueDate)}</Typography>
                </Stack>
                <Stack spacing={0.5}>
                  {inv.lines.map((l) => (
                    <Stack key={l.reference} direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" color="text.secondary">{l.description}</Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>{l.reference}</Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{usd(l.amount)}</Typography>
                    </Stack>
                  ))}
                  <Divider sx={{ borderStyle: 'dashed', my: 0.5 }} />
                  <Row label="Invoice total" value={usd(inv.total)} strong />
                </Stack>
              </Box>
            ))}
          </Stack>
        </Card>
      )}

      <Card sx={{ p: { xs: 2.25, sm: 2.75 } }}>
        <MetricLabel sx={{ mb: 1.5 }}>Statement of account</MetricLabel>
        {account.transactions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No transactions yet.</Typography>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {account.transactions.map((tx) => (
                  <TableRow key={tx.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{shortDate(tx.dateIso, tx.date)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tx.id}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', minWidth: 220 }}>
                      {tx.description}
                      {tx.paymentMethod ? ` · ${tx.paymentMethod}` : ''}
                      {tx.status === 'Reversed' && <Typography component="span" variant="caption" color="error.main"> (reversed)</Typography>}
                    </TableCell>
                    <TableCell><Badge variant={TYPE_VARIANT[tx.type] ?? 'neutral'}>{tx.type}</Badge></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: tx.signedAmount < 0 ? 'success.main' : 'text.primary' }}>
                      {tx.signedAmount < 0 ? `−${usd(tx.amount)}` : usd(tx.amount)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{usd(tx.runningBalance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Stack>
  );
};

export default SisAccountView;
