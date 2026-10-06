import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import ButtonBase from '@mui/material/ButtonBase';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CoPresentOutlinedIcon from '@mui/icons-material/CoPresentOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { IconTile } from '../../components/common/IconTile';
import { PageHeader } from '../../components/common/PageHeader';
import { MetricLabel } from '../../components/common/Section';
import { DataState } from '../../components/common/DataState';
import { RoleDetailDrawer } from '../../components/admin/RoleDetailDrawer';
import { PERMISSIONS } from './roleAccess';

/**
 * Roles and what each one is permitted to do. The cards summarise each role; selecting
 * one opens the full detail (scope, modules, restrictions and enforcing guards).
 * Permission text lives in ./roleAccess and describes the guards the backend enforces.
 */
const ROLE_PRESENTATION = {
  STUDENT: { icon: SchoolOutlinedIcon, tone: 'info' },
  FACULTY: { icon: CoPresentOutlinedIcon, tone: 'primary' },
  ADMIN: { icon: AdminPanelSettingsOutlinedIcon, tone: 'purple' },
};

export const AdminRolesPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.listRoles());
  const roles = data ?? [];
  const [selected, setSelected] = useState(null);

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
                <Card
                  key={role.id}
                  sx={{
                    position: 'relative',
                    p: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    cursor: 'pointer',
                    transition: 'transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 240ms ease, border-color 240ms ease',
                    '&:hover': { transform: 'translateY(-3px)', borderColor: 'primary.light', boxShadow: '0 18px 36px -22px rgba(70, 81, 222, 0.55)' },
                    '&:hover .role-more svg': { transform: 'translateX(3px)' },
                    '&:has(.role-more:focus-visible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
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

                  {/* Stretched button: the whole card opens the detail, while headings and lists stay outside the button. */}
                  <ButtonBase
                    className="role-more"
                    onClick={() => setSelected({ role, presentation })}
                    aria-haspopup="dialog"
                    aria-label={`View full permissions for ${role.name}`}
                    disableRipple
                    sx={{
                      position: 'static',
                      mt: 'auto',
                      alignSelf: 'flex-start',
                      gap: 0.5,
                      color: 'primary.main',
                      typography: 'body2',
                      fontWeight: 600,
                      borderRadius: '6px',
                      '& svg': { fontSize: 17, transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' },
                      '&::after': { content: '""', position: 'absolute', inset: 0 },
                    }}
                  >
                    View full permissions
                    <ArrowForwardRoundedIcon />
                  </ButtonBase>
                </Card>
              );
            })}
          </Box>

          <RoleDetailDrawer
            open={Boolean(selected)}
            role={selected?.role}
            presentation={selected?.presentation}
            onClose={() => setSelected(null)}
          />
        </Box>
      )}
    </DataState>
  );
};

export default AdminRolesPage;
