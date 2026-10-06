import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { useFinance } from '../context/FinanceContext';
import { TuitionBalanceCard } from '../components/finance/TuitionBalanceCard';
import { PaymentModal } from '../components/finance/PaymentModal';
import { TransactionsTable } from '../components/finance/TransactionsTable';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { IconTile } from '../components/common/IconTile';
import { PageHeader } from '../components/common/PageHeader';
import { MetricLabel } from '../components/common/Section';
import { useToast } from '../components/common/Toast';
import { useAuth } from '../context/AuthContext';

/** Earlier finance screen. Not routed (see App.jsx); kept and restyled for consistency. */
export const FinancePage = () => {
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
            <Box>
              {financeData.breakdown.map((item, idx) => (
                <Stack
                  key={idx}
                  direction="row"
                  justifyContent="space-between"
                  spacing={2}
                  sx={{ py: 1, borderBottom: idx === financeData.breakdown.length - 1 ? 0 : 1, borderColor: 'divider' }}
                >
                  <Typography variant="body2" sx={{ color: item.amount < 0 ? 'success.main' : 'text.secondary' }}>{item.label}</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: item.amount < 0 ? 'success.main' : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                    {item.amount < 0 ? `-$${Math.abs(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `$${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </Typography>
                </Stack>
              ))}
            </Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 'auto', px: 1.75, py: 1.25, bgcolor: 'background.subtle', borderRadius: 2.5, border: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2">Net Balance Due:</Typography>
              <Typography variant="metric" component="span" sx={{ fontSize: '1.25rem', color: financeData.currentBalance === 0 ? 'success.main' : 'text.primary' }}>
                ${Number(financeData.currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
              </Typography>
            </Stack>
          </Card>
        </Box>

        {/* Payment Plans & Direct Deposit Note */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Card sx={{ p: 2.25 }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <IconTile icon={EventRepeatOutlinedIcon} tone="primary" size={34} />
              <Box>
                <Typography variant="subtitle2">Monthly Installment Plan</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem', mt: 0.25 }}>
                  Enrolled in 3-part semester installment plan. Remaining installments will be automatically due on Nov 15 and Dec 15.
                </Typography>
              </Box>
            </Stack>
          </Card>
          <Card sx={{ p: 2.25 }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <IconTile icon={VerifiedUserOutlinedIcon} tone="success" size={34} />
              <Box>
                <Typography variant="subtitle2">Direct Deposit (eRefund) Active</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem', mt: 0.25 }}>
                  Excess aid disbursements will automatically route to Chase checking account ending in ****8912 within 48 hours.
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Box>

        {/* Payment History & Transactions Table */}
        <TransactionsTable transactions={financeData.transactions} />
      </Stack>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        currentBalance={financeData.currentBalance}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Box>
  );
};
