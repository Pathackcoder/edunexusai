import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { FilterChips } from '../../../components/common/FilterChips';
import { ChartTable } from '../../../components/charts/Charts';
import { ENTITY_COLORS, SERIES, ShareBars, TrendChart } from '../../../components/analytics/charts';
import { Grid2, Kpi, KpiGroup, NoData, Panel, RankTable } from '../../../components/analytics/parts';
import { formatDay, formatDuration, formatNumber, formatPercent, formatRange } from '../../../components/analytics/format.js';
import { ReportState, deviceLabel, trendPoints, useReport } from './shared';

const TREND_METRICS = [
  { id: 'users', label: 'Active people', info: 'People with at least one page view, navigation click, widget interaction or feature use that day. Each person counts once a day, whatever roles they hold.' },
  { id: 'pageViews', label: 'Page views', info: 'Portal pages opened that day.' },
  { id: 'visits', label: 'Visits', info: 'Browser visits that started that day. A visit ends after 30 minutes without activity.' },
];

/** Plain-language observations drawn from the figures on this tab: where an administrator might look next. */
function observations(data) {
  const notes = [];
  const { kpis } = data;
  if (data.unusedPages > 0) notes.push({ text: `${data.unusedPages} of ${data.trackedPages} portal pages had no visits in this period.`, tab: 'pages', action: 'See unused pages' });
  if (data.unusedFeatures.length) notes.push({ text: `${data.unusedFeatures.length} tracked feature actions were not used at all, including "${data.unusedFeatures[0]}".`, tab: 'features', action: 'See feature use' });
  const mobile = data.devices.find((row) => row.device === 'MOBILE');
  if (mobile && mobile.share != null && mobile.visits > 0) {
    const what = 'phones';
    notes.push({ text: mobile.share >= 0.4 ? `${formatPercent(mobile.share)} of visits come from ${what}: check that the most-visited pages work well on a small screen.` : `${formatPercent(mobile.share)} of visits come from ${what}.`, tab: 'devices', action: 'See devices' });
  }
  if (kpis.stickiness.value != null) {
    notes.push({ text: `On a typical day, ${formatPercent(kpis.stickiness.value)} of the people active in the last 30 days use the portal${kpis.stickiness.value < 0.2 ? ': most people come only occasionally.' : '.'}`, tab: 'people', action: 'See activity' });
  }
  if (kpis.returningRate.value != null) notes.push({ text: `${formatPercent(kpis.returningRate.value)} of active users came back on a second day in this period.`, tab: 'people', action: 'See activity' });
  return notes.slice(0, 4);
}

export function OverviewTab({ filters, refreshKey, goTo }) {
  const query = useReport('overview', filters, refreshKey);
  const [metric, setMetric] = useState('users');
  return (
    <ReportState query={query}>
      {(data) => {
        const { kpis, meta, basis } = data;
        if (!data.hasData) return <Panel title="Overview"><NoData meta={meta} onOpenHealth={() => goTo('health')} /></Panel>;
        const selected = TREND_METRICS.find((item) => item.id === metric);
        const points = trendPoints(data.series, { value: metric });
        const notes = observations(data);
        const comparison = data.previousComparable ? `vs ${formatRange(meta.previousFrom, meta.previousTo)}` : undefined;
        return (
          <Stack spacing={2}>
            <KpiGroup label="Audience">
              <Kpi title="Active users" kpi={kpis.activeUsers} format={formatNumber} icon={PeopleAltOutlinedIcon} comparison={comparison}
                info="Distinct people who used the portal at least once in the selected period: a page view, a navigation click, a widget interaction or a feature use. Each person counts once, whatever roles they hold. Signing in alone, or a page refreshing itself in the background, does not count."
                context={kpis.returningUsers.value != null && kpis.activeUsers.value ? `${formatNumber(kpis.returningUsers.value)} of them active on 2 or more days (${formatPercent(kpis.returningRate.value)})` : `In ${formatRange(meta.from, meta.to)}`} />
              <Kpi title="Average daily active users" kpi={kpis.averageDailyUsers} format={formatNumber} icon={TodayOutlinedIcon} comparison={comparison}
                info="The number of people active on a typical day: each day's active users added up (person-days), divided by the number of measured days in the period. Days before collection began are not measured, so they are left out rather than counted as days with nobody active. Today is included even though it is not over."
                context={basis.measuredDays ? `${formatNumber(basis.personDays)} person-days over ${formatNumber(basis.measuredDays)} measured ${basis.measuredDays === 1 ? 'day' : 'days'}` : 'No measured days in this period'} />
              <Kpi title="Weekly active users" kpi={kpis.weeklyActiveUsers} format={formatNumber} icon={DateRangeOutlinedIcon}
                info={`Distinct people active in the 7 days ending ${formatDay(meta.to)}, counted person by person (not by adding up daily figures). Always the last 7 days of the period, whatever range is selected.`}
                context={`7 days to ${formatDay(meta.to)}`} />
              <Kpi title="Monthly active users" kpi={kpis.monthlyActiveUsers} format={formatNumber} icon={CalendarMonthOutlinedIcon}
                info={`Distinct people active in the 30 days ending ${formatDay(meta.to)}. Stickiness is average daily active users over those 30 days ÷ monthly active users: how much of the monthly audience uses the portal on a typical day.`}
                context={kpis.stickiness.value != null ? `30 days to ${formatDay(meta.to)} · stickiness ${formatPercent(kpis.stickiness.value)}` : `30 days to ${formatDay(meta.to)}`} />
            </KpiGroup>
            <KpiGroup label="Engagement">
              <Kpi title="Page views" kpi={kpis.pageViews} format={formatNumber} icon={VisibilityOutlinedIcon} tone="info" comparison={comparison}
                info="Every time a portal page is opened: one person opening the same page ten times is ten page views. A page opened in a background tab counts once it is first looked at. Compare with Unique page visitors, which counts people."
                context={kpis.pageViewsPerVisit.value != null ? `${formatNumber(kpis.pageViewsPerVisit.value)} pages per visit` : undefined} />
              <Kpi title="Unique page visitors" kpi={kpis.pageVisitors} format={formatNumber} icon={PersonSearchOutlinedIcon} tone="info" comparison={comparison}
                info="Distinct people who opened at least one portal page in the period. One person opening ten pages is one visitor and ten page views."
                context={kpis.pageVisitors.value ? `${formatNumber(kpis.pageViews.value / kpis.pageVisitors.value)} page views per visitor` : undefined} />
              <Kpi title="Visits" kpi={kpis.visits} format={formatNumber} icon={LoginOutlinedIcon} tone="info" comparison={comparison}
                info="Browser visits: continuous use of the portal with no gap longer than 30 minutes, shared across a person's tabs. Not the same as a sign-in: one sign-in can cover several visits. A visit belongs to the day it started."
                context={kpis.averageVisitMs.value != null ? `Average visit ${formatDuration(kpis.averageVisitMs.value)}` : undefined} />
              <Kpi title="Average time on page" kpi={kpis.averageVisibleMs} format={formatDuration} icon={TimerOutlinedIcon} tone="teal" comparison={comparison}
                info="Average time a page was on screen and in use, per page view. Time in a background tab, or after 5 minutes without any input, is not counted. Page views shorter than one second are left out of the average; each view counts at most 4 hours."
                context="Visible, active time per page view" />
            </KpiGroup>
            {!data.previousComparable && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: -0.75 }}>
                No comparison with the previous period: collection began on {formatDay(meta.collectingSince, { year: true })}, so there is no complete earlier period yet.
              </Typography>
            )}

            <Panel
              title={`${selected.label} per day`}
              subtitle={`${formatRange(meta.from, meta.to)}${meta.includesToday ? ' · today is not over yet (hollow point)' : ''}`}
              info={selected.info}
              action={<FilterChips ariaLabel="Trend metric" options={TREND_METRICS.map(({ id, label }) => ({ id, label }))} value={metric} onChange={setMetric} sx={{ display: { xs: 'none', sm: 'flex' } }} />}
              table={<ChartTable columns={[{ key: 'tip', label: 'Day' }, { key: 'shown', label: selected.label }]} rows={points.map((point) => ({ tip: point.tip, shown: point.value == null ? point.note ?? '—' : formatNumber(point.value) }))} />}
            >
              <FilterChips ariaLabel="Trend metric" options={TREND_METRICS.map(({ id, label }) => ({ id, label }))} value={metric} onChange={setMetric} sx={{ display: { xs: 'flex', sm: 'none' }, mb: 1.5 }} />
              <TrendChart data={points} width={1100} height={220} series={[{ key: 'value', label: selected.label, color: SERIES[0] }]} ariaLabel={`${selected.label} per day, ${formatRange(meta.from, meta.to)}`} />
            </Panel>

            <Grid2 align="start">
              <Panel title="Most visited pages" info="Pages ranked by views in the period. People is the number of distinct people who opened the page."
                action={<MuiButton size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => goTo('pages')}>All pages</MuiButton>}>
                <RankTable
                  ariaLabel="Most visited pages"
                  pageSize={6}
                  rows={data.topPages}
                  columns={[
                    { key: 'label', label: 'Page', primary: true, sortable: false },
                    { key: 'users', label: 'People', align: 'right', format: formatNumber, sortable: false },
                    { key: 'views', label: 'Views', align: 'right', format: formatNumber, bar: true, sortable: false },
                  ]}
                  emptyText="No page views recorded in this period."
                />
              </Panel>
              <Panel title="Most used features" info="Named portal features, ranked by the number of distinct people who used them. Adoption is that number as a share of everyone active in the period."
                action={<MuiButton size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => goTo('engagement')}>All features</MuiButton>}>
                <RankTable
                  ariaLabel="Most used features"
                  pageSize={6}
                  rows={[...data.topFeatures].sort((a, b) => b.users - a.users)}
                  columns={[
                    { key: 'label', label: 'Feature', primary: true, sortable: false, render: (row) => <><Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>{row.group} · </Box>{row.label}</> },
                    { key: 'users', label: 'People', align: 'right', format: formatNumber, sortable: false },
                    { key: 'adoptionRate', label: 'Adoption', align: 'right', format: formatPercent, bar: true, sortable: false },
                  ]}
                  emptyText="No feature use recorded in this period."
                />
              </Panel>
            </Grid2>

            <Grid2 ratio="2fr 3fr" align="start">
              <Panel title="Devices" subtitle="Share of visits" info="Each visit comes from one kind of device, so these shares add up to 100%. The device is judged from the screen and pointer only; no browser details are kept."
                action={<MuiButton size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => goTo('devices')}>Details</MuiButton>}>
                <ShareBars rows={data.devices.map((row) => ({ label: deviceLabel(row.device), value: row.share, color: ENTITY_COLORS[row.device], suffix: `${formatNumber(row.visits)} ${row.visits === 1 ? 'visit' : 'visits'}` }))} format={formatPercent} />
              </Panel>
              <Panel title="Worth a look" subtitle="Observations from this period's figures">
                {notes.length === 0 ? <Typography variant="body2" color="text.secondary">Nothing stands out yet. Observations appear as more activity is recorded.</Typography> : (
                  <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                    {notes.map((note) => (
                      <Stack component="li" key={note.text} direction="row" spacing={1.25} alignItems="flex-start">
                        <LightbulbOutlinedIcon sx={{ fontSize: 18, color: 'warning.main', mt: 0.25, flexShrink: 0 }} />
                        <Box>
                          <Typography variant="body2">{note.text}</Typography>
                          <MuiButton size="small" onClick={() => goTo(note.tab)} sx={{ ml: -0.75, mt: 0.25 }}>{note.action}</MuiButton>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Panel>
            </Grid2>
          </Stack>
        );
      }}
    </ReportState>
  );
}

export default OverviewTab;
