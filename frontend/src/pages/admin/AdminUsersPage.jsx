import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Avatar from '@mui/material/Avatar';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { FilterChips } from '../../components/common/FilterChips';
import { useToast } from '../../components/common/Toast';
import { DataState } from '../../components/common/DataState';
import { OnboardPersonDialog } from '../../components/admin/OnboardPersonDialog';
import { PersonSystemsDialog } from '../../components/admin/PersonSystemsDialog';
import { AccountAccessDrawer, ROLE_LABEL } from '../../components/admin/AccountAccessDrawer';

const ROLES = ['STUDENT', 'FACULTY', 'STAFF', 'ALUMNI', 'ADMIN'];
const ROLE_STATUS_HINT = { UNLINKED: 'record missing', SIS_NOT_LINKED: 'SIS link missing' };

/**
 * User management. One row per account, whatever its roles: a faculty member who is also a student
 * appears once, with both roles. Each role badge shows whether its record is linked; Access opens
 * the account's roles, records, links and sign-in identities, where roles are added and removed
 * under the rules (Student/Faculty only by linking the institutional record).
 *
 * Changing a student's tier here is the configurability demonstration: the next dashboard
 * that student loads returns a different widget set, with no code change and no deploy.
 */
export const AdminUsersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const roleFilter = searchParams.get('role') ?? '';
  const [search, setSearch] = useState('');
  const { showToast } = useToast();

  const { data, loading, error, refetch } = useApiQuery(
    () => adminApi.listUsers({ role: roleFilter || undefined, search: search || undefined }),
    [roleFilter, search],
  );
  const { data: tiers } = useApiQuery(() => adminApi.listTiers());

  const users = data ?? [];
  const tierOptions = tiers ?? [];

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [systemsFor, setSystemsFor] = useState(null);
  const [accessFor, setAccessFor] = useState(null);

  const handleTierChange = async (user, tierKey) => {
    try {
      await adminApi.updateUser(user.id, { tierKey });
      showToast(`${user.fullName} moved to the ${tierKey} tier.`);
      refetch();
    } catch (caught) {
      showToast(caught?.message ?? 'The tier could not be changed.');
    }
  };

  const handleStatusToggle = async (user) => {
    const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await adminApi.updateUser(user.id, { status: next });
      showToast(`${user.fullName} is now ${next.toLowerCase()}.`);
      refetch();
    } catch (caught) {
      showToast(caught?.message ?? 'The status could not be changed.');
    }
  };


  return (
    <Box>
      <PageHeader
        title="Users & Roles"
        description="One row per person. Community roles are relationships backed by a record; administrative roles are what the person may manage. Open Access to manage an account's roles, records and sign-in."
        actions={
          <Button variant="primary" size="sm" icon={PersonAddAlt1OutlinedIcon} onClick={() => setIsCreateOpen(true)}>
            Add user
          </Button>
        }
      />

      <Stack spacing={2.5}>
        {/* Filters */}
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} spacing={1.5}>
          <TextField
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputProps={{ 'aria-label': 'Search users' }}
            sx={{ maxWidth: { md: 360 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 19, color: 'grey.400' }} />
                </InputAdornment>
              ),
            }}
          />
          <FilterChips
            ariaLabel="Filter by role"
            value={roleFilter || 'all'}
            onChange={(id) => (id !== 'all' ? setSearchParams({ role: id }) : setSearchParams({}))}
            options={['', ...ROLES].map((role) => ({ id: role || 'all', label: role ? ROLE_LABEL[role] : 'All roles' }))}
          />
        </Stack>

        <DataState
          loading={loading}
          error={error}
          onRetry={refetch}
          loadingLabel="Loading users…"
          isEmpty={users.length === 0}
          emptyTitle="No users match"
          emptyMessage="Adjust the search or role filter."
        >
          {() => (
            <Card>
              <TableContainer sx={{ borderRadius: 0 }}>
                <Table sx={{ minWidth: 820 }}>
                  <TableHead>
                    <TableRow>
                      {['User', 'Roles', 'Identifier', 'Student tier', 'Status', ''].map((heading, index) => (
                        <TableCell key={index} align={index === 5 ? 'right' : 'left'}>{heading}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} hover>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1.5}>
                            <Avatar sx={{ width: 34, height: 34, fontSize: '0.8125rem', bgcolor: 'primary.lighter', color: 'primary.dark' }}>
                              {user.fullName?.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('')}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600}>{user.fullName}</Typography>
                              <Typography variant="caption">{user.email}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
                            {(user.roleDetails ?? user.roles.map((key) => ({ key, category: key === 'ADMIN' ? 'ADMINISTRATIVE' : 'COMMUNITY', status: 'ACTIVE' }))).map((role) => (
                              <Badge
                                key={role.key}
                                variant={role.status !== 'ACTIVE' ? 'warning' : role.category === 'ADMINISTRATIVE' ? 'purple' : role.key === 'FACULTY' ? 'primary' : 'neutral'}
                                dot={role.status !== 'ACTIVE'}
                              >
                                {ROLE_LABEL[role.key] ?? role.key}{role.status !== 'ACTIVE' ? ` · ${ROLE_STATUS_HINT[role.status] ?? role.status.toLowerCase()}` : ''}
                              </Badge>
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {user.studentNumber ?? user.employeeNumber ?? '—'}
                        </TableCell>
                        <TableCell>
                          {user.roles.includes('STUDENT') ? (
                            <TextField
                              select
                              value={user.tier?.key ?? ''}
                              onChange={(e) => handleTierChange(user, e.target.value)}
                              SelectProps={{ native: true }}
                              inputProps={{ 'aria-label': `Student tier for ${user.fullName}` }}
                              sx={{ minWidth: 150, '& .MuiNativeSelect-select': { py: 0.75, fontSize: '0.8125rem' } }}
                            >
                              {tierOptions.map((tier) => (
                                <option key={tier.key} value={tier.key}>{tier.name}</option>
                              ))}
                            </TextField>
                          ) : (
                            <Typography variant="body2" color="text.secondary">n/a</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status === 'ACTIVE' ? 'success' : 'warning'} dot>{user.status}</Badge>
                        </TableCell>
                        <TableCell align="right">
                          <Button variant="ghost" size="sm" onClick={() => setAccessFor(user.id)}>Access</Button>
                          <Button variant="ghost" size="sm" onClick={() => setSystemsFor(user.id)}>Systems</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStatusToggle(user)}
                            sx={user.status === 'ACTIVE' ? { color: 'error.main', '&:hover': { bgcolor: 'error.lighter' } } : { color: 'success.main', '&:hover': { bgcolor: 'success.lighter' } }}
                          >
                            {user.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}
        </DataState>
      </Stack>

      <OnboardPersonDialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} onDone={refetch} tiers={tierOptions} />
      {systemsFor && <PersonSystemsDialog userId={systemsFor} onClose={() => setSystemsFor(null)} />}
      {accessFor && <AccountAccessDrawer userId={accessFor} tiers={tierOptions} onClose={() => setAccessFor(null)} onChanged={refetch} />}
    </Box>
  );
};

export default AdminUsersPage;
