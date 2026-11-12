import React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import RepeatOutlinedIcon from '@mui/icons-material/RepeatOutlined';
import { BarChart, ChartTable } from '../../../components/charts/Charts';
import { ENTITY_COLORS, ShareBars, StackedBars } from '../../../components/analytics/charts';
import { Grid2, Kpi, KpiGrid, NoData, Panel, RankTable } from '../../../components/analytics/parts';
import { formatDay, formatDayLong, formatDuration, formatNumber, formatPercent } from '../../../components/analytics/format.js';
import { DEVICE_OPTIONS, ReportState, deviceLabel, roleLabel, useReport } from './shared';

const BUCKET_LABELS = { 'under-1m': '< 1 min', '1-5m': '1–5 min', '5-15m': '5–15 min', '15-30m': '15–30 min', '30-60m': '30–60 min', 'over-60m': '> 1 hour' };

export function DevicesTab({ filters, refreshKey, goTo }) {
  const query = useReport('devices', filters, refreshKey, { role: true, device: false });
  return (
    <ReportState query={query}>
      {(data) => {
        const { meta } = data;
        const anyVisits = data.distribution.some((row) => row.visits > 0);
        if (!anyVisits) return <Panel title="Devices and visits"><NoData meta={meta} what="visits" onOpenHealth={() => goTo('health')} /></Panel>;
        const series = DEVICE_OPTIONS.map((device) => ({ key: device, label: deviceLabel(device), color: ENTITY_COLORS[device] }));
        const trend = data.trend.map((row) => ({ ...row, label: formatDay(row.date), tip: formatDayLong(row.date) }));
        const visits = data.visits;
        const value = (number) => ({ value: number });
        return (
          <Stack spacing={2}>
              <KpiGrid>
                <Kpi title="Visits" kpi={value(visits.total)} format={formatNumber} icon={DevicesOutlinedIcon} info="Browser visits that started in the period. A visit ends after 30 minutes without activity and is shared by a person's tabs." />
                <Kpi title="Visit length" kpi={value(visits.averageVisitMs)} format={formatDuration} icon={TimerOutlinedIcon} tone="info" info="Average time from a visit's first activity to its last. It includes time when the portal was open but in the background. Capped at 12 hours." />
                <Kpi title="Active time per visit" kpi={value(visits.averageActiveMs)} format={formatDuration} icon={TouchAppOutlinedIcon} tone="teal" info="Average time per visit that a portal page was on screen and in use. Always at most the visit length." />
                <Kpi title="Visits per person" kpi={value(visits.visitsPerUser)} format={formatNumber} icon={RepeatOutlinedIcon} tone="teal" info="Visits ÷ distinct active people in the period." />
              </KpiGrid>

            <Grid2 ratio="2fr 3fr" align="start">
              <Stack spacing={2}>
              <Panel title="Visits by device" subtitle="Share of visits" info="Phone, tablet or computer, judged only from the screen size and whether the main pointer is a finger. No browser or model details are collected. People can use more than one device, so the People figures can overlap."
                table={<ChartTable columns={[{ key: 'label', label: 'Device' }, { key: 'share', label: 'Share of visits' }, { key: 'visits', label: 'Visits' }, { key: 'users', label: 'People' }, { key: 'time', label: 'Visit length' }]} rows={data.distribution.map((row) => ({ label: deviceLabel(row.device), share: formatPercent(row.share), visits: formatNumber(row.visits), users: formatNumber(row.users), time: formatDuration(row.averageVisitMs) }))} />}>
                <ShareBars rows={data.distribution.map((row) => ({ label: deviceLabel(row.device), value: row.share, color: ENTITY_COLORS[row.device], suffix: `${formatNumber(row.visits)} ${row.visits === 1 ? 'visit' : 'visits'} · ${formatNumber(row.users)} ${row.users === 1 ? 'person' : 'people'}${row.averageVisitMs != null ? ` · ${formatDuration(row.averageVisitMs)} a visit` : ''}` }))} format={formatPercent} />
              </Panel>
              <Panel title="Device mix by role" subtitle="Share of each role's visits" info="For people holding each role: how their visits divide between devices. Each row adds up to 100%; rows overlap for people with more than one role, so they are not stacked together.">
                {data.byRole === null ? <Typography variant="body2" color="text.secondary">Available for periods within the last 90 days.</Typography> : (
                  <RankTable
                    ariaLabel="Device mix by role"
                    rows={data.byRole.map((row) => ({ key: row.role, label: roleLabel(row.role), total: row.total, ...Object.fromEntries(row.cells.map((cell) => [cell.device, cell.share])) }))}
                    columns={[
                      { key: 'label', label: 'Role', primary: true, sortable: false },
                      ...DEVICE_OPTIONS.map((device) => ({ key: device, label: deviceLabel(device), align: 'right', sortable: false, render: (row) => formatPercent(row[device]) })),
                      { key: 'total', label: 'Visits', align: 'right', format: formatNumber, sortable: false },
                    ]}
                    emptyText="No visits recorded."
                  />
                )}
              </Panel>
              </Stack>
              <Stack spacing={2}>
              <Panel title="Visits per day by device" info="Each visit has exactly one device, so the segments add up to the day's visits."
                table={<ChartTable columns={[{ key: 'tip', label: 'Day' }, ...series.map((item) => ({ key: item.key, label: item.label }))]} rows={trend.map((row) => ({ tip: row.tip, ...Object.fromEntries(series.map((item) => [item.key, formatNumber(row[item.key] ?? 0)])) }))} />}>
                <StackedBars data={trend} series={series} height={200} ariaLabel="Visits per day by device" />
              </Panel>
              <Panel title="How long visits last" info="Visits grouped by the time between their first and last activity."
                table={<ChartTable columns={[{ key: 'label', label: 'Visit length' }, { key: 'visits', label: 'Visits' }, { key: 'share', label: 'Share' }]} rows={data.durations.map((row) => ({ label: BUCKET_LABELS[row.bucket], visits: formatNumber(row.visits), share: formatPercent(row.share) }))} />}>
                {data.durations.length ? <BarChart width={640} height={200} data={data.durations.map((row) => ({ label: BUCKET_LABELS[row.bucket], value: row.visits, note: formatPercent(row.share) }))} format={formatNumber} ariaLabel="Visits by length" /> : <Typography variant="body2" color="text.secondary">No visits recorded.</Typography>}
              </Panel>
              </Stack>
            </Grid2>
          </Stack>
        );
      }}
    </ReportState>
  );
}

export default DevicesTab;
