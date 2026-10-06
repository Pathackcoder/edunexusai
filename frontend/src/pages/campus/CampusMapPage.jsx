import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import { alpha, useTheme } from '@mui/material/styles';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import DirectionsWalkRoundedIcon from '@mui/icons-material/DirectionsWalkRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { FilterChips } from '../../components/common/FilterChips';
import { DataState } from '../../components/common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { campusApi } from '../../services/api';

const CATEGORY_COLOR = { Academic: '#4651DE', Study: '#7A4FD8', 'Student Life': '#0D9488', Services: '#B26A00' };
const ENTRANCE = { x: 50, y: 96 };

/** Stylised campus map: building positions are stored per tenant; search, filter, walking estimate. */
export const CampusMapPage = () => {
  const theme = useTheme();
  const { data, loading, error, refetch } = useApiQuery(() => campusApi.getMap());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const buildings = data?.buildings ?? [];
  const visible = useMemo(
    () => buildings.filter((b) => (category === 'ALL' || b.category === category) && `${b.name} ${b.code} ${b.amenities.join(' ')} ${b.description}`.toLowerCase().includes(search.toLowerCase())),
    [buildings, category, search],
  );
  const selected = buildings.find((b) => b.id === selectedId) ?? null;
  // Walking estimate from the main gate: map units ≈ 6 m, 80 m/min.
  const walkMinutes = selected ? Math.max(1, Math.round((Math.hypot(selected.x - ENTRANCE.x, selected.y - ENTRANCE.y) * 6) / 80)) : null;

  return (
    <Box>
      <PageHeader eyebrow="Campus" title="Campus Map" description="Find buildings, services and the rooms your classes meet in." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading the campus map…">
        {() => (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 360px' }, gap: 2.5, alignItems: 'start' }}>
            <WidgetCard title="Demo University campus" subtitle="Select a building for details" icon={MapOutlinedIcon} tone="campus" hoverable={false}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
                  <TextField size="small" placeholder="Search buildings, services, amenities…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} />
                  <FilterChips ariaLabel="Building type" value={category} onChange={setCategory} options={[{ id: 'ALL', label: 'All' }, ...data.categories.map((item) => ({ id: item, label: item }))]} />
                </Stack>
                <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', borderRadius: 4, overflow: 'hidden', border: 1, borderColor: 'divider', background: `linear-gradient(160deg, ${alpha('#0D9488', 0.08)}, ${alpha('#4651DE', 0.06)})` }}>
                  <Box component="svg" viewBox="0 0 100 100" preserveAspectRatio="none" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
                    <path d="M50 100 L50 60 L20 60 M50 60 L80 60 M50 60 L50 20 L30 20 M50 20 L75 20 M30 60 L30 25 M78 60 L78 40" stroke={alpha(theme.palette.text.primary, 0.12)} strokeWidth="2.2" fill="none" strokeLinecap="round" />
                    <ellipse cx="44" cy="40" rx="9" ry="6" fill={alpha('#13845A', 0.15)} />
                    {selected && <line x1={ENTRANCE.x} y1={ENTRANCE.y} x2={selected.x} y2={selected.y} stroke={theme.palette.primary.main} strokeWidth="0.8" strokeDasharray="1.5 1.5" />}
                  </Box>
                  <Typography variant="caption" sx={{ position: 'absolute', left: '50%', bottom: 4, transform: 'translateX(-50%)', color: 'text.secondary', fontWeight: 700 }}>Main gate</Typography>
                  {visible.map((b) => {
                    const active = b.id === selectedId;
                    const mine = b.myClasses.length > 0;
                    const color = CATEGORY_COLOR[b.category] ?? theme.palette.grey[600];
                    return (
                      <ButtonBase
                        key={b.id}
                        onClick={() => setSelectedId(b.id)}
                        aria-label={`${b.name}${mine ? ', you have classes here' : ''}`}
                        sx={{
                          position: 'absolute',
                          left: `${b.x}%`,
                          top: `${b.y}%`,
                          transform: `translate(-50%, -50%) scale(${active ? 1.12 : 1})`,
                          px: 1,
                          py: 0.5,
                          borderRadius: 2,
                          bgcolor: active ? color : 'background.paper',
                          color: active ? '#fff' : 'text.primary',
                          border: `2px solid ${color}`,
                          boxShadow: active ? 4 : 1,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          transition: 'all 200ms cubic-bezier(.2,.8,.2,1)',
                          '&:hover': { transform: 'translate(-50%, -50%) scale(1.08)', boxShadow: 3 },
                          '&::after': mine ? { content: '""', position: 'absolute', top: -5, right: -5, width: 10, height: 10, borderRadius: '50%', bgcolor: 'warning.main', border: '2px solid #fff' } : undefined,
                        }}
                      >
                        {b.code}
                      </ButtonBase>
                    );
                  })}
                </Box>
                <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
                  {Object.entries(CATEGORY_COLOR).map(([label, color]) => (
                    <Stack key={label} direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: 1, border: `2px solid ${color}` }} /><Typography variant="caption" color="text.secondary">{label}</Typography></Stack>
                  ))}
                  <Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'warning.main' }} /><Typography variant="caption" color="text.secondary">You have classes here</Typography></Stack>
                </Stack>
              </Stack>
            </WidgetCard>
            <Stack spacing={2}>
              {selected ? (
                <WidgetCard title={selected.name} subtitle={`${selected.code} · ${selected.category}`} icon={PlaceOutlinedIcon} tone="campus" hoverable={false}>
                  <Stack spacing={1.25}>
                    <Typography variant="body2" color="text.secondary">{selected.description}</Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center"><PlaceOutlinedIcon fontSize="small" color="action" /><Typography variant="body2">{selected.address}</Typography></Stack>
                    <Stack direction="row" spacing={0.75} alignItems="center"><ScheduleRoundedIcon fontSize="small" color="action" /><Typography variant="body2">{selected.hours}</Typography></Stack>
                    <Stack direction="row" spacing={0.75} alignItems="center"><DirectionsWalkRoundedIcon fontSize="small" color="primary" /><Typography variant="body2">About {walkMinutes} min walk from the main gate</Typography></Stack>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">{selected.amenities.map((item) => <Chip key={item} size="small" label={item} />)}</Stack>
                    {selected.roomCount > 0 && <Link component={RouterLink} to={`/campus/classrooms?building=${selected.code}`} variant="body2">See {selected.roomCount} bookable rooms →</Link>}
                    {selected.myClasses.map((place) => (
                      <Box key={place.courseCode} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'warning.lighter' }}>
                        <Typography variant="subtitle2">{place.courseCode} · Room {place.room}</Typography>
                        <Typography variant="caption" color="text.secondary">{place.courseName} · {place.when}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </WidgetCard>
              ) : (
                <WidgetCard title="Your classes" icon={PlaceOutlinedIcon} tone="warning" hoverable={false}>
                  <Stack spacing={1}>
                    {data.myPlaces.length === 0 && <Typography color="text.secondary">Select a building on the map.</Typography>}
                    {data.myPlaces.map((place) => (
                      <ButtonBase key={place.courseCode} onClick={() => setSelectedId(place.buildingId)} sx={{ display: 'block', textAlign: 'left', p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                        <Typography variant="subtitle2">{place.courseCode} → {place.buildingCode} {place.room}</Typography>
                        <Typography variant="caption" color="text.secondary">{place.when}</Typography>
                      </ButtonBase>
                    ))}
                  </Stack>
                </WidgetCard>
              )}
              <WidgetCard title="Directory" icon={MapOutlinedIcon} tone="neutral" hoverable={false}>
                <Stack spacing={0.5} sx={{ maxHeight: 320, overflowY: 'auto' }}>
                  {visible.map((b) => (
                    <ButtonBase key={b.id} onClick={() => setSelectedId(b.id)} sx={{ justifyContent: 'space-between', p: 1, borderRadius: 2, bgcolor: b.id === selectedId ? 'primary.lighter' : 'transparent' }}>
                      <Typography variant="body2" fontWeight={600}>{b.name}</Typography>
                      <Badge variant="neutral">{b.code}</Badge>
                    </ButtonBase>
                  ))}
                </Stack>
              </WidgetCard>
            </Stack>
          </Box>
        )}
      </DataState>
    </Box>
  );
};

export default CampusMapPage;
