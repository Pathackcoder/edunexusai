import React from 'react';
import { keyframes } from '@emotion/react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';

/**
 * Loading skeletons that mirror the real components, so the layout holds still while
 * data arrives and content fades in where its placeholder was.
 */

const reveal = keyframes`
  from { opacity: 0; transform: translate3d(0, 6px, 0); }
  to   { opacity: 1; transform: none; }
`;

/** Smooth hand-off from skeleton to content. */
export const FadeIn = ({ children, delay = 0, sx }) => (
  <Box sx={{ animation: `${reveal} 420ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms both`, minWidth: 0, ...sx }}>{children}</Box>
);

const Line = ({ w = '100%', h = 12, sx }) => <Skeleton variant="rounded" width={w} height={h} sx={{ borderRadius: '6px', ...sx }} />;

/** Header row matching WidgetCard: icon tile, title, subtitle and action pill. */
export const SkeletonHeader = ({ action = true }) => (
  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, sm: 2.25 }, pt: { xs: 1.5, sm: 1.75 }, pb: 1.25 }}>
    <Skeleton variant="rounded" width={34} height={34} sx={{ borderRadius: '10px', flexShrink: 0 }} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Line w="46%" h={13} />
      <Line w="30%" h={10} sx={{ mt: 0.75 }} />
    </Box>
    {action && <Skeleton variant="rounded" width={78} height={26} sx={{ borderRadius: '999px', flexShrink: 0 }} />}
  </Stack>
);

const Bodies = {
  list: ({ rows = 3 }) => (
    <Stack spacing={1}>
      {Array.from({ length: rows }, (_, i) => (
        <Stack key={i} direction="row" alignItems="center" spacing={1.25} sx={{ p: 1.25, borderRadius: '12px', border: 1, borderColor: 'divider' }}>
          <Skeleton variant="rounded" width={4} height={36} sx={{ borderRadius: 2, flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Line w="28%" h={9} />
            <Line w={`${70 - i * 8}%`} h={12} sx={{ mt: 0.75 }} />
            <Line w="40%" h={9} sx={{ mt: 0.75 }} />
          </Box>
          <Skeleton variant="rounded" width={62} height={24} sx={{ borderRadius: '8px', flexShrink: 0 }} />
        </Stack>
      ))}
    </Stack>
  ),
  metric: () => (
    <Box>
      <Line w="32%" h={10} />
      <Line w="48%" h={34} sx={{ mt: 1 }} />
      <Line w="100%" h={8} sx={{ mt: 2.5 }} />
      <Line w="56%" h={10} sx={{ mt: 2 }} />
    </Box>
  ),
  ring: () => (
    <Stack direction="row" spacing={2} alignItems="center">
      <Skeleton variant="circular" width={104} height={104} sx={{ flexShrink: 0 }} />
      <Stack spacing={1.25} sx={{ flex: 1 }}>
        <Line w="80%" />
        <Line w="70%" />
        <Line w="75%" />
      </Stack>
    </Stack>
  ),
  stats: ({ rows = 4 }) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: `repeat(${rows}, 1fr)` }, gap: 1.5 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} sx={{ p: 2, borderRadius: '16px', border: 1, borderColor: 'divider' }}>
          <Line w="55%" h={9} />
          <Line w="40%" h={26} sx={{ mt: 1.25 }} />
        </Box>
      ))}
    </Box>
  ),
  chart: () => (
    <Stack direction="row" alignItems="flex-end" spacing={1.5} sx={{ height: 140, px: 1 }}>
      {[60, 85, 45, 100, 70, 90].map((h, i) => (
        <Skeleton key={i} variant="rounded" sx={{ flex: 1, height: `${h}%`, borderRadius: '6px 6px 2px 2px' }} />
      ))}
    </Stack>
  ),
};

/** A WidgetCard-shaped placeholder. `kind` picks the body pattern. */
export const WidgetSkeleton = ({ kind = 'list', rows, header = true, sx }) => {
  const Body = Bodies[kind] ?? Bodies.list;
  return (
    <Card aria-hidden sx={{ width: '100%', overflow: 'hidden', ...sx }}>
      {header && <SkeletonHeader />}
      <Box sx={{ px: { xs: 2, sm: 2.25 }, pb: { xs: 1.75, sm: 2 }, pt: header ? 0.25 : 2 }}>
        <Body rows={rows} />
      </Box>
    </Card>
  );
};

/** Generic content placeholder used by DataState when no specific skeleton is given. */
export const ContentSkeleton = ({ minHeight = 180 }) => {
  if (minHeight >= 240) {
    return (
      <Stack spacing={2.25} sx={{ minHeight }} aria-hidden>
        <Box>
          <Line w={140} h={10} />
          <Line w="38%" h={26} sx={{ mt: 1.25 }} />
          <Line w="58%" h={12} sx={{ mt: 1.25 }} />
        </Box>
        <Bodies.stats rows={4} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <WidgetSkeleton kind="list" rows={3} />
          <WidgetSkeleton kind="metric" />
        </Box>
      </Stack>
    );
  }
  const rows = Math.max(1, Math.min(4, Math.round(minHeight / 60)));
  return (
    <Stack spacing={1} sx={{ minHeight, py: 0.5 }} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Stack key={i} direction="row" spacing={1.25} alignItems="center" sx={{ p: 1.25, borderRadius: '12px', border: 1, borderColor: 'divider' }}>
          <Skeleton variant="rounded" width={32} height={32} sx={{ borderRadius: '9px', flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Line w={`${68 - i * 9}%`} h={12} />
            <Line w="36%" h={9} sx={{ mt: 0.75 }} />
          </Box>
        </Stack>
      ))}
    </Stack>
  );
};
