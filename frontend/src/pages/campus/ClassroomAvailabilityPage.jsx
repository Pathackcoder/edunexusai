import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import EventSeatOutlinedIcon from '@mui/icons-material/EventSeatOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DoNotDisturbOnOutlinedIcon from '@mui/icons-material/DoNotDisturbOnOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { StatCard } from '../../components/common/StatCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { FilterChips } from '../../components/common/FilterChips';
import { DataState } from '../../components/common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { campusApi } from '../../services/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;

/** Day timeline for one room: booked blocks over 7am–10pm, with a "now" marker. */
const Timeline = ({ schedule, nowMinutes }) => (
  <Box sx={{ position: 'relative', height: 14, borderRadius: 7, bgcolor: 'success.lighter', overflow: 'hidden' }}>
    {schedule.map((slot) => (
      <Tooltip key={`${slot.title}-${slot.start}`} title={`${slot.start}–${slot.end} · ${slot.title}`}>
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${((slot.startMinutes - DAY_START) / (DAY_END - DAY_START)) * 100}%`, width: `${((slot.endMinutes - slot.startMinutes) / (DAY_END - DAY_START)) * 100}%`, bgcolor: 'warning.main', opacity: 0.75, borderLeft: '2px solid #fff' }} />
      </Tooltip>
    ))}
    <Box sx={{ position: 'absolute', top: -2, bottom: -2, width: 2, bgcolor: 'text.primary', left: `${Math.min(100, Math.max(0, ((nowMinutes - DAY_START) / (DAY_END - DAY_START)) * 100))}%` }} />
  </Box>
);

/** Real-time classroom availability from course meetings + the room-scheduling feed. */
export const ClassroomAvailabilityPage = () => {
  const [params] = useSearchParams();
  const [query, setQuery] = useState({ day: '', time: '', building: params.get('building') ?? 'ALL', minCapacity: '' });
  const [status, setStatus] = useState('ALL');
  const { data, loading, error, refetch } = useApiQuery(
    () => campusApi.getClassrooms({ day: query.day || undefined, time: query.time || undefined, building: query.building, minCapacity: query.minCapacity || undefined }),
    [query.day, query.time, query.building, query.minCapacity],
  );
  const rooms = (data?.rooms ?? []).filter((room) => status === 'ALL' || room.status === status);
  const nowMinutes = data ? Number(data.timeValue.split(':')[0]) * 60 + Number(data.timeValue.split(':')[1]) : 0;

  return (
    <Box>
      <PageHeader eyebrow="Campus" title="Classroom Availability" description="Which rooms are free right now — or at any time you choose — and when they are next booked." actions={<Button variant="outline" icon={RefreshRoundedIcon} onClick={() => { setQuery({ ...query, day: '', time: '' }); refetch(); }}>Now</Button>} />
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField select size="small" label="Day" value={query.day} onChange={(e) => setQuery({ ...query, day: e.target.value })} sx={{ minWidth: 150 }}>
            <MenuItem value="">Today</MenuItem>
            {DAYS.map((day) => <MenuItem key={day} value={day}>{day}</MenuItem>)}
          </TextField>
          <TextField size="small" type="time" label="Time" InputLabelProps={{ shrink: true }} value={query.time} onChange={(e) => setQuery({ ...query, time: e.target.value })} sx={{ minWidth: 140 }} />
          <TextField select size="small" label="Building" value={query.building} onChange={(e) => setQuery({ ...query, building: e.target.value })} sx={{ minWidth: 200 }}>
            <MenuItem value="ALL">All buildings</MenuItem>
            {(data?.buildings ?? []).map((b) => <MenuItem key={b.code} value={b.code}>{b.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Capacity" value={query.minCapacity} onChange={(e) => setQuery({ ...query, minCapacity: e.target.value })} sx={{ minWidth: 140 }}>
            <MenuItem value="">Any size</MenuItem>
            {[10, 30, 50, 100].map((n) => <MenuItem key={n} value={n}>{n}+ seats</MenuItem>)}
          </TextField>
          <FilterChips ariaLabel="Availability" value={status} onChange={setStatus} options={[{ id: 'ALL', label: 'All' }, { id: 'AVAILABLE', label: 'Available' }, { id: 'IN_USE', label: 'In use' }]} />
        </Stack>
        <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Checking rooms…">
          {() => (
            <Stack spacing={2.5}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <StatCard title={data.isNow ? 'Free right now' : `Free · ${data.day} ${data.time}`} value={data.summary.available} icon={CheckCircleRoundedIcon} tone="success" />
                <StatCard title="In use" value={data.summary.inUse} icon={DoNotDisturbOnOutlinedIcon} tone="warning" />
                <StatCard title="Rooms tracked" value={data.summary.total} icon={MeetingRoomOutlinedIcon} tone="primary" />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
                {rooms.map((room) => {
                  const free = room.status === 'AVAILABLE';
                  return (
                    <Stack key={room.id} spacing={1.25} sx={{ p: 2, borderRadius: 4, border: 1, borderColor: free ? 'success.light' : 'warning.light', bgcolor: 'background.paper', transition: 'transform 220ms ease, box-shadow 220ms ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: 3 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <Typography variant="subtitle1" fontWeight={700}>{room.building.code} {room.roomNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">{room.name} · {room.building.name}</Typography>
                        </Box>
                        <Badge variant={free ? 'success' : 'warning'} dot>{free ? 'Available' : 'In use'}</Badge>
                      </Stack>
                      <Typography variant="body2">
                        {free ? <>Free until <strong>{room.availableUntil}</strong></> : <><strong>{room.currentUse.title}</strong> until {room.currentUse.until}</>}
                      </Typography>
                      <Timeline schedule={room.schedule} nowMinutes={nowMinutes} />
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center">
                        <Chip size="small" icon={<EventSeatOutlinedIcon />} label={`${room.capacity} seats`} />
                        <Chip size="small" label={room.roomType} variant="outlined" />
                        {room.features.slice(0, 2).map((feature) => <Chip key={feature} size="small" label={feature} variant="outlined" />)}
                      </Stack>
                    </Stack>
                  );
                })}
              </Box>
              <Typography variant="caption" color="text.secondary">Sources: {data.sources.join(' + ')}. Timeline shows 7 AM – 10 PM; amber blocks are booked.</Typography>
            </Stack>
          )}
        </DataState>
      </Stack>
    </Box>
  );
};

export default ClassroomAvailabilityPage;
