import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { nexora } from './nexoraStyle';

/** What Nexora looked up for an answer: one chip per tool, shimmering while it runs. */
export function ToolTrail({ tools }) {
  if (!tools?.length) return null;
  return (
    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mb: 1.25 }} aria-label="What Nexora checked">
      {tools.map((tool) => {
        const running = tool.state === 'running';
        const Icon = tool.state === 'error' ? ErrorOutlineRoundedIcon : CheckRoundedIcon;
        return (
          <Box
            key={tool.id}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.6,
              height: 26,
              px: 1.1,
              borderRadius: 999,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: running ? 'primary.dark' : tool.state === 'error' ? 'warning.dark' : nexora.muted,
              border: 1,
              borderColor: running ? 'primary.light' : nexora.hairline,
              background: running
                ? 'linear-gradient(90deg, rgba(70,81,222,0.06) 0%, rgba(139,92,246,0.18) 50%, rgba(70,81,222,0.06) 100%)'
                : 'rgba(255,255,255,0.7)',
              backgroundSize: '220% 100%',
              animation: running ? 'nxShimmer 1.6s linear infinite' : 'nxFadeIn 240ms ease both',
            }}
          >
            {running ? (
              <Box component="span" sx={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid', borderColor: 'primary.light', borderTopColor: 'transparent', animation: 'nxSpin 0.8s linear infinite' }} />
            ) : (
              <Icon sx={{ fontSize: 14 }} />
            )}
            {tool.label}
          </Box>
        );
      })}
    </Stack>
  );
}

/** Three breathing dots while Nexora is thinking before any text arrives. */
export function TypingIndicator({ label = 'Nexora is thinking' }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} role="status" aria-live="polite" sx={{ py: 0.75, color: nexora.muted }}>
      <Stack direction="row" spacing={0.6}>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ width: 7, height: 7, borderRadius: '50%', background: nexora.spectrum, animation: `nxDot 1.2s ${i * 0.16}s ease-in-out infinite` }} />
        ))}
      </Stack>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit' }}>{label}</Typography>
    </Stack>
  );
}

/** Real advising slots returned by the availability tool; choosing one tells Nexora which slot to book. */
export function SlotPicker({ block, onSelect, disabled }) {
  return (
    <Box sx={{ mt: 1.5, p: { xs: 1.5, sm: 2 }, borderRadius: 4, border: 1, borderColor: nexora.hairline, bgcolor: 'rgba(255,255,255,0.75)', animation: 'nxFadeUp 320ms ease both' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
        <EventAvailableRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{block.title}</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
        {block.slots.map((slot) => (
          <ButtonBase
            key={slot.slotRef}
            disabled={disabled}
            onClick={() => onSelect?.(slot)}
            aria-label={`Choose ${slot.when}`}
            sx={{
              justifyContent: 'flex-start',
              textAlign: 'left',
              gap: 1.25,
              p: 1.25,
              borderRadius: 3,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              transition: `transform 180ms ${nexora.ease}, border-color 180ms ease, box-shadow 180ms ease`,
              '&:hover': { borderColor: 'primary.main', transform: 'translateY(-1px)', boxShadow: '0 8px 20px -14px rgba(70,81,222,0.6)' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              '&.Mui-disabled': { opacity: 0.55 },
            }}
          >
            <Box sx={{ width: 34, height: 34, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.lighter', color: 'primary.dark', flexShrink: 0 }}>
              {slot.mode === 'VIRTUAL' ? <VideocamOutlinedIcon sx={{ fontSize: 18 }} /> : <PlaceOutlinedIcon sx={{ fontSize: 18 }} />}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{slot.when}</Typography>
              <Typography variant="caption" sx={{ color: nexora.muted }} noWrap>{slot.mode === 'VIRTUAL' ? 'Virtual meeting' : slot.location || 'In person'}</Typography>
            </Box>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

/** A portal update in the thread: the confirmed, cancelled or failed outcome of an action. */
export function EventNote({ message }) {
  const action = message.blocks?.find((b) => b.type === 'action')?.action;
  const status = action?.status;
  const tone = status === 'EXECUTED' ? 'success' : status === 'CANCELLED' || status === 'EXPIRED' ? 'neutral' : 'warning';
  const Icon = tone === 'success' ? CheckRoundedIcon : tone === 'neutral' ? BlockRoundedIcon : ErrorOutlineRoundedIcon;
  const text = status === 'EXECUTED' ? action.result?.summary ?? 'Done.' : status === 'CANCELLED' ? 'Cancelled. Nothing was changed.' : status === 'EXPIRED' ? 'This proposal expired.' : action?.errorMessage ?? message.content;
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ my: 1.5, animation: 'nxFadeUp 300ms ease both' }}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          py: 0.6,
          borderRadius: 999,
          fontSize: '0.8rem',
          fontWeight: 600,
          bgcolor: tone === 'success' ? 'success.lighter' : tone === 'neutral' ? 'grey.100' : 'warning.lighter',
          color: tone === 'success' ? 'success.dark' : tone === 'neutral' ? 'grey.600' : 'warning.dark',
        }}
      >
        <Icon sx={{ fontSize: 16 }} />
        <span>{text}</span>
      </Box>
    </Stack>
  );
}
