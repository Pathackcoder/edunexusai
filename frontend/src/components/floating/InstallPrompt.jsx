import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MuiButton from '@mui/material/Button';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { usePWA } from '../../context/PWAContext';
import { DarkSurface } from '../common/DarkSurface';
import { brand } from '../../theme/theme';
import { DOCK_EASE, usePresence, useDockLift } from './FloatingDock';

const NEVER_KEY = 'enx.installPrompt.never';
const LATER_KEY = 'enx.installPrompt.later';
const SHOW_AFTER_MS = 2200;

const read = (store, key) => {
  try {
    return store.getItem(key) === '1';
  } catch {
    return false;
  }
};
const write = (store, key) => {
  try {
    store.setItem(key, '1');
  } catch {
    /* private mode: the choice lasts until reload */
  }
};

/**
 * Floating "install the portal" prompt. Uses the existing PWA flow: the browser's
 * native install prompt when available, otherwise the existing step-by-step install
 * modal. "Not now" hides it for this browser session; "Don't show again" persists.
 */
export function InstallPrompt() {
  const { isInstalled, promptInstall } = usePWA();
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(() => read(localStorage, NEVER_KEY) || read(sessionStorage, LATER_KEY));

  useEffect(() => {
    if (isInstalled || dismissed) return undefined;
    const timer = setTimeout(() => setEligible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isInstalled, dismissed]);

  const visible = eligible && !dismissed && !isInstalled;
  const { mounted, shown } = usePresence(visible);
  // Report height only once the prompt is actually in the DOM (presence mounts it a render later).
  const ref = useDockLift(visible && mounted);

  const notNow = () => {
    write(sessionStorage, LATER_KEY);
    setDismissed(true);
  };
  const never = () => {
    write(localStorage, NEVER_KEY);
    setDismissed(true);
  };
  const install = () => {
    write(sessionStorage, LATER_KEY);
    setDismissed(true);
    promptInstall();
  };

  if (!mounted) return null;
  return (
    <Box
      ref={ref}
      role="dialog"
      aria-label="Install the EdunexusAI portal"
      sx={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: { xs: 'calc(100vw - 32px)', sm: 330 },
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translate3d(0, 16px, 0) scale(0.97)',
        transformOrigin: 'bottom right',
        transition: `opacity 260ms ease, transform 520ms ${DOCK_EASE}`,
      }}
    >
      <DarkSurface glow="tr" sx={{ borderRadius: '18px', p: 1.75, boxShadow: '0 24px 48px -18px rgba(20, 24, 80, 0.65)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 8px 18px -10px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <Box sx={{ width: 26, height: 26, overflow: 'hidden' }}>
              <Box component="img" src="/logo.png" alt="" sx={{ height: 26, width: 'auto', maxWidth: 'none', display: 'block' }} />
            </Box>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: '"Rubik", sans-serif', fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.3 }}>Install EdunexusAI</Typography>
            <Typography variant="caption" component="p" sx={{ mt: 0.25, lineHeight: 1.45 }}>
              Open your campus portal from your home screen or dock in one tap.
            </Typography>
          </Box>
          <IconButton size="small" onClick={notNow} aria-label="Not now" sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
          <MuiButton
            size="small"
            variant="contained"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={install}
            sx={{ color: '#fff', backgroundImage: brand.gradient, '&:hover': { backgroundImage: brand.gradientHover } }}
          >
            Add to device
          </MuiButton>
          <MuiButton size="small" onClick={notNow}>Not now</MuiButton>
          <Box sx={{ flex: 1 }} />
          <MuiButton size="small" onClick={never} sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem', px: 0.75 }}>
            Don't show again
          </MuiButton>
        </Stack>
      </DarkSurface>
    </Box>
  );
}

export default InstallPrompt;
