import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '../../../components/common/Badge';
import { IntegrationStatusBadge } from '../../../components/admin/IntegrationStatusBadge';
import { ChartTable } from '../../../components/charts/Charts';
import { StackedBars } from '../../../components/analytics/charts';
import { Fact, FactGrid, Grid2, Panel } from '../../../components/analytics/parts';
import { formatAgo, formatDay, formatDayLong, formatDuration, formatInstant, formatNumber, formatPercent, formatRange } from '../../../components/analytics/format.js';
import { ReportState, useReport } from './shared';

const OUTCOME_LABELS = { NETWORK: 'Could not be reached', AUTH_FAILED: 'Sign-in to the service failed', PERMISSION_DENIED: 'Permission denied', NOT_SUPPORTED: 'Not supported', NOT_IMPLEMENTED: 'Not implemented', FUNCTION_NOT_ENABLED: 'Function not enabled', PARTIAL: 'Partly completed', ERROR: 'Error' };

function IntegrationCard({ item, timezone }) {
  const stale = item.lastSuccessfulSyncAt && Date.now() - new Date(item.lastSuccessfulSyncAt).getTime() > 7 * 86_400_000;
  return (
    <Card component="article" sx={{ p: { xs: 2, md: 2.5 }, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} sx={{ mb: 1.75 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h3" sx={{ fontSize: '1rem' }} noWrap>{item.displayName}</Typography>
          <Typography variant="caption" color="text.secondary">{item.provider.replace(/_/g, ' ')} · {item.mode === 'LIVE' ? 'Live' : item.mode === 'MOCK' ? 'Demo data' : 'Disabled'}</Typography>
        </Box>
        <IntegrationStatusBadge status={item.status} enabled={item.enabled} />
      </Stack>
      <FactGrid min={130}>
        <Fact label="Last successful sync" info="The last attempt this integration recorded as successful.">{item.lastSuccessfulSyncAt ? <>{formatAgo(item.lastSuccessfulSyncAt)}{stale && <Box component="span" sx={{ ml: 0.75 }}><Badge variant="warning">Over a week</Badge></Box>}</> : 'Never'}</Fact>
        <Fact label="Last attempt">{item.lastAttemptAt ? formatInstant(item.lastAttemptAt, timezone) : 'None recorded'}</Fact>
        <Fact label="Runs in period" info="Synchronisation attempts logged in the period.">{formatNumber(item.runs)}</Fact>
        <Fact label="Succeeded" info="Successful runs ÷ all runs in the period. This is the success rate of logged attempts, not a measure of the service's uptime.">{item.runs ? `${formatPercent(item.successRate)} (${formatNumber(item.succeeded)})` : 'No runs'}</Fact>
        <Fact label="Failed or partial">{item.runs ? formatNumber(item.failed + item.partial) : '—'}</Fact>
        <Fact label="Typical duration">{formatDuration(item.averageDurationMs)}</Fact>
      </FactGrid>
      {item.failureReasons.length > 0 && (
        <Box sx={{ mt: 1.75, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Why runs did not succeed</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
            {item.failureReasons.map((reason) => <Badge key={reason.outcome} variant="danger">{OUTCOME_LABELS[reason.outcome] ?? reason.outcome} · {reason.runs}</Badge>)}
          </Stack>
        </Box>
      )}
      {item.operations.total > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Account and enrolment operations: <strong>{formatNumber(item.operations.succeeded)}</strong> completed, <strong>{formatNumber(item.operations.failed)}</strong> failed{item.operations.needsAttention ? <>, <strong>{formatNumber(item.operations.needsAttention)}</strong> waiting or needing attention</> : null}.
        </Typography>
      )}
      {item.status === 'ERROR' && item.lastErrorMessage && <Alert severity="error" variant="outlined" sx={{ mt: 1.5, py: 0 }}>{item.lastErrorMessage}</Alert>}
    </Card>
  );
}

export function IntegrationsTab({ filters, refreshKey }) {
  const query = useReport('integrations', filters, refreshKey, { role: false, device: false });
  return (
    <ReportState query={query}>
      {(data) => {
        const { meta, signIn } = data;
        const series = [
          { key: 'succeeded', label: 'Succeeded', color: '#0D9488' },
          { key: 'partial', label: 'Partly completed', color: '#eda100' },
          { key: 'failed', label: 'Failed', color: '#c2410c' },
        ];
        const daily = data.daily.map((row) => ({ ...row, label: formatDay(row.date), tip: formatDayLong(row.date) }));
        const anyRuns = data.daily.some((row) => row.succeeded + row.failed + row.partial > 0);
        return (
          <Stack spacing={2}>
            <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
              This shows what the connected services actually recorded: the outcome of each synchronisation and operation. It is separate from usage analytics, and it is not an uptime monitor: a service that nobody tried to reach shows no failures.
            </Alert>
            {data.integrations.length === 0 ? <Panel title="Integrations"><Typography variant="body2" color="text.secondary">No integrations are configured for your institution.</Typography></Panel> : (
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' } }}>
                {data.integrations.map((item) => <IntegrationCard key={item.id} item={item} timezone={meta.timezone} />)}
              </Box>
            )}
            <Grid2 ratio="3fr 2fr">
              <Panel title="Synchronisation outcomes per day" subtitle={formatRange(meta.from, meta.to)} info="Every logged synchronisation attempt across all integrations, by outcome."
                action={<MuiButton size="small" component={RouterLink} to="/admin/integrations">Manage integrations</MuiButton>}
                table={<ChartTable columns={[{ key: 'tip', label: 'Day' }, { key: 'succeeded', label: 'Succeeded' }, { key: 'partial', label: 'Partly completed' }, { key: 'failed', label: 'Failed' }]} rows={daily.filter((row) => row.succeeded + row.failed + row.partial > 0)} />}>
                {anyRuns ? <StackedBars data={daily} series={series} height={200} ariaLabel="Synchronisation outcomes per day" /> : <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No synchronisation was attempted in this period.</Typography>}
              </Panel>
              <Panel title="University sign-in" info="From the audit trail: sign-ins completed through your institution's sign-in provider, and attempts the portal refused (for example no matching record, or an unverified email). Not a probe of the provider itself.">
                {signIn.providers.length === 0 ? <Typography variant="body2" color="text.secondary">No university sign-in provider is configured.</Typography> : (
                  <Stack spacing={2}>
                    <Stack spacing={0.75}>
                      {signIn.providers.map((provider) => (
                        <Stack key={provider.id} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Typography variant="body2" fontWeight={600} noWrap>{provider.displayName}</Typography>
                          <Badge variant={provider.enabled ? 'success' : 'neutral'} dot>{provider.enabled ? 'Enabled' : 'Disabled'}</Badge>
                        </Stack>
                      ))}
                    </Stack>
                    <FactGrid min={120}>
                      <Fact label="Sign-ins">{formatNumber(signIn.signIns)}</Fact>
                      <Fact label="Refused" info="Attempts the portal refused, with the reason recorded in the audit trail.">{formatNumber(signIn.refused)}{signIn.refusalRate != null ? ` (${formatPercent(signIn.refusalRate)})` : ''}</Fact>
                      <Fact label="Last sign-in">{signIn.lastSignInAt ? formatAgo(signIn.lastSignInAt) : 'None in period'}</Fact>
                      <Fact label="Sessions open now">{formatNumber(signIn.activeSessions)}</Fact>
                    </FactGrid>
                    <MuiButton size="small" component={RouterLink} to="/admin/sign-in" sx={{ alignSelf: 'flex-start', ml: -0.75 }}>Sign-in &amp; role mapping</MuiButton>
                  </Stack>
                )}
              </Panel>
            </Grid2>
            <Typography variant="caption" color="text.secondary">Not monitored, so not shown: {data.notMonitored.join('; ')}.</Typography>
          </Stack>
        );
      }}
    </ReportState>
  );
}

export default IntegrationsTab;
