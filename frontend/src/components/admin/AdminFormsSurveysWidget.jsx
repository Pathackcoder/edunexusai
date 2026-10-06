import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import Alert from '@mui/material/Alert';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { DataState } from '../common/DataState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminOpsApi } from '../../services/api';
import { formatAnswer } from '../workflows/DynamicField';
import { statusTone, formatDate, formatDateTime } from '../workflows/status';

const FIELD_TYPES = [
  ['text', 'Short answer'],
  ['textarea', 'Paragraph'],
  ['select', 'Dropdown'],
  ['rating', 'Rating (1–5)'],
  ['checkbox', 'Checkbox'],
  ['date', 'Date'],
];
const blankField = () => ({ label: '', type: 'text', required: false, options: '' });

function FormBuilder({ open, onClose, onCreated }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ title: '', description: '', category: 'Survey', audience: 'STUDENT', closesAt: '', requiresReview: false });
  const [fields, setFields] = useState([blankField()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (publish) => {
    setError('');
    if (form.title.trim().length < 3) return setError('Give the form a title.');
    if (fields.some((field) => !field.label.trim())) return setError('Every question needs a label.');
    setSaving(true);
    try {
      await adminOpsApi.createForm({
        ...form,
        closesAt: form.closesAt || undefined,
        publish,
        fields: fields.map((field) => ({ label: field.label, type: field.type, required: field.required, options: field.type === 'select' ? field.options.split(',').map((option) => option.trim()).filter(Boolean) : undefined })),
      });
      showToast(publish ? 'Form published — the audience has been notified.' : 'Form saved as draft.');
      setForm({ title: '', description: '', category: 'Survey', audience: 'STUDENT', closesAt: '', requiresReview: false });
      setFields([blankField()]);
      onCreated();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };
  const update = (index, patch) => setFields(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Create a form"
      subtitle="Publish to students, faculty or both. Published forms appear in Help & Support → Forms."
      maxWidth="760px"
      footer={<><Button variant="ghost" onClick={() => save(false)} loading={saving}>Save draft</Button><Button onClick={() => save(true)} loading={saving}>Publish</Button></>}
    >
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select fullWidth label="Audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
            <MenuItem value="STUDENT">Students</MenuItem>
            <MenuItem value="FACULTY">Faculty</MenuItem>
            <MenuItem value="ALL">Students & faculty</MenuItem>
          </TextField>
          <TextField select fullWidth label="Type" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {['Survey', 'Intake', 'Application', 'Feedback', 'Registration'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </TextField>
          <TextField fullWidth label="Closes on" type="date" InputLabelProps={{ shrink: true }} value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
        </Stack>
        <FormControlLabel control={<Switch checked={form.requiresReview} onChange={(e) => setForm({ ...form, requiresReview: e.target.checked })} />} label="Submissions need staff review (submitter is notified of the outcome)" />
        <Typography variant="overline" color="text.secondary">Questions</Typography>
        {fields.map((field, index) => (
          <Stack key={index} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
            <TextField size="small" label={`Question ${index + 1}`} value={field.label} onChange={(e) => update(index, { label: e.target.value })} sx={{ flex: 2 }} />
            <TextField size="small" select label="Answer type" value={field.type} onChange={(e) => update(index, { type: e.target.value })} sx={{ flex: 1, minWidth: 150 }}>
              {FIELD_TYPES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
            {field.type === 'select' && <TextField size="small" label="Options (comma separated)" value={field.options} onChange={(e) => update(index, { options: e.target.value })} sx={{ flex: 2 }} />}
            <FormControlLabel control={<Checkbox size="small" checked={field.required} onChange={(e) => update(index, { required: e.target.checked })} />} label="Required" />
            <IconButton aria-label="Remove question" onClick={() => setFields(fields.filter((_, i) => i !== index))} disabled={fields.length === 1}>
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Box><Button variant="outline" size="sm" icon={AddRoundedIcon} onClick={() => setFields([...fields, blankField()])}>Add question</Button></Box>
      </Stack>
    </Modal>
  );
}

function Submissions({ formId, onClose, onChanged }) {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => (formId ? adminOpsApi.listSubmissions(formId) : Promise.resolve(null)), [formId]);
  const [notes, setNotes] = useState({});
  const review = async (submission, status) => {
    try {
      await adminOpsApi.reviewSubmission(submission.id, status, notes[submission.id]);
      showToast(`Submission ${status.toLowerCase().replace('_', ' ')} — ${submission.submitter.name} notified.`);
      refetch();
      onChanged?.();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };
  const form = data?.form;
  return (
    <Modal isOpen={Boolean(formId)} onClose={onClose} title={form?.title ?? 'Submissions'} subtitle={form ? `${data.submissions.length} submission(s)` : ''} maxWidth="760px">
      <DataState loading={loading} error={error} onRetry={refetch} minHeight={120}>
        {() =>
          data?.submissions.length ? (
            <Stack spacing={1.5}>
              {data.submissions.map((submission) => (
                <Box key={submission.id} sx={{ p: 1.75, borderRadius: 3, border: 1, borderColor: 'divider' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Typography variant="subtitle2">{submission.submitter.name} <Typography component="span" variant="caption" color="text.secondary">· {formatDateTime(submission.submittedAt)}</Typography></Typography>
                    <Badge variant={statusTone(submission.status)} dot>{submission.statusLabel}</Badge>
                  </Stack>
                  <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                    {form.fields.map((field) => (
                      <Box key={field.key}>
                        <Typography variant="caption" color="text.secondary">{field.label}</Typography>
                        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{formatAnswer(field, submission.answers[field.key])}</Typography>
                      </Box>
                    ))}
                  </Box>
                  {form.requiresReview && ['SUBMITTED', 'UNDER_REVIEW'].includes(submission.status) && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }} alignItems={{ sm: 'center' }}>
                      <TextField size="small" placeholder="Note to submitter (optional)" value={notes[submission.id] ?? ''} onChange={(e) => setNotes({ ...notes, [submission.id]: e.target.value })} sx={{ flex: 1 }} />
                      <Button size="sm" variant="outline" onClick={() => review(submission, 'REJECTED')}>Decline</Button>
                      <Button size="sm" onClick={() => review(submission, 'APPROVED')}>Approve</Button>
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary">No submissions yet.</Typography>
          )
        }
      </DataState>
    </Modal>
  );
}

/** Forms & surveys: build, publish, close and review — responses come from real users. */
export const AdminFormsSurveysWidget = ({ onChanged }) => {
  const { showToast } = useToast();
  const { data: forms = [], loading, error, refetch } = useApiQuery(() => adminOpsApi.listForms(), [], { initialData: [] });
  const [building, setBuilding] = useState(false);
  const [viewing, setViewing] = useState(null);

  const setStatus = async (form, status) => {
    try {
      await adminOpsApi.setFormStatus(form.id, status);
      showToast(status === 'PUBLISHED' ? `${form.title} published — audience notified.` : `${form.title} ${status.toLowerCase()}.`);
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <>
      <WidgetCard
        title="Forms & campus surveys"
        subtitle="Build forms, publish them to students or faculty, and review what comes back"
        icon={AssignmentTurnedInOutlinedIcon}
        tone="academic"
        hoverable={false}
        headerAction={<Button size="sm" icon={AddRoundedIcon} onClick={() => setBuilding(true)}>New form</Button>}
      >
        <DataState loading={loading} error={error} onRetry={refetch} minHeight={120}>
          {() => (
            <Stack spacing={1.5}>
              {(forms ?? []).map((item) => {
                const rate = item.audienceSize ? Math.min(100, Math.round((item.responses / item.audienceSize) * 100)) : 0;
                return (
                  <Box key={item.id} sx={{ p: 1.75, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }} useFlexGap flexWrap="wrap">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{item.title}</Typography>
                      <Stack direction="row" spacing={0.75}>
                        {item.awaitingReview > 0 && <Badge variant="danger">{item.awaitingReview} to review</Badge>}
                        <Badge variant={statusTone(item.status)}>{item.status}</Badge>
                      </Stack>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Audience: {item.audience === 'ALL' ? 'Students & faculty' : item.audience === 'STUDENT' ? 'Students' : 'Faculty'} ({item.audienceSize}) · <strong>{item.closesAt ? `Closes ${formatDate(item.closesAt)}` : 'No deadline'}</strong>
                      {item.requiresReview ? ' · Staff review' : ''}
                    </Typography>
                    <Box sx={{ mt: 1.25 }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Responses: <strong>{item.responses}</strong> of {item.audienceSize}</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>{rate}%</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={rate} sx={{ height: 6, borderRadius: 3 }} />
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} useFlexGap flexWrap="wrap">
                      <Button size="sm" variant="outline" onClick={() => setViewing(item.id)}>View responses</Button>
                      {item.status === 'DRAFT' && <Button size="sm" onClick={() => setStatus(item, 'PUBLISHED')}>Publish</Button>}
                      {item.status === 'PUBLISHED' && <Button size="sm" variant="ghost" onClick={() => setStatus(item, 'CLOSED')}>Close form</Button>}
                      {item.status === 'CLOSED' && <Button size="sm" variant="ghost" onClick={() => setStatus(item, 'PUBLISHED')}>Re-open</Button>}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </DataState>
      </WidgetCard>
      <FormBuilder open={building} onClose={() => setBuilding(false)} onCreated={() => { setBuilding(false); refetch(); }} />
      <Submissions formId={viewing} onClose={() => { setViewing(null); refetch(); }} onChanged={onChanged} />
    </>
  );
};

export default AdminFormsSurveysWidget;
