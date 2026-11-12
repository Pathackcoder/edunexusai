import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../../context/AuthContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { analyticsApi } from '../../services/api';
import { PageHeader } from '../../components/common/PageHeader';
import { FilterChips } from '../../components/common/FilterChips';
import { Button } from '../../components/common/Button';
import { IconTile } from '../../components/common/IconTile';
import { PRESETS, formatAgo, formatDay } from '../../components/analytics/format.js';
import { DEVICE_OPTIONS, ROLE_OPTIONS, deviceLabel, roleLabel } from './analytics/shared';
import { OverviewTab } from './analytics/OverviewTab';
import { ActivityTab } from './analytics/ActivityTab';
import { PagesTab } from './analytics/PagesTab';
import { EngagementTab } from './analytics/EngagementTab';
import { DevicesTab } from './analytics/DevicesTab';
import { CommunicationTab } from './analytics/CommunicationTab';
import { IntegrationsTab } from './analytics/IntegrationsTab';
import { HealthTab } from './analytics/HealthTab';
import { ANALYTICS_BASE, ANALYTICS_SECTIONS, analyticsSection } from './analytics/sections';

const COMPONENTS = {
  overview: OverviewTab, people: ActivityTab, pages: PagesTab, features: EngagementTab,
  devices: DevicesTab, communication: CommunicationTab, integrations: IntegrationsTab, health: HealthTab,
};
const FILTER_KEYS = ['range', 'from', 'to', 'role', 'device'];
// The last filters used, so moving between sections from the sidebar keeps the same period and filters.
const FILTER_STORAGE = 'edunexus.analytics.filters';
const readStoredFilters = () => {
  try { return window.sessionStorage.getItem(FILTER_STORAGE) ?? ''; } catch { return ''; }
};
const storeFilters = (query) => {
  try { window.sessionStorage.setItem(FILTER_STORAGE, query); } catch { /* the address still carries the filters */ }
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULTS = { range: '30d', from: '', to: '', role: '', device: '' };

/** Filters live in the address, so a view can be bookmarked or shared; anything unexpected falls back to a default. */
function readFilters(params) {
  const range = PRESETS.some((preset) => preset.id === params.get('range')) ? params.get('range') : DEFAULTS.range;
  return {
    range,
    from: DATE.test(params.get('from') ?? '') ? params.get('from') : '',
    to: DATE.test(params.get('to') ?? '') ? params.get('to') : '',
    role: ROLE_OPTIONS.includes(params.get('role')) ? params.get('role') : '',
    device: DEVICE_OPTIONS.includes(params.get('device')) ? params.get('device') : '',
  };
}

function NoAccess() {
  return (
    <Stack spacing={2.5}>
      <Card sx={{ p: { xs: 3, md: 4 } }}>
        <Stack alignItems="center" spacing={1.5} sx={{ textAlign: 'center' }}>
          <IconTile icon={LockOutlinedIcon} tone="analytics" size={52} />
          <Typography variant="h5" component="h2">Analytics access has not been given to your account</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
            Analytics shows how your institution's community uses the portal. Because that is sensitive, it is opened only for administrators who have been given access by name. Ask an administrator who already has Analytics access to give it to you (under Analytics → Data health).
          </Typography>
        </Stack>
      </Card>
    </Stack>
  );
}

export const AdminAnalyticsPage = () => {
  const { user, refreshUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const allowed = (user?.permissions ?? []).includes('analytics.view');
  const { section: sectionParam } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const filters = readFilters(params);
  const tab = sectionParam ? analyticsSection(sectionParam) : ANALYTICS_SECTIONS[0];
  const legacyTab = params.get('tab');
  const filterQuery = new URLSearchParams(FILTER_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : []))).toString();
  const health = useApiQuery(() => analyticsApi.report('health', { range: '7d' }), [refreshKey, allowed], { enabled: allowed });
  // Access withdrawn while this page was open: the server now refuses, so re-read the session and show the
  // no-access view instead of a page of errors.
  const revoked = health.error?.details?.reason === 'PERMISSION_REQUIRED';
  useEffect(() => {
    if (revoked) refreshUser();
  }, [revoked, refreshUser]);

  const update = useCallback((changes) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value == null || value === DEFAULTS[key]) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setParams]);
  // A shortcut to another section keeps the period and filters.
  const goTo = useCallback((id) => {
    const target = analyticsSection(id) ?? ANALYTICS_SECTIONS[0];
    navigate(`${target.path}${filterQuery ? `?${filterQuery}` : ''}`);
    window.scrollTo?.({ top: 0 });
  }, [navigate, filterQuery]);

  // Remember the filters; a section opened from the sidebar (no filters in its address) takes the last ones used.
  // (Not on an address that is about to be redirected: an unknown section or an old ?tab= link.)
  const redirecting = !tab || Boolean(legacyTab && !sectionParam);
  useEffect(() => {
    if (redirecting) return;
    if (filterQuery) storeFilters(filterQuery);
    else if (!search && readStoredFilters()) navigate({ search: `?${readStoredFilters()}` }, { replace: true });
  }, [filterQuery, search, navigate, redirecting]);
  const reset = () => { storeFilters(''); update({ range: '', from: '', to: '', role: '', device: '' }); };
  const filtered = filters.range !== DEFAULTS.range || filters.role || filters.device;

  const refresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      await analyticsApi.refresh();
    } catch (caught) {
      setNotice(caught?.message ?? 'The figures could not be refreshed.');
    } finally {
      setRefreshing(false);
      setRefreshKey((key) => key + 1);
    }
  };

  // Earlier links (/admin/analytics?tab=pages) open the section's own page; an unknown section opens the Overview.
  if (legacyTab && !sectionParam) {
    const next = new URLSearchParams(params);
    next.delete('tab');
    const target = analyticsSection(legacyTab) ?? ANALYTICS_SECTIONS[0];
    return <Navigate to={`${target.path}${next.toString() ? `?${next}` : ''}`} replace />;
  }
  if (!tab) return <Navigate to={ANALYTICS_BASE} replace />;

  if (!allowed) {
    return (
      <Box>
        <PageHeader eyebrow="Administration" title="Analytics" description="How your institution uses the portal." />
        <NoAccess />
        <MuiButton size="small" onClick={() => refreshUser()} sx={{ mt: 2 }}>I have been given access: check again</MuiButton>
      </Box>
    );
  }

  const state = health.data;
  const today = state?.meta?.today;
  const customInvalid = filters.range === 'custom' && (!filters.from || !filters.to || filters.from > filters.to);
  const Section = COMPONENTS[tab.id];
  const select = (label, key, options, format, supported, reason) => (
    <Tooltip title={supported ? '' : reason}>
      <TextField select size="small" fullWidth={false} label={label} value={supported ? filters[key] : ''} onChange={(event) => update({ [key]: event.target.value })} disabled={!supported} sx={{ width: 170 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
        <MenuItem value="">{key === 'role' ? 'Everyone' : 'All devices'}</MenuItem>
        {options.map((option) => <MenuItem key={option} value={option}>{format(option)}</MenuItem>)}
      </TextField>
    </Tooltip>
  );

  return (
    <Box>
      <PageHeader
        eyebrow="Analytics"
        title={tab.label}
        description={tab.description}
        actions={<Button variant="secondary" size="sm" icon={RefreshRoundedIcon} loading={refreshing} onClick={refresh}>Refresh</Button>}
        sx={{ mb: 1 }}
      >
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.75, color: 'text.secondary' }}>
          <Typography variant="caption">
            {state ? (state.freshness.lastAggregationAt ? `Figures updated ${formatAgo(state.freshness.lastAggregationAt)}` : 'Figures not yet calculated') : 'Checking freshness…'}
          </Typography>
          {state?.meta?.collectingSince && <Typography variant="caption">· Collecting since {formatDay(state.meta.collectingSince, { year: true })}</Typography>}
          {state && !state.collection.collecting && tab.id !== 'health' && (
            <MuiButton size="small" color="warning" onClick={() => goTo('health')} sx={{ py: 0, minHeight: 0 }}>Usage collection is off</MuiButton>
          )}
        </Stack>
      </PageHeader>
      {notice && <Alert severity="warning" onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice}</Alert>}

      {tab.dates !== false && (
        <Card sx={{ px: 1.5, py: 1.25, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} useFlexGap flexWrap="wrap" role="group" aria-label="Filters">
            <FilterChips ariaLabel="Period" options={PRESETS} value={filters.range} onChange={(range) => update(range === 'custom' ? { range, from: filters.from || '', to: filters.to || today || '' } : { range, from: '', to: '' })} />
            {filters.range === 'custom' && (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField type="date" size="small" fullWidth={false} label="From" value={filters.from} onChange={(event) => update({ from: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ max: filters.to || today }} />
                <TextField type="date" size="small" fullWidth={false} label="To" value={filters.to} onChange={(event) => update({ to: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ min: filters.from, max: today }} />
              </Stack>
            )}
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ ml: { md: 'auto' } }} alignItems="center">
              {select('Role', 'role', ROLE_OPTIONS, roleLabel, tab.role, 'This section is not divided by role.')}
              {select('Device', 'device', DEVICE_OPTIONS, deviceLabel, tab.device, tab.id === 'devices' ? 'This section already compares devices.' : 'These records carry no device.')}
              <MuiButton size="small" startIcon={<RestartAltRoundedIcon />} onClick={reset} disabled={!filtered}>Reset</MuiButton>
            </Stack>
          </Stack>
          {filters.role && tab.role && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, mb: 0 }}>Showing people who hold the {roleLabel(filters.role).toLowerCase()} role. Someone with a second role is included.</Typography>}
        </Card>
      )}

      <Box component="section" aria-label={tab.label}>
        {customInvalid
          ? <Alert severity="info">Choose a start and an end date (the start on or before the end) to see this period.</Alert>
          : <Section filters={filters} refreshKey={refreshKey} goTo={goTo} onChanged={() => setRefreshKey((key) => key + 1)} />}
      </Box>
    </Box>
  );
};

export default AdminAnalyticsPage;
