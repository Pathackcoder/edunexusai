import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { analyticsApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Fact, FactGrid, Grid2, Panel, RankTable } from '../../../components/analytics/parts';
import { formatAgo, formatDayLong, formatDuration, formatInstant, formatNumber, formatPercent } from '../../../components/analytics/format.js';
import { AccessPanel } from './AccessPanel';
import { ReportState, useReport } from './shared';

const RUN_BADGE = { FINAL: ['success', 'Final'], PARTIAL: ['info', 'In progress'], FAILED: ['danger', 'Failed'] };
const REJECTION_LABELS = { INVALID: 'Not in the fixed format', STALE: 'Too old or dated in the future', NOT_PERMITTED: 'A page the account cannot open', FOREIGN_ID: 'An id belonging to someone else' };

function CollectionPanel({ collection, timezone, onChanged }) {
  const { refreshUser } = useAuth();
  const [dialog, setDialog] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);
  const close = () => { setDialog(null); setConfirmed(false); setFailure(null); };
  const save = async (enabled) => {
    setSaving(true);
    setFailure(null);
    try {
      await analyticsApi.setCollection(enabled, enabled ? confirmed : false);
      await refreshUser();
      close();
      onChanged();
    } catch (caught) {
      setFailure(caught?.message ?? 'The change could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  const state = collection.collecting ? ['success', 'Collecting'] : collection.institutionEnabled ? ['warning', 'Waiting for the platform switch'] : ['neutral', 'Not collecting'];
  return (
    <Panel title="Usage collection" info="Collection needs two switches: your institution's, here, and the platform's, which EdunexusAI operations controls. With either off, nothing is recorded. Switching off keeps what was already collected.">
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap">
          <Badge variant={state[0]} dot>{state[1]}</Badge>
          <Typography variant="body2" color="text.secondary">
            {collection.collecting ? `Portal usage is being measured${collection.startedAt ? ` (first switched on ${formatInstant(collection.startedAt, timezone)})` : ''}.`
              : collection.institutionEnabled ? 'Your institution has switched collection on, but it is not yet enabled for this platform. Nothing is being recorded.'
                : collection.startedAt ? 'Collection is switched off. Earlier figures are kept until they reach their retention limit.' : 'Portal usage has never been measured for your institution.'}
          </Typography>
        </Stack>
        <FactGrid>
          <Fact label="Your institution's switch">{collection.institutionEnabled ? 'On' : 'Off'}</Fact>
          <Fact label="Platform switch" info="Set by EdunexusAI operations for the whole deployment. It is the emergency stop: off means nothing is collected anywhere.">{collection.deploymentEnabled ? 'On' : 'Off'}</Fact>
          <Fact label="Accounts never measured" info="Accounts excluded from measurement, such as test and service accounts.">{formatNumber(collection.excludedAccounts)}</Fact>
        </FactGrid>
        <Box>
          {collection.institutionEnabled
            ? <Button variant="secondary" size="sm" onClick={() => setDialog('off')}>Switch collection off</Button>
            : <Button variant="primary" size="sm" onClick={() => setDialog('on')}>Switch collection on…</Button>}
        </Box>
      </Stack>

      <Dialog open={dialog === 'on'} onClose={close} maxWidth="sm" fullWidth aria-labelledby="collection-on-title">
        <DialogTitle id="collection-on-title">Switch usage collection on?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2">From now on the portal will record, for signed-in people at your institution:</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2', '& li': { mb: 0.5 } }}>
              <li>which portal pages are opened (by a fixed page name, never an address, record or search), and how long they are on screen;</li>
              <li>navigation clicks, dashboard widgets seen and used, and named features used;</li>
              <li>whether the device is a phone, tablet or computer; sign-ins and sign-outs.</li>
            </Box>
            <Typography variant="body2">It never records passwords, IP addresses, browser details, search text, messages, form answers, grades or payments. Reports show totals only: never a name, an email address or one person's own activity.</Typography>
            <Alert severity="warning" variant="outlined">Measuring how people use the portal is processing of personal data. Make sure your institution's privacy notice describes it, and that it has been reviewed as your institution requires, before you continue.</Alert>
            <FormControlLabel control={<Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />} label="Our privacy notice covers portal usage measurement, and this has been approved at our institution." />
            {failure && <Alert severity="error">{failure}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!confirmed} loading={saving} onClick={() => save(true)}>Switch on</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={dialog === 'off'} onClose={close} maxWidth="xs" fullWidth aria-labelledby="collection-off-title">
        <DialogTitle id="collection-off-title">Switch usage collection off?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Nothing further will be recorded. Figures already collected stay available until they reach their retention limit. Reports will show a gap for the time collection is off.</Typography>
          {failure && <Alert severity="error" sx={{ mt: 1.5 }}>{failure}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
          <Button variant="danger" size="sm" loading={saving} onClick={() => save(false)}>Switch off</Button>
        </DialogActions>
      </Dialog>
    </Panel>
  );
}

export function HealthTab({ filters, refreshKey, onChanged }) {
  const query = useReport('health', filters, refreshKey, { role: false, device: false });
  return (
    <ReportState query={query}>
      {(data) => {
        const { meta, freshness, coverage, retention } = data;
        const rejected = Object.entries(data.rejections.sinceRestart ?? {}).filter(([, count]) => count > 0);
        const overdue = data.collection.collecting && freshness.lastAggregationAt && Date.now() - new Date(freshness.lastAggregationAt).getTime() > freshness.aggregationIntervalSeconds * 3000;
        return (
          <Stack spacing={2}>
            {data.failedRuns > 0 && <Alert severity="warning">{data.failedRuns} of the last 14 daily summaries failed and will be retried automatically. Figures for those days may be incomplete until then.</Alert>}
            {overdue && <Alert severity="warning">The figures have not been updated for longer than expected (last update {formatAgo(freshness.lastAggregationAt)}). Use Refresh, and contact support if this continues.</Alert>}
            <Grid2>
              <CollectionPanel collection={data.collection} timezone={meta.timezone} onChanged={onChanged} />
              <Panel title="Freshness" info="Reports are built from summaries that are recalculated on a schedule, so the newest activity appears after the next update. Today's and yesterday's figures can still change: browsers may deliver events up to a day late.">
                <FactGrid>
                  <Fact label="Figures last updated">{freshness.lastAggregationAt ? `${formatAgo(freshness.lastAggregationAt)} · ${formatInstant(freshness.lastAggregationAt, meta.timezone)}` : 'Not yet'}</Fact>
                  <Fact label="Updated every">{formatDuration(freshness.aggregationIntervalSeconds * 1000)}</Fact>
                  <Fact label="Last activity received">{freshness.lastActivityReceivedAt ? formatAgo(freshness.lastActivityReceivedAt) : 'None yet'}</Fact>
                  <Fact label="Last 24 hours">{formatNumber(freshness.pageViews24h)} page views · {formatNumber(freshness.events24h)} events</Fact>
                </FactGrid>
              </Panel>
            </Grid2>

            <Grid2 align="start">
              <Panel title="Daily summaries" subtitle="Last 14 days" info="Each day is summarised from the recorded activity. In progress: the day can still change. Final: the day is closed. A failed day is rebuilt automatically; rebuilding always gives the same result.">
                <RankTable
                  ariaLabel="Daily summaries"
                  rows={data.runs.map((run) => ({ ...run, key: run.date }))}
                  pageSize={14}
                  columns={[
                    { key: 'date', label: 'Day', primary: true, sortable: false, render: (run) => formatDayLong(run.date) },
                    { key: 'status', label: 'State', sortable: false, numeric: false, render: (run) => <Badge variant={RUN_BADGE[run.status]?.[0] ?? 'neutral'}>{RUN_BADGE[run.status]?.[1] ?? run.status}{run.errorCode ? ` · ${run.errorCode}` : ''}</Badge> },
                    { key: 'finishedAt', label: 'Updated', align: 'right', sortable: false, render: (run) => (run.finishedAt ? formatInstant(run.finishedAt, meta.timezone) : '—') },
                    { key: 'durationMs', label: 'Took', align: 'right', sortable: false, format: formatDuration },
                  ]}
                  emptyText="No day has been summarised yet. Summaries start once collection is on."
                />
              </Panel>
              <Stack spacing={2}>
                <Panel title="Measurement coverage" info="How complete the measurement is. Time on page can only be measured for views that lasted at least a second and whose browser reported back; the rest are left out of time averages rather than counted as zero.">
                  <FactGrid>
                    <Fact label="Page views with measured time" info="Last 7 days. Shown once there are at least 20 page views.">{coverage.timedPageViewShare == null ? 'Not enough data yet' : formatPercent(coverage.timedPageViewShare)}</Fact>
                    <Fact label="Pages tracked" info="Every signed-in page has a fixed name; an automated check fails the build if a new page is added without one.">{formatNumber(coverage.trackedPages)}</Fact>
                    <Fact label="Widgets tracked">{formatNumber(coverage.trackedWidgets)}</Fact>
                    <Fact label="Feature actions tracked">{formatNumber(coverage.trackedFeatures)}</Fact>
                  </FactGrid>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Not measured: the login page and the public site; people using a browser that blocks the request; activity while collection is off. Treat the figures as measurements, not exact counts.
                  </Typography>
                </Panel>
                <Panel title="Retention" info="How long each kind of record is kept before it is deleted automatically.">
                  <FactGrid>
                    <Fact label="Detailed activity" info="Individual visits, page views and events. Needed for exact people counts per page or feature.">{retention.rawDays} days</Fact>
                    <Fact label="Daily activity per person" info="One row per person per active day (counts only, never which pages). Used for weekly and monthly active people.">{Math.round(retention.personDayDays / 30.4)} months</Fact>
                    <Fact label="Totals" info="Daily totals with no personal identifiers.">{Math.round(retention.aggregateDays / 365)} years</Fact>
                    <Fact label="Oldest detailed day held">{retention.oldestRawDate ? formatDayLong(retention.oldestRawDate) : 'None'}</Fact>
                  </FactGrid>
                </Panel>
                {rejected.length > 0 && (
                  <Panel title="Events refused" subtitle="Since the service last restarted" info="Events the portal refused to store because they did not match the fixed format. A few are normal (an old browser tab, a clock that is wrong). The refused content itself is never kept.">
                    <Stack spacing={0.5}>{rejected.map(([reason, count]) => <Typography key={reason} variant="body2">{REJECTION_LABELS[reason] ?? reason}: <strong>{formatNumber(count)}</strong></Typography>)}</Stack>
                  </Panel>
                )}
              </Stack>
            </Grid2>
            <AccessPanel />
          </Stack>
        );
      }}
    </ReportState>
  );
}

export default HealthTab;
