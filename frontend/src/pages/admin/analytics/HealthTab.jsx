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
import { ChartTable } from '../../../components/charts/Charts';
import { useAuth } from '../../../context/AuthContext';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Fact, FactGrid, Grid2, Panel, RankTable } from '../../../components/analytics/parts';
import { formatAgo, formatDayLong, formatDuration, formatInstant, formatNumber, formatPercent } from '../../../components/analytics/format.js';
import { AccessPanel } from './AccessPanel';
import { ReportState, useReport } from './shared';

/**
 * "Include demo data": adds the synthetic analytics dataset to every usage report (Analytics only). Generating it
 * the first time takes about 20 seconds; after that switching is instant and creates nothing new.
 */
const DEMO_RECORD_LABELS = { people: 'Sample people', visits: 'Visits', page_views: 'Page views', events: 'Events (sign-ins, features, widgets)', user_daily: 'Person-days', rollups: 'Daily facts', concurrency: 'Concurrency samples', notifications: 'Notifications' };

/** Real, demo and shown figures for the period (server-computed), so it is clear what the demo data adds. */
function SourceTable({ sources }) {
  const rows = [['Visits', 'visits'], ['Active people', 'people'], ['Successful logins', 'logins']];
  return (
    <ChartTable
      columns={[{ key: 'label', label: 'In this period' }, { key: 'real', label: 'Real' }, { key: 'demo', label: 'Demo' }, { key: 'shown', label: 'Shown' }]}
      rows={rows.map(([label, key]) => ({ label, real: formatNumber(sources.real[key]), demo: sources.demoIncluded ? formatNumber(sources.demo[key]) : '—', shown: formatNumber(sources.displayed[key]) }))}
    />
  );
}

function DemoPanel({ demo, sources, timezone, onChanged }) {
  const [saving, setSaving] = useState(null);
  const [failure, setFailure] = useState(null);
  const run = async (action, call) => {
    setSaving(action);
    setFailure(null);
    try {
      await call();
      onChanged();
    } catch (caught) {
      setFailure(caught?.message ?? 'The change could not be saved.');
    } finally {
      setSaving(null);
    }
  };
  const { dataset } = demo;
  return (
    <Panel title="Include demo data" info="For demonstrations before real usage has built up. Turning this on adds a synthetic dataset to the Analytics reports only: 520 sample people (150 of them shown as online now), 90 days of visits, sign-ins, page views, feature use and notifications. The sample people are not portal accounts and never appear anywhere else: not in the directory, CampusCore, Keycloak, Moodle or Strapi, and nobody can sign in as them. System status under Integrations is never affected. Turning it off returns every report to real figures at once; the sample data is kept so turning it on again is instant.">
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap">
          <Badge variant={demo.enabled ? 'warning' : 'neutral'} dot>{demo.enabled ? 'On: reports include demo data' : 'Off: reports show real data only'}</Badge>
          {dataset && <Typography variant="body2" color="text.secondary">Sample data covers {formatDayLong(dataset.coversFrom)} to {formatDayLong(dataset.coversTo)} · {formatNumber(dataset.people)} sample people, {formatNumber(dataset.online)} online · generated {formatInstant(dataset.generatedAt, timezone)}</Typography>}
        </Stack>
        {dataset && demo.records && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
            Stored demo rows: {Object.entries(DEMO_RECORD_LABELS).map(([key, label]) => `${label} ${formatNumber(demo.records[key] ?? 0)}`).join(' · ')}
          </Typography>
        )}
        {sources && <SourceTable sources={sources} />}
        {demo.enabled && demo.stale && <Alert severity="info" variant="outlined">The sample data was generated before today, so its history stops on {formatDayLong(dataset.coversTo)}. Regenerate it to bring it up to date.</Alert>}
        {saving === 'on' && !dataset && <Alert severity="info" variant="outlined">Preparing the sample data. This takes about 20 seconds the first time.</Alert>}
        {failure && <Alert severity="error">{failure}</Alert>}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {demo.enabled
            ? <Button variant="secondary" size="sm" loading={saving === 'off'} disabled={Boolean(saving)} onClick={() => run('off', () => analyticsApi.setDemo(false))}>Turn demo data off</Button>
            : <Button variant="primary" size="sm" loading={saving === 'on'} disabled={Boolean(saving)} onClick={() => run('on', () => analyticsApi.setDemo(true))}>Include demo data</Button>}
          {dataset && <Button variant="ghost" size="sm" loading={saving === 'regenerate'} disabled={Boolean(saving)} onClick={() => run('regenerate', () => analyticsApi.regenerateDemo())}>Regenerate sample data</Button>}
        </Stack>
      </Stack>
    </Panel>
  );
}

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
              <li>whether the device is a phone, tablet or computer, and the kind of browser and operating system (for example "Chrome" and "Windows"); sign-ins and sign-outs;</li>
              <li>whether a person currently has the portal open (to count people online now; cleared when they sign out).</li>
            </Box>
            <Typography variant="body2">It never records passwords, IP addresses, the browser's full identification string, search text, messages, form answers, grades or payments. Usage reports show totals only: never a name, an email address or one person's own activity. (The list of people who have not signed in recently comes from sign-in records, not from this measurement.)</Typography>
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

            <Grid2>
              <DemoPanel demo={data.demo} sources={meta.sources} timezone={meta.timezone} onChanged={onChanged} />
              <Panel title="Live users" info="How Concurrent active users is measured. Every open, visible and recently used portal tab of a measured person reports in every 30 seconds; the person is counted once while a report arrived within the window below. Signing out removes them at once. The live count is recorded every sample interval to build the history and the peak.">
                <FactGrid>
                  <Fact label="Counted as online for" info="After the last signal from any of the person's tabs.">{formatDuration(data.live.presenceWindowSeconds * 1000)}</Fact>
                  <Fact label="History sampled every">{formatDuration(data.live.sampleIntervalSeconds * 1000)}</Fact>
                  <Fact label="Last sample">{data.live.lastSampleAt ? formatAgo(data.live.lastSampleAt) : 'None yet'}</Fact>
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
