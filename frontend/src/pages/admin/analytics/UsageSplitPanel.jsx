import React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChartTable } from '../../../components/charts/Charts';
import { CATEGORY_COLORS, DonutChart } from '../../../components/analytics/charts';
import { Panel } from '../../../components/analytics/parts';
import { formatNumber, formatPercent } from '../../../components/analytics/format.js';
import { BROWSER_LABELS, OS_LABELS } from '../../../../../shared/analyticsAgent.js';

export const BROWSER_INFO = "Which browser each visit used, worked out in the browser itself; only the category is stored, never the browser's full identification string. Visits recorded before browsers were measured count as Unknown, so these shares use the same visit total as the device and system charts.";
export const OS_INFO = 'Which operating system each visit came from, detected separately from the browser (an iPad that presents itself as a Mac is counted as iOS / iPadOS). Only the category is stored. Visits recorded before systems were measured count as Unknown.';
const KINDS = {
  browser: { title: 'Usage by Browser', column: 'Browser', labels: BROWSER_LABELS },
  os: { title: 'Usage by Operating System', column: 'Operating system', labels: OS_LABELS },
};

/** Visits by browser or by operating system: a donut with its legend (counts and shares), and a table view. */
export function UsageSplitPanel({ kind, split, info, emptyText = 'No visits recorded in this period.' }) {
  const { title, column, labels } = KINDS[kind];
  const rows = split.rows.map((row) => ({ key: row.key, label: labels[row.key] ?? row.key, value: row.visits, share: row.share, color: CATEGORY_COLORS[row.key] }));
  return (
    <Panel title={title} subtitle="Share of visits" info={info}
      table={<ChartTable columns={[{ key: 'label', label: column }, { key: 'visits', label: 'Visits' }, { key: 'share', label: 'Share' }]} rows={rows.filter((row) => row.value > 0).map((row) => ({ label: row.label, visits: formatNumber(row.value), share: formatPercent(row.share) }))} />}>
      {split.total > 0
        ? (
          <Stack spacing={1} sx={{ height: '100%' }}>
            <DonutChart rows={rows} total={split.total} ariaLabel={`${title}: share of ${formatNumber(split.total)} visits`} formatShare={formatPercent} />
            {split.notRecorded > 0 && (
              <Typography variant="caption" color="text.secondary">
                {formatNumber(split.notRecorded)} of {formatNumber(split.total)} {split.total === 1 ? 'visit was' : 'visits were'} recorded before {kind === 'browser' ? 'browsers' : 'systems'} were measured and {split.notRecorded === 1 ? 'is' : 'are'} included in Unknown.
              </Typography>
            )}
          </Stack>
        )
        : (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 5, px: 2, textAlign: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>{emptyText}</Typography>
          </Stack>
        )}
    </Panel>
  );
}

export default UsageSplitPanel;
