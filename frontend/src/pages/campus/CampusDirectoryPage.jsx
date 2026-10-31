import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Link from '@mui/material/Link';
import Button from '@mui/material/Button';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { Badge } from '../../components/common/Badge';
import { useApiQuery } from '../../hooks/useApiQuery';
import { directoryApi } from '../../services/api';

/**
 * Campus Directory: people in the institution's identity provider (Keycloak), searched and paged by the
 * EdunexusAI backend (GET /campus/directory). The browser never talks to Keycloak. Read-only: account
 * administration stays in Administration > Users & Roles.
 */

const PAGE_SIZE = 20;
const AFFILIATIONS = {
  STUDENT: { label: 'Student', variant: 'primary' },
  FACULTY: { label: 'Faculty', variant: 'purple' },
  STAFF: { label: 'Staff', variant: 'warning' },
  ALUMNI: { label: 'Alumni', variant: 'cyan' },
};

const initials = (person) => [person.firstName, person.lastName].filter(Boolean).map((part) => part[0]).join('').toUpperCase() || '?';

function PersonRow({ person }) {
  const name = person.displayName ?? 'Name not listed';
  return (
    <Card component="li" sx={{ p: 2, display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Avatar aria-hidden="true" sx={{ width: 42, height: 42, bgcolor: 'primary.main', fontSize: '0.95rem', fontWeight: 600, flexShrink: 0 }}>
        {initials(person)}
      </Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle1" component="h3" noWrap sx={{ fontWeight: 600, lineHeight: 1.3, color: person.displayName ? 'text.primary' : 'text.secondary' }}>
          {name}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0, mt: 0.25 }}>
          <MailOutlineRoundedIcon sx={{ fontSize: 15, color: 'grey.400', flexShrink: 0 }} />
          {person.email ? (
            <Link href={`mailto:${person.email}`} underline="hover" variant="caption" noWrap sx={{ color: 'primary.main', fontWeight: 500 }}>
              {person.email}
            </Link>
          ) : (
            <Typography variant="caption" color="text.secondary">No email listed</Typography>
          )}
        </Stack>
      </Box>
      {person.affiliations?.length > 0 && (
        // On a phone the labels take their own line under the name, so several of them never squeeze the email.
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" justifyContent={{ xs: 'flex-start', sm: 'flex-end' }} sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' }, maxWidth: { sm: '45%' }, pl: { xs: '54px', sm: 0 } }}>
          {person.affiliations.filter((key) => AFFILIATIONS[key]).map((key) => (
            <Badge key={key} variant={AFFILIATIONS[key].variant}>{AFFILIATIONS[key].label}</Badge>
          ))}
        </Stack>
      )}
    </Card>
  );
}

export const CampusDirectoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [input, setInput] = useState(query);

  // Search on the server after a short pause in typing; the address keeps the search and page.
  useEffect(() => {
    const term = input.trim();
    if (term === query) return undefined;
    const timer = setTimeout(() => setSearchParams(term ? { q: term } : {}, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps
  // Back/forward (or a link) changed the search: show it in the box.
  useEffect(() => {
    setInput((current) => (current.trim() === query ? current : query));
  }, [query]);

  const { data, loading, error, refetch } = useApiQuery(() => directoryApi.campus({ search: query || undefined, page, pageSize: PAGE_SIZE }), [query, page]);
  const goTo = (next) => setSearchParams({ ...(query ? { q: query } : {}), ...(next > 1 ? { page: String(next) } : {}) });
  const people = data?.people ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Box>
      <PageHeader
        title="Campus Directory"
        description="Find people at your institution by name or email. The list comes from the university's sign-in system."
      />
      <Stack spacing={2.5}>
        <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
          <TextField
            type="search"
            fullWidth
            placeholder="Search by first name, last name or email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputProps={{ 'aria-label': 'Search the campus directory', maxLength: 80 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ color: 'grey.400' }} />
                </InputAdornment>
              ),
              endAdornment: input ? (
                <InputAdornment position="end">
                  <IconButton onClick={() => setInput('')} aria-label="Clear search" size="small" edge="end">
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        </Card>

        <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Searching the campus directory…" minHeight={280}>
          {() => (
            <Stack spacing={1.75}>
              <Typography variant="body2" color="text.secondary" role="status">
                <Box component="strong" sx={{ color: 'text.primary' }}>{data.total}</Box> {data.total === 1 ? 'person' : 'people'}{query ? ` match “${query}”` : ' in the directory'}
              </Typography>

              {people.length > 0 ? (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}>
                  {people.map((person) => <PersonRow key={person.key} person={person} />)}
                </Box>
              ) : (
                <Card sx={{ py: 5, px: 2.5, textAlign: 'center' }}>
                  <GroupsOutlinedIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
                  <Typography variant="subtitle2">{query ? `No one matches “${query}”` : 'No one is listed yet'}</Typography>
                  <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
                    {query ? 'Check the spelling, or search by email instead.' : 'People appear here once they have an account in the university’s sign-in system.'}
                  </Typography>
                </Card>
              )}

              {(page > 1 || data.hasMore) && (
                <Stack component="nav" aria-label="Directory pages" direction="row" alignItems="center" justifyContent="center" spacing={1.5}>
                  <Button size="small" startIcon={<ChevronLeftRoundedIcon />} disabled={page <= 1} onClick={() => goTo(page - 1)}>Previous</Button>
                  <Typography variant="caption">Page {page} of {Math.max(pages, page)}</Typography>
                  <Button size="small" endIcon={<ChevronRightRoundedIcon />} disabled={!data.hasMore} onClick={() => goTo(page + 1)}>Next</Button>
                </Stack>
              )}

              {!data.labels && people.length > 0 && (
                <Typography variant="caption" color="text.secondary">Role labels are not shown: the institution has not mapped its sign-in roles yet.</Typography>
              )}
            </Stack>
          )}
        </DataState>
      </Stack>
    </Box>
  );
};

export default CampusDirectoryPage;
