import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { calendarSyncApi } from '../../services/api';

const BRAND = { GOOGLE: { color: '#1A73E8', mark: 'G' }, OUTLOOK: { color: '#0F6CBD', mark: 'O' } };

/**
 * External calendar sync (Google / Outlook). Connection state is stored per user; the
 * provider handshake is simulated until institutional OAuth credentials are configured.
 */
export function CalendarSyncPanel() {
  const { showToast } = useToast();
  const { data, loading, setData } = useApiQuery(() => calendarSyncApi.status());
  const [connecting, setConnecting] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(null);

  const run = async (key, fn, message) => {
    setBusy(key);
    try {
      setData(await fn());
      showToast(message);
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <WidgetCard title="Calendar sync" subtitle={data ? `${data.available.total} portal events available: classes, academic dates, advising and group events` : 'Connect an external calendar'} icon={EventRepeatRoundedIcon} tone="info" hoverable={false}>
        {loading || !data ? (
          <CircularProgress size={22} />
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
            {data.providers.map((provider) => {
              const connected = provider.status === 'CONNECTED';
              return (
                <Stack key={provider.key} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.75, borderRadius: 3, border: 1, borderColor: connected ? 'success.light' : 'divider', bgcolor: connected ? 'success.lighter' : 'background.subtle' }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: BRAND[provider.key].color, color: '#fff', fontWeight: 800 }}>{BRAND[provider.key].mark}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2">{provider.label}</Typography>
                      {connected && <Badge variant="success" dot>Connected</Badge>}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {connected ? `${provider.accountEmail} · ${provider.eventsSynced} events · synced ${provider.lastSyncedLabel}` : 'Not connected'}
                    </Typography>
                  </Box>
                  {connected ? (
                    <Stack direction="row" spacing={0.5}>
                      <Button size="sm" variant="outline" icon={SyncRoundedIcon} loading={busy === `sync-${provider.key}`} onClick={() => run(`sync-${provider.key}`, () => calendarSyncApi.sync(provider.key), 'Calendar synced.')}>Sync</Button>
                      <Button size="sm" variant="ghost" loading={busy === `off-${provider.key}`} onClick={() => run(`off-${provider.key}`, () => calendarSyncApi.disconnect(provider.key), `${provider.label} disconnected.`)}>Disconnect</Button>
                    </Stack>
                  ) : (
                    <Button size="sm" onClick={() => { setConnecting(provider); setEmail(''); }}>Connect</Button>
                  )}
                </Stack>
              );
            })}
          </Box>
        )}
      </WidgetCard>
      <Modal
        isOpen={Boolean(connecting)}
        onClose={() => setConnecting(null)}
        title={`Connect ${connecting?.label ?? ''}`}
        subtitle="Prototype: the provider sign-in is simulated. No calendar password or token is requested or stored."
        footer={<Button icon={CheckCircleRoundedIcon} loading={busy === 'connect'} onClick={() => run('connect', () => calendarSyncApi.connect(connecting.key, email || undefined), `${connecting.label} connected and synced.`).then(() => setConnecting(null))}>Authorize & sync</Button>}
      >
        <Stack spacing={2}>
          <Typography variant="body2">EdunexusAI will add your class meetings, academic dates, advising appointments and group events to this calendar, and keep them updated.</Typography>
          <TextField label="Calendar account email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Stack>
      </Modal>
    </>
  );
}

export default CalendarSyncPanel;
