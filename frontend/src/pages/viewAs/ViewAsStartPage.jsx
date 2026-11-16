import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { InstitutionLogo } from '../../components/brand/Brand';
import { viewAsApi, viewAsStore } from '../../services/api';
import { receiveFromOpener } from '../../viewAs/handoff';
import { viewAsTone } from '../../viewAs/viewAsStyle';

/**
 * The first page of a View-As tab. It receives the session secret from the administrator's tab that opened it
 * (postMessage, same origin, from that exact window), keeps it for this tab only (sessionStorage), checks it with the
 * server, cuts the link back to the opener, and then loads the portal fresh so every part of the shell starts in
 * View-As mode. Opened any other way, it explains where View-As starts.
 */
export const ViewAsStartPage = () => {
  const [state, setState] = useState(() => (window.opener ? 'waiting' : 'orphan'));
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!window.opener) return undefined;
    const stop = receiveFromOpener({
      opener: window.opener,
      origin: window.location.origin,
      win: window,
      onToken: async (token) => {
        setState('checking');
        viewAsStore.set(token);
        try {
          await viewAsApi.current();
          window.opener = null;
          window.location.replace('/dashboard');
        } catch (caught) {
          viewAsStore.clear();
          setMessage(caught?.message ?? 'The View-As session could not be opened.');
          setState('failed');
        }
      },
    });
    const giveUp = setTimeout(() => setState((current) => (current === 'waiting' ? 'orphan' : current)), 25_000);
    return () => {
      stop();
      clearTimeout(giveUp);
    };
  }, []);

  const busy = state === 'waiting' || state === 'checking';
  return (
    <Stack alignItems="center" justifyContent="center" spacing={2.25} sx={{ minHeight: '100vh', px: 2, textAlign: 'center', bgcolor: viewAsTone.surface }}>
      <InstitutionLogo height={48} />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: viewAsTone.edge }}>
        <VisibilityOutlinedIcon aria-hidden="true" />
        <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.12em' }}>Read-only View-As</Typography>
      </Stack>
      {busy && (
        <>
          <Typography variant="h5" component="h1">Opening the portal view…</Typography>
          <LinearProgress sx={{ width: 180, height: 4 }} aria-label="Opening View-As" />
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '48ch' }}>
            You stay signed in as yourself. Nothing you do here is done on the person&apos;s behalf.
          </Typography>
        </>
      )}
      {state === 'failed' && (
        <>
          <Typography variant="h5" component="h1">View-As could not start</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '52ch' }}>{message}</Typography>
          <Button variant="contained" onClick={() => window.close()}>Close this tab</Button>
        </>
      )}
      {state === 'orphan' && (
        <>
          <Typography variant="h5" component="h1">Start View-As from Users &amp; Roles</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '52ch' }}>
            View-As opens in a new tab when an administrator chooses Impersonate on Administration → Access Control → Users.
            This tab was not opened that way, so it has no View-As session.
          </Typography>
          <Button component={RouterLink} to="/admin/users" variant="contained">Go to Users &amp; Roles</Button>
        </>
      )}
    </Stack>
  );
};

export default ViewAsStartPage;
