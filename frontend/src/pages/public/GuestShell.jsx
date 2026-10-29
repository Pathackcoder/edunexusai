import React, { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListSubheader from '@mui/material/ListSubheader';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { GUEST_SECTIONS } from './guestContent';

/**
 * Header, navigation and footer of the public guest site only (/visit and /visit/pages/:slug). It holds
 * its own small UI state (the pages menu and the mobile drawer, each separately); it reads no session
 * and offers no signed-in destination except the existing sign-in page.
 */

export const HEADER_HEIGHT = 64;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Scroll to an in-page section on the landing page; returns false when the section is not on this page. */
export function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  window.history.replaceState(null, '', `/visit#${id}`);
  // Move keyboard focus to the section so screen-reader and keyboard users land there too.
  target.focus({ preventScroll: true });
  return true;
}

function useSectionNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  return (id) => {
    if (location.pathname === '/visit' && scrollToSection(id)) return;
    navigate(`/visit#${id}`);
  };
}

export function GuestShell({ institution, pages = [], children }) {
  const goTo = useSectionNavigation();
  const [pagesAnchor, setPagesAnchor] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const name = institution?.name ?? 'University';
  const pagesMenuOpen = Boolean(pagesAnchor);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflowX: 'clip' }}>
      <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: (t) => t.zIndex.appBar, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ maxWidth: 1200, mx: 'auto', px: 2, minHeight: HEADER_HEIGHT }}>
          <Stack component={RouterLink} to="/visit" direction="row" alignItems="center" spacing={1} sx={{ color: 'text.primary', textDecoration: 'none', minWidth: 0, mr: 'auto' }} aria-label={`${name} visitor home`}>
            <SchoolOutlinedIcon color="primary" />
            <Typography variant="subtitle1" component="span" noWrap sx={{ fontWeight: 700 }}>{name}</Typography>
          </Stack>

          <Stack component="nav" aria-label="Visitor sections" direction="row" spacing={0.25} sx={{ display: { xs: 'none', md: 'flex' } }}>
            {GUEST_SECTIONS.map((s) => (
              <Button key={s.id} size="small" color="inherit" onClick={() => goTo(s.id)} sx={{ fontWeight: 600, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>{s.label}</Button>
            ))}
            {pages.length > 0 && (
              <Button
                size="small"
                color="inherit"
                id="guest-pages-button"
                aria-controls={pagesMenuOpen ? 'guest-pages-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={pagesMenuOpen ? 'true' : undefined}
                endIcon={<ExpandMoreRoundedIcon sx={{ transform: pagesMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
                onClick={(e) => setPagesAnchor(e.currentTarget)}
                sx={{ fontWeight: 600, color: 'text.secondary' }}
              >
                Information
              </Button>
            )}
          </Stack>
          <Menu id="guest-pages-menu" anchorEl={pagesAnchor} open={pagesMenuOpen} onClose={() => setPagesAnchor(null)} MenuListProps={{ 'aria-labelledby': 'guest-pages-button' }}>
            {pages.map((p) => (
              <MenuItem key={p.slug} component={RouterLink} to={`/visit/pages/${p.slug}`} onClick={() => setPagesAnchor(null)} sx={{ maxWidth: 360, whiteSpace: 'normal' }}>
                <ListItemText primary={p.navLabel || p.title} secondary={p.summary || null} />
              </MenuItem>
            ))}
          </Menu>

          <Button component={RouterLink} to="/login" variant="contained" size="small" startIcon={<LoginRoundedIcon />} sx={{ flexShrink: 0 }}>Sign in</Button>
          <IconButton aria-label="Open visitor menu" aria-controls="guest-nav-drawer" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} sx={{ display: { md: 'none' } }}>
            <MenuRoundedIcon />
          </IconButton>
        </Stack>
      </Box>

      <Drawer id="guest-nav-drawer" anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: 'min(320px, 86vw)' } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, minHeight: HEADER_HEIGHT }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Menu</Typography>
          <IconButton aria-label="Close visitor menu" onClick={() => setDrawerOpen(false)}><CloseRoundedIcon /></IconButton>
        </Stack>
        <Divider />
        <List component="nav" aria-label="Visitor sections" subheader={<ListSubheader disableSticky>On this page</ListSubheader>}>
          {GUEST_SECTIONS.map((s) => (
            // Close first, then scroll, so the drawer's focus trap does not pull focus back.
            <ListItemButton key={s.id} onClick={() => { setDrawerOpen(false); setTimeout(() => goTo(s.id), 0); }}>{s.label}</ListItemButton>
          ))}
        </List>
        {pages.length > 0 && (
          <List aria-label="Information pages" subheader={<ListSubheader disableSticky>Information</ListSubheader>}>
            {pages.map((p) => (
              <ListItemButton key={p.slug} component={RouterLink} to={`/visit/pages/${p.slug}`} onClick={() => setDrawerOpen(false)}>{p.navLabel || p.title}</ListItemButton>
            ))}
          </List>
        )}
        <Box sx={{ p: 2, mt: 'auto' }}>
          <Button fullWidth component={RouterLink} to="/login" variant="contained" startIcon={<LoginRoundedIcon />}>Sign in</Button>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flex: 1, width: '100%', maxWidth: 1200, mx: 'auto', px: 2, py: { xs: 2, sm: 3 } }}>{children}</Box>

      <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 4 }} sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 3 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 420 }}>
              Public information for prospective students and visitors. Sections marked “Illustrative” describe the kind of information offered and are not official.
            </Typography>
          </Box>
          <Box component="nav" aria-label="Footer">
            <Typography variant="overline" color="text.secondary">Explore</Typography>
            <Stack spacing={0.5}>
              {GUEST_SECTIONS.map((s) => (
                <Link key={s.id} component="button" type="button" underline="hover" color="text.primary" variant="body2" onClick={() => goTo(s.id)} sx={{ textAlign: 'left' }}>{s.label}</Link>
              ))}
            </Stack>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Members</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 260 }}>Students, faculty, staff and alumni use their own portal.</Typography>
            <Link component={RouterLink} to="/login" underline="hover" variant="body2" sx={{ fontWeight: 600 }}>Sign in</Link>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

export default GuestShell;
