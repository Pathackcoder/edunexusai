import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded';
import { Badge } from '../common/Badge';
import { MetricLabel } from '../common/Section';
import { getTone } from '../../theme/tones';

export const currency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

/** Ledger dates are calendar days: format them in UTC so no timezone shifts the day. */
export const longDate = (iso, fallback) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : fallback ?? '—';
};

/**
 * How an entry moves the balance: charges raise it, payments and credits lower it. Uses the ledger
 * direction when present (CampusCore), the type otherwise (local finance).
 */
export function entryKind(t) {
  const type = String(t?.type ?? '').toUpperCase();
  const credit = t?.direction ? t.direction === 'CREDIT' : ['PAYMENT', 'CREDIT', 'REFUND_CREDIT'].includes(type);
  if (type === 'PAYMENT') return { tone: 'success', icon: PaymentsOutlinedIcon, credit };
  if (type === 'CREDIT') return { tone: 'purple', icon: SavingsOutlinedIcon, credit };
  if (type === 'CHARGE') return { tone: 'warning', icon: ReceiptLongOutlinedIcon, credit };
  return { tone: 'neutral', icon: SyncAltRoundedIcon, credit };
}

export const signedCurrency = (t) => `${entryKind(t).credit ? '−' : '+'}${currency(t.amount)}`;

export function standingOf(finance) {
  if (finance.standing === 'PAST_DUE') return { label: 'Past due', variant: 'danger' };
  if (finance.currentBalance > 0) return { label: 'Payment due', variant: 'warning' };
  if (finance.currentBalance < 0) return { label: 'Credit balance', variant: 'success' };
  return { label: 'Settled', variant: 'success' };
}

const Metric = ({ label, value, dot }) => (
  <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dot, flexShrink: 0 }} />
      <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>{label}</Typography>
    </Stack>
    <Typography variant="subtitle1" component="p" noWrap sx={{ mt: 0.25, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
      {value}
    </Typography>
  </Box>
);

/**
 * Body of the dashboard "Tuition & Accounts" widget: balance, due date and standing, the
 * assessed vs. paid split and the latest ledger entry. Sized to fit a standard dashboard slot;
 * `action` (the button) is pinned to the bottom.
 */
export const TuitionAccountSummary = ({ finance, action }) => {
  const theme = useTheme();
  const status = standingOf(finance);
  const latest = finance.transactions?.[0];
  const kind = latest && entryKind(latest);
  const kindTone = kind && getTone(theme, kind.tone);
  const KindIcon = kind?.icon;
  const due = finance.currentBalance > 0 ? `Due ${finance.dueDate ?? '—'}` : 'Nothing due';

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ minWidth: 0 }}>
        <MetricLabel sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Outstanding balance</MetricLabel>
        <Badge variant={status.variant} dot size="small" sx={{ flexShrink: 0, fontWeight: 600 }}>{status.label}</Badge>
      </Stack>
      <Typography
        variant="metric"
        component="strong"
        sx={{ display: 'block', lineHeight: 1.15, fontSize: '1.875rem', fontVariantNumeric: 'tabular-nums', color: finance.currentBalance > 0 ? 'text.primary' : 'success.main' }}
      >
        {finance.formattedBalance ?? currency(finance.currentBalance)}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.25, minWidth: 0, color: 'text.secondary' }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
          <EventOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
          <Typography variant="caption" noWrap>{due}</Typography>
        </Stack>
        {finance.isDemo && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{ minWidth: 0, flexShrink: 0 }}
            title="Demonstration data recorded in CampusCore. No real charge, payment or scholarship."
          >
            <InfoOutlinedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" noWrap>Illustrative</Typography>
          </Stack>
        )}
      </Stack>

      {finance.totals && (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ mt: 1.25, px: 1.5, py: 0.75, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.035) }}
        >
          <Metric label="Assessed" value={currency(finance.totals.charges)} dot="warning.main" />
          <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'divider' }} />
          <Metric label="Payments & credits" value={currency(finance.totals.payments + finance.totals.credits)} dot="success.main" />
        </Stack>
      )}

      {latest && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, minWidth: 0 }}>
          <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, color: kindTone.fg, bgcolor: kindTone.bg }}>
            <KindIcon sx={{ fontSize: 15 }} />
          </Box>
          <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }} title={latest.description}>
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{latest.type ?? 'Entry'}</Box>
            {' · '}{longDate(latest.dateIso, latest.date)}
          </Typography>
          <Typography variant="body2" noWrap sx={{ flexShrink: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: kind.credit ? 'success.main' : 'text.primary' }}>
            {signedCurrency(latest)}
          </Typography>
        </Stack>
      )}

      {action && <Box sx={{ mt: 'auto', pt: 1.25 }}>{action}</Box>}
    </>
  );
};
