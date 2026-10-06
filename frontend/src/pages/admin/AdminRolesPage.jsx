import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CoPresentOutlinedIcon from '@mui/icons-material/CoPresentOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { IconTile } from '../../components/common/IconTile';
import { PageHeader } from '../../components/common/PageHeader';
import { MetricLabel } from '../../components/common/Section';
import { DataState } from '../../components/common/DataState';

/**
 * Roles and what each one is permitted to do.
 *
 * The permission lines below describe the guards the backend actually enforces
 * (requireAuth + requireRole on each router), so this page documents real behaviour
 * rather than an aspirational matrix.
 */
const PERMISSIONS = {
  STUDENT: [
    'Read own courses, schedule, assignments, grades and announcements',
    'Submit assignments and request official transcripts',
    'Make tuition payments and view own financial aid',
    'Manage own profile, preferences and change requests',
  ],
  FACULTY: [
    'Read courses where they are instructor of record',
    'Read the enrolled roster for those courses',
    'Send notifications and post announcements to those courses',
    'No access to another instructor’s roster, and no student financial data',
  ],
  ADMIN: [
    'Manage users, roles and account status',
    'Assign student tiers and configure widget entitlements',
    'Register and configure integrations, run connection tests and syncs',
    'View integration health and sync logs',
  ],
};

const ROLE_PRESENTATION = {
  STUDENT: { icon: SchoolOutlinedIcon, tone: 'info' },
  FACULTY: { icon: CoPresentOutlinedIcon, tone: 'primary' },
  ADMIN: { icon: AdminPanelSettingsOutlinedIcon, tone: 'purple' },
};

export const AdminRolesPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.listRoles());
  const roles = data ?? [];

  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading roles…">
      {() => (
        <Box>
          <PageHeader
            title="Roles & Permissions"
            description="Role-based access control as enforced by the API. Every protected route checks the caller's role before any data is read."
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2.5 }}>
            {roles.map((role) => {
              const presentation = ROLE_PRESENTATION[role.key] ?? { icon: VerifiedUserOutlinedIcon, tone: 'neutral' };
              return (
                <Card key={role.id} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <IconTile icon={presentation.icon} tone={presentation.tone} size={40} />
                      <Typography variant="h5" component="h3">{role.name}</Typography>
                    </Stack>
                    <Chip
                      icon={<PeopleAltOutlinedIcon />}
                      label={role.userCount}
                      sx={{ bgcolor: 'grey.100', color: 'text.secondary', '& .MuiChip-icon': { color: 'text.secondary' } }}
                    />
                  </Stack>

                  <Typography variant="body2" color="text.secondary">{role.description}</Typography>

                  <Box sx={{ pt: 1.75, borderTop: 1, borderColor: 'divider' }}>
                    <MetricLabel sx={{ mb: 1 }}>Permissions</MetricLabel>
                    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                      {(PERMISSIONS[role.key] ?? []).map((permission) => (
                        <Stack component="li" key={permission} direction="row" spacing={1} alignItems="flex-start">
                          <CheckRoundedIcon sx={{ fontSize: 16, color: 'primary.main', mt: 0.25, flexShrink: 0 }} />
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>{permission}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                </Card>
              );
            })}
          </Box>
        </Box>
      )}
    </DataState>
  );
};

export default AdminRolesPage;
