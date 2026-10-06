import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

const INITIAL_EVENTS = [
  {
    id: 'ev-1',
    title: 'Fall 2026 University Career Fair & Tech Expo',
    date: 'Oct 14, 2026 · 10:00 AM - 4:00 PM',
    location: 'Student Union Grand Ballroom',
    rsvps: 742,
    capacity: 1000,
    status: 'ACTIVE',
    attention: null,
  },
  {
    id: 'ev-2',
    title: 'Annual Faculty Senate & Academic Research Colloquium',
    date: 'Oct 18, 2026 · 2:00 PM - 5:30 PM',
    location: 'Faculty Hall Auditorium C',
    rsvps: 185,
    capacity: 250,
    status: 'CONFIRMED',
    attention: 'AV setup review pending',
  },
  {
    id: 'ev-3',
    title: 'First-Year Midterm De-Stress & Wellness Fair',
    date: 'Oct 22, 2026 · 11:30 AM - 3:00 PM',
    location: 'Campus Quad Lawn',
    rsvps: 410,
    capacity: 600,
    status: 'ACTIVE',
    attention: null,
  },
];

export const AdminCampusEventsWidget = () => {
  const { showToast } = useToast();
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    date: '',
    location: '',
    capacity: 500,
  });

  const handleCreateEvent = (e) => {
    e.preventDefault();
    if (!form.title || !form.date) return;
    const newEv = {
      id: `ev-${Date.now()}`,
      title: form.title,
      date: form.date,
      location: form.location || 'Campus Center',
      rsvps: 0,
      capacity: Number(form.capacity) || 500,
      status: 'CONFIRMED',
      attention: null,
    };
    setEvents([newEv, ...events]);
    setIsModalOpen(false);
    setForm({ title: '', date: '', location: '', capacity: 500 });
    showToast('Campus event scheduled successfully.');
  };

  return (
    <>
      <WidgetCard
        title="Campus Events & Activities"
        subtitle="Manage institution events, student turnout, and venue logistics"
        icon={EventAvailableOutlinedIcon}
        tone="campus"
        headerAction={
          <Button size="sm" variant="outline" icon={AddRoundedIcon} onClick={() => setIsModalOpen(true)}>
            Schedule Event
          </Button>
        }
      >
        <Stack spacing={1.5}>
          {events.map((ev) => (
            <Box
              key={ev.id}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.subtle',
                transition: 'border-color 160ms ease, box-shadow 160ms ease',
                '&:hover': { borderColor: 'primary.light', boxShadow: 1 },
              }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {ev.title}
                    </Typography>
                    {ev.attention && <Badge variant="warning">{ev.attention}</Badge>}
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.5, color: 'text.secondary' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {ev.date}
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <PlaceOutlinedIcon sx={{ fontSize: 13 }} />
                      <Typography variant="caption">{ev.location}</Typography>
                    </Stack>
                  </Stack>
                </Box>

                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
                    <PeopleOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {ev.rsvps} / {ev.capacity} RSVPs
                    </Typography>
                  </Stack>
                  <Badge variant="teal">{Math.round((ev.rsvps / ev.capacity) * 100)}% Full</Badge>
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
      </WidgetCard>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule University Event"
        subtitle="Publish event to student calendar and RSVP listings"
        footer={
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ width: '100%' }}>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateEvent}>
              Publish Event
            </Button>
          </Stack>
        }
      >
        <Box component="form" onSubmit={handleCreateEvent}>
          <Stack spacing={2}>
            <TextField
              label="Event Title"
              placeholder="e.g. Spring Hackathon & Career Networking Night"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                label="Date & Time"
                placeholder="Oct 28, 2026 · 1:00 PM"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
              <TextField
                label="Location / Hall"
                placeholder="Science Hall Auditorium B"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Box>
            <TextField
              label="Attendee RSVP Capacity"
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Stack>
        </Box>
      </Modal>
    </>
  );
};

export default AdminCampusEventsWidget;
