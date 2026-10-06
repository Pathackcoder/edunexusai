import React, { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import MuiButton from '@mui/material/Button';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { DetailDrawer, DrawerSection, DetailList } from '../common/DetailDrawer';
import { IconTile } from '../common/IconTile';
import { heroChipSx } from '../dashboard/HeroBanner';
import { PERMISSIONS, ROLE_DETAILS, roleModules } from '../../pages/admin/roleAccess';

const Bullets = ({ items, icon: Icon, color }) => (
  <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
    {items.map((text) => (
      <Stack component="li" key={text} direction="row" spacing={1} alignItems="flex-start">
        <Icon sx={{ fontSize: 16, color, mt: 0.3, flexShrink: 0 }} />
        <Typography variant="body2" color="text.secondary">{text}</Typography>
      </Stack>
    ))}
  </Stack>
);

/**
 * Full view of one role: description, user count, access scope, permissions, the
 * modules it can reach (from the sidebar's own navigation builder), restrictions and
 * the API guards that enforce them.
 */
export const RoleDetailDrawer = ({ role, presentation, open, onClose }) => {
  const navigate = useNavigate();
  const last = useRef({ role, presentation });
  if (role) last.current = { role, presentation };
  const { role: r, presentation: look } = last.current;
  const modules = useMemo(() => (r ? roleModules(r.key) : []), [r]);
  if (!r) return null;

  const details = ROLE_DETAILS[r.key] ?? {};
  const permissions = [...(PERMISSIONS[r.key] ?? []), ...(details.more ?? [])];
  const moduleCount = modules.reduce((sum, section) => sum + section.items.length, 0);
  const gatedCount = modules.reduce((sum, section) => sum + section.items.filter((item) => item.gated).length, 0);

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      labelId="role-detail-title"
      width={520}
      header={
        <Stack spacing={1.5} sx={{ pr: 4 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {look && <IconTile icon={look.icon} tone={look.tone} size={44} />}
            <Box sx={{ minWidth: 0 }}>
              <Typography id="role-detail-title" variant="h4" component="h2" sx={{ color: '#fff' }}>{r.name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{r.key}</Typography>
            </Box>
          </Stack>
          {r.description && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{r.description}</Typography>}
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
            <Chip size="small" icon={<PeopleAltOutlinedIcon />} label={`${r.userCount} assigned user${r.userCount === 1 ? '' : 's'}`} sx={heroChipSx} />
            <Chip size="small" label={`${moduleCount} pages`} sx={heroChipSx} />
            {gatedCount > 0 && <Chip size="small" label={`${gatedCount} tier-gated`} sx={heroChipSx} />}
          </Stack>
        </Stack>
      }
      footer={
        <>
          {details.tierGated && (
            <MuiButton variant="outlined" startIcon={<TuneRoundedIcon />} onClick={() => navigate('/admin/entitlements')}>
              Widget entitlements
            </MuiButton>
          )}
          <MuiButton variant="contained" startIcon={<PeopleAltOutlinedIcon />} onClick={() => navigate('/admin/users')}>
            Manage users
          </MuiButton>
        </>
      }
    >
      {details.scope && (
        <DrawerSection title="Access scope">
          <Box sx={{ p: 1.75, borderRadius: '14px', bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">{details.scope}</Typography>
          </Box>
        </DrawerSection>
      )}

      <DrawerSection title={`Permissions (${permissions.length})`}>
        <Bullets items={permissions} icon={CheckRoundedIcon} color="success.main" />
      </DrawerSection>

      <DrawerSection
        title="Accessible modules"
        action={gatedCount > 0 && <Chip size="small" label="Tier = requires entitlement" variant="outlined" sx={{ height: 22, fontSize: '0.6875rem' }} />}
      >
        <Stack spacing={1.25}>
          {modules.map((section) => {
            const Icon = section.icon;
            return (
              <Box key={section.id} sx={{ p: 1.5, borderRadius: '14px', bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: section.items.length > 1 ? 1 : 0 }}>
                  {Icon && <Icon sx={{ fontSize: 18, color: 'primary.main' }} />}
                  <Typography variant="subtitle2">{section.label}</Typography>
                </Stack>
                {section.items.length > 1 && (
                  <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
                    {section.items.map((item) => (
                      <Chip
                        key={item.path}
                        size="small"
                        label={item.gated ? `${item.label} · Tier` : item.label}
                        sx={item.gated ? { bgcolor: 'secondary.lighter', color: 'secondary.dark' } : { bgcolor: 'grey.100', color: 'text.secondary' }}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      </DrawerSection>

      {details.restrictions?.length > 0 && (
        <DrawerSection title="Restrictions">
          <Bullets items={details.restrictions} icon={BlockRoundedIcon} color="error.main" />
        </DrawerSection>
      )}

      {details.guards?.length > 0 && (
        <DrawerSection title="Enforced by">
          <DetailList>
            {details.guards.map(({ route, guard }) => (
              <Stack key={route} direction="row" useFlexGap flexWrap="wrap" columnGap={1.5} rowGap={0.5} alignItems="center" sx={{ px: 1.75, py: 1.1 }}>
                <ShieldOutlinedIcon sx={{ fontSize: 17, color: 'primary.main', flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: '1 1 150px', minWidth: 0 }}>{route}</Typography>
                <Box component="code" sx={{ fontSize: '0.75rem', px: 0.75, py: 0.25, borderRadius: '6px', bgcolor: 'grey.100', color: 'text.secondary', whiteSpace: 'nowrap' }}>{guard}</Box>
              </Stack>
            ))}
          </DetailList>
        </DrawerSection>
      )}
    </DetailDrawer>
  );
};

export default RoleDetailDrawer;
