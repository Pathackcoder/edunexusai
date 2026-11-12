import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { analyticsApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { Badge } from '../../../components/common/Badge';
import { Panel } from '../../../components/analytics/parts';
import { formatDay } from '../../../components/analytics/format.js';

/**
 * Who may open Analytics. Shown only to administrators who have access themselves; they can give or withdraw it
 * for another active administrator (never for themselves). The server enforces these rules and records every
 * change in the audit trail.
 */
export function AccessPanel({ onChanged }) {
  const { user } = useAuth();
  const { data, loading, error, setData } = useApiQuery(() => analyticsApi.listAccess());
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const admins = data ?? [];
  const toggle = async (admin) => {
    setBusy(admin.id);
    setFailure(null);
    try {
      setData(await analyticsApi.setAccess(admin.id, !admin.hasAccess));
      onChanged?.();
    } catch (caught) {
      setFailure(caught?.message ?? 'The change could not be saved.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Who can open Analytics" subtitle="Access is given to named administrators"
      info="Being an administrator is not enough to see analytics: access is granted to a person by name, and ends if they stop being an administrator. Each change is recorded in the audit trail with who made it.">
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>The list of administrators could not be loaded.</Alert>}
      {failure && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setFailure(null)}>{failure}</Alert>}
      {loading && !data ? <Typography variant="body2" color="text.secondary">Loading administrators…</Typography> : (
        <Stack component="ul" divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {admins.map((admin) => {
            const self = admin.id === user?.id;
            return (
              <Stack component="li" key={admin.id} direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ py: 1.25 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="body2" fontWeight={600}>{admin.name}</Typography>
                    {self && <Badge variant="neutral">You</Badge>}
                    {admin.status !== 'ACTIVE' && <Badge variant="warning">{admin.status.toLowerCase()}</Badge>}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap>
                    {admin.email}{admin.hasAccess && admin.grantedAt ? ` · access since ${formatDay(String(admin.grantedAt).slice(0, 10), { year: true })}${admin.grantedBy ? ` (given by ${admin.grantedBy})` : ''}` : ''}
                  </Typography>
                </Box>
                <Switch checked={admin.hasAccess} disabled={self || busy === admin.id || (!admin.hasAccess && admin.status !== 'ACTIVE')} onChange={() => toggle(admin)} inputProps={{ 'aria-label': `${admin.hasAccess ? 'Withdraw' : 'Give'} analytics access: ${admin.name}` }} />
              </Stack>
            );
          })}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>You cannot change your own access; another administrator does that.</Typography>
    </Panel>
  );
}

export default AccessPanel;
