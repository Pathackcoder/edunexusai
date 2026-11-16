import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { ChartTable } from '../../../components/charts/Charts';
import { ENTITY_COLORS, ShareBars } from '../../../components/analytics/charts';
import { Kpi, Panel, RankTable } from '../../../components/analytics/parts';
import { formatDateTime, formatNumber, formatPercent, formatRange } from '../../../components/analytics/format.js';
import { ReportState, deviceLabel, useReport } from './shared';
import { ConcurrencyTimeline, LiveUsersCard } from './LivePanels';
import { InactiveUsersPanel } from './InactiveUsersPanel';
import { BROWSER_INFO, OS_INFO, UsageSplitPanel } from './UsageSplitPanel';

/**
 * A responsive row of cards that all take the height of the tallest one; content that does not fit scrolls inside
 * its card (see `Scroll`), so one long list never stretches the page.
 */
const Row = ({ columns, children }) => (
  <Box sx={{ display: 'grid', gap: 2, alignItems: 'stretch', gridTemplateColumns: columns, '& > *': { minWidth: 0, height: '100%' } }}>{children}</Box>
);
const Scroll = ({ max = 360, children }) => <Box sx={{ maxHeight: max, overflowY: 'auto', mx: -0.5, px: 0.5 }}>{children}</Box>;

const EmptyNote = ({ children }) => (
  <Stack alignItems="center" justifyContent="center" sx={{ py: 5, px: 2, textAlign: 'center', height: '100%' }}>
    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>{children}</Typography>
  </Stack>
);

/** Plain-language observations drawn from the figures on this page: where an administrator might look next. */
function observations(data) {
  const notes = [];
  const { kpis } = data;
  if (kpis.peakConcurrent.value && kpis.peakConcurrent.at) notes.push({ text: `The busiest moment was ${formatDateTime(kpis.peakConcurrent.at, data.meta.timezone)}, with ${formatNumber(kpis.peakConcurrent.value)} people online at once.`, tab: 'people', action: 'See activity by hour' });
  if (data.unusedPages > 0) notes.push({ text: `${data.unusedPages} of ${data.trackedPages} portal pages had no visits in this period.`, tab: 'pages', action: 'See unused pages' });
  if (data.unusedFeatures.length) notes.push({ text: `${data.unusedFeatures.length} tracked feature actions were not used at all, including "${data.unusedFeatures[0]}".`, tab: 'features', action: 'See feature use' });
  const mobile = data.devices.rows.find((row) => row.key === 'MOBILE');
  if (mobile?.visits > 0) notes.push({ text: mobile.share >= 0.4 ? `${formatPercent(mobile.share)} of visits come from phones: check that the most-visited pages work well on a small screen.` : `${formatPercent(mobile.share)} of visits come from phones.`, tab: 'devices', action: 'See devices' });
  if (kpis.returningRate.value != null) notes.push({ text: `${formatPercent(kpis.returningRate.value)} of active users came back on a second day in this period.`, tab: 'people', action: 'See activity' });
  return notes.slice(0, 4);
}

export function OverviewTab({ filters, refreshKey, goTo, live }) {
  const query = useReport('overview', filters, refreshKey);
  return (
    <ReportState query={query}>
      {(data) => {
        const { kpis, meta } = data;
        const comparison = data.previousComparable ? `vs ${formatRange(meta.previousFrom, meta.previousTo)}` : undefined;
        const notes = observations(data);
        const noUsage = !data.hasData;
        const emptyUsage = !meta.collectingSince ? 'Usage collection has not been switched on, so nothing has been measured yet.' : 'No visits were recorded in this period for the filters chosen.';
        return (
          <Stack spacing={2}>
            {/* Row 1: the headline figures. */}
            <Row columns={{ xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' }}>
              <LiveUsersCard live={live} />
              <Kpi title="Total logins" kpi={kpis.logins} format={formatNumber} icon={LoginOutlinedIcon} comparison={comparison}
                info="Successful sign-ins in the selected period: each password or university (SSO) sign-in that opened a portal session counts once. Refreshing a session in the background, reopening a tab or visiting pages never counts as a login. Failed attempts are not counted. The role filter applies; the device filter does not (a sign-in carries no device)."
                context={meta.sources?.demoIncluded
                  ? `${formatNumber(meta.sources.real.logins)} real + ${formatNumber(meta.sources.demo.logins)} demo`
                  : kpis.logins.value ? `${formatNumber(kpis.logins.sso)} university sign-in · ${formatNumber(kpis.logins.password)} password${kpis.logins.users != null ? ` · ${formatNumber(kpis.logins.users)} people` : ''}` : `In ${formatRange(meta.from, meta.to)}`} />
              <Kpi title="Peak concurrent users" kpi={kpis.peakConcurrent} format={formatNumber} icon={TrendingUpRoundedIcon} tone="info" comparison={comparison}
                info="The highest number of people online at the same moment during the selected period (same definition as Concurrent active users, sampled every minute). Unlike the live figure, this is the record for the whole period. Role and device filters do not apply."
                context={kpis.peakConcurrent.at ? `${formatDateTime(kpis.peakConcurrent.at, meta.timezone)}${meta.demo.included ? ` · ${kpis.peakConcurrent.real == null ? 'real not measured' : `${formatNumber(kpis.peakConcurrent.real)} real`} + ${formatNumber(kpis.peakConcurrent.demo)} demo` : ''}` : 'Nothing measured in this period'} />
            </Row>

            {/* Row 2: concurrency over time. */}
            <ConcurrencyTimeline refreshKey={refreshKey} liveTotal={live.data && (live.data.collecting || live.data.demoIncluded || live.data.real > 0) ? live.data.total : null} />

            {/* Row 3: technical usage. */}
            <Row columns={{ xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }}>
              <UsageSplitPanel kind="browser" split={data.browsers} emptyText={emptyUsage} info={BROWSER_INFO} />
              <UsageSplitPanel kind="os" split={data.operatingSystems} emptyText={emptyUsage} info={OS_INFO} />
              <Box sx={{ gridColumn: { md: '1 / -1', xl: 'auto' } }}>
                <Panel sx={{ height: '100%' }} title="Usage by Device" subtitle="Share of visits" info="Each visit comes from one kind of device, judged from the screen size and the kind of pointer (touch or mouse). Shares add up to 100% and use the same visit total as the browser and system charts."
                  action={<MuiButton size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => goTo('devices')}>Details</MuiButton>}
                  table={<ChartTable columns={[{ key: 'label', label: 'Device' }, { key: 'visits', label: 'Visits' }, { key: 'share', label: 'Share' }]} rows={data.devices.rows.map((row) => ({ label: deviceLabel(row.key), visits: formatNumber(row.visits), share: formatPercent(row.share) }))} />}>
                  {data.devices.total > 0 ? (
                    <Stack spacing={2} justifyContent="center" sx={{ height: '100%', py: 1 }}>
                      <ShareBars format={formatPercent} rows={data.devices.rows.map((row) => ({
                        label: deviceLabel(row.key), value: row.share, color: ENTITY_COLORS[row.key],
                        suffix: `${formatNumber(row.visits)} ${row.visits === 1 ? 'visit' : 'visits'}`,
                        tip: `${deviceLabel(row.key)}: ${formatNumber(row.visits)} of ${formatNumber(data.devices.total)} visits (${formatPercent(row.share)})`,
                      }))} />
                      <Typography variant="caption" color="text.secondary">
                        {formatNumber(data.devices.total)} visits in {formatRange(meta.from, meta.to)}
                        {meta.sources?.demoIncluded ? ` (${formatNumber(meta.sources.real.visits)} real + ${formatNumber(meta.sources.demo.visits)} demo)` : ''}
                      </Typography>
                    </Stack>
                  ) : <EmptyNote>{emptyUsage}</EmptyNote>}
                </Panel>
              </Box>
            </Row>

            {/* Row 4: what people use. */}
            <Row columns={{ xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }}>
              <Panel title="Most used features" info="Named portal features, ranked by the number of distinct people who used them. Adoption is that number as a share of everyone active in the period."
                action={<MuiButton size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => goTo('features')}>All features</MuiButton>}>
                {noUsage ? <EmptyNote>{emptyUsage}</EmptyNote> : (
                  <Scroll>
                    <RankTable ariaLabel="Most used features" pageSize={8} rows={[...data.topFeatures].sort((a, b) => b.users - a.users)} emptyText="No feature use recorded in this period."
                      columns={[
                        { key: 'label', label: 'Feature', primary: true, sortable: false, render: (row) => <><Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>{row.group} · </Box>{row.label}</> },
                        { key: 'users', label: 'People', align: 'right', format: formatNumber, sortable: false },
                        { key: 'adoptionRate', label: 'Adoption', align: 'right', format: formatPercent, bar: true, sortable: false },
                      ]} />
                  </Scroll>
                )}
              </Panel>
              <Panel title="Most visited pages" info="Pages ranked by how often they were opened in the period. People is the number of distinct people who opened the page."
                action={<MuiButton size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => goTo('pages')}>All pages</MuiButton>}>
                {noUsage ? <EmptyNote>{emptyUsage}</EmptyNote> : (
                  <Scroll>
                    <RankTable ariaLabel="Most visited pages" pageSize={8} rows={data.topPages} emptyText="No pages opened in this period."
                      columns={[
                        { key: 'label', label: 'Page', primary: true, sortable: false },
                        { key: 'users', label: 'People', align: 'right', format: formatNumber, sortable: false },
                        { key: 'views', label: 'Opened', align: 'right', format: formatNumber, bar: true, sortable: false },
                      ]} />
                  </Scroll>
                )}
              </Panel>
            </Row>

            {/* Row 5: who has stopped signing in. */}
            <InactiveUsersPanel timezone={meta.timezone} refreshKey={refreshKey} />

            {/* Row 6: observations. */}
            {notes.length > 0 && (
              <Panel title="Worth a look" subtitle="Observations from this period's figures">
                <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
                  {notes.map((note) => (
                    <Stack component="li" key={note.text} direction="row" spacing={1.25} alignItems="flex-start" sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <LightbulbOutlinedIcon sx={{ fontSize: 18, color: 'warning.main', mt: 0.25, flexShrink: 0 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2">{note.text}</Typography>
                        <MuiButton size="small" onClick={() => goTo(note.tab)} sx={{ ml: -0.75, mt: 0.25 }}>{note.action}</MuiButton>
                      </Box>
                    </Stack>
                  ))}
                </Box>
              </Panel>
            )}
          </Stack>
        );
      }}
    </ReportState>
  );
}

export default OverviewTab;
