import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { MetricLabel } from '../common/Section';

export const TuitionBalanceCard = ({ financeData, onMakePayment, onResetBalance, isCompact = false }) => {
  const isPaid = financeData.currentBalance === 0;

  return (
    <Card sx={{ p: { xs: 2.25, sm: 2.75 }, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
        <Box>
          <MetricLabel>Current Tuition Balance</MetricLabel>
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.75 }}>
            <Typography
              variant="metric"
              component="span"
              sx={{ fontSize: isCompact ? '1.875rem' : { xs: '2.125rem', md: '2.5rem' }, color: isPaid ? 'success.main' : 'text.primary' }}
            >
              ${Number(financeData.currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
            <Typography variant="body2" color="text.secondary">USD</Typography>
          </Stack>
        </Box>

        {isPaid ? (
          <Badge variant="success" dot>Settled in Full</Badge>
        ) : (
          <Badge variant="warning" dot>{financeData.status || 'Due Soon'}</Badge>
        )}
      </Stack>

      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'text.secondary' }}>
        <EventOutlinedIcon sx={{ fontSize: 18, color: 'grey.500' }} />
        <Typography variant="body2" color="text.secondary">
          Due date: <Box component="strong" sx={{ color: 'text.primary' }}>{financeData.dueDate}</Box>
        </Typography>
      </Stack>

      {!isCompact && financeData.breakdown && (
        <Box>
          <Divider sx={{ mb: 1.5 }} />
          <MetricLabel sx={{ mb: 1 }}>Semester Summary ({financeData.term})</MetricLabel>
          <Stack spacing={0.75}>
            {financeData.breakdown.slice(0, 3).map((item, i) => (
              <Stack key={i} direction="row" justifyContent="space-between" spacing={2}>
                <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ color: item.amount < 0 ? 'success.main' : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                  {item.amount < 0 ? `-$${Math.abs(item.amount).toLocaleString('en-US')}` : `$${item.amount.toLocaleString('en-US')}`}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <Stack direction="row" spacing={1.25} sx={{ mt: 'auto', pt: 0.5 }}>
        {isPaid ? (
          <>
            <Button variant="secondary" disabled icon={CheckRoundedIcon} sx={{ flex: 1 }}>
              Settled
            </Button>
            {onResetBalance && (
              <Button variant="outline" icon={RestartAltRoundedIcon} onClick={onResetBalance} sx={{ flex: 1 }}>
                Reset Demo ($4,280)
              </Button>
            )}
          </>
        ) : (
          <Button variant="primary" icon={CreditCardRoundedIcon} onClick={onMakePayment} sx={{ flex: 1 }}>
            Make Payment
          </Button>
        )}
      </Stack>
    </Card>
  );
};
