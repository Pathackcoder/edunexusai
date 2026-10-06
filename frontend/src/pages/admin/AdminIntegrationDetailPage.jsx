import React, { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import TimelapseRoundedIcon from '@mui/icons-material/TimelapseRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { InfoField } from '../../components/common/Section';
import { useToast } from '../../components/common/Toast';
import { DataState } from '../../components/common/DataState';
import { IntegrationStatusBadge } from '../../components/admin/IntegrationStatusBadge';

const DOMAINS = ['COURSES', 'ENROLLMENTS', 'ASSIGNMENTS', 'GRADES', 'FINANCIAL_AID', 'SCHEDULE', 'STUDENTS'];
const AUTH_TYPES = ['NONE', 'API_KEY', 'BEARER_TOKEN', 'OAUTH2_CLIENT_CREDENTIALS', 'BASIC'];
const MODES = ['MOCK', 'LIVE', 'DISABLED'];

/**
 * One integration: its configuration, its current health reading, and the log of every
 * sync attempt. The log is what makes "we know when an integration failed" true rather
 * than aspirational.
 */
export const AdminIntegrationDetailPage = () => {
  const { integrationId } = useParams();
  const { showToast } = useToast();

  const { data, loading, error, refetch } = useApiQuery(
    () => adminApi.getIntegration(integrationId),
    [integrationId],
  );
  const { data: logs, refetch: refetchLogs } = useApiQuery(
    () => adminApi.getIntegrationLogs(integrationId, 25),
    [integrationId],
  );

  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  // Start editing from the server's current values.
  const form = edit ?? {
    displayName: data?.displayName ?? '',
    description: data?.description ?? '',
    mode: data?.mode ?? 'MOCK',
    baseUrl: data?.baseUrl ?? '',
    apiVersion: data?.apiVersion ?? '',
    authType: data?.authType ?? 'NONE',
    credentialRef: data?.credentialRef ?? '',
    timeoutMs: data?.timeoutMs ?? 8000,
    enabled: data?.enabled ?? false,
    supportedDomains: data?.supportedDomains ?? [],
  };
  const update = (patch) => setEdit({ ...form, ...patch });

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await adminApi.updateIntegration(integrationId, {
        ...form,
        baseUrl: form.baseUrl || undefined,
        credentialRef: form.credentialRef || undefined,
        description: form.description || undefined,
      });
      showToast('Integration configuration saved.');
      setEdit(null);
      refetch();
    } catch (caught) {
      setFormError(caught);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const result = await adminApi.testIntegration(integrationId);
      showToast(`Connected in ${result.responseTimeMs} ms · ${result.recordCount} records visible.`);
    } catch (caught) {
      showToast(caught?.message ?? 'The connection test failed.');
    } finally {
      setBusy(false);
      refetch();
      refetchLogs();
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const result = await adminApi.syncIntegration(integrationId);
      showToast(`Synced ${result.totalRecords} records from the provider.`);
    } catch (caught) {
      showToast(caught?.message ?? 'The sync failed.');
    } finally {
      setBusy(false);
      refetch();
      refetchLogs();
    }
  };

  const fieldErrors = formError?.fieldErrors ?? {};
  const health = data?.health ?? {};

  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading integration…" minHeight={360}>
      {() => (
        <Box>
          <MuiButton
            component={RouterLink}
            to="/admin/integrations"
            size="small"
            startIcon={<ArrowBackRoundedIcon />}
            sx={{ color: 'primary.main', mb: 1.5, ml: -1 }}
          >
            Back to integrations
          </MuiButton>

          <PageHeader
            title={data?.displayName}
            description={
              <>
                {data?.provider} ·{' '}
                <Box component="code" sx={{ px: 0.75, py: 0.25, borderRadius: 1.5, bgcolor: 'grey.100', fontSize: '0.8125rem', color: 'text.primary' }}>
                  {data?.key}
                </Box>
              </>
            }
            actions={
              <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1}>
                <IntegrationStatusBadge status={data?.status} enabled={data?.enabled} />
                <Button variant="secondary" size="sm" icon={BoltRoundedIcon} loading={busy} onClick={handleTest}>
                  Test connection
                </Button>
                {data?.supportedDomains?.length > 0 && (
                  <Button variant="outline" size="sm" icon={SyncRoundedIcon} loading={busy} onClick={handleSync}>
                    Sync now
                  </Button>
                )}
              </Stack>
            }
          />

          <Stack spacing={{ xs: 2.5, md: 3 }}>
            {/* Health */}
            <WidgetCard title="Health" icon={MonitorHeartOutlinedIcon} tone="success">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' }, gap: 2.5 }}>
                {[
                  ['Status', data?.status ?? '—'],
                  ['Last successful sync', health.lastSuccessfulSyncAt ? new Date(health.lastSuccessfulSyncAt).toLocaleString() : 'Never'],
                  ['Last attempt', health.lastAttemptAt ? new Date(health.lastAttemptAt).toLocaleString() : 'Never'],
                  ['Records last seen', health.lastRecordCount ?? '—'],
                  ['Response time', health.lastResponseTimeMs != null ? `${health.lastResponseTimeMs} ms` : '—'],
                  ['Credential', `${data?.credentialRef ?? 'none'} (${data?.credentialConfigured ? 'resolved' : 'not set'})`],
                ].map(([label, value]) => (
                  <InfoField key={label} label={label} valueSx={{ fontSize: '0.875rem' }}>{value}</InfoField>
                ))}
              </Box>
              {health.lastErrorMessage && (
                <Alert severity="error" icon={<WarningAmberRoundedIcon fontSize="inherit" />} sx={{ mt: 2 }}>
                  {health.lastErrorMessage}
                </Alert>
              )}
            </WidgetCard>

            {/* Configuration */}
            <WidgetCard title="Configuration" icon={TuneRoundedIcon}>
              <Box component="form" onSubmit={handleSave}>
                <Stack spacing={2.25}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                    <TextField id="d-name" label="Display name" value={form.displayName} onChange={(e) => update({ displayName: e.target.value })} />
                    <TextField id="d-mode" select label="Mode" value={form.mode} onChange={(e) => update({ mode: e.target.value })} SelectProps={{ native: true }}>
                      {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </TextField>
                    <TextField id="d-version" label="API version" value={form.apiVersion} onChange={(e) => update({ apiVersion: e.target.value })} />
                  </Box>

                  <TextField
                    id="d-url"
                    label="Base URL"
                    value={form.baseUrl}
                    onChange={(e) => update({ baseUrl: e.target.value })}
                    error={Boolean(fieldErrors.baseUrl)}
                    helperText={fieldErrors.baseUrl}
                  />

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'start' }}>
                    <TextField id="d-auth" select label="Auth type" value={form.authType} onChange={(e) => update({ authType: e.target.value })} SelectProps={{ native: true }}>
                      {AUTH_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </TextField>
                    <TextField
                      id="d-cred"
                      label="Credential reference"
                      value={form.credentialRef}
                      onChange={(e) => update({ credentialRef: e.target.value.toUpperCase() })}
                      error={Boolean(fieldErrors.credentialRef)}
                      helperText={fieldErrors.credentialRef || 'Environment variable name only.'}
                    />
                    <TextField
                      id="d-timeout"
                      type="number"
                      label="Timeout (ms)"
                      inputProps={{ min: 500, max: 60000 }}
                      value={form.timeoutMs}
                      onChange={(e) => update({ timeoutMs: Number(e.target.value) })}
                    />
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Data domains served</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' }, columnGap: 1 }}>
                      {DOMAINS.map((domain) => (
                        <FormControlLabel
                          key={domain}
                          label={domain}
                          control={
                            <Checkbox
                              checked={form.supportedDomains.includes(domain)}
                              onChange={(e) =>
                                update({
                                  supportedDomains: e.target.checked
                                    ? [...form.supportedDomains, domain]
                                    : form.supportedDomains.filter((d) => d !== domain),
                                })
                              }
                            />
                          }
                          sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem', fontWeight: 500 } }}
                        />
                      ))}
                    </Box>
                  </Box>

                  <FormControlLabel
                    label="Enabled"
                    control={<Switch checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} />}
                    sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem', fontWeight: 500 } }}
                  />

                  {formError && !Object.keys(fieldErrors).length && (
                    <Alert severity="error">{formError.message}</Alert>
                  )}

                  <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                    {edit && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEdit(null)}>Discard changes</Button>
                    )}
                    <Button type="submit" variant="primary" size="sm" icon={SaveOutlinedIcon} loading={saving} disabled={!edit}>
                      Save configuration
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </WidgetCard>

            {/* Sync logs */}
            <WidgetCard title="Sync Log" icon={ReceiptLongOutlinedIcon} tone="neutral" disablePadding>
              <TableContainer sx={{ borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
                <Table sx={{ minWidth: 860 }}>
                  <TableHead>
                    <TableRow>
                      {['', 'Operation', 'Status', 'Records', 'Duration', 'Started', 'Triggered by', 'Error'].map((heading, index) => (
                        <TableCell key={index} sx={index === 0 ? { width: 40, pr: 0 } : undefined}>{heading}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(logs ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
                          No sync attempts recorded yet. Use “Test connection” or “Sync now”.
                        </TableCell>
                      </TableRow>
                    )}
                    {(logs ?? []).map((log) => {
                      const Icon = log.status === 'SUCCESS' ? CheckCircleRoundedIcon : log.status === 'RUNNING' ? TimelapseRoundedIcon : WarningAmberRoundedIcon;
                      const colour = log.status === 'SUCCESS' ? 'success.main' : log.status === 'RUNNING' ? 'text.secondary' : 'error.main';
                      return (
                        <TableRow key={log.id} hover>
                          <TableCell sx={{ pr: 0 }}><Icon sx={{ fontSize: 18, color: colour, display: 'block' }} /></TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{log.operation}</TableCell>
                          <TableCell>
                            <Badge variant={log.status === 'SUCCESS' ? 'success' : log.status === 'RUNNING' ? 'neutral' : 'danger'}>
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{log.recordsProcessed}</TableCell>
                          <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{log.durationMs != null ? `${log.durationMs} ms` : '—'}</TableCell>
                          <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            {new Date(log.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{log.triggeredBy}</TableCell>
                          <TableCell sx={{ color: log.errorMessage ? 'error.main' : 'text.secondary', maxWidth: 240 }}>{log.errorMessage ?? '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </WidgetCard>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default AdminIntegrationDetailPage;
