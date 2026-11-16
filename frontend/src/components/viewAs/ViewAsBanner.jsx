import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { onViewAsEvent, viewAsApi, VIEW_AS_READ_ONLY_MESSAGE } from '../../services/api';
import { PERSONA_LABEL, TOP_OFFSET_VAR, viewAsTone } from '../../viewAs/viewAsStyle';

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The View-As band: full viewport width, fixed above the sidebar, header and every page, on every route of the
 * portal shell. It names the person and persona being viewed, says the session is read-only, and ends it.
 *
 * Its measured height is published as --enx-top-offset, which the shell's sticky sidebar and header use, so nothing
 * slides under it at any width (the band wraps to two lines on a phone). Outside View-As it renders nothing and the
 * offset stays 0px, so the normal portal layout is unchanged.
 *
 * It also shows why an action did nothing (every refused action raises the same notice) and checks the session when
 * it is due to expire and when the tab regains focus, so an ended session leaves the portal promptly.
 */
export const ViewAsBanner = () => {
  const { user, viewAs, endViewAs } = useAuth();
  const { showToast } = useToast();
  const ref = useRef(null);
  const [ending, setEnding] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const node = ref.current;
    if (!viewAs || !node) return undefined;
    const apply = () => root.style.setProperty(TOP_OFFSET_VAR, `${node.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty(TOP_OFFSET_VAR);
    };
  }, [viewAs]);

  useEffect(() => {
    if (!viewAs) return undefined;
    let last = 0;
    return onViewAsEvent('blocked', () => {
      if (Date.now() - last < 1500) return;
      last = Date.now();
      showToast(VIEW_AS_READ_ONLY_MESSAGE);
    });
  }, [viewAs, showToast]);

  // The tab title says it too, so a row of tabs never leaves doubt about which one is the View-As tab.
  useEffect(() => {
    if (!viewAs || !user) return undefined;
    const original = document.title;
    const prefix = `View-As: ${user.fullName} · `;
    const apply = () => {
      if (!document.title.startsWith(prefix)) document.title = `${prefix}${document.title.replace(/^View-As: .*? · /, '')}`;
    };
    apply();
    const observer = new window.MutationObserver(apply);
    const titleNode = document.querySelector('title');
    if (titleNode) observer.observe(titleNode, { childList: true });
    return () => {
      observer.disconnect();
      document.title = original.replace(/^View-As: .*? · /, '');
    };
  }, [viewAs, user]);

  // Check the session at its absolute expiry and whenever the tab comes back into focus. These checks do not count as
  // activity on the server, so an unattended tab still times out.
  useEffect(() => {
    if (!viewAs?.expiresAt) return undefined;
    const check = () => viewAsApi.current().catch(() => {});
    const delay = Math.max(0, new Date(viewAs.expiresAt).getTime() - Date.now()) + 1000;
    const timer = setTimeout(check, Math.min(delay, 2 ** 31 - 1));
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
    };
  }, [viewAs?.expiresAt]);

  if (!viewAs || !user) return null;
  const persona = PERSONA_LABEL[viewAs.persona] ?? viewAs.persona;

  return (
    <Box
      ref={ref}
      component="section"
      role="region"
      aria-label="View-As session"
      sx={(theme) => ({
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // Above the sidebar, header, drawers and dialogs: the band is never covered.
        zIndex: theme.zIndex.modal + 10,
        background: viewAsTone.band,
        color: viewAsTone.ink,
        borderBottom: `2px solid ${viewAsTone.edge}`,
        boxShadow: '0 6px 18px -10px rgba(120, 53, 15, 0.55)',
        px: { xs: 1.5, sm: 2.5 },
        py: { xs: 0.875, sm: 0.75 },
      })}
    >
      <Stack direction="row" alignItems="center" spacing={{ xs: 1.25, sm: 2 }} sx={{ maxWidth: '100%' }}>
        <Box aria-hidden sx={{ display: { xs: 'none', sm: 'flex' }, width: 34, height: 34, borderRadius: '50%', bgcolor: 'rgba(31, 19, 0, 0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <VisibilityOutlinedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" columnGap={1.25} rowGap={0.25}>
            <Typography component="p" sx={{ fontWeight: 700, fontSize: { xs: '0.875rem', sm: '0.9375rem' }, lineHeight: 1.3 }}>
              Viewing as <Box component="span" sx={{ fontWeight: 800 }}>{user.fullName}</Box> · {persona}
            </Typography>
            <Box component="span" sx={{ bgcolor: viewAsTone.chip, color: viewAsTone.chipInk, fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.08em', px: 1, py: 0.25, borderRadius: 1, whiteSpace: 'nowrap' }}>
              READ-ONLY MODE
            </Box>
          </Stack>
          <Typography component="p" sx={{ fontSize: '0.8125rem', color: viewAsTone.inkSoft, lineHeight: 1.35, mt: 0.125, display: { xs: 'none', md: 'block' } }}>
            You are viewing this account as an administrator{viewAs.actor?.fullName ? ` (${viewAs.actor.fullName})` : ''}. All user actions are disabled.
            {viewAs.expiresAt ? ` Session ends by ${clock(viewAs.expiresAt)}.` : ''}
          </Typography>
        </Box>
        <Button
          onClick={async () => {
            setEnding(true);
            await endViewAs();
          }}
          disabled={ending}
          variant="contained"
          size="small"
          startIcon={ending ? <CircularProgress size={14} color="inherit" /> : <LogoutRoundedIcon fontSize="small" />}
          sx={{
            flexShrink: 0,
            bgcolor: viewAsTone.ink,
            // The theme paints contained buttons with the brand gradient; this one stays dark on the amber band.
            backgroundImage: 'none',
            color: '#FFFFFF',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            px: { xs: 1.25, sm: 2 },
            boxShadow: 'none',
            '&:hover': { bgcolor: '#3A2600', backgroundImage: 'none', boxShadow: 'none' },
            '&.Mui-disabled': { bgcolor: 'rgba(31, 19, 0, 0.55)', color: '#FFFFFF' },
          }}
        >
          End Impersonation
        </Button>
      </Stack>
    </Box>
  );
};

export default ViewAsBanner;
