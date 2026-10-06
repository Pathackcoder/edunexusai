import React, { useState } from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { useFinance } from '../../context/FinanceContext';
import { TuitionBalanceCard } from '../../components/finance/TuitionBalanceCard';
import { PaymentModal } from '../../components/finance/PaymentModal';
import { TransactionsTable } from '../../components/finance/TransactionsTable';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { MetricLabel } from '../../components/common/Section';
import { useToast } from '../../components/common/Toast';
import { useAuth } from '../../context/AuthContext';

const ChargeRow = ({ label, amount, muted, tone }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Typography variant={muted ? 'caption' : 'body2'} color="text.secondary">{label}</Typography>
    <Typography
      variant={muted ? 'caption' : 'body2'}
      sx={{ fontWeight: 600, color: tone ?? 'text.primary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
    >
      {amount}
    </Typography>
  </Stack>
);

export const TuitionPaymentsPage = () => {
  const { user } = useAuth();
  const { financeData, makePayment, resetFinanceBalance } = useFinance();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const { showToast } = useToast();

  const handlePaymentSuccess = async (amount, method) => {
    const result = await makePayment(amount, method);
    showToast(`Payment of $${Number(amount).toFixed(2)} processed successfully!`);
    return result;
  };

  const handleResetBalance = () => {
    resetFinanceBalance();
    showToast('Demo balance reset to $4,280.00! Ready to simulate payment again.');
  };

  return (
    <Box>
      <PageHeader
        title="Tuition & Student Accounts"
        description={`Bursar billing statement, electronic payment portal, and itemized transaction receipts for ${user?.fullName ?? 'your account'}.`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={FileDownloadOutlinedIcon}
              onClick={() => alert(`Generating official statement PDF for ${user?.fullName ?? 'this account'}...`)}
            >
              Download Statement
            </Button>

            {financeData.currentBalance === 0 ? (
              <Button variant="outline" size="sm" icon={RestartAltRoundedIcon} onClick={handleResetBalance}>
                Reset Demo ($4,280)
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={CreditCardRoundedIcon} onClick={() => setIsPaymentModalOpen(true)}>
                Make Payment
              </Button>
            )}
          </>
        }
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        {/* Balance & itemized charges */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 2, md: 2.5 } }}>
          <TuitionBalanceCard
            financeData={financeData}
            onMakePayment={() => setIsPaymentModalOpen(true)}
            onResetBalance={handleResetBalance}
          />

          {/* Itemized Tuition & Fee Breakdown */}
          <Card sx={{ p: { xs: 2.25, sm: 2.75 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <MetricLabel>Itemized Semester Charges</MetricLabel>
              <Badge variant="neutral">{financeData.term}</Badge>
            </Stack>

            <Stack spacing={1.25}>
              <ChargeRow label="Graduate Tuition (16 Credits)" amount="$9,600.00" />
              <ChargeRow label="Technology & Computing Lab Fee" amount="$450.00" />
              <ChargeRow label="Student Health & Wellness Fee" amount="$280.00" />
              <ChargeRow label="Campus Infrastructure & Library Fee" amount="$150.00" />
              <Divider sx={{ borderStyle: 'dashed' }} />
              <ChargeRow label="Less: Financial Aid & Scholarships" amount="-$6,200.00" muted tone="secondary.main" />
            </Stack>

            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mt: 'auto', pt: 1.75, borderTop: 1, borderColor: 'divider' }}
            >
              <Typography variant="subtitle2">Net Remaining Due</Typography>
              <Typography variant="metric" component="span" sx={{ fontSize: '1.375rem', color: financeData.currentBalance > 0 ? 'primary.main' : 'success.main' }}>
                ${financeData.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Typography>
            </Stack>
          </Card>
        </Box>

        {/* Transaction History Ledger */}
        <TransactionsTable transactions={financeData.transactions} />
      </Stack>

      {/* Payment Gateway Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        currentBalance={financeData.currentBalance}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Box>
  );
};

export default TuitionPaymentsPage;
