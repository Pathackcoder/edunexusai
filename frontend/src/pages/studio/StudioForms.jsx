import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import MuiButton from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { studioApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';
import { CmsForm } from '../../components/cms/CmsForm';
import { FIELD_TYPES, fieldName, validateFormDefinition } from '../../../../shared/forms.js';
import { StateChip, audienceText, errorLines, useUnsavedGuard, AUDIENCE_OPTIONS } from './studioCommon';

/**
 * Studio → Forms. Forms are reusable: build one here (fields, validation, notification
 * recipient, who may submit), publish it, then place it on any page with the Form block.
 * Submissions are validated by the server and emailed to the recipient; they are not stored.
 */

const ALL = { students: true, faculty: true, staff: true };
let seq = 0;
const newId = () => `f${Date.now().toString(36)}${(seq += 1)}`;
const blankField = (type, existing) => {
  const label = FIELD_TYPES[type].label;
  let name = fieldName(label);
  while (existing.some((f) => f.name === name)) name = `${name}_${existing.length + 1}`.slice(0, 40);
  return { id: newId(), type, label, name, placeholder: '', helpText: '', required: false, ...(FIELD_TYPES[type].options ? { options: [{ label: 'Option 1', value: 'Option 1' }, { label: 'Option 2', value: 'Option 2' }] } : {}) };
};
const toForm = (doc) => ({ name: doc.name, description: doc.description, fields: (doc.fields ?? []).map((f) => ({ ...f, autoName: false })), submitLabel: doc.submitLabel, successMessage: doc.successMessage, recipientEmail: doc.recipientEmail, notificationSubject: doc.notificationSubject, audiences: doc.audiences ?? ALL });

/* ------------------------------------------------------------------ list */

export function StudioForms() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApiQuery(() => studioApi.list('form'));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const create = async (source) => {
    setBusy(true);
    setFailure(null);
    try {
      const body = source
        ? { ...toForm(source), name: `${source.name} (copy)`.slice(0, 120) }
        : { name: 'Untitled form', description: '', fields: [blankField('text', []), blankField('email', [{ name: 'single_line_text' }])], submitLabel: 'Submit', successMessage: 'Thank you. Your request has been sent.', recipientEmail: '', notificationSubject: '', audiences: ALL };
      const created = await studioApi.create('form', body);
      navigate(`/studio/forms/${created.id}`);
    } catch (e) {
      setFailure(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1">Forms</Typography>
          <Typography variant="body2" color="text.secondary">Reusable forms. Build a form once, publish it, then add it to any page with the <b>Form</b> block. Submissions are checked by the server and emailed to the form’s recipient; they are not stored in the portal.</Typography>
        </Box>
        <MuiButton variant="contained" startIcon={<AddRoundedIcon />} disabled={busy} onClick={() => create(null)}>New form</MuiButton>
      </Stack>
      {failure && <Alert severity="error">{failure.message}</Alert>}
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle="No forms yet" emptyMessage="Create a form to collect requests from students, faculty or staff.">
        {() => (
          <TableContainer component={Card}>
            <Table size="small" aria-label="Forms">
              <TableHead><TableRow><TableCell>Form</TableCell><TableCell>Status</TableCell><TableCell>Who can submit</TableCell><TableCell>Notifications</TableCell><TableCell align="right" /></TableRow></TableHead>
              <TableBody>
                {data.map((f) => (
                  <TableRow key={f.id} hover>
                    <TableCell><Typography variant="subtitle2">{f.name}</Typography><Typography variant="caption" color="text.secondary">{f.fields.length} field{f.fields.length === 1 ? '' : 's'}</Typography></TableCell>
                    <TableCell><StateChip state={f.state} /></TableCell>
                    <TableCell>{audienceText(f.audiences)}</TableCell>
                    <TableCell>{f.recipientEmail ? <Typography variant="body2">{f.recipientEmail}</Typography> : <Typography variant="caption" color="warning.main">No recipient set</Typography>}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <MuiButton size="small" disabled={busy} onClick={() => create(f)}>Duplicate</MuiButton>
                      <MuiButton size="small" variant="outlined" component={RouterLink} to={`/studio/forms/${f.id}`}>Edit</MuiButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
    </Stack>
  );
}

/* ---------------------------------------------------------------- editor */

function OptionsEditor({ options, onChange, error }) {
  const update = (i, patch) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i, d) => { const next = [...options]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Options</Typography>
      {options.map((o, i) => (
        <Stack key={i} direction="row" spacing={0.5} alignItems="center">
          <TextField size="small" label={`Option ${i + 1}`} value={o.label} onChange={(e) => update(i, { label: e.target.value, value: e.target.value })} sx={{ flex: 1 }} inputProps={{ maxLength: 100 }} />
          <IconButton size="small" aria-label="Move option up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardRoundedIcon fontSize="small" /></IconButton>
          <IconButton size="small" aria-label="Move option down" disabled={i === options.length - 1} onClick={() => move(i, 1)}><ArrowDownwardRoundedIcon fontSize="small" /></IconButton>
          <IconButton size="small" aria-label="Remove option" disabled={options.length <= 1} onClick={() => onChange(options.filter((_, j) => j !== i))}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      ))}
      {error && <Typography variant="caption" color="error">{error}</Typography>}
      <MuiButton size="small" startIcon={<AddRoundedIcon />} onClick={() => onChange([...options, { label: `Option ${options.length + 1}`, value: `Option ${options.length + 1}` }])} sx={{ alignSelf: 'flex-start' }}>Add option</MuiButton>
    </Stack>
  );
}

function FieldEditor({ field, index, onChange, errors }) {
  const err = (k) => errors[`fields[${index}].${k}`];
  const set = (patch) => onChange({ ...field, ...patch });
  const def = FIELD_TYPES[field.type];
  const optionError = Object.entries(errors).find(([k]) => k.startsWith(`fields[${index}].options`))?.[1];
  return (
    <Stack spacing={1.75}>
      <TextField select size="small" label="Field type" value={field.type} onChange={(e) => { const type = e.target.value; set({ type, ...(FIELD_TYPES[type].options && !field.options ? { options: [{ label: 'Option 1', value: 'Option 1' }] } : {}) }); }}>
        {Object.entries(FIELD_TYPES).map(([k, t]) => <MenuItem key={k} value={k}>{t.label}</MenuItem>)}
      </TextField>
      <TextField size="small" label="Label" required value={field.label} onChange={(e) => set({ label: e.target.value, ...(field.autoName !== false ? { name: fieldName(e.target.value) } : {}) })} error={Boolean(err('label'))} helperText={err('label') ?? ' '} inputProps={{ maxLength: 120 }} />
      <TextField size="small" label="Field name (used in the email)" value={field.name} onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40), autoName: false })} error={Boolean(err('name'))} helperText={err('name') ?? 'Lowercase letters, numbers and underscores.'} />
      {!['checkbox', 'radio', 'checkboxes'].includes(field.type) && <TextField size="small" label="Placeholder" value={field.placeholder ?? ''} onChange={(e) => set({ placeholder: e.target.value })} inputProps={{ maxLength: 120 }} />}
      <TextField size="small" label="Help text" value={field.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value })} inputProps={{ maxLength: 200 }} />
      <FormControlLabel control={<Switch checked={Boolean(field.required)} onChange={(e) => set({ required: e.target.checked })} />} label="Required" />
      {def.maxLength && <TextField size="small" type="number" label={`Maximum length (up to ${def.maxLength})`} value={field.maxLength ?? def.maxLength} onChange={(e) => set({ maxLength: Math.min(def.maxLength, Math.max(1, Number(e.target.value) || def.maxLength)) })} />}
      {field.type === 'number' && (
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="number" label="Minimum" value={field.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} error={Boolean(err('min'))} helperText={err('min') ?? ' '} />
          <TextField size="small" type="number" label="Maximum" value={field.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </Stack>
      )}
      {def.options && <OptionsEditor options={field.options ?? []} onChange={(options) => set({ options })} error={optionError} />}
    </Stack>
  );
}

export function StudioFormEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState('fields');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [addAnchor, setAddAnchor] = useState(null);
  const meta = useApiQuery(() => studioApi.meta());
  useUnsavedGuard(dirty);

  const load = useCallback(async () => {
    try {
      const d = await studioApi.get('form', id);
      setDoc(d);
      setForm(toForm(d));
      setDirty(false);
    } catch (e) {
      setError(e);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const local = useMemo(() => (form ? validateFormDefinition(form) : { ok: true }), [form]);
  const errors = { ...(local.ok ? {} : local.errors), ...(error?.details?.fieldErrors ?? {}) };
  const change = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const setField = (i, field) => change({ fields: form.fields.map((f, j) => (j === i ? field : f)) });
  const moveField = (i, d) => { const next = [...form.fields]; [next[i], next[i + d]] = [next[i + d], next[i]]; change({ fields: next }); setSelected(i + d); };
  const removeField = (i) => { change({ fields: form.fields.filter((_, j) => j !== i) }); setSelected(Math.max(0, i - 1)); };
  const addField = (type) => { setAddAnchor(null); const field = blankField(type, form.fields); change({ fields: [...form.fields, field] }); setSelected(form.fields.length); setTab('fields'); };

  const save = async ({ quiet = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await studioApi.update('form', id, { ...form, fields: form.fields.map(({ autoName, ...f }) => f) });
      setDoc(saved);
      setDirty(false);
      if (!quiet) setMessage('Draft saved. The published form is unchanged until you publish.');
      return saved;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const action = async (name) => {
    if (name === 'publish' && dirty && !(await save({ quiet: true }))) return;
    if (name === 'delete') {
      if (!window.confirm('Delete this form? Pages that use it will show “form not available”.')) return;
      await studioApi.remove('form', id);
      navigate('/studio/forms');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setDoc(await studioApi.action('form', id, name));
      if (name === 'discard') await load();
      setMessage(name === 'publish' ? 'Published. Pages with this form now use this version.' : name === 'unpublish' ? 'Unpublished. Pages show “form not available”.' : 'Unpublished changes discarded.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (error && !doc) return <Alert severity="error" action={<MuiButton component={RouterLink} to="/studio/forms">Back</MuiButton>}>{error.message}</Alert>;
  if (!doc || !form) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  const field = form.fields[selected];
  const mail = meta.data?.mail;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ md: 'center' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <MuiButton size="small" component={RouterLink} to="/studio/forms" startIcon={<ArrowBackRoundedIcon />}>Forms</MuiButton>
          <Typography variant="h4" component="h1" noWrap>{form.name || 'Untitled form'}</Typography>
          <StateChip state={dirty ? undefined : doc.state} />
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {doc.state !== 'draft' && <MuiButton disabled={busy} onClick={() => action('unpublish')}>Unpublish</MuiButton>}
          {doc.state === 'modified' && <MuiButton disabled={busy} onClick={() => action('discard')}>Discard changes</MuiButton>}
          <MuiButton color="error" disabled={busy} onClick={() => action('delete')}>Delete</MuiButton>
          <MuiButton variant="outlined" disabled={busy || !dirty || !local.ok} onClick={() => save()}>{dirty ? 'Save draft' : 'Saved'}</MuiButton>
          <MuiButton variant="contained" disabled={busy || !local.ok || (!dirty && doc.state === 'published')} onClick={() => action('publish')}>{doc.state === 'draft' ? 'Publish' : 'Publish changes'}</MuiButton>
        </Stack>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error.message}{errorLines(error).slice(0, 6).map((l) => <div key={l}>{l}</div>)}</Alert>}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Form editor">
        <Tab value="fields" label={`Fields (${form.fields.length})`} />
        <Tab value="settings" label="Settings & notifications" />
        <Tab value="preview" label="Preview & test" />
      </Tabs>

      {tab === 'fields' && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.1fr)' } }}>
          <Card variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1} role="listbox" aria-label="Fields">
              {form.fields.map((f, i) => (
                <Stack key={f.id ?? i} role="option" aria-selected={i === selected} direction="row" alignItems="center" spacing={1} onClick={() => setSelected(i)} sx={{ p: 1, pl: 1.5, borderRadius: 2, border: 1.5, borderColor: i === selected ? 'primary.main' : errors && Object.keys(errors).some((k) => k.startsWith(`fields[${i}]`)) ? 'error.main' : 'divider', bgcolor: i === selected ? 'primary.lighter' : 'background.paper', cursor: 'pointer' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{f.label || 'Untitled field'}{f.required ? ' *' : ''}</Typography>
                    <Typography variant="caption" color="text.secondary">{FIELD_TYPES[f.type]?.label} · {f.name}</Typography>
                  </Box>
                  <Tooltip title="Move up"><span><IconButton size="small" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveField(i, -1); }}><ArrowUpwardRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
                  <Tooltip title="Move down"><span><IconButton size="small" aria-label={`Move ${f.label} down`} disabled={i === form.fields.length - 1} onClick={(e) => { e.stopPropagation(); moveField(i, 1); }}><ArrowDownwardRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
                  <Tooltip title="Delete field"><span><IconButton size="small" aria-label={`Delete ${f.label}`} disabled={form.fields.length <= 1} onClick={(e) => { e.stopPropagation(); removeField(i); }}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
                </Stack>
              ))}
              <MuiButton startIcon={<AddRoundedIcon />} onClick={(e) => setAddAnchor(e.currentTarget)} sx={{ alignSelf: 'flex-start' }}>Add field</MuiButton>
              <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
                {Object.entries(FIELD_TYPES).map(([k, t]) => <MenuItem key={k} onClick={() => addField(k)}>{t.label}</MenuItem>)}
              </Menu>
            </Stack>
          </Card>
          <Card variant="outlined" sx={{ p: 2 }}>
            {field ? <FieldEditor key={field.id ?? selected} field={field} index={selected} errors={errors} onChange={(f) => setField(selected, f)} /> : <Typography color="text.secondary">Add a field to get started.</Typography>}
          </Card>
        </Box>
      )}

      {tab === 'settings' && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.75}>
              <TextField size="small" label="Form name" required value={form.name} onChange={(e) => change({ name: e.target.value })} error={Boolean(errors.name)} helperText={errors.name ?? ' '} inputProps={{ maxLength: 120 }} />
              <TextField size="small" label="Description" multiline minRows={2} value={form.description} onChange={(e) => change({ description: e.target.value })} inputProps={{ maxLength: 500 }} />
              <TextField size="small" label="Submit button label" value={form.submitLabel} onChange={(e) => change({ submitLabel: e.target.value })} inputProps={{ maxLength: 60 }} />
              <TextField size="small" label="Success message" multiline minRows={2} value={form.successMessage} onChange={(e) => change({ successMessage: e.target.value })} inputProps={{ maxLength: 300 }} />
              <Box>
                <Typography variant="subtitle2">Who can see and submit it</Typography>
                <FormGroup row>
                  {AUDIENCE_OPTIONS.map(([k, label]) => (
                    <FormControlLabel key={k} control={<Checkbox checked={Boolean(form.audiences[k])} onChange={(e) => change({ audiences: { ...form.audiences, [k]: e.target.checked } })} />} label={label} />
                  ))}
                </FormGroup>
                <Typography variant="caption" color="text.secondary">Pages that show the form have their own audience; the stricter of the two applies.</Typography>
              </Box>
            </Stack>
          </Card>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.75}>
              <Stack direction="row" spacing={1} alignItems="center"><MarkEmailReadOutlinedIcon color="primary" /><Typography variant="subtitle1">Email notifications</Typography></Stack>
              {!mail ? <CircularProgress size={18} /> : mail.configured ? (
                <Alert severity={mail.verified === false ? 'warning' : 'success'}>Email is configured (from {mail.from}){mail.verified === false ? `, but the mail server could not be reached (${mail.error}).` : mail.verified ? ' and the mail server responded.' : '.'}</Alert>
              ) : (
                <Alert severity="warning">Email is not configured on the server ({mail.problems.join(' ')}). Submissions are validated but refused with a clear message until an administrator sets the SMTP settings (see the CMS implementation notes).</Alert>
              )}
              <TextField size="small" type="email" label="Send submissions to" placeholder="office@feddrick.edu" value={form.recipientEmail} onChange={(e) => change({ recipientEmail: e.target.value.trim() })} error={Boolean(errors.recipientEmail)} helperText={errors.recipientEmail ?? (mail?.recipientDomains?.length ? `Must be an address at ${mail.recipientDomains.join(' or ')}.` : 'Each submission is emailed here. It is never shown to portal users.')} />
              <TextField size="small" label="Email subject" placeholder={`New submission: ${form.name}`} value={form.notificationSubject} onChange={(e) => change({ notificationSubject: e.target.value })} inputProps={{ maxLength: 150 }} />
              <Typography variant="caption" color="text.secondary">The email contains the submitted answers and the submitter’s name and portal email. Submissions are not stored in the portal or the CMS.</Typography>
            </Stack>
          </Card>
        </Box>
      )}

      {tab === 'preview' && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(0, 1fr)' } }}>
          <Card variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <CmsForm key={JSON.stringify(form.fields)} form={{ ...form, id: doc.id }} mode="test" onTest={async (values) => { if (dirty && !(await save({ quiet: true }))) throw new Error('Save failed.'); return studioApi.testFormSubmission(id, values); }} />
          </Card>
          <Stack spacing={1.5}>
            <Alert severity="info">This test checks your answers with the server’s validation, using the saved draft. <b>No email is sent</b> and nothing is stored.</Alert>
            <Typography variant="body2" color="text.secondary">To use the form on a page, open a page in Studio, add a <b>Form</b> block and choose “{form.name}”. Only the published version of the form appears on pages.</Typography>
            <Chip size="small" label={`Status: ${doc.state}`} sx={{ alignSelf: 'flex-start' }} />
          </Stack>
        </Box>
      )}
      <Snackbar open={Boolean(message)} autoHideDuration={5000} onClose={() => setMessage(null)} message={message} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Stack>
  );
}
