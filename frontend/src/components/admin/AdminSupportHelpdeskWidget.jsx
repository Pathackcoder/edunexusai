import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { FilterChips } from '../common/FilterChips';
import { DataState } from '../common/DataState';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminOpsApi, workflowApi } from '../../services/api';
import { TicketThread } from '../../pages/help/SupportTicketsPage';
import { statusTone, PRIORITY_TONES } from '../workflows/status';

/** Help desk queue: tickets opened by students and faculty from Help & Support. */
export const AdminSupportHelpdeskWidget = ({ onChanged }) => {
  const { showToast } = useToast();
  const [status, setStatus] = useState('OPEN');
  const [selectedId, setSelectedId] = useState(null);
  const { data, loading, error, refetch, setData } = useApiQuery(() => adminOpsApi.listTickets({ status }), [status]);
  const tickets = data?.tickets ?? [];
  const summary = data?.summary ?? {};
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  const replace = (updated) => {
    setData((current) => ({ ...current, tickets: current.tickets.map((ticket) => (ticket.id === updated.id ? updated : ticket)) }));
    onChanged?.();
  };
  const setTicketStatus = async (next) => {
    try {
      replace(await workflowApi.setTicketStatus(selected.id, next));
      showToast(`${selected.reference} → ${next.replace('_', ' ').toLowerCase()}. ${selected.requester.name} has been notified.`);
      if (['RESOLVED', 'CLOSED'].includes(next)) {
        setSelectedId(null);
        refetch();
      }
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  const metrics = [
    ['Open', summary.open ?? 0, 'text.primary'],
    ['Unassigned', summary.unassigned ?? 0, 'warning.main'],
    ['High priority', summary.highPriority ?? 0, 'error.main'],
    ['Avg resolution', summary.avgResolutionHours != null ? `${summary.avgResolutionHours}h` : '—', 'success.main'],
  ];

  return (
    <>
      <WidgetCard title="Portal support & help desk" subtitle="Tickets opened by students and faculty, with the full conversation" icon={SupportAgentOutlinedIcon} tone="primary" hoverable={false}>
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
            {metrics.map(([label, value, color]) => (
              <Box key={label} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.subtle', textAlign: 'center', border: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color }}>{value}</Typography>
              </Box>
            ))}
          </Box>
          <FilterChips ariaLabel="Ticket status" value={status} onChange={setStatus} options={[{ id: 'OPEN', label: 'Open' }, { id: 'AWAITING_USER', label: 'Awaiting user' }, { id: 'RESOLVED', label: 'Resolved' }, { id: 'ALL', label: 'All' }]} />
          <DataState loading={loading} error={error} onRetry={refetch} minHeight={120} loadingLabel="Loading tickets…">
            {() =>
              tickets.length === 0 ? (
                <EmptyState compact title="No tickets" description="Nothing matches this filter." />
              ) : (
                <Stack spacing={1}>
                  {tickets.map((ticket) => (
                    <ButtonBase
                      key={ticket.id}
                      onClick={() => setSelectedId(ticket.id)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', textAlign: 'left', p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper', transition: 'border-color 160ms ease, transform 160ms ease', '&:hover': { borderColor: 'primary.light', transform: 'translateY(-1px)' } }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{ticket.reference}</Typography>
                          <Badge variant={statusTone(ticket.status)} dot>{ticket.statusLabel}</Badge>
                          <Badge variant={PRIORITY_TONES[ticket.priority]}>{ticket.priority}</Badge>
                          <Badge variant="purple">{ticket.category}</Badge>
                          <Typography variant="caption" color="text.secondary">{ticket.timeAgo}</Typography>
                        </Stack>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.25 }} noWrap>{ticket.subject}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          From: <strong>{ticket.requester.name}</strong> ({ticket.requester.role === 'FACULTY' ? 'Faculty' : 'Student'}) · {ticket.messages.length} message{ticket.messages.length === 1 ? '' : 's'}
                        </Typography>
                      </Box>
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
        title={selected?.subject}
        subtitle={selected ? `${selected.reference} · ${selected.requester.name} · ${selected.requester.email}` : ''}
        maxWidth="720px"
        footer={
          selected && selected.status !== 'CLOSED' ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end" sx={{ width: '100%' }}>
              {selected.status !== 'IN_PROGRESS' && <Button variant="ghost" onClick={() => setTicketStatus('IN_PROGRESS')}>Take ticket</Button>}
              {selected.status !== 'AWAITING_USER' && <Button variant="outline" onClick={() => setTicketStatus('AWAITING_USER')}>Waiting on requester</Button>}
              {selected.status !== 'RESOLVED' && <Button icon={CheckCircleOutlineRoundedIcon} onClick={() => setTicketStatus('RESOLVED')}>Resolve</Button>}
              {selected.status === 'RESOLVED' && <Button variant="outline" onClick={() => setTicketStatus('CLOSED')}>Close</Button>}
            </Stack>
          ) : null
        }
      >
        {selected && <TicketThread ticket={selected} staffView onChanged={replace} />}
      </Modal>
    </>
  );
};

export default AdminSupportHelpdeskWidget;
