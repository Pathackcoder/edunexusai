import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha } from '@mui/material/styles';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useNotifications } from '../../context/NotificationContext';
import { useI18n } from '../../i18n';

const ROTATE_MS = 5200;
const MAX_ITEMS = 5;
const HEIGHT = 40;

const isUrgent = (item) => String(item?.priority ?? '').toLowerCase() === 'high';

/**
 * Compact one-line notification bar for the student dashboard. Reads the existing
 * notification context (no separate fetch). Unread items rotate gently with a short
 * cross-fade; hovering or focusing pauses it, and reduced motion shows the latest only.
 */
export function NotificationTicker() {
  const { notifications, unreadCount } = useNotifications();
  const navigate = useNavigate();
  const { t } = useI18n();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Unread first (newest first, as the API orders them); otherwise the latest notice.
  const items = useMemo(() => {
    const unread = notifications.filter((item) => !item.isRead);
    return (unread.length ? unread : notifications).slice(0, MAX_ITEMS);
  }, [notifications]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const rotating = items.length > 1 && !reduceMotion;

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  useEffect(() => {
    if (!rotating || paused) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [rotating, paused, items.length]);

  if (!items.length) return null;
  const active = items[Math.min(index, items.length - 1)];
  const accent = isUrgent(active) ? '#D97706' : '#4F46E5';

  return (
    <Box
      role="region"
      aria-label={t('Latest notifications')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      sx={{
        position: 'relative',
        height: HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 1.25 },
        pl: 0.75,
        pr: { xs: 0.5, sm: 0.75 },
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: alpha(accent, 0.18),
        background: `linear-gradient(90deg, ${alpha(accent, 0.08)} 0%, ${alpha('#7C3AED', 0.045)} 55%, ${alpha('#22D3EE', 0.05)} 100%), #FFFFFF`,
        boxShadow: `0 1px 2px rgba(18, 24, 51, 0.04), 0 8px 18px -16px ${alpha(accent, 0.6)}`,
        transition: 'border-color 300ms ease, box-shadow 300ms ease',
        '&:hover': { borderColor: alpha(accent, 0.32), boxShadow: `0 1px 2px rgba(18, 24, 51, 0.04), 0 10px 22px -14px ${alpha(accent, 0.6)}` },
      }}
    >
      {/* Icon + unread count */}
      <Box
        aria-hidden
        sx={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: '9px',
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          background: isUrgent(active) ? 'linear-gradient(135deg, #D97706, #F59E0B)' : 'linear-gradient(135deg, #4651DE, #7A4FD8)',
          boxShadow: `0 6px 12px -6px ${alpha(accent, 0.8)}`,
          transition: 'background 300ms ease',
          '& svg': { fontSize: 16 },
        }}
      >
        <NotificationsActiveRoundedIcon />
      </Box>
      <Box
        component="span"
        sx={{
          flexShrink: 0,
          px: 0.875,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          color: unreadCount > 0 ? accent : 'text.secondary',
          bgcolor: unreadCount > 0 ? alpha(accent, 0.1) : 'grey.100',
        }}
      >
        {unreadCount > 0 ? `${unreadCount} ${t('unread')}` : t('Up to date')}
      </Box>

      {/* Rotating latest notification */}
      <ButtonBase
        onClick={() => navigate(active.link || '/notifications')}
        aria-label={`${active.title}${active.message ? `: ${active.message}` : ''}`}
        sx={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          justifyContent: 'flex-start',
          borderRadius: '8px',
          textAlign: 'left',
          '&:focus-visible': { outline: `2px solid ${alpha(accent, 0.5)}`, outlineOffset: -2 },
          '&:hover .ticker-title': { color: accent },
        }}
      >
        <Box
          key={active.id}
          aria-live="off"
          sx={{
            minWidth: 0,
            width: '100%',
            display: 'flex',
            alignItems: 'baseline',
            gap: 1,
            '@keyframes enxTickerIn': {
              from: { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
              to: { opacity: 1, transform: 'none' },
            },
            animation: rotating ? 'enxTickerIn 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both' : 'none',
          }}
        >
          <Typography className="ticker-title" variant="body2" noWrap sx={{ fontWeight: 600, color: 'text.primary', flexShrink: { xs: 1, md: 0 }, maxWidth: { md: '45%' }, transition: 'color 200ms ease' }}>
            {active.title}
          </Typography>
          {active.message && (
            <Typography variant="body2" noWrap color="text.secondary" sx={{ minWidth: 0, flex: 1, display: { xs: 'none', md: 'block' } }}>
              {active.message}
            </Typography>
          )}
        </Box>
      </ButtonBase>

      {/* Position dots for multiple items */}
      {rotating && (
        <Stack direction="row" spacing={0.5} aria-hidden sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 0 }}>
          {items.map((item, i) => (
            <Box
              key={item.id}
              sx={{
                width: i === index ? 14 : 5,
                height: 5,
                borderRadius: '999px',
                bgcolor: i === index ? accent : alpha(accent, 0.22),
                transition: 'width 300ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 300ms ease',
              }}
            />
          ))}
        </Stack>
      )}

      <ButtonBase
        onClick={() => navigate('/notifications')}
        sx={{
          flexShrink: 0,
          gap: 0.375,
          px: 1,
          height: 28,
          borderRadius: '8px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'primary.main',
          whiteSpace: 'nowrap',
          transition: 'background-color 200ms ease',
          '& svg': { fontSize: 16, transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' },
          '&:hover': { bgcolor: alpha('#4F46E5', 0.08), '& svg': { transform: 'translateX(2px)' } },
          '&:focus-visible': { outline: `2px solid ${alpha('#4F46E5', 0.5)}` },
        }}
      >
        {t('View all')}
        <ArrowForwardRoundedIcon />
      </ButtonBase>
    </Box>
  );
}

export default NotificationTicker;
