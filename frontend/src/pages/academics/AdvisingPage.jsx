import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import ButtonBase from '@mui/material/ButtonBase';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import VideoCallOutlinedIcon from '@mui/icons-material/VideoCallOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { advisingApi } from '../../services/api';
import { useNotifications } from '../../context/NotificationContext';

const dayKey = (iso) => new Date(iso).toDateString();
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const longDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/** Slot picker: a row of days, then the times available that day. */
function SlotPicker({ slots, value, onChange }) {
  const days = useMemo(() => [...new Set(slots.map((slot) => dayKey(slot.startsAt)))], [slots]);
  const [day, setDay] = useState(null);
  const activeDay = day ?? days[0];
  if (!slots.length) return <Alert severity="info">No open times right now. Your advisor will publish more availability soon.</Alert>;
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
        {days.map((key) => {
          const date = new Date(key);
          const active = key === activeDay;
          return (
            <ButtonBase key={key} onClick={() => setDay(key)} sx={{ flexShrink: 0, px: 1.75, py: 1, borderRadius: 3, border: 1, borderColor: active ? 'primary.main' : 'divider', bgcolor: active ? 'primary.lighter' : 'background.paper', display: 'block', textAlign: 'center', minWidth: 72 }}>
              <Typography variant="caption" color="text.secondary" display="block">{date.toLocaleDateString(undefined, { weekday: 'short' })}</Typography>
              <Typography variant="subtitle1" fontWeight={700}>{date.getDate()}</Typography>
              <Typography variant="caption" color="text.secondary">{date.toLocaleDateString(undefined, { month: 'short' })}</Typography>
            </ButtonBase>
          );
        })}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1 }}>
        {slots.filter((slot) => dayKey(slot.startsAt) === activeDay).map((slot) => {
          const active = value === slot.id;
          return (
            <ButtonBase key={slot.id} onClick={() => onChange(slot.id)} sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: active ? 'primary.main' : 'divider', bgcolor: active ? 'primary.main' : 'background.subtle', color: active ? '#fff' : 'text.primary', flexDirection: 'column', transition: 'all 160ms ease' }}>
              <Typography variant="subtitle2">{time(slot.startsAt)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>{slot.mode === 'VIRTUAL' ? 'Virtual' : 'In person'}</Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Stack>
  );
}

/** Virtual advising: pick an advisor and a time, book, reschedule or cancel. */
export const AdvisingPage = () => {
  const { showToast } = useToast();
  const { refreshNotifications } = useNotifications();
  const advisors = useApiQuery(() => advisingApi.advisors());
  const appointments = useApiQuery(() => advisingApi.appointments());
  const [advisorId, setAdvisorId] = useState(null);
  const currentAdvisor = advisorId ?? advisors.data?.[0]?.id;
  const slots = useApiQuery(() => (currentAdvisor ? advisingApi.slots(currentAdvisor) : Promise.resolve([])), [currentAdvisor]);
  const [slotId, setSlotId] = useState(null);
  const [form, setForm] = useState({ topic: '', notes: '' });
  const [rescheduling, setRescheduling] = useState(null);
  const [newSlot, setNewSlot] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = () => {
    appointments.refetch();
    slots.refetch();
    advisors.refetch();
    refreshNotifications?.();
  };
  const book = async () => {
    if (!slotId) return showToast('Choose a time first.', 'error');
    if (form.topic.trim().length < 3) return showToast('Add a topic for the meeting.', 'error');
    setBusy(true);
    try {
      await advisingApi.book({ slotId, ...form });
      showToast('Appointment booked. Your advisor has been notified.');
      setSlotId(null);
      setForm({ topic: '', notes: '' });
      refreshAll();
    } catch (caught) {
      showToast(caught.message, 'error');
      slots.refetch();
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (appt) => {
    try {
      await advisingApi.setStatus(appt.id, 'CANCELLED');
      showToast('Appointment cancelled.');
      refreshAll();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };
  const reschedule = async () => {
    setBusy(true);
    try {
      await advisingApi.reschedule(rescheduling.id, newSlot);
      showToast('Appointment moved.');
      setRescheduling(null);
      setNewSlot(null);
      refreshAll();
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const upcoming = appointments.data?.upcoming ?? [];
  const past = appointments.data?.past ?? [];
  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Virtual Advising" description="Book a virtual or in-person meeting with your academic advisor. You and your advisor are both notified of every change." />
      <Stack spacing={2.5}>
        <WidgetCard title="Upcoming appointments" icon={EventAvailableOutlinedIcon} tone="success" hoverable={false}>
          <DataState loading={appointments.loading} error={appointments.error} onRetry={appointments.refetch} minHeight={80}>
            {() =>
              upcoming.length === 0 ? (
                <Typography color="text.secondary">No upcoming appointments. Book one below.</Typography>
              ) : (
                <Stack spacing={1.25}>
                  {upcoming.map((appt) => (
                    <Stack key={appt.id} direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ p: 2, borderRadius: 3, border: 1, borderColor: 'success.light', bgcolor: 'success.lighter' }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700}>{longDate(appt.startsAt)} · {time(appt.startsAt)}–{time(appt.endsAt)}</Typography>
                        <Typography variant="body2">{appt.topic} with <strong>{appt.advisor.name}</strong></Typography>
                        {appt.mode === 'VIRTUAL' ? (
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}><VideoCallOutlinedIcon fontSize="small" color="primary" /><Link href={appt.meetingUrl} target="_blank" rel="noopener noreferrer" variant="body2">{appt.meetingUrl}</Link></Stack>
                        ) : (
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}><PlaceOutlinedIcon fontSize="small" /><Typography variant="body2">{appt.location}</Typography></Stack>
                        )}
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button size="sm" variant="outline" onClick={() => { setRescheduling(appt); setNewSlot(null); }}>Reschedule</Button>
                        <Button size="sm" variant="ghost" onClick={() => cancel(appt)}>Cancel</Button>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )
            }
          </DataState>
        </WidgetCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <WidgetCard title="Advisors" icon={VideoCallOutlinedIcon} tone="purple" hoverable={false}>
            <DataState loading={advisors.loading} error={advisors.error} onRetry={advisors.refetch} minHeight={80}>
              {() => (
                <Stack spacing={1}>
                  {(advisors.data ?? []).map((advisor) => (
                    <ButtonBase key={advisor.id} onClick={() => { setAdvisorId(advisor.id); setSlotId(null); }} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: 3, border: 2, borderColor: currentAdvisor === advisor.id ? 'primary.main' : 'divider', textAlign: 'left', justifyContent: 'flex-start' }}>
                      <Avatar sx={{ bgcolor: 'secondary.main' }}>{advisor.name.charAt(0)}</Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">{advisor.name}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">{advisor.title}</Typography>
                        <Badge variant={advisor.openSlots ? 'success' : 'neutral'}>{advisor.openSlots} open slots</Badge>
                      </Box>
                    </ButtonBase>
                  ))}
                </Stack>
              )}
            </DataState>
          </WidgetCard>
          <WidgetCard title="Book an appointment" subtitle="Times shown in your local time zone" icon={EventAvailableOutlinedIcon} hoverable={false}>
            <Stack spacing={2.5}>
              <DataState loading={slots.loading} error={slots.error} onRetry={slots.refetch} minHeight={100}>
                {() => <SlotPicker slots={slots.data ?? []} value={slotId} onChange={setSlotId} />}
              </DataState>
              <TextField label="Topic" required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Spring course plan, capstone topic" />
              <TextField label="Anything your advisor should know?" multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <Box><Button onClick={book} loading={busy} disabled={!slotId}>Book appointment</Button></Box>
            </Stack>
          </WidgetCard>
        </Box>

        {past.length > 0 && (
          <WidgetCard title="Past & cancelled" icon={HistoryRoundedIcon} tone="neutral" hoverable={false}>
            <Stack spacing={1}>
              {past.map((appt) => (
                <Stack key={appt.id} direction="row" spacing={1} alignItems="center" sx={{ p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{longDate(appt.startsAt)} · {appt.topic} · {appt.advisor.name}</Typography>
                  <Badge variant={appt.status === 'COMPLETED' ? 'success' : 'neutral'}>{appt.status === 'BOOKED' ? 'Past' : appt.status.toLowerCase()}</Badge>
                </Stack>
              ))}
            </Stack>
          </WidgetCard>
        )}
      </Stack>
      <Modal isOpen={Boolean(rescheduling)} onClose={() => setRescheduling(null)} title="Reschedule appointment" subtitle={rescheduling ? `${rescheduling.topic} · currently ${longDate(rescheduling.startsAt)} ${time(rescheduling.startsAt)}` : ''} footer={<Button onClick={reschedule} loading={busy} disabled={!newSlot}>Move appointment</Button>}>
        {rescheduling && <SlotPicker slots={(slots.data ?? []).filter((slot) => slot.advisorId === rescheduling.advisor.id)} value={newSlot} onChange={setNewSlot} />}
      </Modal>
    </Box>
  );
};

export default AdvisingPage;
