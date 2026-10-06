import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Link from '@mui/material/Link';
import IconButton from '@mui/material/IconButton';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import AddAlarmOutlinedIcon from '@mui/icons-material/AddAlarmOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { advisingApi } from '../../services/api';

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Advisor view: publish availability, see bookings, complete or cancel meetings. */
export const FacultyAdvisingPage = () => {
  const { showToast } = useToast();
  const appts = useApiQuery(() => advisingApi.appointments());
  const slots = useApiQuery(() => advisingApi.mySlots());
  const [form, setForm] = useState({ startsAt: '', durationMinutes: 30, count: 4, mode: 'VIRTUAL', location: '' });
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (!form.startsAt) return showToast('Choose a start date and time.', 'error');
    setBusy(true);
    try {
      const result = await advisingApi.createSlots({ ...form, startsAt: new Date(form.startsAt).toISOString() });
      showToast(`${result.created} slot(s) published.`);
      slots.refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (appt, status) => {
    try {
      await advisingApi.setStatus(appt.id, status);
      showToast(status === 'COMPLETED' ? 'Marked complete.' : 'Cancelled — the student was notified.');
      appts.refetch();
      slots.refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };
  const remove = async (slot) => {
    try {
      await advisingApi.deleteSlot(slot.id);
      slots.refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Teaching workspace" title="Advising" description="Students book these times from Academics → Advising. Virtual meetings get a meeting link automatically." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 2.5, alignItems: 'start' }}>
        <WidgetCard title="Booked appointments" icon={EventAvailableOutlinedIcon} tone="success" hoverable={false}>
          <DataState loading={appts.loading} error={appts.error} onRetry={appts.refetch} minHeight={80}>
            {() => (
              <Stack spacing={1.25}>
                {(appts.data?.upcoming ?? []).length === 0 && <Typography color="text.secondary">No upcoming bookings.</Typography>}
                {(appts.data?.upcoming ?? []).map((appt) => (
                  <Box key={appt.id} sx={{ p: 1.75, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} useFlexGap flexWrap="wrap">
                      <Typography variant="subtitle2">{when(appt.startsAt)}</Typography>
                      <Badge variant={appt.mode === 'VIRTUAL' ? 'info' : 'neutral'}>{appt.mode === 'VIRTUAL' ? 'Virtual' : 'In person'}</Badge>
                    </Stack>
                    <Typography variant="body2"><strong>{appt.student.name}</strong> ({appt.student.studentNumber}) · {appt.topic}</Typography>
                    {appt.notes && <Typography variant="body2" color="text.secondary">“{appt.notes}”</Typography>}
                    {appt.meetingUrl && <Link href={appt.meetingUrl} target="_blank" rel="noopener noreferrer" variant="caption">{appt.meetingUrl}</Link>}
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button size="sm" onClick={() => setStatus(appt, 'COMPLETED')}>Mark complete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(appt, 'CANCELLED')}>Cancel</Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </DataState>
        </WidgetCard>
        <Stack spacing={2.5}>
          <WidgetCard title="Publish availability" icon={AddAlarmOutlinedIcon} tone="purple" hoverable={false}>
            <Stack spacing={1.75}>
              <TextField label="First slot starts" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              <Stack direction="row" spacing={1.5}>
                <TextField select fullWidth label="Length" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}>{[15, 30, 45, 60].map((m) => <MenuItem key={m} value={m}>{m} min</MenuItem>)}</TextField>
                <TextField select fullWidth label="Slots" value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })}>{[1, 2, 3, 4, 6, 8].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}</TextField>
              </Stack>
              <TextField select label="Format" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><MenuItem value="VIRTUAL">Virtual</MenuItem><MenuItem value="IN_PERSON">In person</MenuItem></TextField>
              {form.mode === 'IN_PERSON' && <TextField label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />}
              <Button onClick={publish} loading={busy}>Publish slots</Button>
            </Stack>
          </WidgetCard>
          <WidgetCard title="Your upcoming availability" icon={EventAvailableOutlinedIcon} tone="neutral" hoverable={false}>
            <DataState loading={slots.loading} error={slots.error} onRetry={slots.refetch} minHeight={80}>
              {() => (
                <Stack spacing={0.75} sx={{ maxHeight: 360, overflowY: 'auto' }}>
                  {(slots.data ?? []).map((slot) => (
                    <Stack key={slot.id} direction="row" alignItems="center" spacing={1} sx={{ px: 1.25, py: 0.75, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{when(slot.startsAt)}</Typography>
                      {slot.bookedBy ? <Badge variant="success">{slot.bookedBy}</Badge> : <Badge variant="neutral">Open</Badge>}
                      {!slot.bookedBy && <IconButton size="small" aria-label="Remove slot" onClick={() => remove(slot)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>}
                    </Stack>
                  ))}
                </Stack>
              )}
            </DataState>
          </WidgetCard>
        </Stack>
      </Box>
    </Box>
  );
};

export default FacultyAdvisingPage;
