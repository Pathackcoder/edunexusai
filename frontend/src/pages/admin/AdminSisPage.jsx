import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Pagination from '@mui/material/Pagination';
import InputAdornment from '@mui/material/InputAdornment';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import MuiButton from '@mui/material/Button';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { sisAdminApi } from '../../services/api';
import { pretty } from '../../components/sis/sisData';

const errorText = (e) => {
  const fields = Array.isArray(e?.details?.sisDetails) ? e.details.sisDetails.map((d) => `${d.field ?? ''} ${d.message}`.trim()).join('; ') : '';
  return `${e?.message ?? 'Request failed.'}${fields ? ` (${fields})` : ''}${e?.details?.requestId ? ` · ref ${e.details.requestId}` : ''}`;
};

function useAction(onDone) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(null);
  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      const result = await fn();
      if (success) showToast(typeof success === 'function' ? success(result) : success);
      await onDone?.();
      return result;
    } catch (e) {
      showToast(errorText(e), 'error', 8000);
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

/* ------------------------------------------------------------------ overview */

function Overview() {
  const health = useApiQuery(() => sisAdminApi.health());
  const caps = useApiQuery(() => sisAdminApi.capabilities());
  const { busy, run } = useAction(async () => {
    await health.refetch();
    await caps.refetch();
  });
  const h = health.data;
  const ops = caps.data?.operations ?? [];
  const disabled = ops.filter((o) => !o.clientEnabled).map((o) => o.operation);
  const toggle = (op, enable) =>
    run(`pref-${op.operation}`, () => sisAdminApi.setWritePreferences({ disabledOperations: enable ? disabled.filter((x) => x !== op.operation) : [...disabled, op.operation] }), `${op.label}: ${enable ? 'allowed by EduNexusAI' : 'switched off by EduNexusAI'}.`);

  return (
    <Stack spacing={2}>
      <Card sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="h6" component="h2">Connection</Typography>
          <Button variant="secondary" size="sm" icon={BoltRoundedIcon} loading={health.loading} onClick={health.refetch}>Check now</Button>
        </Stack>
        <DataState loading={health.loading} error={health.error} onRetry={health.refetch} minHeight={80}>
          {() => (
            <Stack spacing={0.75} sx={{ typography: 'body2' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" color={h.ok ? 'success' : 'error'} label={pretty(h.state)} />
                {h.institution && <span>{h.institution.name} ({h.institution.slug}){h.institutionVerified ? ' · institution verified' : ''}</span>}
              </Stack>
              <span><b>Expected institution:</b> {h.expectedInstitution ?? '—'} · <b>EduNexusAI tenant:</b> {h.tenantKey ?? '—'}</span>
              <span><b>API:</b> {h.baseUrl ?? 'not set'} · <b>Client:</b> {h.clientId ?? '—'} · <b>Secret:</b> {h.clientSecretConfigured ? 'configured (hidden)' : 'not set'}</span>
              {h.tokenExpiresAt && <span><b>Current token expires:</b> {new Date(h.tokenExpiresAt).toLocaleTimeString()} (refreshed automatically)</span>}
              {h.scopes && <span><b>Granted scopes:</b> {h.scopes.join(', ')}</span>}
              {h.error && <Alert severity="error">{h.error.message}</Alert>}
              {h.problems?.map((p) => <Alert key={p} severity="warning">{p}</Alert>)}
            </Stack>
          )}
        </DataState>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Typography variant="h6" component="h2">Write capabilities</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          An operation runs only when CampusCore grants the scope, CampusCore&apos;s institutional policy allows it, and EduNexusAI&apos;s switch below is on. EduNexusAI can only switch operations off; it can never grant what CampusCore has not.
        </Typography>
        <DataState loading={caps.loading} error={caps.error} onRetry={caps.refetch} minHeight={80}>
          {() => (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Write capabilities">
                <TableHead>
                  <TableRow>
                    <TableCell>Operation</TableCell>
                    <TableCell>Scope</TableCell>
                    <TableCell>CampusCore policy</TableCell>
                    <TableCell>EduNexusAI</TableCell>
                    <TableCell>Effective</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ops.map((o) => (
                    <TableRow key={o.operation}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.label}</Typography>
                        {o.allowedFields && <Typography variant="caption">Fields: {o.allowedFields.join(', ') || 'none'}</Typography>}
                      </TableCell>
                      <TableCell><Chip size="small" variant="outlined" color={o.scopeGranted ? 'success' : 'default'} label={o.scope} /></TableCell>
                      <TableCell><Chip size="small" variant="outlined" color={o.policyEnabled ? 'success' : 'default'} label={o.policyEnabled ? 'On' : 'Off'} /></TableCell>
                      <TableCell>
                        <Switch size="small" checked={o.clientEnabled} disabled={busy === `pref-${o.operation}`} onChange={(e) => toggle(o, e.target.checked)} inputProps={{ 'aria-label': `EduNexusAI allows ${o.label}` }} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={o.effective ? 'success' : 'default'} label={o.effective ? 'Allowed' : 'Blocked'} />
                        {o.reason && <Typography variant="caption" component="div">{o.reason}</Typography>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataState>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------ portal accounts */

const newPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return `${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}!`;
};

/**
 * Create an EduNexusAI login for an existing CampusCore student or faculty member. The login
 * email is the record's institutional email and the account is linked to the record in the
 * same step; no academic data is copied. Refused if the record is already linked or the
 * email already has an account (then verify and link that account instead).
 */
function ProvisionDialog({ target, onClose, onDone }) {
  // target: { recordType, record: { sisId, displayName, institutionalId, email } }
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [created, setCreated] = useState(null);
  const { busy, run } = useAction(onDone);
  useEffect(() => {
    setPassword(target ? newPassword() : '');
    setConfirmed(false);
    setCreated(null);
  }, [target]);
  if (!target) return null;
  const { record, recordType } = target;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Create portal login"
      subtitle={`CampusCore ${recordType.toLowerCase()} ${record.displayName} · ${record.institutionalId}`}
      footer={
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="sm" variant="ghost" onClick={onClose}>{created ? 'Close' : 'Cancel'}</Button>
          {!created && (
            <Button
              size="sm"
              variant="primary"
              disabled={!confirmed || password.length < 8}
              loading={busy === 'provision'}
              onClick={async () => {
                const r = await run('provision', () => sisAdminApi.provisionAccount({ recordType, sisRecordId: record.sisId, password }), (x) => `Portal login created for ${x.user.email} and linked in CampusCore.`);
                if (r) setCreated(r);
              }}
            >
              Create and link
            </Button>
          )}
        </Stack>
      }
    >
      {created ? (
        <Stack spacing={1.5}>
          <Alert severity="success">
            <b>{created.user.email}</b> can now sign in to EduNexusAI. The account is linked to CampusCore {recordType.toLowerCase()} {created.sisRecord.institutionalId}, so their pages show their own live SIS record.
          </Alert>
          <TextField size="small" label="Initial password" value={password} InputProps={{ readOnly: true }} helperText={created.passwordStorage === 'plaintext' ? 'Development mode: passwords are stored as plain text (PASSWORD_STORAGE=plaintext).' : 'Stored as a bcrypt hash; share it with the person securely. It is not shown again.'} />
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Alert severity="info">
            Login email: <b>{record.email}</b> (the record&apos;s institutional email). No GPA, program, grades or registrations are copied; the portal reads them live from CampusCore.
          </Alert>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField size="small" label="Initial password" value={password} onChange={(e) => setPassword(e.target.value)} helperText="At least 8 characters." sx={{ flex: 1 }} />
            <MuiButton size="small" onClick={() => setPassword(newPassword())} sx={{ mt: 0.5 }}>Generate</MuiButton>
          </Stack>
          <FormControlLabel control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />} label="This person should have a portal login for this CampusCore record." />
        </Stack>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ students */

const CONTACT = [['preferredName', 'Preferred name'], ['phone', 'Phone'], ['personalEmail', 'Personal email'], ['addressLine', 'Address'], ['city', 'City'], ['region', 'Region'], ['postalCode', 'Postal code'], ['country', 'Country']];

function StudentDetail({ sisId, onChanged, onProvision }) {
  const detail = useApiQuery(() => sisAdminApi.student(sisId), [sisId]);
  const audit = useApiQuery(() => sisAdminApi.studentAudit(sisId), [sisId]);
  const { busy, run } = useAction(async () => {
    await detail.refetch();
    await audit.refetch();
    await onChanged?.();
  });
  const [form, setForm] = useState({});
  const [reason, setReason] = useState('');
  useEffect(() => setForm({}), [sisId]);
  return (
    <DataState loading={detail.loading} error={detail.error} onRetry={detail.refetch} minHeight={120}>
      {() => {
        const s = detail.data.student;
        const changes = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== undefined));
        return (
          <Stack spacing={2}>
            <Box sx={{ typography: 'body2' }}>
              <b>{s.displayName}</b> · {s.institutionalId} · {s.email}
              <br />
              {s.program?.name ?? 'No program'} · {pretty(s.level)} · {pretty(s.standing)} · status {pretty(s.enrollmentStatus)}
            </Box>
            <Alert severity={detail.data.mapping ? 'success' : 'info'}>
              {detail.data.mapping
                ? `Linked to EduNexusAI account ${detail.data.portalAccount?.user?.email ?? detail.data.mapping.externalUserId}.`
                : 'Not linked to any EduNexusAI account. Create a portal login for this student, or verify and link an existing account under Identity links.'}
            </Alert>
            {!detail.data.mapping && onProvision && ['active', 'prospective'].includes(s.enrollmentStatus) && (
              <Box>
                <Button size="sm" variant="secondary" onClick={() => onProvision({ recordType: 'STUDENT', record: { sisId, displayName: s.displayName, institutionalId: s.institutionalId, email: s.email } })}>
                  Create portal login
                </Button>
              </Box>
            )}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Edit fields CampusCore permits</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                {[['firstName', 'First name'], ['lastName', 'Last name'], ...CONTACT].map(([key, label]) => (
                  <TextField key={key} size="small" label={label} value={form[key] ?? ''} placeholder={key === 'firstName' ? s.givenName : key === 'lastName' ? s.familyName : key === 'phone' ? s.phone ?? '' : ''} onChange={(e) => setForm({ ...form, [key]: e.target.value === '' ? undefined : e.target.value })} />
                ))}
              </Box>
              <Button
                size="sm"
                variant="primary"
                sx={{ mt: 1.25 }}
                disabled={!Object.keys(changes).length}
                loading={busy === 'save'}
                onClick={async () => {
                  const r = await run('save', () => sisAdminApi.updateStudent(sisId, detail.data.etag, changes), (x) => `Saved in CampusCore: ${x.changedFields.join(', ') || 'no changes'}.`);
                  if (r) setForm({});
                }}
              >
                Save to CampusCore
              </Button>
              <Typography variant="caption" component="p">Unsaved changes stay in the form if CampusCore refuses them; its per-field reasons are shown.</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2">Deactivate (withdraw)</Typography>
              <Typography variant="caption" component="p" sx={{ mb: 1 }}>Sets the record to WITHDRAWN in CampusCore. Nothing is deleted: registrations, grades and history are kept.</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField size="small" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ flex: 1 }} />
                <Button size="sm" variant="secondary" disabled={reason.trim().length < 3 || s.enrollmentStatus === 'inactive'} loading={busy === 'deactivate'} onClick={() => window.confirm(`Withdraw ${s.displayName} in CampusCore?`) && run('deactivate', () => sisAdminApi.deactivateStudent(sisId, { reason, idempotencyKey: crypto.randomUUID() }), 'Student deactivated in CampusCore.')}>
                  Deactivate
                </Button>
              </Stack>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Audit history (CampusCore)</Typography>
              {audit.error ? <Alert severity="info">{audit.error.message}</Alert> : (audit.data?.data ?? []).slice(0, 10).map((a) => (
                <Typography key={a.id} variant="caption" component="div">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ''} · {a.action} {a.summary ? `· ${a.summary}` : ''}</Typography>
              ))}
            </Box>
          </Stack>
        );
      }}
    </DataState>
  );
}

function CreateStudent({ open, onClose, onCreated }) {
  const ref = useApiQuery(() => sisAdminApi.reference(), [open], { enabled: open });
  const [form, setForm] = useState({});
  // One idempotency key per opened form, reused for every retry of this submission.
  const [key, setKey] = useState(null);
  const { busy, run } = useAction(onCreated);
  useEffect(() => {
    if (open) {
      setForm({ status: 'ADMITTED' });
      setKey(crypto.randomUUID());
    }
  }, [open]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ready = form.firstName && form.lastName && form.email && form.programId;
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Create a student in CampusCore"
      subtitle="CampusCore assigns the student number. No EduNexusAI account is created."
      footer={
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!ready}
            loading={busy === 'create'}
            onClick={async () => {
              const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== undefined));
              const r = await run('create', () => sisAdminApi.createStudent(key, body), (x) => (x.replayed ? 'Already created (same submission); nothing duplicated.' : `Created ${x.student.institutionalId} in CampusCore.`));
              if (r) onClose();
            }}
          >
            Create in CampusCore
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        {ref.error && <Alert severity="error">{ref.error.message}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField size="small" label="First name" required value={form.firstName ?? ''} onChange={set('firstName')} fullWidth />
          <TextField size="small" label="Last name" required value={form.lastName ?? ''} onChange={set('lastName')} fullWidth />
        </Stack>
        <TextField size="small" label="Email" required value={form.email ?? ''} onChange={set('email')} />
        <TextField select size="small" label="Program" required value={form.programId ?? ''} onChange={set('programId')}>
          {(ref.data?.programs ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.code} · {p.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Admit term" value={form.admitTermId ?? ''} onChange={set('admitTermId')}>
          <MenuItem value="">Not specified</MenuItem>
          {(ref.data?.terms ?? []).map((t) => <MenuItem key={t.source.id} value={t.source.id}>{t.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Status" value={form.status ?? 'ADMITTED'} onChange={set('status')}>
          <MenuItem value="ADMITTED">Admitted</MenuItem>
          <MenuItem value="ACTIVE">Active</MenuItem>
        </TextField>
      </Stack>
    </Modal>
  );
}

function Students() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useApiQuery(() => sisAdminApi.students({ search: search || undefined, page, pageSize: 20 }), [search, page]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [provisioning, setProvisioning] = useState(null);
  // Show up front whether CampusCore lets this connection create students (scope ∧ policy ∧
  // preference), instead of letting the form fail after submit.
  const caps = useApiQuery(() => sisAdminApi.capabilities());
  const createCap = caps.data?.operations?.find((o) => o.operation === 'student.create');
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        To onboard a person end to end (CampusCore record, EduNexusAI login and Moodle account together), use Users &amp; Roles → Add user. This page manages the CampusCore side only.
      </Alert>
      {createCap && !createCap.effective && (
        <Alert severity="warning">Creating students from EduNexusAI is not available: {createCap.reason} New students are created in CampusCore by the registrar, then get a portal login here or under Users &amp; Roles.</Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
        <TextField
          size="small"
          placeholder="Search name, email or student number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setSearch(input.trim()); } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
          inputProps={{ 'aria-label': 'Search CampusCore students' }}
          sx={{ maxWidth: 420, flex: 1 }}
        />
        <Button size="sm" variant="primary" icon={AddRoundedIcon} onClick={() => setCreating(true)} disabled={!createCap?.effective}>Create student</Button>
      </Stack>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.items?.length} emptyTitle="No students" emptyMessage="No CampusCore students match.">
        {() => (
          <>
            <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="CampusCore students">
                <TableHead>
                  <TableRow>
                    <TableCell>Student</TableCell>
                    <TableCell>Program</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>EduNexusAI account</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items.map((s) => (
                    <TableRow key={s.source.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2">{s.displayName}</Typography>
                        <Typography variant="caption">{s.institutionalId} · {s.email}</Typography>
                      </TableCell>
                      <TableCell>{s.program?.code ?? '—'}</TableCell>
                      <TableCell>{pretty(s.enrollmentStatus)} · {pretty(s.level)}</TableCell>
                      <TableCell>{s.portalAccount ? <Chip size="small" color="success" variant="outlined" label={s.portalAccount.user?.email ?? 'Linked'} /> : <Chip size="small" variant="outlined" label="Unmapped" />}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {!s.portalAccount && ['active', 'prospective'].includes(s.enrollmentStatus) && (
                          <MuiButton size="small" onClick={() => setProvisioning({ recordType: 'STUDENT', record: { sisId: s.source.id, displayName: s.displayName, institutionalId: s.institutionalId, email: s.email } })}>Create login</MuiButton>
                        )}
                        <MuiButton size="small" onClick={() => setSelected(s)}>Open</MuiButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption">{data.total} student(s) in CampusCore</Typography>
            {data.totalPages > 1 && <Pagination page={page} count={data.totalPages} onChange={(_e, p) => setPage(p)} sx={{ alignSelf: 'center' }} />}
          </>
        )}
      </DataState>
      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.displayName ?? ''} subtitle="CampusCore student record" maxWidth="720px">
        {selected && <StudentDetail sisId={selected.source.id} onChanged={refetch} onProvision={(t) => { setSelected(null); setProvisioning(t); }} />}
      </Modal>
      <CreateStudent open={creating} onClose={() => setCreating(false)} onCreated={refetch} />
      <ProvisionDialog target={provisioning} onClose={() => setProvisioning(null)} onDone={refetch} />
    </Stack>
  );
}

/* ------------------------------------------------------------------- faculty */

function Faculty() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useApiQuery(() => sisAdminApi.faculty({ search: search || undefined, page, pageSize: 20 }), [search, page]);
  const [provisioning, setProvisioning] = useState(null);
  return (
    <Stack spacing={2}>
      <TextField
        size="small"
        placeholder="Search name, email or employee number"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setSearch(input.trim()); } }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
        inputProps={{ 'aria-label': 'Search CampusCore faculty' }}
        sx={{ maxWidth: 420 }}
      />
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.items?.length} emptyTitle="No faculty" emptyMessage="No CampusCore faculty match.">
        {() => (
          <>
            <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="CampusCore faculty">
                <TableHead>
                  <TableRow>
                    <TableCell>Faculty member</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>EduNexusAI account</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items.map((f) => (
                    <TableRow key={f.source.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2">{f.displayName}</Typography>
                        <Typography variant="caption">{f.institutionalId} · {f.email}</Typography>
                      </TableCell>
                      <TableCell>{f.department ?? '—'}</TableCell>
                      <TableCell>{pretty(f.status)}{f.title ? ` · ${f.title}` : ''}</TableCell>
                      <TableCell>{f.portalAccount ? <Chip size="small" color="success" variant="outlined" label={f.portalAccount.user?.email ?? 'Linked'} /> : <Chip size="small" variant="outlined" label="Unmapped" />}</TableCell>
                      <TableCell align="right">
                        {!f.portalAccount && f.status === 'ACTIVE' && (
                          <MuiButton size="small" onClick={() => setProvisioning({ recordType: 'FACULTY', record: { sisId: f.source.id, displayName: f.displayName, institutionalId: f.institutionalId, email: f.email } })}>Create login</MuiButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption">{data.total} faculty member(s) in CampusCore</Typography>
            {data.totalPages > 1 && <Pagination page={page} count={data.totalPages} onChange={(_e, p) => setPage(p)} sx={{ alignSelf: 'center' }} />}
          </>
        )}
      </DataState>
      <ProvisionDialog target={provisioning} onClose={() => setProvisioning(null)} onDone={refetch} />
    </Stack>
  );
}

/* ------------------------------------------------------------------ identity */

function LinkDialog({ target, onClose, onDone }) {
  // target: { user, recordType, record? } ; record may be chosen by searching when unmatched
  const [record, setRecord] = useState(null);
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const isFaculty = target?.recordType === 'FACULTY';
  const search = useApiQuery(() => (query.length >= 2 ? (isFaculty ? sisAdminApi.faculty({ search: query, pageSize: 8 }) : sisAdminApi.students({ search: query, pageSize: 8 })) : Promise.resolve(null)), [query, isFaculty]);
  const { busy, run } = useAction(onDone);
  useEffect(() => {
    setRecord(target?.record ?? null);
    setReason('');
    setConfirmed(false);
    setQuery('');
  }, [target]);
  if (!target) return null;
  const emailMatches = record && record.email?.trim().toLowerCase() === target.user.email.trim().toLowerCase();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Confirm identity link"
      subtitle={`${target.user.firstName} ${target.user.lastName} · ${target.user.email}`}
      footer={
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!record || !confirmed || (!emailMatches && reason.trim().length < 5)}
            loading={busy === 'link'}
            onClick={async () => {
              const r = await run('link', () => sisAdminApi.link({ userId: target.user.id, recordType: target.recordType, sisRecordId: record.sisId, ...(emailMatches ? {} : { evidenceMismatchReason: reason.trim() }) }), 'Linked in CampusCore.');
              if (r) onClose();
            }}
          >
            Link accounts
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        {!target.record && (
          <>
            <TextField size="small" label={`Find the CampusCore ${isFaculty ? 'faculty member' : 'student'}`} value={query} onChange={(e) => setQuery(e.target.value)} helperText={`Search by name, email or ${isFaculty ? 'employee' : 'student'} number, then pick the right record.`} />
            {(search.data?.items ?? []).map((s) => (
              <MuiButton key={s.source.id} size="small" variant={record?.sisId === s.source.id ? 'contained' : 'outlined'} onClick={() => setRecord({ sisId: s.source.id, displayName: s.displayName, institutionalId: s.institutionalId, email: s.email })} sx={{ justifyContent: 'flex-start' }}>
                {s.displayName} · {s.institutionalId} · {s.email}
              </MuiButton>
            ))}
          </>
        )}
        {record && (
          <Alert severity={emailMatches ? 'success' : 'warning'}>
            CampusCore {target.recordType.toLowerCase()} <b>{record.displayName}</b> ({record.institutionalId}, {record.email}).{' '}
            {emailMatches ? 'The email matches.' : 'The emails differ: record how you verified this person.'}
          </Alert>
        )}
        {record && !emailMatches && <TextField size="small" label="Verification note (required)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Checked student ID card in person" />}
        <FormControlLabel control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />} label="I have verified this is the same person." />
      </Stack>
    </Modal>
  );
}

const STATUS_COLOR = { LINKED: 'success', CANDIDATE: 'info', AMBIGUOUS: 'warning', UNMATCHED: 'default' };

function Identity() {
  const [recordType, setRecordType] = useState('STUDENT');
  const rec = useApiQuery(() => sisAdminApi.reconcile(recordType), [recordType]);
  const links = useApiQuery(() => sisAdminApi.links({ status: 'ACTIVE' }));
  const [target, setTarget] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');
  const refresh = async () => {
    await rec.refetch();
    await links.refetch();
  };
  const { busy, run } = useAction(refresh);
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField select size="small" label="Accounts" value={recordType} onChange={(e) => setRecordType(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="STUDENT">EduNexusAI students</MenuItem>
          <MenuItem value="FACULTY">EduNexusAI faculty</MenuItem>
        </TextField>
        <Typography variant="caption">Matched by email only (never by name). Nothing is linked until you confirm. Unmatched accounts stay unmapped and see a &quot;not linked&quot; state.</Typography>
      </Stack>
      <DataState loading={rec.loading} error={rec.error} onRetry={rec.refetch} isEmpty={!rec.data?.results?.length} emptyTitle="No accounts" emptyMessage="No EduNexusAI accounts of this type.">
        {() => (
          <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Identity reconciliation">
              <TableHead>
                <TableRow>
                  <TableCell>EduNexusAI account</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>CampusCore record(s)</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {rec.data.results.map((r) => (
                  <TableRow key={r.externalUserId} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{r.portalUser ? `${r.portalUser.firstName} ${r.portalUser.lastName}` : r.externalUserId}</Typography>
                      <Typography variant="caption">{r.portalUser?.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={STATUS_COLOR[r.status] ?? 'default'} label={r.status} />
                      {r.warnings?.map((w) => <Typography key={w} variant="caption" color="warning.main" component="div">{w}</Typography>)}
                      {r.reason && <Typography variant="caption" component="div">{r.reason}</Typography>}
                    </TableCell>
                    <TableCell>
                      {r.status === 'LINKED' && r.sisRecord && <Typography variant="body2">{r.sisRecord.displayName} · {r.sisRecord.institutionalId}</Typography>}
                      {(r.candidates ?? []).map((c) => (
                        <Stack key={c.sisId} direction="row" spacing={1} alignItems="center" sx={{ py: 0.25 }}>
                          <Typography variant="body2">{c.displayName} · {c.institutionalId} · {c.email}</Typography>
                          {c.linkedToExternalUserId ? <Chip size="small" label="linked elsewhere" /> : <MuiButton size="small" onClick={() => setTarget({ user: r.portalUser, recordType, record: c })}>Link</MuiButton>}
                        </Stack>
                      ))}
                    </TableCell>
                    <TableCell align="right">
                      {r.status === 'UNMATCHED' && r.portalUser && <MuiButton size="small" onClick={() => setTarget({ user: r.portalUser, recordType })}>Find &amp; link</MuiButton>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>

      <Card sx={{ p: 2.5 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Active links (CampusCore)</Typography>
        <DataState loading={links.loading} error={links.error} onRetry={links.refetch} isEmpty={!links.data?.data?.length} emptyTitle="No active links" emptyMessage="Links you confirm appear here." minHeight={80}>
          {() => (
            <Stack spacing={1}>
              {links.data.data.map((l) => (
                <Stack key={l.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                  <Box>
                    <Typography variant="body2"><b>{l.externalLabel ?? l.externalEmail ?? l.externalUserId}</b> ↔ {l.sisRecord?.displayName} ({l.sisRecord?.institutionalId}) · {pretty(l.recordType)}</Typography>
                    <Typography variant="caption">{l.method} · by {l.createdBy ?? '—'}{l.evidence?.mismatchReason ? ` · verified: ${l.evidence.mismatchReason}` : ''}</Typography>
                  </Box>
                  <MuiButton size="small" color="inherit" onClick={() => { setReason(''); setRevoking(l); }}>Revoke</MuiButton>
                </Stack>
              ))}
            </Stack>
          )}
        </DataState>
      </Card>

      <LinkDialog target={target} onClose={() => setTarget(null)} onDone={refresh} />
      <Modal
        isOpen={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        title="Revoke identity link"
        subtitle="The link is kept in CampusCore's history; a new link can be made afterwards."
        footer={
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="sm" variant="ghost" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={reason.trim().length < 5} loading={busy === 'revoke'} onClick={async () => { const r = await run('revoke', () => sisAdminApi.revokeLink(revoking.id, { reason: reason.trim(), userId: revoking.externalUserId }), 'Link revoked.'); if (r) setRevoking(null); }}>
              Revoke
            </Button>
          </Stack>
        }
      >
        <TextField size="small" fullWidth label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </Stack>
  );
}

/**
 * CampusCore SIS administration: connection and capabilities, the SIS student directory
 * with write-back, and identity reconciliation. Every action is authorised by the
 * EduNexusAI backend (ADMIN) and again by CampusCore (scope, policy, preferences).
 */
export const AdminSisPage = () => {
  const [tab, setTab] = useState('overview');
  return (
    <Box>
      <MuiButton component={RouterLink} to="/admin/integrations" startIcon={<ArrowBackRoundedIcon />} size="small" sx={{ mb: 1 }}>All integrations</MuiButton>
      <PageHeader eyebrow="Integrations" title="CampusCore SIS" description="Feddrick University's system of record: connection, write capabilities, student and faculty records, portal logins and identity links." />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="overview" label="Overview" />
        <Tab value="students" label="Students" />
        <Tab value="faculty" label="Faculty" />
        <Tab value="identity" label="Identity links" />
      </Tabs>
      {tab === 'overview' && <Overview />}
      {tab === 'students' && <Students />}
      {tab === 'faculty' && <Faculty />}
      {tab === 'identity' && <Identity />}
    </Box>
  );
};

export default AdminSisPage;
