import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import { DarkSurface } from '../common/DarkSurface';
import { SortableDashboard } from './SortableDashboard';
import { WidgetSkeleton } from '../common/Skeletons';
import { StatCard } from '../common/StatCard';

/**
 * Persona hero banner (student, faculty, admin) in the EdunexusAI dark-surface language:
 * navy/indigo, cyan and violet light, a faint grid. Text and chips are light-on-dark.
 */
export const heroChipSx = {
  bgcolor: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(8px)',
  '& .MuiChip-icon': { color: 'var(--enx-accent)' },
  '&.MuiChip-clickable:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
};

export function HeroBanner({ eyebrow, title, highlight, description, chips, aside, children, dense = false, sx }) {
  return (
    <DarkSurface glow="both" sx={{ borderRadius: '22px', px: { xs: 2, sm: dense ? 3 : 3.5 }, py: dense ? { xs: 1.5, sm: 1.75 } : { xs: 2, sm: 2.25 }, boxShadow: '0 22px 50px -28px rgba(20, 24, 80, 0.8)', ...sx }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={3}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <Chip
              label={eyebrow}
              sx={{ mb: dense ? 0.75 : 1, color: '#fff', fontWeight: 700, backgroundImage: 'linear-gradient(115deg, var(--enx-primary), var(--enx-secondary))', boxShadow: '0 6px 16px -8px color-mix(in srgb, var(--enx-secondary) 90%, transparent)' }}
            />
          )}
          <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.4rem', sm: '1.625rem', lg: '1.75rem' }, letterSpacing: '-0.025em', color: '#fff' }}>
            {title}
            {highlight && (
              <Box component="span" sx={{ backgroundImage: 'linear-gradient(90deg, var(--enx-accent), color-mix(in srgb, var(--enx-accent) 55%, #FFFFFF))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {highlight}
              </Box>
            )}
          </Typography>
          {description && (
            <Typography variant="body1" sx={{ mt: dense ? 0.25 : 0.5, maxWidth: 720, color: 'text.secondary' }}>
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

/**
 * The stat row inside a dense persona banner (faculty teaching summary, admin population).
 * One row from tablet up, two columns on phones; compact tiles keep the label, value,
 * icon and supporting line at their usual type sizes.
 */
export const HeroStats = ({ stats, label }) => (
  <Box
    aria-label={label}
    sx={{
      mt: { xs: 1.5, sm: 1.75 },
      display: 'grid',
      gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${stats.length}, minmax(0, 1fr))` },
      gap: { xs: 1, sm: 1.25 },
    }}
  >
    {stats.map((stat) => (
      <StatCard key={stat.label} density="compact" title={stat.label} value={stat.value ?? 0} subtitle={stat.hint} icon={stat.icon} tone={stat.tone} to={stat.to ?? undefined} />
    ))}
  </Box>
);

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
 * widgets: [{ kind, span, rows, size }]
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
        size: widget.size ?? 'standard',
        node: <WidgetSkeleton kind={widget.kind} rows={widget.rows} />,
      }))}
    />
  </Stack>
);
