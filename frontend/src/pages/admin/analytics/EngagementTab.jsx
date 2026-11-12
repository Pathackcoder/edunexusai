import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { FilterChips } from '../../../components/common/FilterChips';
import { Badge } from '../../../components/common/Badge';
import { NoData, Panel, RankTable } from '../../../components/analytics/parts';
import { formatNumber, formatPercent } from '../../../components/analytics/format.js';
import { ReportState, useReport } from './shared';

const VIEWS = [{ id: 'features', label: 'Features' }, { id: 'widgets', label: 'Dashboard widgets' }];

/** One row per feature area: how many people opened it and how many actually used it. */
function featureGroups(features) {
  const groups = new Map();
  for (const row of features) {
    const group = groups.get(row.group) ?? { key: row.group, label: row.group, opened: null, completed: null, uses: 0, rows: [] };
    group.rows.push(row);
    group.uses += row.uses ?? 0;
    const slot = row.stage === 'OPEN' ? 'opened' : 'completed';
    // A group's people are those of its busiest action of that kind (people cannot be added across actions).
    group[slot] = Math.max(group[slot] ?? 0, row.users);
    groups.set(row.group, group);
  }
  return [...groups.values()];
}

function FeaturesView({ data, goTo }) {
  const [show, setShow] = useState('all');
  const anyUse = data.features.some((row) => row.uses !== 0);
  const groups = useMemo(() => featureGroups(data.features), [data.features]);
  if (!anyUse) return <Panel title="Features"><NoData meta={data.meta} what="feature use" onOpenHealth={() => goTo('health')} /></Panel>;
  const rows = data.features.filter((row) => (show === 'unused' ? row.uses === 0 : show === 'used' ? row.uses !== 0 : true));
  const unused = data.features.filter((row) => row.uses === 0).length;
  return (
    <Stack spacing={2}>
      <Panel title="Opened versus actually used" subtitle={data.activeUsers != null ? `Out of ${formatNumber(data.activeUsers)} people active in the period` : undefined}
        info="Opened: people who opened the feature in the portal. Used: people who completed its action (sent a message, submitted a request, booked an appointment), recorded by the server only when the action succeeded. A feature with many opens and few uses may be hard to use, or may not offer what people expected.">
        <RankTable
          ariaLabel="Features: opened versus used"
          rows={groups.map((group) => ({ ...group, conversion: group.opened && group.completed != null ? Math.min(1, group.completed / group.opened) : null }))}
          initialSort={{ key: 'uses', direction: 'desc' }}
          columns={[
            { key: 'label', label: 'Feature', primary: true },
            { key: 'opened', label: 'People who opened it', align: 'right', render: (row) => (row.opened != null ? formatNumber(row.opened) : 'Not measured'), info: 'Not measured: this feature has no separate "open" step to record.' },
            { key: 'completed', label: 'People who used it', align: 'right', render: (row) => (row.completed != null ? formatNumber(row.completed) : 'Not measured'), bar: true },
            { key: 'conversion', label: 'Opened → used', align: 'right', format: formatPercent, info: 'People who used it ÷ people who opened it (shown when both are measured).' },
          ]}
        />
      </Panel>
      <Panel title="Every tracked action" subtitle="Adoption is the share of active people who did it at least once"
        info="Uses: how many times the action happened. People: distinct people who did it. Adoption: people ÷ everyone active in the period. Device filters do not apply here, because completed actions are recorded by the server, which keeps no device.">
        <FilterChips ariaLabel="Show actions" options={[{ id: 'all', label: 'All' }, { id: 'used', label: 'Used' }, { id: 'unused', label: `Not used (${unused})` }]} value={show} onChange={setShow} sx={{ mb: 1.5 }} />
        <RankTable
          ariaLabel="Feature actions"
          rows={rows}
          initialSort={{ key: 'users', direction: 'desc' }}
          pageSize={20}
          columns={[
            { key: 'label', label: 'Action', primary: true, render: (row) => <Box><Box>{row.label}</Box><Typography variant="caption" color="text.secondary">{row.group}</Typography></Box> },
            { key: 'stage', label: 'Kind', render: (row) => <Badge variant={row.stage === 'OPEN' ? 'neutral' : 'success'}>{row.stage === 'OPEN' ? 'Opened' : 'Used'}</Badge>, numeric: false, sortable: false },
            { key: 'users', label: 'People', align: 'right', format: formatNumber },
            { key: 'adoptionRate', label: 'Adoption', align: 'right', format: formatPercent, bar: true },
            { key: 'uses', label: 'Uses', align: 'right', format: formatNumber, secondary: true },
            { key: 'usesPerUser', label: 'Uses per person', align: 'right', format: formatNumber, secondary: true },
          ]}
          emptyText="Nothing matches this filter."
        />
      </Panel>
    </Stack>
  );
}

function WidgetsView({ data, goTo }) {
  const dashboards = [...new Set(data.widgets.map((row) => row.dashboard))];
  const [dashboard, setDashboard] = useState('');
  if (!data.widgets.some((row) => row.impressions !== 0)) return <Panel title="Dashboard widgets"><NoData meta={data.meta} what="widget views" onOpenHealth={() => goTo('health')} /></Panel>;
  const rows = data.widgets.filter((row) => !dashboard || row.dashboard === dashboard);
  return (
    <Panel title="Dashboard widgets" subtitle="Seen is not the same as used"
      info="Seen: the widget was at least half on screen for a second (counted once per dashboard view). Used: someone clicked a link or control inside it. Engagement: people who used it ÷ people who saw it. A widget that is seen by many and used by few may belong lower on the dashboard, or may be doing its job by being read. Widgets shown while editing in Studio are not counted.">
      <FilterChips ariaLabel="Dashboard" options={[{ id: '', label: 'All dashboards' }, ...dashboards.map((name) => ({ id: name, label: name.replace(' dashboard', '') }))]} value={dashboard} onChange={setDashboard} sx={{ mb: 1.5 }} />
      <RankTable
        ariaLabel="Dashboard widgets"
        rows={rows}
        initialSort={{ key: 'users', direction: 'desc' }}
        pageSize={20}
        columns={[
          { key: 'label', label: 'Widget', primary: true, render: (row) => <Box><Box>{row.label}</Box><Typography variant="caption" color="text.secondary">{row.dashboard}</Typography></Box> },
          { key: 'users', label: 'People who saw it', align: 'right', format: formatNumber },
          { key: 'impressions', label: 'Times seen', align: 'right', format: formatNumber, secondary: true },
          { key: 'interactors', label: 'People who used it', align: 'right', format: formatNumber },
          { key: 'interactions', label: 'Clicks', align: 'right', format: formatNumber, secondary: true },
          { key: 'engagementRate', label: 'Engagement', align: 'right', format: formatPercent, bar: true },
        ]}
      />
    </Panel>
  );
}

export function EngagementTab({ filters, refreshKey, goTo }) {
  const [view, setView] = useState('features');
  const features = useReport('features', filters, refreshKey, { role: true, device: false });
  const widgets = useReport('widgets', filters, refreshKey);
  return (
    <Stack spacing={2}>
      <FilterChips ariaLabel="Features or widgets" options={VIEWS} value={view} onChange={setView} />
      {view === 'features'
        ? <ReportState query={features}>{(data) => <FeaturesView data={data} goTo={goTo} />}</ReportState>
        : <ReportState query={widgets}>{(data) => <WidgetsView data={data} goTo={goTo} />}</ReportState>}
    </Stack>
  );
}

export default EngagementTab;
