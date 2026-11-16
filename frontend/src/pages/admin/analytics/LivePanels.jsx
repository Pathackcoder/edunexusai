import React, { useCallback, useEffect, useRef, useState } from 'react';
import { keyframes } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import { analyticsApi } from '../../../services/api';
import { FilterChips } from '../../../components/common/FilterChips';
import { ChartTable } from '../../../components/charts/Charts';
import { SERIES, TrendChart } from '../../../components/analytics/charts';
import { InfoTip, Panel } from '../../../components/analytics/parts';
import { DASH, formatAgo, formatBucket, formatDateTime, formatNumber } from '../../../components/analytics/format.js';

export const LIVE_POLL_MS = 5_000;
const TIMELINE_POLL_MS = 60_000;

/**
 * Re-run `load` every `intervalMs` while this tab is visible (and at once when it becomes visible again), so a
 * figure stays current without a page refresh and a background tab costs nothing.
 */
export function usePolling(load, intervalMs, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((current) => ({ ...current, error, loading: false }));
    }
  }, []);
  useEffect(() => {
    let timer = null;
    setState((current) => ({ ...current, loading: true }));
    run();
    const schedule = () => {
      clearInterval(timer);
      if (document.visibilityState === 'visible') timer = setInterval(run, intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [run, intervalMs, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, refetch: run };
}

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.45); }
  70% { box-shadow: 0 0 0 7px rgba(22, 163, 74, 0); }
  100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
`;

export const LIVE_DEFINITION = (seconds) => `People signed in to the portal right now: a portal tab is open, visible and was used in the last 5 minutes. Each person counts once, however many tabs, windows or devices they have open. Someone leaves this count as soon as they sign out, or ${Math.round((seconds ?? 120) / 60 * 10) / 10} minutes after the last signal from their browser (for example after closing it). Updated every ${LIVE_POLL_MS / 1000} seconds.`;

/** Concurrent active users, live: the hero KPI of the Overview. */
export function LiveUsersCard({ live }) {
  const { data, error } = live;
  const measuring = data && (data.collecting || data.demoIncluded || data.real > 0);
  return (
    <Card component="article" sx={{ p: { xs: 1.75, md: 2 }, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, height: '100%', boxShadow: 'none', position: 'relative', overflow: 'hidden', borderColor: 'divider',
      background: (theme) => `linear-gradient(135deg, ${theme.palette.mode === 'dark' ? 'rgba(70,81,222,0.16)' : 'rgba(70,81,222,0.07)'} 0%, transparent 60%)` }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: 1.75, display: 'grid', placeItems: 'center', bgcolor: 'success.lighter', color: 'success.dark', flexShrink: 0 }}>
          <SensorsRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
        <Typography variant="body2" component="h3" sx={{ fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }}>Concurrent active users</Typography>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.125, borderRadius: 1.5, bgcolor: measuring ? 'success.lighter' : 'grey.100', color: measuring ? 'success.dark' : 'text.secondary', typography: 'caption', fontWeight: 700, letterSpacing: '0.04em' }}>
          <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: measuring ? 'success.main' : 'text.disabled', animation: measuring ? `${pulse} 2s infinite` : 'none' }} />
          LIVE
        </Box>
        <Box sx={{ ml: 'auto !important', flexShrink: 0 }}><InfoTip text={LIVE_DEFINITION(data?.presenceWindowSeconds)} /></Box>
      </Stack>
      {!data && !error ? <Skeleton variant="text" width={90} height={46} /> : (
        <Typography component="div" variant="metric" aria-live="polite" sx={{ fontSize: { xs: '1.875rem', md: '2.25rem' }, lineHeight: 1.1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {measuring ? formatNumber(data.total) : DASH}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.45 }}>
        {error && !data && 'The live count could not be loaded.'}
        {data && !measuring && 'Usage collection is off, so nobody is being counted.'}
        {data && measuring && data.demoIncluded && (
          <><Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{formatNumber(data.real)}</Box> real + <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{formatNumber(data.demo)}</Box> demo = {formatNumber(data.total)} shown</>
        )}
        {data && measuring && !data.demoIncluded && `People online now · updated ${formatAgo(data.asOf)}`}
      </Typography>
    </Card>
  );
}

const WINDOWS = [{ id: '24h', label: '24 hours' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }];
const STEP_LABEL = { 15: '15 minutes', 60: 'hour', 240: '4 hours' };

/**
 * Active users by time: the highest number of people online at the same moment in each interval, from the samples
 * taken every minute. Intervals with no sample are gaps; the last point is the live count.
 */
export function ConcurrencyTimeline({ liveTotal, refreshKey = 0 }) {
  const [range, setRange] = useState('24h');
  const query = usePolling(() => analyticsApi.concurrency(range), TIMELINE_POLL_MS, [range, refreshKey]);
  const data = query.data;
  const tz = data?.timezone;
  const points = (data?.points ?? []).map((point, index, all) => {
    const isLast = index === all.length - 1;
    // The live point follows the live card between timeline refreshes.
    const total = isLast && liveTotal != null && point.total != null ? liveTotal : point.total;
    return {
      label: isLast ? 'Now' : formatBucket(point.at, tz, range),
      tip: isLast ? `Now · ${formatDateTime(point.at, tz)}` : `${formatDateTime(point.at, tz)}${data.stepMinutes > 5 ? ` (busiest moment of the ${STEP_LABEL[data.stepMinutes] ?? 'interval'})` : ''}`,
      value: total,
      real: point.real,
      demo: point.demo,
      partial: isLast,
      partialLabel: 'Live',
      note: 'Not measured',
    };
  });
  const measured = data && points.some((point) => point.value != null);
  const selector = <FilterChips ariaLabel="Time range" options={WINDOWS} value={range} onChange={setRange} />;
  return (
    <Panel
      title="Active users by time"
      subtitle={data ? `Highest number of people online at the same moment, per ${STEP_LABEL[data.stepMinutes] ?? 'interval'}${data.demoIncluded ? ' · includes demo data' : ''}` : 'Concurrent people online'}
      info="Uses the same definition as Concurrent active users. Each point is the highest number of people online at the same moment during that interval (the live count is sampled every minute). A gap means nothing was measured then (collection was off or the service was not running); it is not a zero. The last point is the live count. Times are in your institution's time zone."
      action={<Box sx={{ display: { xs: 'none', sm: 'block' } }}>{selector}</Box>}
      table={data && <ChartTable columns={[{ key: 'tip', label: 'Time' }, { key: 'shown', label: 'People online' }, ...(data.demoIncluded ? [{ key: 'split', label: 'Real + demo' }] : [])]} rows={points.filter((point) => point.value != null).map((point) => ({ tip: point.tip, shown: formatNumber(point.value), split: `${point.real == null ? 'not measured' : formatNumber(point.real)} + ${formatNumber(point.demo)}` }))} />}
    >
      <Box sx={{ display: { xs: 'block', sm: 'none' }, mb: 1.5 }}>{selector}</Box>
      {!data && !query.error && <Skeleton variant="rounded" height={240} />}
      {query.error && !data && <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>The timeline could not be loaded.</Typography>}
      {data && !measured && (
        <Stack alignItems="center" spacing={0.75} sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="subtitle2">No concurrent activity measured in this period</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>{data.collecting ? 'The history fills in as people use the portal: the live count is recorded every minute.' : 'Usage collection is off, so nothing is being measured. It can be switched on under Data health.'}</Typography>
        </Stack>
      )}
      {data && measured && (
        <TrendChart data={points} height={240} width={1100} area maxLabels={range === '24h' ? 8 : 7} series={[{ key: 'value', label: 'People online', color: SERIES[0] }]}
          ariaLabel={`Concurrent people online over the last ${WINDOWS.find((entry) => entry.id === range).label}`}
          tipExtra={(row) => (data.demoIncluded && row.value != null ? <Box sx={{ opacity: 0.8 }}>{row.real == null ? 'real not measured' : `${formatNumber(row.real)} real`} + {formatNumber(row.demo)} demo</Box> : null)} />
      )}
    </Panel>
  );
}
