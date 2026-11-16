import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Typography from '@mui/material/Typography';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { analyticsApi } from '../../../services/api';
import { FilterChips } from '../../../components/common/FilterChips';
import { Panel } from '../../../components/analytics/parts';
import { DASH, formatDate, formatNumber } from '../../../components/analytics/format.js';
import { ROLE_OPTIONS } from './shared';

const ROLE_NAMES = { STUDENT: 'Student', FACULTY: 'Faculty', STAFF: 'Staff', ALUMNI: 'Alumni', ADMIN: 'Administrator' };
const VIEWS = [{ id: '5', days: 5 }, { id: '15', days: 15 }, { id: '30', days: 30 }, { id: 'never' }];

/**
 * People who have not signed in recently (or never), from their own sign-in records: who an institution may want
 * to follow up with. Students by default. Names and addresses are shown only to administrators holding
 * analytics.view (the server enforces it); synthetic people appear only while demo data is included, marked Demo.
 */
export function InactiveUsersPanel({ timezone, defaultRole = 'STUDENT', refreshKey = 0 }) {
  const [view, setView] = useState('5');
  const [role, setRole] = useState(defaultRole);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [includeSuspended, setIncludeSuspended] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Search as the administrator types, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(typed.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const params = {
    ...(view === 'never' ? { view: 'never' } : { days: view }),
    role: role || undefined,
    search: search || undefined,
    includeSuspended: includeSuspended ? 'true' : undefined,
    page: page + 1,
    pageSize,
  };
  const { data, loading, error } = useApiQuery(() => analyticsApi.inactiveUsers(params), [JSON.stringify(params), refreshKey]);
  const counts = data?.counts;
  const change = (setter) => (value) => { setter(value); setPage(0); };

  return (
    <Panel
      title="Users who haven't logged in"
      subtitle={data?.demoIncluded ? 'From sign-in records · includes demo people, marked Demo' : 'From sign-in records'}
      info="Accounts whose last successful sign-in (password or university sign-in) is older than the period chosen, longest first. A token refresh or an open tab is not a sign-in. Accounts that have never signed in are listed separately. Suspended accounts are left out unless you include them; test and service accounts excluded from analytics are never listed. Works whether or not usage collection is on."
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <FilterChips
          ariaLabel="Not logged in for"
          value={view}
          onChange={change(setView)}
          options={VIEWS.map((option) => ({ id: option.id, label: option.days ? `${option.days}+ days` : 'Never signed in', count: counts ? counts[option.days ?? 'never'] : undefined }))}
        />
        <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center" sx={{ ml: { md: 'auto' } }}>
          <TextField select size="small" label="Role" value={role} onChange={(event) => change(setRole)(event.target.value)} sx={{ width: 150 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Everyone</MenuItem>
            {ROLE_OPTIONS.map((option) => <MenuItem key={option} value={option}>{ROLE_NAMES[option]}s</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder="Search name, email or ID" value={typed} onChange={(event) => setTyped(event.target.value)} inputProps={{ 'aria-label': 'Search people', maxLength: 80 }}
            sx={{ width: { xs: '100%', sm: 240 } }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} />
          <FormControlLabel control={<Checkbox size="small" checked={includeSuspended} onChange={(event) => change(setIncludeSuspended)(event.target.checked)} />} label={<Typography variant="body2">Include suspended</Typography>} sx={{ mr: 0 }} />
        </Stack>
      </Stack>

      {error && !data && <Typography variant="body2" color="error" sx={{ py: 2 }}>The list could not be loaded.</Typography>}
      <TableContainer sx={{ maxHeight: 440, border: 1, borderColor: 'divider', borderRadius: 2, opacity: loading && data ? 0.6 : 1, transition: 'opacity 160ms ease' }}>
        <Table size="small" stickyHeader aria-label="Users who haven't logged in" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              {[['Name'], ['Email', true], ['ID', true], ['Role'], ['Last sign-in'], ['Days since', false, 'right']].map(([label, secondary, align]) => (
                <TableCell key={label} align={align} sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap', bgcolor: 'background.paper', ...(secondary ? { display: { xs: 'none', md: 'table-cell' } } : {}) }}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {!data && !error && Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index}>{Array.from({ length: 6 }, (__, cell) => <TableCell key={cell} sx={cell === 1 || cell === 2 ? { display: { xs: 'none', md: 'table-cell' } } : undefined}><Skeleton variant="text" /></TableCell>)}</TableRow>
            ))}
            {data?.rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.name}</Typography>
                    {row.demo && <Chip size="small" label="Demo" color="secondary" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
                    {row.status !== 'ACTIVE' && <Chip size="small" label={row.status === 'SUSPENDED' ? 'Suspended' : 'Invited'} sx={{ height: 20, fontSize: '0.6875rem' }} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, overflowWrap: 'anywhere' }}>{row.email}</Typography>
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, overflowWrap: 'anywhere' }}>{row.email}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.institutionId ?? DASH}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.roles.map((key) => ROLE_NAMES[key] ?? key).join(', ') || DASH}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.lastLoginAt ? formatDate(row.lastLoginAt, timezone) : 'Never'}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{row.daysSinceLogin == null ? DASH : formatNumber(row.daysSinceLogin)}</TableCell>
              </TableRow>
            ))}
            {data && !data.rows.length && (
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                  {search ? 'Nobody matches this search.' : view === 'never' ? 'Every account has signed in at least once.' : `Everyone ${role ? `with the ${ROLE_NAMES[role].toLowerCase()} role ` : ''}has signed in within the last ${view} days.`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {data && data.total > 0 && (
        <TablePagination component="div" count={data.total} page={Math.min(page, data.pages - 1)} onPageChange={(_, next) => setPage(next)} rowsPerPage={pageSize}
          onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} sx={{ '.MuiTablePagination-toolbar': { px: 0 } }} />
      )}
    </Panel>
  );
}

export default InactiveUsersPanel;
