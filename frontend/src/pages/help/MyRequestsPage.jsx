import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import ButtonBase from '@mui/material/ButtonBase';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { StatCard } from '../../components/common/StatCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { FilterChips } from '../../components/common/FilterChips';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { workflowApi } from '../../services/api';
import { useNotifications } from '../../context/NotificationContext';
import { DynamicField } from '../../components/workflows/DynamicField';
import { FileAttachInput } from '../../components/workflows/FileAttachInput';
import { AttachmentList } from '../../components/workflows/AttachmentList';
import { RequestTimeline } from '../../components/workflows/RequestTimeline';
import { statusTone, formatDateTime, PRIORITY_TONES } from '../../components/workflows/status';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'NEEDS_INFO', label: 'Needs information' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Not approved' },
];
const OPEN = ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'];

/** Detail labels shown for well-known `details` keys. */
const prettyKey = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function NewRequestDialog({ open, onClose, onCreated }) {
  const { data: types = [] } = useApiQuery(() => workflowApi.requestTypes(), [], { initialData: [] });
  const [form, setForm] = useState({ type: '', title: '', description: '', priority: 'NORMAL', details: {}, attachments: [] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const type = types?.find((item) => item.key === form.type);

  useEffect(() => {
    if (open) {
      setForm({ type: '', title: '', description: '', priority: 'NORMAL', details: {}, attachments: [] });
      setErrors({});
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.type) next.type = 'Choose a request type.';
    if (form.description.trim().length < 5) next.description = 'Describe your request in a sentence or two.';
    for (const field of type?.fields ?? []) {
      if (field.required && !String(form.details[field.key] ?? '').trim()) next[field.key] = `${field.label} is required.`;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const created = await workflowApi.createRequest(form);
      onCreated(created);
    } catch (error) {
      setErrors({ ...error.fieldErrors, form: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="New request"
      subtitle="Your request goes straight to the Administration operations queue. You will be notified at every step."
      maxWidth="620px"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="new-request" loading={saving}>Submit request</Button></>}
    >
      <Stack component="form" id="new-request" spacing={2} onSubmit={submit} noValidate>
        {errors.form && <Alert severity="error">{errors.form}</Alert>}
        <TextField select label="Request type" required value={form.type} error={Boolean(errors.type)} helperText={errors.type ?? type?.category} onChange={(e) => setForm({ ...form, type: e.target.value, details: {} })}>
          {(types ?? []).map((item) => (
            <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>
          ))}
        </TextField>
        <TextField label="Short title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={type?.label} />
        {(type?.fields ?? []).map((field) => (
          <DynamicField key={field.key} field={field} value={form.details[field.key]} error={errors[field.key]} onChange={(value) => setForm({ ...form, details: { ...form.details, [field.key]: value } })} />
        ))}
        <TextField label="Description" required multiline minRows={4} value={form.description} error={Boolean(errors.description)} helperText={errors.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <TextField select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <MenuItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</MenuItem>)}
        </TextField>
        <FileAttachInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} />
      </Stack>
    </Modal>
  );
}

function RequestDetail({ request, onClose, onChanged }) {
  const { showToast } = useToast();
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReply('');
    setFiles([]);
  }, [request?.id]);
  if (!request) return <Modal isOpen={false} onClose={onClose} />;

  const respond = async () => {
    if (reply.trim().length < 3) return showToast('Add a short reply first.', 'error');
    setBusy(true);
    try {
      onChanged(await workflowApi.respondToRequest(request.id, { message: reply, attachments: files }));
      showToast('Information sent. Your request is back in the queue.');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      onChanged(await workflowApi.cancelRequest(request.id));
      showToast('Request withdrawn.');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const details = Object.entries(request.details ?? {}).filter(([, value]) => value !== null && value !== '' && typeof value !== 'object');

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={request.title}
      subtitle={`${request.reference} · ${request.typeLabel}`}
      maxWidth="640px"
      footer={request.canCancel ? <Button variant="outline" onClick={cancel} loading={busy}>Withdraw request</Button> : null}
    >
      <Stack spacing={2.25}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Badge variant={statusTone(request.status)} dot>{request.statusLabel}</Badge>
          <Badge variant={PRIORITY_TONES[request.priority]}>{request.priority} priority</Badge>
          <Badge variant="neutral">{request.category}</Badge>
        </Stack>
        {request.status === 'NEEDS_INFO' && (
          <Alert severity="warning" icon={<ReportProblemOutlinedIcon />}>
            <strong>Action needed:</strong> {request.decisionNote}
          </Alert>
        )}
        {['APPROVED', 'REJECTED'].includes(request.status) && (
          <Alert severity={request.status === 'APPROVED' ? 'success' : 'info'}>
            {request.status === 'APPROVED' ? 'Approved' : 'Not approved'} by {request.decidedBy ?? 'Administration'} on {formatDateTime(request.decidedAt)}
            {request.decisionNote ? ` — ${request.decisionNote}` : ''}
          </Alert>
        )}
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{request.description}</Typography>
        {details.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
            {details.map(([key, value]) => (
              <Box key={key} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.subtle', border: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">{prettyKey(key)}</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{String(value)}</Typography>
              </Box>
            ))}
          </Box>
        )}
        <AttachmentList files={request.attachments} />
        <Divider />
        <Typography variant="overline" color="text.secondary">Timeline</Typography>
        <RequestTimeline history={request.history} />
        {request.canRespond && (
          <Stack spacing={1.25} sx={{ p: 2, borderRadius: 3, border: 1, borderColor: 'warning.light', bgcolor: 'warning.lighter' }}>
            <Typography variant="subtitle2">Reply to the administrator</Typography>
            <TextField multiline minRows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Provide the requested information…" sx={{ bgcolor: 'background.paper' }} />
            <FileAttachInput value={files} onChange={setFiles} label="Attach document" />
            <Box><Button onClick={respond} loading={busy}>Send information</Button></Box>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

/**
 * My Requests: every request the signed-in student or faculty member has filed —
 * profile petitions, transcript orders, referrals and generic requests — with live
 * status from the shared queue the Administration works.
 */
export const MyRequestsPage = () => {
  const [params, setParams] = useSearchParams();
  const { refreshNotifications } = useNotifications();
  const { showToast } = useToast();
  const { data, loading, error, refetch, setData } = useApiQuery(() => workflowApi.listRequests());
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const requests = data?.requests ?? [];
  const summary = data?.summary ?? {};
  const selected = requests.find((item) => item.id === params.get('request')) ?? null;

  const filtered = useMemo(
    () => requests.filter((item) => (filter === 'all' ? true : filter === 'open' ? OPEN.includes(item.status) : item.status === filter)),
    [requests, filter],
  );

  const replace = (updated) => {
    setData((current) => ({ ...current, requests: current.requests.map((item) => (item.id === updated.id ? updated : item)) }));
    refetch();
    refreshNotifications?.();
  };
  const select = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('request', id);
    else next.delete('request');
    next.delete('new');
    setParams(next, { replace: true });
  };

  return (
    <Box>
      <PageHeader
        eyebrow="Help & Support"
        title="My Requests"
        description="Track everything you have asked the university for — address and name petitions, transcripts, verification letters and more."
        actions={<Button icon={AddRoundedIcon} onClick={() => setCreating(true)}>New request</Button>}
      />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your requests…">
        {() => (
          <Stack spacing={2.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              <StatCard title="Open" value={summary.open ?? 0} icon={HourglassTopRoundedIcon} tone="warning" />
              <StatCard title="Needs your action" value={summary.needsInfo ?? 0} icon={ReportProblemOutlinedIcon} tone="danger" />
              <StatCard title="Approved" value={summary.approved ?? 0} icon={TaskAltRoundedIcon} tone="success" />
              <StatCard title="Total filed" value={summary.total ?? 0} icon={AssignmentIndOutlinedIcon} tone="primary" />
            </Box>
            <WidgetCard title="Request history" subtitle="Select a request to see its timeline" icon={AssignmentIndOutlinedIcon} hoverable={false}>
              <Stack spacing={1.5}>
                <FilterChips ariaLabel="Filter requests" value={filter} onChange={setFilter} options={FILTERS} />
                {filtered.length === 0 ? (
                  <EmptyState compact title="No requests here" description="Requests you submit — and updates from Administration — appear in this list." actionLabel="New request" onActionClick={() => setCreating(true)} />
                ) : (
                  filtered.map((item) => (
                    <ButtonBase
                      key={item.id}
                      onClick={() => select(item.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        width: '100%',
                        textAlign: 'left',
                        p: 1.5,
                        borderRadius: 3,
                        border: 1,
                        borderColor: item.status === 'NEEDS_INFO' ? 'error.light' : 'divider',
                        bgcolor: item.status === 'NEEDS_INFO' ? 'error.lighter' : 'background.subtle',
                        transition: 'transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
                        '&:hover': { transform: 'translateY(-1px)', borderColor: 'primary.light', boxShadow: 1 },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                          <Typography variant="caption" fontWeight={700} color="primary.main">{item.reference}</Typography>
                          <Badge variant={statusTone(item.status)} dot>{item.statusLabel}</Badge>
                          <Typography variant="caption" color="text.secondary">{item.typeLabel}</Typography>
                        </Stack>
                        <Typography variant="subtitle2" noWrap sx={{ mt: 0.25 }}>{item.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Submitted {formatDateTime(item.createdAt)}
                          {item.status === 'NEEDS_INFO' && item.decisionNote ? ` · ${item.decisionNote}` : ''}
                        </Typography>
                      </Box>
                      <ChevronRightRoundedIcon color="action" />
                    </ButtonBase>
                  ))
                )}
              </Stack>
            </WidgetCard>
          </Stack>
        )}
      </DataState>
      <NewRequestDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          showToast(`Request ${created.reference} submitted.`);
          refetch();
          refreshNotifications?.();
          select(created.id);
        }}
      />
      <RequestDetail request={selected} onClose={() => select(null)} onChanged={replace} />
    </Box>
  );
};

export default MyRequestsPage;
