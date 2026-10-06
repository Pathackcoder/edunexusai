import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import ReportGmailerrorredRoundedIcon from '@mui/icons-material/ReportGmailerrorredRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { IconTile } from '../../components/common/IconTile';
import { PageHeader } from '../../components/common/PageHeader';
import { MetricLabel } from '../../components/common/Section';
import { useToast } from '../../components/common/Toast';
import { DataState } from '../../components/common/DataState';
import { IntegrationStatusBadge } from '../../components/admin/IntegrationStatusBadge';

const DOMAINS = ['COURSES', 'ENROLLMENTS', 'ASSIGNMENTS', 'GRADES', 'FINANCIAL_AID', 'SCHEDULE', 'STUDENTS'];
const AUTH_TYPES = ['NONE', 'API_KEY', 'BEARER_TOKEN', 'OAUTH2_CLIENT_CREDENTIALS', 'BASIC'];
const MODES = ['MOCK', 'LIVE', 'DISABLED'];

const ConfigItem = ({ label, children, sx }) => (
  <Box sx={{ minWidth: 0, ...sx }}>
    <MetricLabel sx={{ fontSize: '0.625rem' }}>{label}</MetricLabel>
    <Box sx={{ typography: 'body2', fontSize: '0.8125rem', fontWeight: 500, mt: 0.25, wordBreak: 'break-all' }}>{children}</Box>
  </Box>
);

/**
 * Integration registry.
 *
 * Secrets never appear here. Each integration stores the NAME of a backend environment
 * variable in `credentialRef`, and the API reports only whether that variable currently
 * resolves. A browser bundle therefore never holds a Canvas token or a Banner key.
 */
export const AdminIntegrationsPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.listIntegrations());
  const { data: providers } = useApiQuery(() => adminApi.listProviders());
  const integrations = data ?? [];

  const [busyId, setBusyId] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({
    key: '',
    provider: 'CANVAS',
    displayName: '',
    description: '',
    mode: 'MOCK',
    baseUrl: '',
    apiVersion: 'v1',
    authType: 'BEARER_TOKEN',
    credentialRef: '',
    timeoutMs: 8000,
    enabled: false,
    supportedDomains: [],
  });

  const handleTest = async (integration) => {
    setBusyId(integration.id);
    try {
      const result = await adminApi.testIntegration(integration.id);
      showToast(
        `${integration.displayName}: connected in ${result.responseTimeMs} ms, ${result.recordCount} records visible.`,
      );
    } catch (caught) {
      // A configuration-only provider answers 409; that is an expected outcome, not a crash.
      showToast(caught?.message ?? 'The connection test failed.');
    } finally {
      setBusyId(null);
      refetch();
    }
  };

  const handleSync = async (integration) => {
    setBusyId(integration.id);
    try {
      const result = await adminApi.syncIntegration(integration.id);
      showToast(
        `Sync complete: ${result.courses} courses, ${result.enrollments} enrollments, ${result.assignments} assignments.`,
      );
    } catch (caught) {
      showToast(caught?.message ?? 'The sync failed.');
    } finally {
      setBusyId(null);
      refetch();
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await adminApi.createIntegration({
        ...form,
        baseUrl: form.baseUrl || undefined,
        credentialRef: form.credentialRef || undefined,
        description: form.description || undefined,
      });
      showToast(`${form.displayName} registered.`);
      setIsCreateOpen(false);
      refetch();
    } catch (caught) {
      setFormError(caught);
    } finally {
      setSaving(false);
    }
  };

  const fieldErrors = formError?.fieldErrors ?? {};

  return (
    <Box>
      <PageHeader
        title="Integrations"
        description="External institutional systems this portal reads from. Credentials live in the backend environment; only their variable names are stored and shown here."
        actions={
          <Button variant="primary" size="sm" icon={AddRoundedIcon} onClick={() => setIsCreateOpen(true)}>
            Register integration
          </Button>
        }
      />

      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading integrations…" minHeight={320}>
        {() => (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2.5 }}>
            {integrations.map((integration) => (
              <Card key={integration.id} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                    <IconTile icon={HubOutlinedIcon} tone="primary" size={40} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" component="h3">{integration.displayName}</Typography>
                      <Typography variant="caption">
                        {integration.provider} · <Box component="code" sx={{ fontSize: '0.75rem' }}>{integration.key}</Box>
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack alignItems="flex-end" spacing={0.75} sx={{ flexShrink: 0 }}>
                    <IntegrationStatusBadge status={integration.status} enabled={integration.enabled} />
                    <Badge variant="neutral">{integration.mode}</Badge>
                  </Stack>
                </Stack>

                {integration.description && (
                  <Typography variant="body2" color="text.secondary">{integration.description}</Typography>
                )}

                <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, m: 0, p: 1.75, borderRadius: 3, bgcolor: 'background.subtle', border: 1, borderColor: 'divider' }}>
                  <ConfigItem label="Base URL">{integration.baseUrl || 'Not set'}</ConfigItem>
                  <ConfigItem label="API version">{integration.apiVersion || '—'}</ConfigItem>
                  <ConfigItem label="Auth type">{integration.authType}</ConfigItem>
                  <ConfigItem label="Timeout">{integration.timeoutMs} ms</ConfigItem>
                  <ConfigItem label="Credential reference" sx={{ gridColumn: '1 / -1' }}>
                    <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={0.75}>
                      <KeyRoundedIcon sx={{ fontSize: 14, color: 'grey.500' }} aria-hidden="true" />
                      <Box component="code" sx={{ fontSize: '0.8125rem' }}>{integration.credentialRef ?? 'none'}</Box>
                      <Badge variant={integration.credentialConfigured ? 'success' : 'warning'}>
                        {integration.credentialConfigured ? 'Resolved' : 'Not set'}
                      </Badge>
                    </Stack>
                  </ConfigItem>
                </Box>

                {integration.supportedDomains?.length > 0 ? (
                  <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
                    {integration.supportedDomains.map((domain) => (
                      <Badge key={domain} variant="primary">{domain}</Badge>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="caption">Serves no data domain (registered for configuration only).</Typography>
                )}

                {integration.health?.lastErrorMessage && (
                  <Alert severity="error" icon={<ReportGmailerrorredRoundedIcon fontSize="inherit" />} sx={{ py: 0, fontSize: '0.8125rem' }}>
                    {integration.health.lastErrorMessage}
                  </Alert>
                )}

                <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" spacing={1} sx={{ mt: 'auto', pt: 1.75, borderTop: 1, borderColor: 'divider' }}>
                  <Button variant="secondary" size="sm" icon={BoltRoundedIcon} loading={busyId === integration.id} onClick={() => handleTest(integration)}>
                    Test connection
                  </Button>
                  {integration.supportedDomains?.length > 0 && (
                    <Button variant="outline" size="sm" icon={SyncRoundedIcon} loading={busyId === integration.id} onClick={() => handleSync(integration)}>
                      Sync now
                    </Button>
                  )}
                  <MuiButton
                    component={RouterLink}
                    to={`/admin/integrations/${integration.id}`}
                    size="small"
                    endIcon={<ArrowForwardRoundedIcon />}
                    sx={{ ml: 'auto', color: 'primary.main' }}
                  >
                    Details & logs
                  </MuiButton>
                </Stack>
              </Card>
            ))}
          </Box>
        )}
      </DataState>

      {/* Register integration */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register an integration"
        subtitle="Configuration only — never paste a secret into this form"
        maxWidth="600px"
      >
        <Box component="form" onSubmit={handleCreate}>
          <Stack spacing={2.25}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                id="i-key"
                label="Key"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="canvas-prod"
                required
                error={Boolean(fieldErrors.key)}
                helperText={fieldErrors.key}
              />
              <TextField
                id="i-provider"
                select
                label="Provider"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
              >
                {(providers ?? []).map((provider) => (
                  <option key={provider.provider} value={provider.provider}>
                    {provider.label}{provider.implementsDataCalls ? '' : ' (configuration only)'}
                  </option>
                ))}
              </TextField>
            </Box>

            <TextField id="i-name" label="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />

            <TextField
              id="i-url"
              label="Base URL"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://canvas.example.edu"
              error={Boolean(fieldErrors.baseUrl)}
              helperText={fieldErrors.baseUrl}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
              <TextField id="i-mode" select label="Mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} SelectProps={{ native: true }}>
                {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </TextField>
              <TextField id="i-auth" select label="Auth type" value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })} SelectProps={{ native: true }}>
                {AUTH_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </TextField>
              <TextField
                id="i-timeout"
                type="number"
                label="Timeout (ms)"
                value={form.timeoutMs}
                onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })}
                inputProps={{ min: 500, max: 60000 }}
              />
            </Box>

            <TextField
              id="i-cred"
              label="Credential reference"
              value={form.credentialRef}
              onChange={(e) => setForm({ ...form, credentialRef: e.target.value.toUpperCase() })}
              placeholder="CANVAS_API_TOKEN"
              error={Boolean(fieldErrors.credentialRef)}
              helperText={fieldErrors.credentialRef || 'The NAME of a backend environment variable, not the secret itself.'}
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Data domains served</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))' }, columnGap: 1 }}>
                {DOMAINS.map((domain) => (
                  <FormControlLabel
                    key={domain}
                    label={domain}
                    control={
                      <Checkbox
                        checked={form.supportedDomains.includes(domain)}
                        onChange={(e) =>
                          setForm({
                            ...form,
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
              control={<Switch checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
              sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem', fontWeight: 500 } }}
            />

            {formError && !Object.keys(fieldErrors).length && (
              <Alert severity="error">{formError.message}</Alert>
            )}

            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm" loading={saving}>Register</Button>
            </Stack>
          </Stack>
        </Box>
      </Modal>
    </Box>
  );
};

export default AdminIntegrationsPage;
