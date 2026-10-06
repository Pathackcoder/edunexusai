import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { PageHeader } from '../../components/common/PageHeader';
import { FilterChips } from '../../components/common/FilterChips';
import { useToast } from '../../components/common/Toast';
import { DataState } from '../../components/common/DataState';

const ROLES = ['STUDENT', 'FACULTY', 'ADMIN'];

/**
 * User management.
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
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    roles: ['STUDENT'],
    tierKey: 'STANDARD',
    department: '',
  });

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

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const created = await adminApi.createUser({
        ...form,
        tierKey: form.roles.includes('STUDENT') ? form.tierKey : undefined,
        department: form.department || undefined,
      });
      showToast(`${created.fullName} created.`);
      setIsCreateOpen(false);
      setForm({ email: '', password: '', firstName: '', lastName: '', roles: ['STUDENT'], tierKey: 'STANDARD', department: '' });
      refetch();
    } catch (caught) {
      setFormError(caught);
    } finally {
      setSaving(false);
    }
  };

  const fieldErrors = formError?.fieldErrors ?? {};

  return (
    <Box>
      <PageHeader
        title="Users & Roles"
        description="Accounts for this institution. Role controls which experience a person gets; tier controls which widgets a student sees."
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
            options={['', ...ROLES].map((role) => ({ id: role || 'all', label: role || 'All roles' }))}
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
                            {user.roles.map((role) => (
                              <Badge key={role} variant={role === 'ADMIN' ? 'purple' : role === 'FACULTY' ? 'primary' : 'neutral'}>
                                {role}
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

      {/* Create user */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add a user"
        subtitle="Creating a student also creates their student record"
      >
        <Box component="form" onSubmit={handleCreate}>
          <Stack spacing={2.25}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField id="u-first" label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <TextField id="u-last" label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </Box>

            <TextField
              id="u-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email}
            />

            <TextField
              id="u-pass"
              label="Temporary password"
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password || 'At least 12 characters with upper case, lower case and a number.'}
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Roles</Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2}>
                {ROLES.map((role) => (
                  <FormControlLabel
                    key={role}
                    label={role}
                    control={
                      <Checkbox
                        checked={form.roles.includes(role)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            roles: e.target.checked
                              ? [...form.roles, role]
                              : form.roles.filter((r) => r !== role),
                          })
                        }
                      />
                    }
                    sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.875rem', fontWeight: 500 } }}
                  />
                ))}
              </Stack>
              {fieldErrors.roles && <FormHelperText error>{fieldErrors.roles}</FormHelperText>}
            </Box>

            {form.roles.includes('STUDENT') && (
              <TextField
                id="u-tier"
                select
                label="Student tier"
                value={form.tierKey}
                onChange={(e) => setForm({ ...form, tierKey: e.target.value })}
                SelectProps={{ native: true }}
              >
                {tierOptions.map((tier) => (
                  <option key={tier.key} value={tier.key}>{tier.name}</option>
                ))}
              </TextField>
            )}

            <TextField id="u-dept" label="Department (optional)" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />

            {formError && !Object.keys(fieldErrors).length && (
              <Alert severity="error">{formError.message}</Alert>
            )}

            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm" loading={saving} icon={SaveOutlinedIcon}>Create user</Button>
            </Stack>
          </Stack>
        </Box>
      </Modal>
    </Box>
  );
};

export default AdminUsersPage;
