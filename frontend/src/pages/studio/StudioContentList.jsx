import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Switch from '@mui/material/Switch';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { studioApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';
import { RichContent } from '../../components/cms/SafeHtml';
import { RichTextEditor } from '../../components/cms/RichTextEditor';
import { ScheduleDialog, scheduleSummary } from './ScheduleDialog';
import { StateChip, audienceText, errorLines, AUDIENCE_OPTIONS, PUBLIC_AUDIENCE_OPTION } from './studioCommon';

const CATEGORIES = ['general', 'academic', 'events', 'campus-life', 'finance', 'it-services', 'safety', 'wellness'];
const LABELS = {
  announcement: { title: 'News & notices', item: 'news item', description: 'Campus announcements for the News & Notices page, the Campus news block and dashboards. Instructor course announcements are separate and unaffected.' },
  faq: { title: 'Help articles', item: 'help article', description: 'Shown under “Campus help articles” on the Help page and in FAQ blocks, beside the existing Help Centre FAQs.' },
};
const EMPTY = {
  announcement: { title: '', summary: '', body: '', bodyFormat: 'html', category: 'general', priority: 'normal', pinned: false, ctaLabel: '', ctaUrl: '', expiresAt: null, audiences: { students: true, faculty: true, staff: true } },
  faq: { question: '', answer: '', answerFormat: 'html', category: 'general', sortOrder: 0, audiences: { students: true, faculty: true, staff: true } },
};
const formOf = (type, item) => Object.fromEntries(Object.keys(EMPTY[type]).map((k) => [k, item?.[k] ?? EMPTY[type][k]]));

/** Body text: the Visual/Source editor for HTML content; Markdown items can be converted. */
function BodyField({ format, value, onChange, onConvert, label, error }) {
  if (format === 'html') {
    return (
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>{label}</Typography>
        <RichTextEditor value={value} onChange={onChange} minHeight={180} label={label} />
        {error && <Typography variant="caption" color="error">{error}</Typography>}
      </Box>
    );
  }
  return (
    <Box>
      <TextField label={`${label} (Markdown)`} multiline minRows={8} fullWidth value={value} onChange={(e) => onChange(e.target.value)} error={Boolean(error)} helperText={error} />
      <MuiButton size="small" onClick={onConvert} sx={{ mt: 0.5, px: 0 }}>Switch to the rich-text editor (Visual / Source)</MuiButton>
    </Box>
  );
}

function Editor({ type, item, onClose, onChanged, timezone }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0); // remounts the rich editor when the form is reloaded
  const [form, setForm] = useState(formOf(type, item));
  const [current, setCurrent] = useState(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setForm(formOf(type, item)); setCurrent(item); setDirty(false); setError(null); setFormVersion((v) => v + 1); }, [type, item]);
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const fieldError = (k) => error?.details?.fieldErrors?.[k];
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result) setCurrent(result);
      await onChanged();
      return result;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(async () => {
    const saved = current ? await studioApi.update(type, current.id, form) : await studioApi.create(type, form);
    setDirty(false);
    return saved;
  });
  const publish = async () => {
    const saved = dirty || !current ? await save() : current;
    if (saved) await run(() => studioApi.action(type, saved.id, 'publish'));
  };
  const act = (name) => run(() => studioApi.action(type, current.id, name)).then((r) => { if (r && name === 'discard') { setForm(formOf(type, r)); setFormVersion((v) => v + 1); } });
  const remove = async () => {
    if (!window.confirm(`Delete this ${LABELS[type].item}? It is removed from the portal too.`)) return;
    await run(() => studioApi.remove(type, current.id));
    onClose();
  };
  const isNews = type === 'announcement';
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <span>{current ? 'Edit' : 'New'} {LABELS[type].item}</span>
          {current && <StateChip state={dirty ? undefined : current.state} />}
          {current?.schedule && (current.schedule.publish || current.schedule.unpublish) && <Typography variant="caption" color={current.schedule.publish?.status === 'blocked' ? 'warning.main' : 'text.secondary'}>{scheduleSummary(current.schedule, timezone)}</Typography>}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}{errorLines(error).map((l) => <div key={l}>{l}</div>)}</Alert>}
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Stack spacing={2}>
            {isNews ? (
              <>
                <TextField label="Title" required value={form.title} onChange={(e) => set('title')(e.target.value)} error={Boolean(fieldError('title'))} helperText={fieldError('title')} inputProps={{ maxLength: 160 }} />
                <TextField label="Summary" value={form.summary} onChange={(e) => set('summary')(e.target.value)} inputProps={{ maxLength: 400 }} />
                <BodyField key={`b${formVersion}`} label="Body" format={form.bodyFormat} value={form.body} onChange={set('body')} onConvert={async () => { const { markdownToHtml } = await import('../../components/cms/markdownToHtml'); setForm((f) => ({ ...f, bodyFormat: 'html', body: markdownToHtml(f.body) })); setDirty(true); }} />
                <Stack direction="row" spacing={2}>
                  <TextField select label="Category" value={form.category} onChange={(e) => set('category')(e.target.value)} sx={{ flex: 1 }}>{CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c.replace('-', ' ')}</MenuItem>)}</TextField>
                  <TextField select label="Priority" value={form.priority} onChange={(e) => set('priority')(e.target.value)} sx={{ flex: 1 }}>{['normal', 'important', 'urgent'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
                </Stack>
                <FormControlLabel control={<Switch checked={form.pinned} onChange={(e) => set('pinned')(e.target.checked)} />} label="Pin to the top" />
                <Stack direction="row" spacing={2}>
                  <TextField label="Link label" value={form.ctaLabel} onChange={(e) => set('ctaLabel')(e.target.value)} error={Boolean(fieldError('ctaLabel'))} helperText={fieldError('ctaLabel')} sx={{ flex: 1 }} />
                  <TextField label="Link address" value={form.ctaUrl} onChange={(e) => set('ctaUrl')(e.target.value)} error={Boolean(fieldError('ctaUrl'))} helperText={fieldError('ctaUrl') ?? 'https://, mailto:, tel: or /path'} sx={{ flex: 2 }} />
                </Stack>
                <TextField label="Expires" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.expiresAt ? form.expiresAt.slice(0, 16) : ''} onChange={(e) => set('expiresAt')(e.target.value ? new Date(e.target.value).toISOString() : null)} helperText="Optional. Expired notices disappear from the portal automatically." />
              </>
            ) : (
              <>
                <TextField label="Question" required value={form.question} onChange={(e) => set('question')(e.target.value)} error={Boolean(fieldError('question'))} helperText={fieldError('question')} inputProps={{ maxLength: 300 }} />
                <BodyField key={`a${formVersion}`} label="Answer" format={form.answerFormat} value={form.answer} onChange={set('answer')} error={fieldError('answer')} onConvert={async () => { const { markdownToHtml } = await import('../../components/cms/markdownToHtml'); setForm((f) => ({ ...f, answerFormat: 'html', answer: markdownToHtml(f.answer) })); setDirty(true); }} />
                <Stack direction="row" spacing={2}>
                  <TextField label="Category" value={form.category} onChange={(e) => set('category')(e.target.value)} sx={{ flex: 2 }} />
                  <TextField label="Order" type="number" value={form.sortOrder} onChange={(e) => set('sortOrder')(Math.max(0, Math.min(999, Number(e.target.value) || 0)))} sx={{ flex: 1 }} />
                </Stack>
              </>
            )}
            <Box>
              <Typography variant="subtitle2">Who can see it</Typography>
              <FormGroup row>
                {[...AUDIENCE_OPTIONS, PUBLIC_AUDIENCE_OPTION].map(([k, label]) => (
                  <FormControlLabel key={k} control={<Checkbox checked={Boolean(form.audiences[k])} onChange={(e) => set('audiences')({ ...form.audiences, [k]: e.target.checked })} />} label={label} />
                ))}
              </FormGroup>
              {fieldError('audiences') && <Typography variant="caption" color="error">{fieldError('audiences')}</Typography>}
            </Box>
          </Stack>
          <Box>
            <Typography variant="overline">Preview</Typography>
            <Card variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" component="p">{isNews ? form.title || 'Title' : form.question || 'Question'}</Typography>
              {isNews && form.summary && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{form.summary}</Typography>}
              <RichContent format={isNews ? form.bodyFormat : form.answerFormat} value={isNews ? form.body : form.answer} />
            </Card>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {current && <MuiButton color="error" disabled={busy} onClick={remove}>Delete</MuiButton>}
        {current && !['draft', 'scheduled'].includes(current.state) && <MuiButton disabled={busy} onClick={() => act('unpublish')}>Unpublish</MuiButton>}
        {current && <MuiButton disabled={busy} onClick={() => setScheduleOpen(true)}>Schedule…</MuiButton>}
        {current?.state === 'modified' && <MuiButton disabled={busy} onClick={() => act('discard')}>Discard changes</MuiButton>}
        <Box sx={{ flex: 1 }} />
        <MuiButton onClick={onClose}>Close</MuiButton>
        <MuiButton variant="outlined" disabled={busy || (!dirty && Boolean(current))} onClick={save}>Save draft</MuiButton>
        <MuiButton variant="contained" disabled={busy} onClick={publish}>{!current || current.state === 'draft' ? 'Publish' : current.state === 'scheduled' ? 'Publish now' : 'Publish changes'}</MuiButton>
      </DialogActions>
      {current && (
        <ScheduleDialog
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          type={type}
          item={current}
          timezone={timezone}
          dirty={dirty}
          onSaved={async (schedule) => { setCurrent((c) => ({ ...c, schedule, state: c.state === 'draft' && schedule.publish && schedule.publish.status !== 'blocked' ? 'scheduled' : c.state === 'scheduled' && !schedule.publish ? 'draft' : c.state })); await onChanged(); }}
        />
      )}
    </Dialog>
  );
}

export function StudioContentList({ type }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(undefined);
  const { data, loading, error, refetch } = useApiQuery(() => studioApi.list(type, { status: status || undefined, q: q || undefined }), [type, status, q]);
  const meta = useApiQuery(() => studioApi.meta());
  const labels = LABELS[type];
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ md: 'center' }}>
        <Box>
          <Typography variant="h4" component="h2">{labels.title}</Typography>
          <Typography variant="body2" color="text.secondary">{labels.description}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All</MenuItem><MenuItem value="draft">Drafts</MenuItem><MenuItem value="scheduled">Scheduled</MenuItem><MenuItem value="published">Published</MenuItem><MenuItem value="modified">With changes</MenuItem>
          </TextField>
          <MuiButton variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setEditing(null)}>New</MuiButton>
        </Stack>
      </Stack>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle={`No ${labels.item}s`} emptyMessage="Create one to get started.">
        {() => (
          <TableContainer component={Card}>
            <Table size="small">
              <TableHead><TableRow><TableCell>{type === 'faq' ? 'Question' : 'Title'}</TableCell><TableCell>Status</TableCell><TableCell>Audience</TableCell><TableCell>Last edited</TableCell><TableCell align="right" /></TableRow></TableHead>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell><Typography variant="subtitle2">{r.title ?? r.question}</Typography><Typography variant="caption" color="text.secondary">{r.category}{r.pinned ? ' · pinned' : ''}{r.expiresAt ? ` · expires ${new Date(r.expiresAt).toLocaleDateString()}` : ''}</Typography></TableCell>
                    <TableCell><StateChip state={r.state} />{r.schedule && (r.schedule.publish || r.schedule.unpublish) && <Typography variant="caption" component="div" color={r.schedule.publish?.status === 'blocked' ? 'warning.main' : 'text.secondary'} sx={{ mt: 0.5 }}>{scheduleSummary(r.schedule, meta.data?.timezone)}</Typography>}</TableCell>
                    <TableCell>{audienceText(r.audiences)}</TableCell>
                    <TableCell><Typography variant="caption">{new Date(r.updatedAt).toLocaleString()}{r.updatedByName ? ` · ${r.updatedByName}` : ''}</Typography></TableCell>
                    <TableCell align="right"><MuiButton size="small" variant="outlined" onClick={() => setEditing(r)}>Edit</MuiButton></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
      {editing !== undefined && <Editor type={type} item={editing} onClose={() => setEditing(undefined)} onChanged={refetch} timezone={meta.data?.timezone} />}
    </Stack>
  );
}
