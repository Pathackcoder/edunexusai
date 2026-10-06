import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import { DarkSurface } from '../common/DarkSurface';
import { SortableDashboard } from './SortableDashboard';
import { WidgetSkeleton } from '../common/Skeletons';

/**
 * Persona hero banner (student, faculty, admin) in the EdunexusAI dark-surface language:
 * navy/indigo, cyan and violet light, a faint grid. Text and chips are light-on-dark.
 */
export const heroChipSx = {
  bgcolor: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(8px)',
  '& .MuiChip-icon': { color: '#A5F3FC' },
  '&.MuiChip-clickable:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
};

export function HeroBanner({ eyebrow, title, highlight, description, chips, aside, children, sx }) {
  return (
    <DarkSurface glow="both" sx={{ borderRadius: '22px', px: { xs: 2.5, sm: 3.5 }, py: { xs: 2.25, sm: 2.5 }, boxShadow: '0 22px 50px -28px rgba(20, 24, 80, 0.8)', ...sx }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={3}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <Chip
              label={eyebrow}
              sx={{ mb: 1, color: '#fff', fontWeight: 700, backgroundImage: 'linear-gradient(115deg, #4F46E5, #7C3AED)', boxShadow: '0 6px 16px -8px rgba(124, 58, 237, 0.9)' }}
            />
          )}
          <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem', lg: '1.9375rem' }, letterSpacing: '-0.025em', color: '#fff' }}>
            {title}
            {highlight && (
              <Box component="span" sx={{ backgroundImage: 'linear-gradient(90deg, #67E8F9, #C4B5FD)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {highlight}
              </Box>
            )}
          </Typography>
          {description && (
            <Typography variant="body1" sx={{ mt: 0.5, maxWidth: 720, color: 'text.secondary' }}>
              {description}
            </Typography>
          )}
          {chips && (
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mt: 1.5 }}>
              {chips}
            </Stack>
          )}
          {children}
        </Box>
        {aside && <Box sx={{ flexShrink: 0, minWidth: 0 }}>{aside}</Box>}
      </Stack>
    </DarkSurface>
  );
}

/** Banner placeholder with the same footprint as HeroBanner. */
export const HeroSkeleton = () => (
  <DarkSurface glow="both" sx={{ borderRadius: '22px', px: { xs: 2.5, sm: 3.5 }, py: { xs: 2.25, sm: 2.5 } }}>
    <Skeleton variant="rounded" width={90} height={24} sx={{ borderRadius: '999px' }} />
    <Skeleton variant="rounded" width="42%" height={30} sx={{ mt: 1.5, borderRadius: '8px' }} />
    <Skeleton variant="rounded" width="60%" height={14} sx={{ mt: 1.25, borderRadius: '6px' }} />
    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
      {[120, 220, 100].map((w) => <Skeleton key={w} variant="rounded" width={w} height={26} sx={{ borderRadius: '999px' }} />)}
    </Stack>
  </DarkSurface>
);

/**
 * Whole-dashboard placeholder: banner + widget skeletons packed by the same layout engine
 * as the real dashboard, so nothing jumps when data arrives.
 * widgets: [{ kind, span, rows }]
 */
export const DashboardSkeleton = ({ widgets, hero = true, banner }) => (
  <Stack spacing={{ xs: 2, md: 2.25 }} aria-hidden>
    {hero && (banner ?? <HeroSkeleton />)}
    <SortableDashboard
      disabled
      order={widgets.map((_, index) => `skeleton-${index}`)}
      items={widgets.map((widget, index) => ({
        key: `skeleton-${index}`,
        span: widget.span ?? { md: 6, lg: 4 },
        node: <WidgetSkeleton kind={widget.kind} rows={widget.rows} />,
      }))}
    />
  </Stack>
);
