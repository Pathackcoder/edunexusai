import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';

const TARGETS = [
  { key: 'STUDENT', label: 'Student', note: 'granted only with the verified student record' },
  { key: 'FACULTY', label: 'Faculty', note: 'granted only with the verified faculty record' },
  { key: 'STAFF', label: 'Staff', note: 'granted only with a staff record, or under the staff policy below' },
  { key: 'ALUMNI', label: 'Alumni', note: 'granted on the institution’s assertion' },
];
const label = (key) => TARGETS.find((t) => t.key === key)?.label ?? key;
const errorText = (caught, fallback) => caught?.details?.fieldErrors ? Object.values(caught.details.fieldErrors).join(' ') : caught?.message ?? fallback;
const EMPTY = { key: '', displayName: '', issuer: '', clientId: '', clientSecretEnv: '', scopes: 'openid email profile', studentIdClaim: 'student_number', employeeIdClaim: 'employee_number', allowInsecureHttp: false };

function ProviderDialog({ provider, onClose, onSaved }) {
  const [form, setForm] = useState(provider ? { ...EMPTY, ...provider, clientSecretEnv: provider.clientSecretEnv ?? '' } : EMPTY);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setError(null);
    const body = { displayName: form.displayName, issuer: form.issuer, clientId: form.clientId, clientSecretEnv: form.clientSecretEnv || null, scopes: form.scopes, studentIdClaim: form.studentIdClaim || null, employeeIdClaim: form.employeeIdClaim || null, allowInsecureHttp: form.allowInsecureHttp };
    try {
      if (provider) await adminApi.updateIdentityProvider(provider.id, body);
      else await adminApi.createIdentityProvider({ ...body, key: form.key });
      onSaved();
    } catch (caught) {
      setError(errorText(caught, 'The sign-in option could not be saved.'));
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={provider ? `Edit ${provider.displayName}` : 'Add a sign-in option'} subtitle="An OpenID Connect provider: Keycloak, or the university's own." footer={<Stack direction="row" spacing={1} justifyContent="flex-end"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></Stack>}>
      <Stack spacing={1.75}>
        {!provider && <TextField size="small" label="Key (used in sign-in links)" value={form.key} onChange={set('key')} helperText="Lowercase letters, digits and dashes, e.g. feddrick-sso. Cannot be changed later." />}
        <TextField size="small" label="Button name" value={form.displayName} onChange={set('displayName')} helperText={'Shown as "Sign in with …"'} />
        <TextField size="small" label="Issuer URL" value={form.issuer} onChange={set('issuer')} helperText="e.g. https://sso.feddrick.edu/realms/feddrick" />
        <TextField size="small" label="Client id" value={form.clientId} onChange={set('clientId')} />
        <TextField size="small" label="Server variable holding the client secret" value={form.clientSecretEnv} onChange={set('clientSecretEnv')} helperText="The secret itself never goes here. Set it on the server as OIDC_CLIENT_SECRET_<NAME> and enter that name." />
        <TextField size="small" label="Student number claim" value={form.studentIdClaim ?? ''} onChange={set('studentIdClaim')} />
        <TextField size="small" label="Employee number claim" value={form.employeeIdClaim ?? ''} onChange={set('employeeIdClaim')} />
        <FormControlLabel control={<Switch checked={Boolean(form.allowInsecureHttp)} onChange={set('allowInsecureHttp')} />} label="Development provider over plain http (refused in production)" />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </Stack>
    </Modal>
  );
}

function MappingRules({ provider }) {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.listMappings(provider.id), [provider.id]);
  const [draft, setDraft] = useState({ claim: 'realm_access.roles', externalValue: '', targetRole: 'STUDENT' });
  const [claimsText, setClaimsText] = useState('{\n  "realm_access": { "roles": ["learner", "employee"] }\n}');
  const [preview, setPreview] = useState(null);
  const act = async (fn, message) => {
    try { await fn(); showToast(message); refetch(); } catch (caught) { showToast(errorText(caught, 'The rule could not be saved.')); }
  };
  const runPreview = async () => {
    try { setPreview(await adminApi.previewMapping(provider.id, JSON.parse(claimsText))); } catch (caught) { setPreview({ error: caught instanceof SyntaxError ? 'The sample is not valid JSON.' : errorText(caught, 'Preview failed.') }); }
  };
  return (
    <Stack spacing={1.5}>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={false}>
        {() => (
          <TableContainer>
            <Table size="small" aria-label={`${provider.displayName} role mapping rules`}>
              <TableHead><TableRow><TableCell>Claim</TableCell><TableCell>Value from the university</TableCell><TableCell>EdunexusAI role</TableCell><TableCell>Active</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {(data ?? []).map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{rule.claim}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{rule.externalValue}</TableCell>
                    <TableCell><Badge variant="primary">{label(rule.targetRole)}</Badge></TableCell>
                    <TableCell><Switch size="small" checked={rule.enabled} onChange={(e) => act(() => adminApi.updateMapping(provider.id, rule.id, { enabled: e.target.checked }), e.target.checked ? 'Rule enabled.' : 'Rule disabled.')} inputProps={{ 'aria-label': `Rule ${rule.externalValue} active` }} /></TableCell>
                    <TableCell align="right"><Button variant="ghost" size="sm" sx={{ color: 'error.main' }} onClick={() => act(() => adminApi.deleteMapping(provider.id, rule.id), 'Rule removed.')}>Remove</Button></TableCell>
                  </TableRow>
                ))}
                {!(data ?? []).length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No rules yet: this sign-in gives no community roles; accounts keep only the roles assigned in the portal.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'flex-start' }}>
        <TextField size="small" label="Claim" value={draft.claim} onChange={(e) => setDraft((d) => ({ ...d, claim: e.target.value }))} sx={{ minWidth: 190 }} />
        <TextField size="small" label="Value" value={draft.externalValue} onChange={(e) => setDraft((d) => ({ ...d, externalValue: e.target.value }))} sx={{ minWidth: 160 }} />
        <TextField size="small" select label="Gives" value={draft.targetRole} onChange={(e) => setDraft((d) => ({ ...d, targetRole: e.target.value }))} SelectProps={{ native: true }} sx={{ minWidth: 130 }} helperText={TARGETS.find((t) => t.key === draft.targetRole)?.note}>
          {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </TextField>
        <Button size="sm" variant="secondary" icon={AddRoundedIcon} disabled={!draft.externalValue.trim()} onClick={() => act(() => adminApi.createMapping(provider.id, draft), 'Rule added.').then(() => setDraft((d) => ({ ...d, externalValue: '' })))}>Add rule</Button>
      </Stack>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Try it</Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>Paste sample claims from this provider to see which roles the rules would give. Nothing is saved; records are still checked at real sign-in.</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField multiline minRows={4} value={claimsText} onChange={(e) => setClaimsText(e.target.value)} sx={{ flex: 1, '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }} inputProps={{ 'aria-label': 'Sample claims (JSON)' }} />
          <Stack spacing={1} sx={{ flex: 1 }}>
            <Box><Button size="sm" variant="secondary" onClick={runPreview}>Preview</Button></Box>
            {preview?.error && <Alert severity="error">{preview.error}</Alert>}
            {preview && !preview.error && (
              <Box>
                <Typography variant="body2">Would map to: {Object.keys(preview.mapped).map(label).join(', ') || 'no role'}</Typography>
                {preview.unknown.length > 0 && <Typography variant="body2" color="text.secondary">Unmapped (grant nothing): {preview.unknown.join(', ')}</Typography>}
                <Typography variant="caption" color="text.secondary">{preview.note}</Typography>
              </Box>
            )}
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}

/**
 * Institutional sign-in and role mapping. Each university uses its own role names; the rules here
 * translate them into EdunexusAI community roles, as evidence that is honoured only with the
 * person's verified record. Administrative roles are never granted by a sign-in (Users & Roles), and
 * which widgets a role sees is Widget Entitlements.
 */
export const AdminSignInPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.listIdentityProviders());
  const [editing, setEditing] = useState(null); // provider or {} for new
  const [tests, setTests] = useState({});

  const toggle = async (provider, patch, message) => {
    try { await adminApi.updateIdentityProvider(provider.id, patch); showToast(message); refetch(); } catch (caught) { showToast(errorText(caught, 'The change could not be saved.')); }
  };
  const test = async (provider) => {
    setTests((t) => ({ ...t, [provider.id]: { running: true } }));
    try {
      const result = await adminApi.testIdentityProvider(provider.id);
      setTests((t) => ({ ...t, [provider.id]: result }));
    } catch (caught) {
      setTests((t) => ({ ...t, [provider.id]: { ok: false, error: caught.message } }));
    }
  };

  return (
    <Box>
      <PageHeader
        title="Sign-in & role mapping"
        description="Your university's sign-in options, and how the roles it sends become EdunexusAI community roles."
        actions={<Button variant="primary" size="sm" icon={AddRoundedIcon} onClick={() => setEditing({})}>Add sign-in option</Button>}
      />
      <Stack spacing={2.5}>
        <Alert severity="info">
          A university sign-in only proves who the person is and suggests community roles. Student and Faculty are granted only with the person&apos;s verified CampusCore record; administrator access is never granted by a sign-in (assign it in Users &amp; Roles); which widgets each role sees is set in Widget Entitlements.
        </Alert>
        <DataState loading={loading} error={error} onRetry={refetch} isEmpty={(data ?? []).length === 0} emptyTitle="No sign-in options yet" emptyMessage="People sign in with their portal password until you add your university's identity provider.">
          {() => (data ?? []).map((provider) => (
            <Card key={provider.id} sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="h6" component="h2">{provider.displayName}</Typography>
                    <Badge variant={provider.enabled ? 'success' : 'neutral'} dot>{provider.enabled ? 'On the sign-in page' : 'Off'}</Badge>
                    <Badge variant={provider.secretConfigured ? 'success' : 'warning'}>{provider.secretConfigured ? 'Client secret set on the server' : 'Client secret missing on the server'}</Badge>
                    {provider.allowInsecureHttp && <Badge variant="warning">Development (http)</Badge>}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: 'break-all' }}>{provider.issuer} · client {provider.clientId} · key {provider.key}</Typography>
                  <Typography variant="caption" color="text.secondary">Institutional IDs from claims: student <code>{provider.studentIdClaim ?? '—'}</code>, employee <code>{provider.employeeIdClaim ?? '—'}</code>. Secret variable: <code>{provider.clientSecretEnv ?? 'none'}</code></Typography>
                  <FormControlLabel sx={{ display: 'flex', mt: 0.5 }} control={<Switch size="small" checked={provider.employeeIdEstablishesStaff} onChange={(e) => toggle(provider, { employeeIdEstablishesStaff: e.target.checked }, 'Staff policy updated.')} />} label={<Typography variant="body2">Staff policy: the employee number from this sign-in establishes a staff record</Typography>} />
                  <FormControlLabel sx={{ display: 'flex' }} control={<Switch size="small" checked={Boolean(provider.jitProvisioning)} onChange={(e) => toggle(provider, { jitProvisioning: e.target.checked }, e.target.checked ? 'Accounts are now created at first sign-in.' : 'Accounts are no longer created at first sign-in.')} />} label={<Typography variant="body2">Create portal accounts at first sign-in, from the person's CampusCore record (needs CampusCore <code>people:read</code>)</Typography>} />
                </Box>
                <Stack direction="row" spacing={1} alignItems="flex-start" flexShrink={0}>
                  <Button size="sm" variant="secondary" onClick={() => test(provider)}>Test connection</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(provider)}>Edit</Button>
                  <Button size="sm" variant={provider.enabled ? 'ghost' : 'primary'} onClick={() => toggle(provider, { enabled: !provider.enabled }, provider.enabled ? 'Removed from the sign-in page.' : 'Shown on the sign-in page.')}>{provider.enabled ? 'Turn off' : 'Turn on'}</Button>
                </Stack>
              </Stack>
              {tests[provider.id] && !tests[provider.id].running && (
                <Alert severity={tests[provider.id].ok ? 'success' : 'error'} sx={{ mt: 1.5 }}>
                  {tests[provider.id].ok ? `Reachable. Sign-in ${tests[provider.id].authorization ? '✓' : '✗'} · token ${tests[provider.id].token ? '✓' : '✗'} · sign-out ${tests[provider.id].endSession ? '✓' : '✗'} · PKCE S256 ${tests[provider.id].pkceS256 ? '✓' : '✗'}` : tests[provider.id].error}
                </Alert>
              )}
              <Typography variant="subtitle1" component="h3" sx={{ mt: 2.5, mb: 1 }}>Role mapping rules</Typography>
              <MappingRules provider={provider} />
            </Card>
          ))}
        </DataState>
      </Stack>
      {editing && <ProviderDialog provider={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); showToast('Sign-in option saved.'); refetch(); }} />}
    </Box>
  );
};

export default AdminSignInPage;
