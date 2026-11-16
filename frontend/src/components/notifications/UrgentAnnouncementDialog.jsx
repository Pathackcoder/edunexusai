import React, { useCallback, useEffect, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { IconTile } from '../common/IconTile';
import { notificationApi } from '../../services/api';
import { useChat } from '../../context/ChatContext';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';

const POLL_MS = 60_000;

/**
 * Urgent announcements as a mandatory, centred popup on every portal page.
 *
 * The server keeps one notification per recipient flagged requiresAck; this shows the oldest one still
 * unacknowledged and stays open (no backdrop click, no Escape) until the person presses OK, which records
 * the acknowledgement. Several pending announcements are shown one after another.
 *
 * Delivery: fetched when the portal loads (so someone who was away sees it at their next sign-in), when the
 * realtime connection signals `notifications:urgent` or reconnects, when the tab becomes visible again,
 * and every minute as a fallback when the realtime connection is unavailable.
 *
 * Read-only View-As: the administrator sees the popup exactly as the person would, but OK only closes it in this tab
 * (nothing is acknowledged for the person), and it is loaded once rather than polled.
 */
export function UrgentAnnouncementDialog() {
  const chat = useChat();
  const { refreshNotifications } = useNotifications();
  const { isViewAs } = useAuth();
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const pending = await notificationApi.pendingUrgent();
      setQueue(Array.isArray(pending) ? pending : []);
    } catch {
      /* keep what is shown; the next trigger tries again */
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    if (isViewAs) return undefined;
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, isViewAs]);

  const subscribe = chat?.subscribeRealtime;
  useEffect(() => {
    if (!subscribe) return undefined;
    const offSignal = subscribe('notifications:urgent', load);
    const offConnect = subscribe('connect', load);
    return () => {
      offSignal();
      offConnect();
    };
  }, [subscribe, load]);

  const current = queue[0] ?? null;

  const acknowledge = async () => {
    if (!current) return;
    if (isViewAs) {
      setQueue((items) => items.filter((item) => item.id !== current.id));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await notificationApi.acknowledgeUrgent(current.id);
      setQueue((items) => items.filter((item) => item.id !== current.id));
      refreshNotifications();
    } catch (caught) {
      // A 404 means it no longer applies to this person (e.g. acknowledged in another tab): move on.
      if (caught?.status === 404) setQueue((items) => items.filter((item) => item.id !== current.id));
      else setError('Your acknowledgement could not be saved. Check your connection and press OK again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(current)}
      // Only OK closes it: backdrop clicks and Escape are ignored.
      onClose={() => {}}
      disableEscapeKeyDown
      maxWidth="xs"
      fullWidth
      role="alertdialog"
      aria-labelledby="urgent-announcement-title"
      aria-describedby="urgent-announcement-message"
      PaperProps={{ sx: { borderTop: 4, borderColor: 'error.main', overflow: 'hidden' } }}
    >
      {current && (
        <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <IconTile icon={WarningAmberRoundedIcon} tone="urgent" size={40} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" component="p" sx={{ color: 'error.main', fontWeight: 700, lineHeight: 1.4 }}>
                Urgent announcement{queue.length > 1 ? ` · 1 of ${queue.length}` : ''}
              </Typography>
              <Typography variant="caption" component="p">{current.timestamp}</Typography>
            </Box>
          </Stack>
          <Typography id="urgent-announcement-title" variant="h4" component="h2" sx={{ mb: 1 }}>
            {current.title}
          </Typography>
          <Typography id="urgent-announcement-message" variant="body1" sx={{ color: 'text.secondary', whiteSpace: 'pre-line', fontSize: '0.875rem' }}>
            {current.message}
          </Typography>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          {isViewAs && <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>The person has not acknowledged this yet. In View-As, OK only closes it here; nothing is recorded for them.</Alert>}
          <MuiButton
            variant="contained"
            color="error"
            fullWidth
            autoFocus
            disableFocusRipple
            disabled={busy}
            onClick={acknowledge}
            sx={{ mt: 3, minHeight: 42, fontWeight: 700 }}
          >
            {busy ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : isViewAs ? 'Close (view only)' : 'OK'}
          </MuiButton>
        </Box>
      )}
    </Dialog>
  );
}

export default UrgentAnnouncementDialog;
