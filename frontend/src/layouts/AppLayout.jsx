import React, { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { layout, motion } from '../theme/theme';
import { AssistantLauncher } from '../components/assistant/AssistantLauncher';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'enx.sidebar.collapsed';

const readPreference = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? null : stored === 'true';
  } catch {
    return null;
  }
};

/**
 * AppShell: Sidebar + MainArea → Header → Breadcrumbs → page content.
 *
 * Desktop and tablet use a push sidebar: it sits in the flex row, so changing its width
 * reflows the main area instead of overlaying it. Tablet defaults to the compact rail.
 * Mobile swaps to a temporary drawer opened from the header.
 */
export const AppLayout = () => {
  const { isAdmin, isStudent, can } = useAuth();
  // Students get the assistant when their tier includes it; faculty always.
  const showAssistant = !isAdmin && (!isStudent || can('feature.assistant'));
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'), { noSsr: true });

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [preference, setPreference] = useState(readPreference);
  const collapsed = preference ?? !isDesktop;

  // Width changes are animated only after the first paint, so a reload never "springs".
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setPreference(() => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* preference is a convenience only */
      }
      return next;
    });
  }, [collapsed]);

  // Leaving the mobile layout closes the drawer.
  useEffect(() => {
    if (!isMobile) setIsMobileOpen(false);
  }, [isMobile]);

  const width = collapsed ? layout.sidebarCollapsedWidth : layout.sidebarWidth;
  const spring = collapsed ? motion.sidebarClose : motion.sidebarOpen;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%', bgcolor: 'background.default' }}>
      {/* Push sidebar (tablet & desktop) */}
      {!isMobile && (
        <Box
          component="aside"
          sx={{
            width,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100vh',
            zIndex: theme.zIndex.appBar + 1,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            transition: animate ? `width ${spring.duration}ms ${spring.easing}` : 'none',
            willChange: 'width',
          }}
        >
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        </Box>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={isMobileOpen}
          onClose={() => setIsMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: 288, maxWidth: '86vw', border: 0 } }}
        >
          <Sidebar isMobile onCloseMobile={() => setIsMobileOpen(false)} />
        </Drawer>
      )}

      {/* Main area */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header onOpenMobile={() => setIsMobileOpen(true)} showMenuButton={isMobile} />
        <Box
          component="main"
          sx={{
            flex: 1,
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            mx: 'auto',
            px: { xs: 2, sm: 2.5, lg: 3 },
            pt: { xs: 2, md: 2.5 },
            pb: { xs: 4, md: 5 },
          }}
        >
          <Breadcrumbs />
          <ErrorBoundary>
            {/* Entrance motion runs whenever a page's root element mounts, as before. */}
            <Box
              sx={{
                '@keyframes enxPageEnter': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
                '& > *': { animation: `enxPageEnter 280ms ${motion.standard} both` },
              }}
            >
              <Outlet />
            </Box>
          </ErrorBoundary>
        </Box>
      </Box>
      {showAssistant && <AssistantLauncher />}
    </Box>
  );
};

export const AppShell = AppLayout;

export default AppLayout;
