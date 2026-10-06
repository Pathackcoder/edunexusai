import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import ButtonBase from '@mui/material/ButtonBase';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ManageSearchRoundedIcon from '@mui/icons-material/ManageSearchRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { FilterChips } from '../common/FilterChips';
import { DataState } from '../common/DataState';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminOpsApi } from '../../services/api';
import { RequestTimeline } from '../workflows/RequestTimeline';
import { AttachmentList } from '../workflows/AttachmentList';
import { statusTone, formatDateTime, PRIORITY_TONES } from '../workflows/status';

const prettyKey = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/**
 * Requests queue: every request a student or faculty member files lands here.
 * A decision writes the status, a history row and a notification to the requester —
 * and, for petitions and transcripts, updates the underlying record.
 */
export const AdminApprovalsWidget = ({ onChanged }) => {
  const { showToast } = useToast();
  const [status, setStatus] = useState('OPEN');
  const [role, setRole] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const { data, loading, error, refetch, setData } = useApiQuery(() => adminOpsApi.listRequests({ status, role, search: search || undefined }), [status, role, search]);
  const requests = data?.requests ?? [];
  const summary = data?.summary ?? {};
  const selected = requests.find((item) => item.id === selectedId) ?? null;

  const decide = async (decision) => {
    if (['NEEDS_INFO', 'REJECTED'].includes(decision) && !note.trim()) {
      showToast('Add a note so the requester knows what to do next.', 'error');
      return;
    }
    setBusy(decision);
    try {
      const updated = await adminOpsApi.decideRequest(selected.id, decision, note.trim() || undefined);
      setData((current) => ({ ...current, requests: current.requests.map((item) => (item.id === updated.id ? updated : item)) }));
      showToast(`${updated.reference}: ${updated.statusLabel}. ${updated.requester.name} has been notified.`);
      setNote('');
      if (!['IN_REVIEW'].includes(decision)) setSelectedId(null);
      refetch();
      onChanged?.();
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const open = Boolean(selected) && ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'].includes(selected.status);
  const details = Object.entries(selected?.details ?? {}).filter(([, value]) => value !== null && value !== '' && typeof value !== 'object');

  return (
    <>
      <WidgetCard
        title="Requests & approvals"
        subtitle="Student and faculty requests: profile petitions, transcripts, referrals, facilities and more"
        icon={HowToRegOutlinedIcon}
        tone="warning"
        hoverable={false}
        badge={summary.open ? <Badge variant="warning">{summary.open} open</Badge> : null}
      >
        <Stack spacing={1.75}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
            {[
              ['Pending', summary.pending, 'warning.main'],
              ['In review', summary.inReview, 'info.main'],
              ['Awaiting requester', summary.needsInfo, 'error.main'],
              ['Approved', summary.approved, 'success.main'],
            ].map(([label, value, color]) => (
              <Box key={label} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.subtle', textAlign: 'center', border: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color }}>{value ?? 0}</Typography>
              </Box>
            ))}
          </Box>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ lg: 'center' }} useFlexGap flexWrap="wrap">
            <FilterChips ariaLabel="Request status" value={status} onChange={setStatus} options={[{ id: 'OPEN', label: 'Open' }, { id: 'APPROVED', label: 'Approved' }, { id: 'REJECTED', label: 'Rejected' }, { id: 'ALL', label: 'All' }]} />
            <FilterChips ariaLabel="Requester" value={role} onChange={setRole} options={[{ id: 'ALL', label: 'Everyone' }, { id: 'STUDENT', label: 'Students' }, { id: 'FACULTY', label: 'Faculty' }]} />
            <TextField size="small" placeholder="Search reference, title or name" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240, flex: 1 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} />
          </Stack>
          <DataState loading={loading} error={error} onRetry={refetch} minHeight={140} loadingLabel="Loading requests…">
            {() =>
              requests.length === 0 ? (
                <EmptyState compact title="Queue is clear" description="No requests match these filters." />
              ) : (
                <Stack spacing={1}>
                  {requests.map((item) => (
                    <ButtonBase
                      key={item.id}
                      onClick={() => { setSelectedId(item.id); setNote(''); }}
                      sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle', transition: 'border-color 160ms ease, transform 160ms ease', '&:hover': { borderColor: 'primary.light', transform: 'translateY(-1px)' } }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                        <Typography variant="caption" fontWeight={700} color="primary.main">{item.reference}</Typography>
                        <Badge variant={statusTone(item.status)} dot>{item.statusLabel}</Badge>
                        <Badge variant="purple">{item.category}</Badge>
                        <Badge variant={item.requester.role === 'FACULTY' ? 'info' : 'neutral'}>{item.requester.role === 'FACULTY' ? 'Faculty' : 'Student'}</Badge>
                        {['HIGH', 'URGENT'].includes(item.priority) && <Badge variant={PRIORITY_TONES[item.priority]}>{item.priority}</Badge>}
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{item.timeAgo}</Typography>
                      </Stack>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.typeLabel} · Requested by <strong>{item.requester.name}</strong>
                        {item.requester.studentNumber ? ` (${item.requester.studentNumber})` : ''}
                        {item.attachments.length ? ` · ${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}` : ''}
                      </Typography>
                    </ButtonBase>
                  ))}
                </Stack>
              )
            }
          </DataState>
        </Stack>
      </WidgetCard>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title}
        subtitle={selected ? `${selected.reference} · ${selected.typeLabel} · submitted ${formatDateTime(selected.createdAt)}` : ''}
        maxWidth="700px"
        footer={
          open ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end" sx={{ width: '100%' }}>
              {selected.status !== 'IN_REVIEW' && <Button variant="ghost" icon={ManageSearchRoundedIcon} loading={busy === 'IN_REVIEW'} onClick={() => decide('IN_REVIEW')}>Mark in review</Button>}
              <Button variant="outline" icon={HelpOutlineRoundedIcon} loading={busy === 'NEEDS_INFO'} onClick={() => decide('NEEDS_INFO')}>Request info</Button>
              <Button variant="outline" icon={CloseRoundedIcon} loading={busy === 'REJECTED'} onClick={() => decide('REJECTED')} sx={{ color: 'error.main', borderColor: 'error.light' }}>Reject</Button>
              <Button icon={CheckRoundedIcon} loading={busy === 'APPROVED'} onClick={() => decide('APPROVED')}>Approve</Button>
            </Stack>
          ) : null
        }
      >
        {selected && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Badge variant={statusTone(selected.status)} dot>{selected.statusLabel}</Badge>
              <Badge variant={PRIORITY_TONES[selected.priority]}>{selected.priority} priority</Badge>
              <Badge variant="purple">{selected.category}</Badge>
            </Stack>
            <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
              <Typography variant="subtitle2">{selected.requester.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {selected.requester.role === 'FACULTY' ? 'Faculty' : 'Student'}
                {selected.requester.studentNumber ? ` · ${selected.requester.studentNumber}` : ''}
                {selected.requester.program ? ` · ${selected.requester.program}` : ''} · {selected.requester.email}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selected.description}</Typography>
            {details.length > 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                {details.map(([key, value]) => (
                  <Box key={key} sx={{ p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">{prettyKey(key)}</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{String(value)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            <AttachmentList files={selected.attachments} />
            {selected.sourceType === 'PROFILE_CHANGE' && open && (
              <Alert severity="info">Approving updates the student’s record of truth (address or legal name) immediately.</Alert>
            )}
            <Divider />
            <Typography variant="overline" color="text.secondary">History</Typography>
            <RequestTimeline history={selected.history} />
            {open && (
              <TextField
                label="Note to requester"
                helperText="Required when requesting information or rejecting. Sent with the notification."
                multiline
                minRows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
};

export default AdminApprovalsWidget;
