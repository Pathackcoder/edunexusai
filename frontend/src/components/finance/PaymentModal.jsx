import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import { alpha } from '@mui/material/styles';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { MetricLabel } from '../common/Section';
import { PaymentSuccessSvg } from '../../assets/illustrations/PaymentSuccessSvg';
import { useAuth } from '../../context/AuthContext';

/** Selectable option tile used for amount and method choices. */
const OptionTile = ({ selected, onClick, children, sx }) => (
  <ButtonBase
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    sx={(theme) => ({
      position: 'relative',
      width: '100%',
      p: 1.5,
      borderRadius: 3,
      border: `1.5px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
      bgcolor: selected ? alpha(theme.palette.primary.main, 0.05) : 'background.paper',
      boxShadow: selected ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
      transition: 'border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
      '&:hover': { borderColor: selected ? 'primary.main' : 'grey.300' },
      ...sx,
    })}
  >
    {selected && (
      <CheckCircleRoundedIcon sx={{ position: 'absolute', top: 6, right: 6, fontSize: 16, color: 'primary.main' }} />
    )}
    {children}
  </ButtonBase>
);

const ReceiptRow = ({ label, children, divider }) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    spacing={2}
    sx={divider ? { borderTop: 1, borderColor: 'divider', pt: 1.25 } : undefined}
  >
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Box sx={{ textAlign: 'right', typography: 'body2', fontWeight: 600 }}>{children}</Box>
  </Stack>
);

export const PaymentModal = ({ isOpen, onClose, currentBalance, onPaymentSuccess }) => {
  const { user } = useAuth();
  const [amountType, setAmountType] = useState('full'); // 'full', 'minimum', 'custom'
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' or 'ach'

  // Demo Card Fields
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardHolder, setCardHolder] = useState(user?.fullName ?? '');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');

  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  const fullAmount = Number(currentBalance) || 0;
  const minimumAmount = Math.min(1500, fullAmount);

  const selectedAmount =
    amountType === 'full'
      ? fullAmount
      : amountType === 'minimum'
      ? minimumAmount
      : parseFloat(customAmount) || 0;

  const handlePayNow = async (e) => {
    e.preventDefault();
    if (selectedAmount <= 0) return;

    setIsProcessing(true);
    setProcessingStep('Establishing encrypted link with university bank...');

    await new Promise(r => setTimeout(r, 600));
    setProcessingStep('Verifying student account authorization...');

    await new Promise(r => setTimeout(r, 600));

    const result = await onPaymentSuccess(selectedAmount, {
      type: paymentMethod === 'card' ? 'Credit Card' : 'Direct ACH',
      display: paymentMethod === 'card' ? 'Visa ending in 4242' : 'ACH Chase ****8912'
    });

    setIsProcessing(false);
    setSuccessResult(result);

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {
      // Ignore if confetti is not available
    }
  };

  const handleClose = () => {
    setSuccessResult(null);
    setIsProcessing(false);
    onClose();
  };

  const amountOptions = [
    { key: 'full', label: 'Full Balance', value: `$${fullAmount.toFixed(0)}` },
    { key: 'minimum', label: 'Minimum Due', value: `$${minimumAmount.toFixed(0)}` },
    { key: 'custom', label: 'Other Amount', value: 'Custom' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={successResult ? "Payment Confirmation" : "Make Tuition Payment"}
      subtitle={successResult ? "Transaction Verified" : "Simulated Student Bursar Gateway"}
      maxWidth="540px"
    >
      {isProcessing ? (
        <Stack alignItems="center" spacing={1} sx={{ py: 5, px: 2, textAlign: 'center' }}>
          <Box sx={{ position: 'relative', display: 'inline-flex', mb: 1.5 }}>
            <CircularProgress size={56} thickness={3.5} />
          </Box>
          <Typography variant="h5" component="h4">Processing Payment...</Typography>
          <Typography variant="body2" color="text.secondary">{processingStep}</Typography>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ pt: 2, color: 'text.secondary' }}>
            <LockOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">256-bit TLS University Gateway Simulation</Typography>
          </Stack>
        </Stack>
      ) : successResult ? (
        <Stack alignItems="center" spacing={2} sx={{ py: 1 }}>
          <PaymentSuccessSvg width={104} height={104} />

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" component="h4">Payment Successful</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Your electronic payment has been processed and applied to your student account.
            </Typography>
          </Box>

          {/* Receipt Breakdown Card */}
          <Stack spacing={1.25} sx={{ width: '100%', bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2 }}>
            <ReceiptRow label="Transaction ID:">
              <Box component="span" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem' }}>
                {successResult.transactionId || 'ENX-2026-0928-1842'}
              </Box>
            </ReceiptRow>
            <ReceiptRow label="Receipt Number:">{successResult.receiptNumber || 'ENX-9821'}</ReceiptRow>
            <ReceiptRow label="Student Name:">{user?.fullName ?? '—'}</ReceiptRow>
            <ReceiptRow label="Amount Paid:">
              <Box component="span" sx={{ color: 'success.main', fontSize: '1.0625rem', fontFamily: 'Rubik, sans-serif' }}>
                ${Number(successResult.amountPaid).toFixed(2)} USD
              </Box>
            </ReceiptRow>
            <ReceiptRow label="Updated Balance:" divider>
              ${Number(successResult.newBalance).toFixed(2)} USD
            </ReceiptRow>
          </Stack>

          <Button variant="primary" onClick={handleClose} fullWidth size="lg" sx={{ mt: 1 }}>
            Done & Return to Portal
          </Button>
        </Stack>
      ) : (
        <Box component="form" onSubmit={handlePayNow}>
          <Stack spacing={2.5}>
            {/* Current Balance Banner */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={2}
              sx={(theme) => ({
                px: 2,
                py: 1.75,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.primary.main, 0.05),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
              })}
            >
              <Box>
                <MetricLabel sx={{ color: 'primary.main' }}>Outstanding Tuition Balance</MetricLabel>
                <Typography variant="metric" component="div" sx={{ fontSize: '1.75rem', mt: 0.25 }}>
                  ${fullAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              <Badge variant="primary">Demo University</Badge>
            </Stack>

            {/* Payment Amount Selection */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Select Payment Amount</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
                {amountOptions.map((option) => (
                  <OptionTile key={option.key} selected={amountType === option.key} onClick={() => setAmountType(option.key)}>
                    <Stack alignItems="center" spacing={0.25}>
                      <Typography variant="caption">{option.label}</Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{option.value}</Typography>
                    </Stack>
                  </OptionTile>
                ))}
              </Box>

              {amountType === 'custom' && (
                <TextField
                  type="number"
                  placeholder="Enter amount (e.g. 500.00)"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  required
                  sx={{ mt: 1.25 }}
                  inputProps={{ step: '0.01', min: '1', max: fullAmount }}
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                />
              )}
            </Box>

            {/* Payment Method Selector */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Payment Method</Typography>
              <Stack direction="row" spacing={1}>
                <OptionTile selected={paymentMethod === 'card'} onClick={() => setPaymentMethod('card')}>
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ color: paymentMethod === 'card' ? 'primary.main' : 'text.secondary' }}>
                    <CreditCardRoundedIcon fontSize="small" />
                    <Typography variant="body2" fontWeight={600} color="inherit">Card (Demo)</Typography>
                  </Stack>
                </OptionTile>
                <OptionTile selected={paymentMethod === 'ach'} onClick={() => setPaymentMethod('ach')}>
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ color: paymentMethod === 'ach' ? 'primary.main' : 'text.secondary' }}>
                    <AccountBalanceOutlinedIcon fontSize="small" />
                    <Typography variant="body2" fontWeight={600} color="inherit">ACH Transfer</Typography>
                  </Stack>
                </OptionTile>
              </Stack>
            </Box>

            {/* Simulated Card Form */}
            {paymentMethod === 'card' ? (
              <Stack spacing={1.75} sx={{ p: 2, bgcolor: 'background.subtle', borderRadius: 3, border: 1, borderColor: 'divider' }}>
                <TextField label="Cardholder Name" type="text" value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} required />
                <TextField label="Card Number" type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} required />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField label="Expiry Date" type="text" value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
                  <TextField label="CVV" type="password" inputProps={{ maxLength: 4 }} value={cvv} onChange={(e) => setCvv(e.target.value)} required />
                </Box>
              </Stack>
            ) : (
              <Box sx={{ p: 2, bgcolor: 'background.subtle', borderRadius: 3, border: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ mb: 0.25 }}>Simulated Chase Bank Account (Direct Debit)</Typography>
                <Typography variant="body2" color="text.secondary">Account ending in ****8912 • Routing ****0021</Typography>
              </Box>
            )}

            <Divider />

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Total to Charge:</Typography>
              <Typography variant="metric" component="span" sx={{ fontSize: '1.375rem' }}>
                ${selectedAmount.toFixed(2)} USD
              </Typography>
            </Stack>

            <Stack direction="row" justifyContent="flex-end" spacing={1.25}>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={selectedAmount <= 0}>
                Pay ${selectedAmount.toFixed(2)} Now
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Modal>
  );
};
