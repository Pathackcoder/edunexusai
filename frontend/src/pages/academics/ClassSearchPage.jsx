import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Pagination from '@mui/material/Pagination';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { sisApi } from '../../services/api';
import { pretty } from '../../components/sis/sisData';

/** Class search: CampusCore sections with live seats, meetings and instructors (read-only). */
export const ClassSearchPage = () => {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [termId, setTermId] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useApiQuery(() => sisApi.sections({ search: search || undefined, termId: termId || undefined, page, pageSize: 20 }), [search, termId, page]);

  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Class Search" description="Sections from the CampusCore course catalog, with seats, meeting times and instructors." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Course code or title"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setSearch(input.trim()); } }}
          onBlur={() => { setPage(1); setSearch(input.trim()); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
          inputProps={{ 'aria-label': 'Search classes' }}
          sx={{ flex: 1, maxWidth: 420 }}
        />
        <TextField select size="small" label="Term" value={termId || data?.term?.source.id || ''} onChange={(e) => { setPage(1); setTermId(e.target.value); }} sx={{ minWidth: 200 }}>
          {(data?.terms ?? []).map((t) => <MenuItem key={t.source.id} value={t.source.id}>{t.name}{t.registrationOpen ? ' · registration open' : t.isCurrent ? ' · current' : ''}</MenuItem>)}
        </TextField>
      </Stack>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.items?.length} emptyTitle="No sections found" emptyMessage="Try another search or term." loadingLabel="Searching CampusCore…">
        {() => (
          <Stack spacing={1.5}>
            <Typography variant="caption">{data.pagination.total} section(s) · {data.term?.name ?? ''} · CampusCore SIS</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
              {data.items.map((s) => (
                <Card key={s.source.id} sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    <Chip size="small" label={`${s.courseCode}-${s.sectionCode}`} />
                    <Chip size="small" variant="outlined" color={s.status === 'open' ? 'success' : 'default'} label={pretty(s.status)} />
                  </Stack>
                  <Typography variant="subtitle1" component="h3">{s.courseTitle}</Typography>
                  <Typography variant="caption">{s.credits} credits · {s.instructors.join(', ') || 'Instructor not listed'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.meetings.length ? s.meetings.map((m) => `${m.day} ${m.start}–${m.end}${m.location ? ` (${m.location})` : ''}`).join(' · ') : 'No scheduled meetings'}
                  </Typography>
                  <Typography variant="caption">
                    Seats: {s.seats.available ?? '—'} of {s.seats.capacity} available{s.seats.waitlisted ? ` · ${s.seats.waitlisted} waitlisted` : ''}
                  </Typography>
                </Card>
              ))}
            </Box>
            {data.pagination.totalPages > 1 && <Pagination page={page} count={data.pagination.totalPages} onChange={(_e, p) => setPage(p)} sx={{ alignSelf: 'center' }} />}
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default ClassSearchPage;
