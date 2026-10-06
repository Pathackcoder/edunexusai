import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { FilterChips } from '../../components/common/FilterChips';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { careerApi } from '../../services/api';

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Student groups & clubs: browse, join/leave, events; officers approve members and post events. */
export const GroupsPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => careerApi.groups());
  const [filter, setFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [eventForm, setEventForm] = useState({ title: '', startsAt: '', location: '', description: '' });
  const groups = (data?.groups ?? []).filter((group) => (filter === 'ALL' ? true : filter === 'MINE' ? group.membership : group.category === filter));
  const selected = (data?.groups ?? []).find((group) => group.id === selectedId) ?? null;

  const act = async (fn, message) => {
    try {
      await fn();
      showToast(message);
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Career & Community" title="Groups & Clubs" description="Find your people — academic societies, technical clubs, community groups and student government." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading groups…">
        {() => (
          <Stack spacing={2.5}>
            <FilterChips ariaLabel="Group filter" value={filter} onChange={setFilter} options={[{ id: 'ALL', label: 'All' }, { id: 'MINE', label: `My groups (${data.myGroups.length})` }, ...data.categories.map((item) => ({ id: item, label: item }))]} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
              {groups.map((group) => (
                <Stack key={group.id} spacing={1.25} onClick={() => setSelectedId(group.id)} sx={{ cursor: 'pointer', p: 2.25, borderRadius: 4, border: 1, borderColor: 'divider', bgcolor: 'background.paper', backgroundImage: `linear-gradient(180deg, ${alpha(group.colorHex ?? '#4651DE', 0.08)} 0%, transparent 90px)`, transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), box-shadow 240ms ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: 3 } }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: group.colorHex, width: 44, height: 44 }}><GroupsOutlinedIcon /></Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>{group.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{group.category} · {group.memberCount} member{group.memberCount === 1 ? '' : 's'}</Typography>
                    </Box>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{group.description}</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {group.membership?.status === 'ACTIVE' && <Badge variant="success" dot>{group.membership.role === 'MEMBER' ? 'Member' : group.membership.role === 'LEAD' ? 'Lead' : 'Officer'}</Badge>}
                    {group.membership?.status === 'PENDING' && <Badge variant="warning" dot>Request pending</Badge>}
                    {!group.isOpen && !group.membership && <Badge variant="neutral">Approval required</Badge>}
                    {group.upcomingEvents[0] && <Badge variant="info">Next: {new Date(group.upcomingEvents[0].startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Badge>}
                  </Stack>
                </Stack>
              ))}
            </Box>
          </Stack>
        )}
      </DataState>
      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.name}
        subtitle={selected ? `${selected.category} · advisor ${selected.advisorName ?? '—'}` : ''}
        maxWidth="640px"
        footer={
          selected &&
          (selected.membership ? (
            <Button variant="outline" onClick={() => act(() => careerApi.leaveGroup(selected.id), selected.membership.status === 'PENDING' ? 'Request withdrawn.' : `You left ${selected.name}.`)}>
              {selected.membership.status === 'PENDING' ? 'Withdraw request' : 'Leave group'}
            </Button>
          ) : (
            <Button icon={PersonAddAltRoundedIcon} onClick={() => act(() => careerApi.joinGroup(selected.id), selected.isOpen ? `Welcome to ${selected.name}!` : 'Request sent to the group officers.')}>
              {selected.isOpen ? 'Join group' : 'Request to join'}
            </Button>
          ))
        }
      >
        {selected && (
          <Stack spacing={2}>
            <Typography>{selected.description}</Typography>
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ color: 'text.secondary' }}>
              <Stack direction="row" spacing={0.5} alignItems="center"><EventOutlinedIcon fontSize="small" /><Typography variant="body2">{selected.meetingInfo}</Typography></Stack>
              <Stack direction="row" spacing={0.5} alignItems="center"><PlaceOutlinedIcon fontSize="small" /><Typography variant="body2">{selected.location}</Typography></Stack>
            </Stack>
            {selected.leaders.length > 0 && <Typography variant="body2">Leaders: {selected.leaders.map((leader) => `${leader.name} (${leader.role.toLowerCase()})`).join(', ')}</Typography>}
            <Divider />
            <Typography variant="overline" color="text.secondary">Upcoming events</Typography>
            {selected.upcomingEvents.length === 0 && <Typography variant="body2" color="text.secondary">No events scheduled.</Typography>}
            {selected.upcomingEvents.map((event) => (
              <Box key={event.id} sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2">{event.title}</Typography>
                <Typography variant="caption" color="text.secondary">{when(event.startsAt)} · {event.location}</Typography>
              </Box>
            ))}
            {selected.canManage && (
              <>
                <Divider />
                <Typography variant="overline" color="text.secondary">Officer tools</Typography>
                {selected.pendingMembers.map((pending) => (
                  <Stack key={pending.membershipId} direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ flex: 1 }}>{pending.name} wants to join</Typography>
                    <Button size="sm" variant="ghost" onClick={() => act(() => careerApi.decideMembership(selected.id, pending.membershipId, false), 'Request declined.')}>Decline</Button>
                    <Button size="sm" onClick={() => act(() => careerApi.decideMembership(selected.id, pending.membershipId, true), 'Member approved.')}>Approve</Button>
                  </Stack>
                ))}
                <Stack spacing={1.25} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'background.subtle' }}>
                  <Typography variant="subtitle2">Post an event (members are notified)</Typography>
                  <TextField size="small" label="Title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField size="small" fullWidth type="datetime-local" label="When" InputLabelProps={{ shrink: true }} value={eventForm.startsAt} onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })} />
                    <TextField size="small" fullWidth label="Location" value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} />
                  </Stack>
                  <Box>
                    <Button size="sm" onClick={() => act(async () => { await careerApi.createGroupEvent(selected.id, { ...eventForm, startsAt: eventForm.startsAt ? new Date(eventForm.startsAt).toISOString() : '' }); setEventForm({ title: '', startsAt: '', location: '', description: '' }); }, 'Event posted.')}>Post event</Button>
                  </Box>
                </Stack>
              </>
            )}
          </Stack>
        )}
      </Modal>
    </Box>
  );
};

export default GroupsPage;
