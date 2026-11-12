import React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BarChart, ChartTable } from '../../../components/charts/Charts';
import { ENTITY_COLORS, Heatmap, SERIES, StackedBars, TrendChart } from '../../../components/analytics/charts';
import { Grid2, NoData, Panel, RankTable } from '../../../components/analytics/parts';
import { WEEKDAYS, WEEKDAYS_LONG, formatDay, formatDayLong, formatHour, formatNumber, formatPercent, formatRange } from '../../../components/analytics/format.js';
import { ReportState, roleLabel, trendPoints, useReport } from './shared';

const SIGN_IN_LABELS = { SSO: 'University sign-in (SSO)', PASSWORD: 'Portal password' };

export function ActivityTab({ filters, refreshKey, goTo }) {
  const query = useReport('activity', filters, refreshKey);
  return (
    <ReportState query={query}>
      {(data) => {
        const { meta } = data;
        const anyone = data.series.some((point) => point.users > 0);
        if (!anyone) return <Panel title="People and activity"><NoData meta={meta} what="activity" onOpenHealth={() => goTo('health')} /></Panel>;
        const daily = trendPoints(data.series, { users: 'users' });
        const rolling = data.rolling.map((row) => ({ label: formatDay(row.date), tip: formatDayLong(row.date), wau: row.wau, mau: row.mau, note: row.beforeCollection ? 'Before collection began' : undefined }));
        const contextSeries = data.contexts.keys.map((key) => ({ key, label: roleLabel(key), color: ENTITY_COLORS[key] }));
        const contextDays = data.contexts.series.map((row) => ({ ...row, label: formatDay(row.date), tip: formatDayLong(row.date) }));
        const busiest = [...data.heatmap].filter((cell) => cell.value).sort((a, b) => b.value - a.value)[0];
        const weekdayRows = data.weekdays.map((row) => ({ label: WEEKDAYS[row.weekday - 1], value: row.averageUsers ?? 0, note: `${row.days} day${row.days === 1 ? '' : 's'} in the period` }));
        const totalSignIns = data.signIns.reduce((sum, row) => sum + (row.signIns ?? 0), 0);
        return (
          <Stack spacing={2}>
            <Grid2>
              <Panel title="Daily active people" subtitle={formatRange(meta.from, meta.to)}
                info="People with at least one page view, navigation click, widget interaction or feature use on that day."
                table={<ChartTable columns={[{ key: 'tip', label: 'Day' }, { key: 'shown', label: 'Active people' }]} rows={daily.map((point) => ({ tip: point.tip, shown: point.users == null ? point.note ?? '—' : formatNumber(point.users) }))} />}>
                <TrendChart data={daily} series={[{ key: 'users', label: 'Active people', color: SERIES[0] }]} ariaLabel="Daily active people" />
              </Panel>
              <Panel title="Weekly and monthly active people" subtitle="Rolling 7 and 30 days, ending on each day"
                info="For each day: the distinct people active in the 7 days (weekly) and 30 days (monthly) ending that day. Counted person by person, so someone active on five days is still one person."
                table={<ChartTable columns={[{ key: 'tip', label: 'Day' }, { key: 'w', label: 'Weekly active' }, { key: 'm', label: 'Monthly active' }]} rows={rolling.map((row) => ({ tip: row.tip, w: row.wau == null ? row.note : formatNumber(row.wau), m: row.mau == null ? row.note : formatNumber(row.mau) }))} />}>
                <TrendChart data={rolling} series={[{ key: 'mau', label: 'Monthly active (30 days)', color: SERIES[0] }, { key: 'wau', label: 'Weekly active (7 days)', color: SERIES[1] }]} ariaLabel="Weekly and monthly active people" />
              </Panel>
            </Grid2>

            <Panel title="Activity by role" subtitle="People holding each role who used the portal"
              info="A person who holds two roles (for example a lecturer who also studies) appears in both rows, so the rows do not add up to the total of active people. The roles are those held at the time of the activity. Active share compares with the accounts that hold the role today.">
              <RankTable
                ariaLabel="Activity by role"
                rows={data.roles.map((row) => ({ ...row, key: row.role, label: roleLabel(row.role) }))}
                columns={[
                  { key: 'label', label: 'Role', primary: true, sortable: false },
                  { key: 'accounts', label: 'Accounts', align: 'right', format: formatNumber, info: 'Active accounts holding this role today.' },
                  { key: 'users', label: 'Active people', align: 'right', format: formatNumber },
                  { key: 'activeShare', label: 'Active share', align: 'right', format: formatPercent, bar: true, info: 'Active people ÷ accounts holding the role.', secondary: true },
                  { key: 'averageDailyUsers', label: 'Per day', align: 'right', format: formatNumber, info: 'Average daily active people with this role.', secondary: true },
                  { key: 'pageViews', label: 'Page views', align: 'right', format: formatNumber, secondary: true },
                  { key: 'returningRate', label: 'Came back', align: 'right', format: formatPercent, info: 'Share active on two or more days.', secondary: true },
                ]}
              />
            </Panel>

            <Panel title="Where the portal is used" subtitle="Page views by workspace, per day"
              info="Every page view belongs to exactly one workspace, so these add up: the student pages, the teaching pages, administration, and so on. Shared pages are pages every role uses (campus, profile, help) when opened by someone with more than one role."
              table={<ChartTable columns={[{ key: 'label', label: 'Workspace' }, { key: 'views', label: 'Page views' }, { key: 'share', label: 'Share' }]} rows={data.contexts.totals.map((row) => ({ label: roleLabel(row.context), views: formatNumber(row.views), share: formatPercent(row.share) }))} />}>
              {contextDays.length ? <StackedBars data={contextDays} series={contextSeries} width={1100} height={200} ariaLabel="Page views by workspace per day" /> : <Typography variant="body2" color="text.secondary">No page views recorded in this period.</Typography>}
            </Panel>

            <Grid2 ratio="3fr 2fr" align="start">
              <Panel title="Peak hours" subtitle="Average people active in each hour of the week"
                info="For each weekday and hour: the number of distinct people active in that hour, averaged over the matching days in the period. Hours are your institution's local hours."
                table={<ChartTable columns={[{ key: 'day', label: 'Day' }, { key: 'hour', label: 'Hour' }, { key: 'people', label: 'Average people' }]} rows={[...data.heatmap].sort((a, b) => b.value - a.value).slice(0, 24).map((cell) => ({ day: WEEKDAYS_LONG[cell.weekday - 1], hour: formatHour(cell.hour), people: formatNumber(cell.value) }))} />}>
                <Heatmap cells={data.heatmap} ariaLabel="Average people active by weekday and hour" />
                {busiest && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Busiest: <strong>{WEEKDAYS_LONG[busiest.weekday - 1]} around {formatHour(busiest.hour)}</strong>, with {formatNumber(busiest.value)} people on average.</Typography>}
              </Panel>
              <Stack spacing={2}>
                <Panel title="Busiest weekdays" subtitle="Average daily active people" info="Daily active people averaged by weekday over the period.">
                  <BarChart data={weekdayRows} format={formatNumber} ariaLabel="Average daily active people by weekday" />
                </Panel>
                <Panel title="How people sign in" info="Sign-ins recorded when a session is issued. Refreshing an existing session is not a sign-in.">
                  {totalSignIns === 0 ? <Typography variant="body2" color="text.secondary">No sign-ins recorded in this period.</Typography> : (
                    <RankTable ariaLabel="Sign-ins by method" rows={data.signIns.map((row) => ({ ...row, key: row.method, label: SIGN_IN_LABELS[row.method] }))}
                      columns={[{ key: 'label', label: 'Method', primary: true, sortable: false }, { key: 'signIns', label: 'Sign-ins', align: 'right', format: formatNumber, bar: true, sortable: false }]} />
                  )}
                </Panel>
              </Stack>
            </Grid2>
          </Stack>
        );
      }}
    </ReportState>
  );
}

export default ActivityTab;
