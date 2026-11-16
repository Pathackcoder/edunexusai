import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { nexora } from './nexoraStyle';

const ICONS = {
  message: SendRoundedIcon,
  booking: EventAvailableRoundedIcon,
  announcement: CampaignRoundedIcon,
  ticket: SupportAgentRoundedIcon,
  profile: PersonOutlineRoundedIcon,
  class_message: GroupsRoundedIcon,
  cancel_appointment: EventBusyRoundedIcon,
};

const STATUS = {
  PENDING: { label: 'Waiting for your confirmation', color: 'primary.main' },
  EXECUTED: { label: 'Done', color: 'success.main' },
  FAILED: { label: 'Not completed', color: 'warning.dark' },
  CANCELLED: { label: 'Cancelled', color: 'grey.500' },
  EXPIRED: { label: 'Expired', color: 'grey.500' },
};

/**
 * A proposed action. Nothing happens until the person presses the confirm button; the server re-checks
 * everything at that moment and the card shows exactly what the portal reported back.
 */
export function ActionCard({ action, onDecide }) {
  const [busy, setBusy] = useState(null);
  if (!action) return null;
  const { preview } = action;
  const Icon = ICONS[preview.kind] ?? SendRoundedIcon;
  const status = STATUS[action.status] ?? STATUS.PENDING;
  const pending = action.status === 'PENDING' && new Date(action.expiresAt) > new Date();
  const danger = preview.tone === 'danger';

  const decide = async (decision) => {
    setBusy(decision);
    try {
      await onDecide(action.id, decision);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box
      role="group"
      aria-label={preview.title}
      sx={{
        mt: 1.5,
        position: 'relative',
        borderRadius: 4,
        p: '1px',
        background: pending ? nexora.spectrum : 'linear-gradient(0deg, rgba(18,24,51,0.08), rgba(18,24,51,0.08))',
        boxShadow: pending ? '0 18px 40px -26px rgba(70, 81, 222, 0.65)' : 'none',
        animation: 'nxFadeUp 340ms ease both',
        transition: 'box-shadow 240ms ease',
      }}
    >
      <Box sx={{ borderRadius: 'inherit', bgcolor: 'background.paper', p: { xs: 1.75, sm: 2.25 } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{ width: 40, height: 40, borderRadius: 3, display: 'grid', placeItems: 'center', flexShrink: 0, color: '#fff', background: danger ? 'linear-gradient(135deg, #E25555, #B42C2C)' : nexora.gradient, boxShadow: '0 8px 18px -10px rgba(70,81,222,0.8)' }}>
            <Icon sx={{ fontSize: 20 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>{preview.title}</Typography>
            <Stack direction="row" alignItems="center" spacing={0.6} sx={{ mt: 0.4, color: status.color }}>
              {action.status === 'EXECUTED' ? <CheckCircleRoundedIcon sx={{ fontSize: 15 }} /> : action.status === 'FAILED' ? <ErrorRoundedIcon sx={{ fontSize: 15 }} /> : <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'currentColor', ...(pending ? { animation: 'nxPulse 1.6s ease-in-out infinite' } : {}) }} />}
              <Typography variant="caption" sx={{ fontWeight: 650, color: 'inherit' }}>
                {pending || action.status !== 'PENDING' ? status.label : 'Expired'}
              </Typography>
            </Stack>
          </Box>
        </Stack>

        <Box component="dl" sx={{ m: 0, mt: 1.75, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '120px 1fr' }, columnGap: 2, rowGap: { xs: 0.25, sm: 0.85 } }}>
          {preview.fields?.map((field) => (
            <React.Fragment key={field.label}>
              <Typography component="dt" variant="caption" sx={{ color: nexora.muted, fontWeight: 600, pt: { sm: '2px' }, mt: { xs: 0.75, sm: 0 } }}>{field.label}</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 550, wordBreak: 'break-word' }}>{field.value}</Typography>
            </React.Fragment>
          ))}
        </Box>

        {preview.body && (
          <Box sx={{ mt: 1.75, p: 1.5, borderRadius: 3, bgcolor: 'rgba(70, 81, 222, 0.045)', border: 1, borderColor: nexora.hairline, whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {preview.body}
          </Box>
        )}

        {action.status === 'EXECUTED' && action.result?.summary && (
          <Typography variant="body2" sx={{ mt: 1.5, color: 'success.dark', fontWeight: 600 }}>{action.result.summary}</Typography>
        )}
        {action.status === 'FAILED' && action.errorMessage && (
          <Typography variant="body2" sx={{ mt: 1.5, color: 'warning.dark', fontWeight: 600 }}>{action.errorMessage}</Typography>
        )}

        {pending && (
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flex: 1, color: nexora.muted }}>
              <ShieldOutlinedIcon sx={{ fontSize: 15 }} />
              <Typography variant="caption">Nothing happens until you confirm.</Typography>
            </Stack>
            <Button variant="text" color="inherit" disabled={Boolean(busy)} onClick={() => decide('cancel')} sx={{ color: nexora.muted, fontWeight: 600 }}>
              {busy === 'cancel' ? <CircularProgress size={16} color="inherit" /> : 'Cancel'}
            </Button>
            <Button
              variant="contained"
              disableElevation
              disabled={Boolean(busy)}
              onClick={() => decide('confirm')}
              sx={{
                fontWeight: 700,
                px: 2.25,
                borderRadius: 999,
                background: danger ? 'linear-gradient(135deg, #E25555, #B42C2C)' : nexora.gradient,
                transition: `transform 180ms ${nexora.spring}, box-shadow 180ms ease`,
                '&:hover': { background: danger ? 'linear-gradient(135deg, #D64545, #A12525)' : nexora.gradientHover, transform: 'translateY(-1px)', boxShadow: '0 10px 22px -12px rgba(70,81,222,0.9)' },
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              {busy === 'confirm' ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : preview.confirmLabel ?? 'Confirm'}
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default ActionCard;
