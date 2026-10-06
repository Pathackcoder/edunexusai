import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import ButtonBase from '@mui/material/ButtonBase';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
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
import { FileAttachInput } from '../../components/workflows/FileAttachInput';
import { AttachmentList } from '../../components/workflows/AttachmentList';
import { statusTone, formatDateTime, PRIORITY_TONES } from '../../components/workflows/status';

const CATEGORIES_FALLBACK = ['IT Access', 'LMS / Canvas', 'Financial Aid', 'Billing', 'Registration', 'Facilities', 'Accessibility', 'Other'];

/** Conversation thread shared with the Admin support queue. */
export function TicketThread({ ticket, staffView = false, onChanged }) {
  const { showToast } = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setReply(''), [ticket?.id]);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      onChanged(await workflowApi.replyToTicket(ticket.id, reply.trim()));
      setReply('');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const messages = [{ id: 'origin', body: ticket.description, author: ticket.requester.name, isStaffReply: false, at: ticket.createdAt }, ...ticket.messages];
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Badge variant={statusTone(ticket.status)} dot>{ticket.statusLabel}</Badge>
        <Badge variant={PRIORITY_TONES[ticket.priority]}>{ticket.priority}</Badge>
        <Badge variant="purple">{ticket.category}</Badge>
        {ticket.assignedTo && <Badge variant="neutral">Assigned: {ticket.assignedTo}</Badge>}
      </Stack>
      {ticket.status === 'AWAITING_USER' && !staffView && <Alert severity="warning">Support is waiting for your reply.</Alert>}
      <AttachmentList files={ticket.attachments} />
      <Stack spacing={1.5} sx={{ maxHeight: 380, overflowY: 'auto', pr: 0.5 }}>
        {messages.map((message) => {
          const mine = staffView ? message.isStaffReply : !message.isStaffReply;
          return (
            <Stack key={message.id} direction={mine ? 'row-reverse' : 'row'} spacing={1} alignItems="flex-end">
              <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: message.isStaffReply ? 'secondary.main' : 'primary.main' }}>
                {message.isStaffReply ? <SupportAgentOutlinedIcon sx={{ fontSize: 16 }} /> : message.author?.charAt(0)}
              </Avatar>
              <Box
                sx={{
                  maxWidth: '78%',
                  px: 1.5,
                  py: 1,
                  borderRadius: 3,
                  bgcolor: mine ? 'primary.lighter' : 'background.subtle',
                  border: 1,
                  borderColor: mine ? 'primary.light' : 'divider',
                }}
              >
                <Typography variant="caption" fontWeight={700}>
                  {message.isStaffReply ? `${message.author} · Support` : message.author}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</Typography>
                <Typography variant="caption" color="text.secondary">{formatDateTime(message.at)}</Typography>
              </Box>
            </Stack>
          );
        })}
      </Stack>
      {ticket.status !== 'CLOSED' && (
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            fullWidth
            multiline
            maxRows={5}
            size="small"
            placeholder={staffView ? 'Reply to the requester…' : 'Add a reply for the support team…'}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button icon={SendRoundedIcon} onClick={send} loading={busy} disabled={!reply.trim()}>Send</Button>
        </Stack>
      )}
    </Stack>
  );
}

function NewTicketDialog({ open, categories, onClose, onCreated }) {
  const [form, setForm] = useState({ category: '', subject: '', description: '', priority: 'NORMAL', attachments: [] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ category: '', subject: '', description: '', priority: 'NORMAL', attachments: [] });
      setErrors({});
    }
  }, [open]);
  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.category) next.category = 'Choose a category.';
    if (form.subject.trim().length < 4) next.subject = 'Subject must be at least 4 characters.';
    if (form.description.trim().length < 10) next.description = 'Describe the issue in at least 10 characters.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      onCreated(await workflowApi.createTicket(form));
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
      title="Open a support ticket"
      subtitle="The help desk team sees your ticket immediately and replies here."
      maxWidth="600px"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="new-ticket" loading={saving}>Submit ticket</Button></>}
    >
      <Stack component="form" id="new-ticket" spacing={2} onSubmit={submit} noValidate>
        {errors.form && <Alert severity="error">{errors.form}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select fullWidth label="Category" required value={form.category} error={Boolean(errors.category)} helperText={errors.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
          </TextField>
          <TextField select fullWidth label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <MenuItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</MenuItem>)}
          </TextField>
        </Stack>
        <TextField label="Subject" required value={form.subject} error={Boolean(errors.subject)} helperText={errors.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        <TextField label="Describe the issue" required multiline minRows={5} value={form.description} error={Boolean(errors.description)} helperText={errors.description ?? 'Include what you tried and any error messages.'} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <FileAttachInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} label="Attach screenshot or file" />
      </Stack>
    </Modal>
  );
}

/** Help desk: students and faculty open tickets and follow the conversation. */
export const SupportTicketsPage = () => {
  const [params, setParams] = useSearchParams();
  const { showToast } = useToast();
  const { refreshNotifications } = useNotifications();
  const { data, loading, error, refetch, setData } = useApiQuery(() => workflowApi.listTickets());
  const [filter, setFilter] = useState('open');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const tickets = data?.tickets ?? [];
  const selected = tickets.find((ticket) => ticket.id === params.get('ticket')) ?? null;
  const visible = tickets.filter((ticket) => (filter === 'all' ? true : filter === 'open' ? ticket.isOpen : !ticket.isOpen));

  const select = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('ticket', id);
    else next.delete('ticket');
    next.delete('new');
    setParams(next, { replace: true });
  };
  const replace = (updated) => setData((current) => ({ ...current, tickets: current.tickets.map((ticket) => (ticket.id === updated.id ? updated : ticket)) }));
  const setStatus = async (status) => {
    try {
      replace(await workflowApi.setTicketStatus(selected.id, status));
      showToast(status === 'RESOLVED' ? 'Marked as resolved. Thanks for letting us know!' : 'Ticket closed.');
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <Box>
      <PageHeader
        eyebrow="Help & Support"
        title="Help Desk"
        description="Report a problem or ask the support team a question. Replies and status changes arrive as notifications."
        actions={<Button icon={AddRoundedIcon} onClick={() => setCreating(true)}>New ticket</Button>}
      />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your tickets…">
        {() => (
          <WidgetCard title="My tickets" subtitle={`${tickets.filter((ticket) => ticket.isOpen).length} open`} icon={SupportAgentOutlinedIcon} hoverable={false}>
            <Stack spacing={1.5}>
              <FilterChips ariaLabel="Filter tickets" value={filter} onChange={setFilter} options={[{ id: 'open', label: 'Open' }, { id: 'closed', label: 'Resolved & closed' }, { id: 'all', label: 'All' }]} />
              {visible.length === 0 ? (
                <EmptyState compact title="No tickets here" description="Need help with access, Canvas, billing or anything else? Open a ticket." actionLabel="New ticket" onActionClick={() => setCreating(true)} />
              ) : (
                visible.map((ticket) => (
                  <ButtonBase
                    key={ticket.id}
                    onClick={() => select(ticket.id)}
                    sx={{ display: 'flex', gap: 1.5, alignItems: 'center', width: '100%', textAlign: 'left', p: 1.5, borderRadius: 3, border: 1, borderColor: ticket.status === 'AWAITING_USER' ? 'error.light' : 'divider', bgcolor: 'background.subtle', transition: 'transform 200ms ease, box-shadow 200ms ease', '&:hover': { transform: 'translateY(-1px)', boxShadow: 1, borderColor: 'primary.light' } }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <Typography variant="caption" fontWeight={700} color="primary.main">{ticket.reference}</Typography>
                        <Badge variant={statusTone(ticket.status)} dot>{ticket.statusLabel}</Badge>
                        <Badge variant="purple">{ticket.category}</Badge>
                      </Stack>
                      <Typography variant="subtitle2" noWrap sx={{ mt: 0.25 }}>{ticket.subject}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Opened {formatDateTime(ticket.createdAt)} · {ticket.messages.length} repl{ticket.messages.length === 1 ? 'y' : 'ies'}
                      </Typography>
                    </Box>
                    <ChevronRightRoundedIcon color="action" />
                  </ButtonBase>
                ))
              )}
            </Stack>
          </WidgetCard>
        )}
      </DataState>
      <NewTicketDialog
        open={creating}
        categories={data?.categories ?? CATEGORIES_FALLBACK}
        onClose={() => setCreating(false)}
        onCreated={(ticket) => {
          setCreating(false);
          showToast(`Ticket ${ticket.reference} submitted.`);
          refetch();
          refreshNotifications?.();
          select(ticket.id);
        }}
      />
      <Modal
        isOpen={Boolean(selected)}
        onClose={() => select(null)}
        title={selected?.subject}
        subtitle={selected ? `${selected.reference} · opened ${formatDateTime(selected.createdAt)}` : ''}
        maxWidth="680px"
        footer={
          selected?.isOpen ? (
            <>
              <Button variant="outline" onClick={() => setStatus('CLOSED')}>Close ticket</Button>
              <Button icon={CheckCircleOutlineRoundedIcon} onClick={() => setStatus('RESOLVED')}>Mark resolved</Button>
            </>
          ) : selected?.status === 'RESOLVED' ? (
            <Button variant="outline" onClick={() => setStatus('CLOSED')}>Close ticket</Button>
          ) : null
        }
      >
        {selected && <TicketThread ticket={selected} onChanged={replace} />}
      </Modal>
    </Box>
  );
};

export default SupportTicketsPage;
