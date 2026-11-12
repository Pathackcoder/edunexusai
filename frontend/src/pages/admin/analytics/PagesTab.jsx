import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { FilterChips } from '../../../components/common/FilterChips';
import { ChartTable } from '../../../components/charts/Charts';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { analyticsApi } from '../../../services/api';
import { NAV_SOURCE_LABELS } from '../../../../../shared/analyticsCatalog.js';
import { CellBar, SERIES, ShareBars, TrendChart } from '../../../components/analytics/charts';
import { Grid2, Kpi, KpiGrid, NoData, Panel, RankTable } from '../../../components/analytics/parts';
import { formatChange, formatDay, formatDayLong, formatDuration, formatNumber, formatPercent, formatRange } from '../../../components/analytics/format.js';
import { ReportState, deviceLabel, reportParams, roleLabel, useReport } from './shared';

const VIEWS = [{ id: 'pages', label: 'Pages' }, { id: 'navigation', label: 'Navigation' }];
const PAGE_FILTERS = [{ id: 'all', label: 'All pages' }, { id: 'visited', label: 'Visited' }, { id: 'unused', label: 'No visits' }];

const changeCell = (row) => {
  if (row.previousViews == null || row.views == null) return '—';
  if (!row.previousViews) return row.views ? 'New' : '—';
  const change = formatChange((row.views - row.previousViews) / row.previousViews);
  return <Box component="span" sx={{ color: change.direction === 'up' ? 'success.dark' : change.direction === 'down' ? 'error.dark' : 'text.secondary', fontWeight: 600 }}>{change.text}</Box>;
};

/** Drill-down for one page: its daily trend and who opens it (aggregates only). */
function PageDetail({ page, filters, onClose }) {
  const params = reportParams(filters);
  const { data, loading, error } = useApiQuery(() => analyticsApi.pageDetail(page.key, params), [page.key, JSON.stringify(params)]);
  const points = (data?.series ?? []).map((point) => ({ label: formatDay(point.date), tip: formatDayLong(point.date), views: point.views }));
  const split = (rows, label) => (
    <RankTable
      ariaLabel={`${page.label} by ${label.toLowerCase()}`}
      rows={rows.map((row) => ({ ...row, label: label === 'Role' ? roleLabel(row.key) : deviceLabel(row.key) }))}
      columns={[
        { key: 'label', label, primary: true, sortable: false },
        { key: 'users', label: 'People', align: 'right', format: formatNumber, sortable: false },
        { key: 'views', label: 'Views', align: 'right', format: formatNumber, bar: true, sortable: false },
        { key: 'averageVisibleMs', label: 'Time on page', align: 'right', format: formatDuration, sortable: false },
      ]}
      emptyText="No visits recorded."
    />
  );
  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, p: { xs: 2, sm: 3 } } }} aria-labelledby="page-detail-title">
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">{page.section}</Typography>
          <Typography id="page-detail-title" variant="h5" component="h2">{page.label}</Typography>
          <Typography variant="body2" color="text.secondary">{data ? formatRange(data.meta.from, data.meta.to) : 'Loading…'}</Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close page details"><CloseRoundedIcon /></IconButton>
      </Stack>
      {error && <Typography variant="body2" color="error">These details could not be loaded.</Typography>}
      {data && (
        <Stack spacing={3} sx={{ opacity: loading ? 0.6 : 1 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Views per day</Typography>
            <TrendChart data={points} series={[{ key: 'views', label: 'Views', color: SERIES[0] }]} height={180} ariaLabel={`${page.label}: views per day`} />
          </Box>
          {data.byRole.length > 0 && <Box><Typography variant="subtitle2" sx={{ mb: 0.5 }}>By role held</Typography><Typography variant="caption" color="text.secondary">A person with two roles appears under both.</Typography>{split(data.byRole, 'Role')}</Box>}
          {data.byDevice.length > 0 && <Box><Typography variant="subtitle2" sx={{ mb: 0.5 }}>By device</Typography>{split(data.byDevice, 'Device')}</Box>}
        </Stack>
      )}
    </Drawer>
  );
}

function PagesView({ data, filters, goTo }) {
  const [show, setShow] = useState('all');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [detail, setDetail] = useState(null);
  const rows = useMemo(() => data.pages.filter((row) => {
    if (show === 'visited' && row.views === 0) return false;
    if (show === 'unused' && row.views !== 0) return false;
    if (section && row.section !== section) return false;
    return !search.trim() || `${row.label} ${row.section}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [data.pages, show, search, section]);
  const unused = data.pages.filter((row) => row.views === 0).length;
  const usedSections = data.sections.filter((row) => row.views > 0);
  const idleSections = data.sections.filter((row) => row.views === 0);
  // Weighted by views with measured time, the same way as the Overview figure.
  const timed = data.pages.filter((row) => row.averageVisibleMs != null);
  const averageTime = timed.length ? timed.reduce((sum, row) => sum + row.averageVisibleMs * row.views, 0) / Math.max(1, timed.reduce((sum, row) => sum + row.views, 0)) : null;
  if (data.totalViews === 0) return <Panel title="Pages"><NoData meta={data.meta} what="page views" onOpenHealth={() => goTo('health')} /></Panel>;
  return (
    <Stack spacing={2}>
      <KpiGrid columns={4}>
        <Kpi title="Page views" kpi={{ value: data.totalViews }} format={formatNumber} icon={VisibilityOutlinedIcon} tone="info" info="Portal pages opened in the period." />
        <Kpi title="Pages with visits" kpi={{ value: data.pages.length - unused }} format={formatNumber} icon={TaskAltOutlinedIcon} tone="teal" footnote={`of ${data.pages.length} tracked pages`} info="Tracked pages opened at least once in the period." />
        <Kpi title="Pages with no visits" kpi={{ value: unused }} format={formatNumber} icon={VisibilityOffOutlinedIcon} tone="warning" info="Tracked pages nobody opened in the period. Use the No visits filter below to list them." />
        <Kpi title="Average time on page" kpi={{ value: averageTime }} format={formatDuration} icon={TimerOutlinedIcon} tone="teal" info="Average time a page was on screen and in use, over every page view with measured time." />
      </KpiGrid>
      <Panel title="Views by area" subtitle="Select an area to filter the table below"
        info="Page views grouped by the part of the portal the page belongs to. Pages are identified by a fixed name, never by their address, so a course, record or search never appears here; all campus pages built in Studio count as one entry.">
        <Box sx={{ display: 'grid', gap: 0.5, columnGap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
          {usedSections.map((row) => (
            <Box key={row.section} component="button" type="button" onClick={() => setSection((current) => (current === row.section ? '' : row.section))} aria-pressed={section === row.section}
              sx={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', width: '100%', borderRadius: 2, px: 1, py: 0.625, bgcolor: section === row.section ? 'primary.lighter' : 'transparent', '&:hover': { bgcolor: section === row.section ? 'primary.lighter' : 'action.hover' }, '&:focus-visible': { outline: (theme) => `2px solid ${theme.palette.primary.main}` } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{row.section}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatNumber(row.views)} {row.views === 1 ? 'view' : 'views'} · {row.unused ? `${row.unused} of ${row.pages} unused` : `all ${row.pages} used`}
                </Typography>
              </Stack>
              <CellBar value={row.views} max={usedSections[0]?.views ?? 0} />
            </Box>
          ))}
        </Box>
        {idleSections.length > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, px: 1 }}>
            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>No views:</Box>{' '}
            {idleSections.map((row, index) => (
              <React.Fragment key={row.section}>
                {index > 0 && ', '}
                <Box component="button" type="button" onClick={() => setSection((current) => (current === row.section ? '' : row.section))} aria-pressed={section === row.section}
                  sx={{ all: 'unset', cursor: 'pointer', borderRadius: 1, px: 0.25, color: section === row.section ? 'primary.main' : 'inherit', textDecoration: 'underline', textDecorationColor: 'transparent', '&:hover': { textDecorationColor: 'currentColor' }, '&:focus-visible': { outline: (theme) => `2px solid ${theme.palette.primary.main}` } }}>
                  {row.section} ({row.pages})
                </Box>
              </React.Fragment>
            ))}
          </Typography>
        )}
        {!data.meta.uniquesExact && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, mb: 0, px: 1 }}>
            This period reaches beyond the 90-day detail window: for it, People shows the busiest single day rather than everyone over the period.
          </Typography>
        )}
      </Panel>
      <Panel title="All pages" subtitle={`${rows.length} of ${data.pages.length} pages${section ? ` · ${section}` : ''} · select a row for its trend`}
        info="Views: times the page was opened. People: distinct people who opened it. Time on page: average time it was on screen and in use (views under one second excluded). Change compares views with the previous period of the same length.">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
          <FilterChips ariaLabel="Show pages" options={PAGE_FILTERS.map((option) => (option.id === 'unused' ? { ...option, label: `No visits (${unused})` } : option))} value={show} onChange={setShow} sx={{ flexShrink: 0 }} />
          <TextField size="small" fullWidth={false} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a page" inputProps={{ 'aria-label': 'Find a page by name' }} sx={{ minWidth: { md: 240 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} />
        </Stack>
        <RankTable
          ariaLabel="Pages"
          rows={rows}
          initialSort={show === 'unused' ? { key: 'label', direction: 'asc' } : { key: 'views', direction: 'desc' }}
          pageSize={15}
          onRowClick={(row) => setDetail(row)}
          rowLabel={(row) => `Open details for ${row.label}`}
          columns={[
            { key: 'label', label: 'Page', primary: true, render: (row) => <Box><Box>{row.label}</Box><Typography variant="caption" color="text.secondary">{row.section}{row.audience ? ` · ${row.audience.map(roleLabel).join(', ')}` : ' · Everyone'}</Typography></Box> },
            { key: 'users', label: 'People', align: 'right', format: formatNumber },
            { key: 'views', label: 'Views', align: 'right', format: formatNumber, bar: true },
            { key: 'share', label: 'Share', align: 'right', format: formatPercent, secondary: true },
            { key: 'averageVisibleMs', label: 'Time on page', align: 'right', format: formatDuration, secondary: true },
            { key: 'previousViews', label: 'Change', align: 'right', render: changeCell, sortable: false, secondary: true },
          ]}
          emptyText="No pages match these filters."
        />
      </Panel>
      {detail && <PageDetail page={detail} filters={filters} onClose={() => setDetail(null)} />}
    </Stack>
  );
}

function NavigationView({ data, goTo }) {
  // Areas nobody navigated to are summarised in one line rather than drawn as empty bars.
  const [show, setShow] = useState('used');
  if (data.totalClicks === 0) return <Panel title="Navigation"><NoData meta={data.meta} what="navigation clicks" onOpenHealth={() => goTo('health')} /></Panel>;
  const rows = data.targets.filter((row) => (show === 'used' ? row.clicks !== 0 : row.clicks === 0));
  const unused = data.targets.filter((row) => row.clicks === 0).length;
  return (
    <Stack spacing={2}>
      <Grid2>
        <Panel title="How people get around" subtitle="Share of navigation clicks" info="Where a navigation click was made: the sidebar, the collapsed sidebar's menu, the breadcrumb trail, the profile menu, or a result chosen in global search. Links inside page content are not navigation clicks."
          table={<ChartTable columns={[{ key: 'label', label: 'Source' }, { key: 'clicks', label: 'Clicks' }, { key: 'share', label: 'Share' }]} rows={data.sources.map((row) => ({ label: NAV_SOURCE_LABELS[row.source], clicks: formatNumber(row.clicks), share: formatPercent(row.share) }))} />}>
          <ShareBars rows={data.sources.map((row) => ({ label: NAV_SOURCE_LABELS[row.source], value: row.share, suffix: row.clicks != null ? `${formatNumber(row.clicks)} clicks` : undefined }))} format={formatPercent} />
        </Panel>
        <Panel title="Clicks by area" info="Navigation clicks grouped by the area of the destination page.">
          <ShareBars rows={data.sections.filter((row) => row.clicks > 0).map((row) => ({ label: row.section, value: row.clicks, suffix: formatPercent(row.share) }))} />
          {data.sections.some((row) => !row.clicks) && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.25, mb: 0 }}>No clicks to: {data.sections.filter((row) => !row.clicks).map((row) => row.section).join(', ')}.</Typography>}
        </Panel>
      </Grid2>
      <Panel title="Navigation destinations" subtitle="What people reach through the portal's navigation"
        info="Clicks: times a navigation link to this destination was used. People: distinct people who used one. A destination with no clicks may still be reached another way (a dashboard link, a bookmark): compare with its page views.">
        <FilterChips ariaLabel="Show destinations" options={[{ id: 'used', label: 'Used' }, { id: 'unused', label: `Never clicked (${unused})` }]} value={show} onChange={setShow} sx={{ mb: 1.5 }} />
        <RankTable
          ariaLabel="Navigation destinations"
          rows={rows}
          initialSort={show === 'used' ? { key: 'clicks', direction: 'desc' } : { key: 'label', direction: 'asc' }}
          pageSize={15}
          columns={[
            { key: 'label', label: 'Destination', primary: true, render: (row) => <Box><Box>{row.label}</Box><Typography variant="caption" color="text.secondary">{row.section}</Typography></Box> },
            { key: 'users', label: 'People', align: 'right', format: formatNumber },
            { key: 'clicks', label: 'Clicks', align: 'right', format: formatNumber, bar: true },
            { key: 'share', label: 'Share of clicks', align: 'right', format: formatPercent, secondary: true },
          ]}
          emptyText={show === 'used' ? 'No navigation clicks recorded.' : 'Every destination was clicked at least once.'}
        />
      </Panel>
    </Stack>
  );
}

export function PagesTab({ filters, refreshKey, goTo }) {
  const [view, setView] = useState('pages');
  const pages = useReport('pages', filters, refreshKey);
  const navigation = useReport('navigation', filters, refreshKey);
  return (
    <Stack spacing={2}>
      <FilterChips ariaLabel="Pages or navigation" options={VIEWS} value={view} onChange={setView} />
      {view === 'pages'
        ? <ReportState query={pages}>{(data) => <PagesView data={data} filters={filters} goTo={goTo} />}</ReportState>
        : <ReportState query={navigation}>{(data) => <NavigationView data={data} goTo={goTo} />}</ReportState>}
    </Stack>
  );
}

export default PagesTab;
