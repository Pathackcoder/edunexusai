import React from 'react';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { analyticsApi } from '../../../services/api';
import { ErrorPanel } from '../../../components/common/DataState';
import { DEVICE_LABELS, ROLE_LABELS } from '../../../../../shared/analyticsCatalog.js';
import { formatDay, formatDayLong } from '../../../components/analytics/format.js';

export { DEVICE_LABELS, ROLE_LABELS };
export const ROLE_OPTIONS = ['STUDENT', 'FACULTY', 'STAFF', 'ALUMNI', 'ADMIN'];
export const DEVICE_OPTIONS = ['DESKTOP', 'MOBILE', 'TABLET'];

/** Query parameters for a report from the page's filters (a preset, or explicit dates for a custom range). */
export const reportParams = (filters, supports = { role: true, device: true }) => ({
  ...(filters.range === 'custom' && filters.from && filters.to ? { from: filters.from, to: filters.to } : { range: filters.range === 'custom' ? '30d' : filters.range }),
  role: supports.role ? filters.role || undefined : undefined,
  device: supports.device ? filters.device || undefined : undefined,
});

/** Load one report section; reloads when the filters or the page's refresh counter change. */
export function useReport(section, filters, refreshKey, supports) {
  const params = reportParams(filters, supports);
  return useApiQuery(() => analyticsApi.report(section, params), [section, JSON.stringify(params), refreshKey]);
}

const TabSkeleton = () => (
  <Stack spacing={2} aria-hidden>
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
      {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="rounded" height={104} />)}
    </Box>
    <Skeleton variant="rounded" height={300} />
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
      <Skeleton variant="rounded" height={240} />
      <Skeleton variant="rounded" height={240} />
    </Box>
  </Stack>
);

/** Loading, error and ready states shared by every tab (the previous figures stay visible while reloading). */
export function ReportState({ query, children }) {
  const { data, loading, error, refetch } = query;
  if (error && !data) return <ErrorPanel error={error} onRetry={refetch} />;
  if (!data) return <Box role="status" aria-live="polite" aria-label="Loading analytics"><TabSkeleton /></Box>;
  return (
    <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity 160ms ease' }} aria-busy={loading}>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>These figures could not be refreshed just now; showing the last ones loaded.</Alert>}
      {children(data)}
    </Box>
  );
}

/**
 * Points for a trend chart from a daily series. A day before collection began is a gap with an explanation,
 * never a zero.
 */
export const trendPoints = (series, fields) => series.map((point) => {
  const gap = point.beforeCollection;
  const row = { label: formatDay(point.date), tip: formatDayLong(point.date), partial: point.partial, note: point.beforeCollection ? 'Before collection began' : undefined };
  for (const [key, source] of Object.entries(fields)) row[key] = gap ? null : point[source];
  return row;
});

export const roleLabel = (role) => ROLE_LABELS[role] ?? role;
export const deviceLabel = (device) => DEVICE_LABELS[device] ?? device;
