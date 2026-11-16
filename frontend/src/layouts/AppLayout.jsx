import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChatPanel } from '../components/chat/ChatPanel';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { brand, layout, motion } from '../theme/theme';
import { AssistantLauncher } from '../components/assistant/AssistantLauncher';
import { FloatingDock } from '../components/floating/FloatingDock';
import { InstallPrompt } from '../components/floating/InstallPrompt';
import { UrgentAnnouncementDialog } from '../components/notifications/UrgentAnnouncementDialog';
import { useAuth } from '../context/AuthContext';
import { STUDIO_RAIL_WIDTH, StudioRail } from './StudioRail';
import { rememberReturnPath } from '../pages/studio/studioSession';
import { StudioModeProvider, editableTarget, useStudioMode } from '../pages/studio/studioMode';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { NEXORA_EXIT_MS, NexoraSessionProvider, useNexoraSession } from '../components/nexora/NexoraSession';
import { nexora } from '../components/nexora/nexoraStyle';
import { ViewAsBanner } from '../components/viewAs/ViewAsBanner';
import { topOffset } from '../viewAs/viewAsStyle';

const InPlaceEditor = lazy(() => import('../pages/studio/InPlaceEditor'));

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
 *
 * Studio (administrators): edit mode or /studio/* adds a CMS rail to the left of the sidebar;
 * both stay visible and the main area reflows. In edit mode on an editable route (a Studio
 * page or the Admin/Faculty dashboard) the route's normal view is replaced in place by the
 * editor for that same page; the URL does not change. While an editor is shown the shell is
 * bounded to the viewport, so the canvas and the side panels scroll independently.
 *
 * Nexora: while it opens and while it is shown, the sidebar folds to its icon rail without touching the saved
 * preference (expanding it inside Nexora lasts only until Nexora closes), so closing Nexora returns the sidebar to
 * exactly its previous state. The outgoing view fades out first; see NexoraSession for the route side.
 */
export const AppLayout = () => (
  <StudioModeProvider>
    <NexoraSessionProvider>
      <AppShellInner />
    </NexoraSessionProvider>
  </StudioModeProvider>
);

const AppShellInner = () => {
  const { isAdmin, isStudent, can, isViewAs } = useAuth();
  // Students get the assistant when their tier includes it; faculty always. Not in a read-only View-As tab (it acts).
  const showAssistant = !isAdmin && !isViewAs && (!isStudent || can('feature.assistant'));
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'), { noSsr: true });
  const { pathname, search } = useLocation();
  const { editing, exit } = useStudioMode();
  const inStudio = isAdmin && pathname.startsWith('/studio');
  const showRail = isAdmin && (inStudio || editing);
  const target = editing && !inStudio ? editableTarget(pathname) : null;
  const notEditable = editing && !inStudio && !target;
  const { inNexora, phase: nexoraPhase } = useNexoraSession();
  const fullBleed = Boolean(target) || inNexora || (inStudio && /^\/studio\/dashboards\/[^/]+\/edit$/.test(pathname));
  useEffect(() => {
    if (!pathname.startsWith('/studio')) rememberReturnPath(`${pathname}${search}`);
  }, [pathname, search]);

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [preference, setPreference] = useState(readPreference);
  // The Studio rail opens on the left, so the portal navigation folds to its icon rail while Studio is
  // open. The saved preference is untouched, so the sidebar returns to its previous state afterwards;
  // expanding it again inside Studio still works.
  const [studioFold, setStudioFold] = useState(showRail);
  useEffect(() => setStudioFold(showRail), [showRail]);
  const nexoraFold = !isMobile && ((inNexora && nexoraPhase !== 'closing') || nexoraPhase === 'opening');
  const [nexoraExpanded, setNexoraExpanded] = useState(false);
  useEffect(() => {
    if (!nexoraFold) setNexoraExpanded(false);
  }, [nexoraFold]);
  const collapsed = nexoraFold ? !nexoraExpanded : (studioFold && !isMobile) || (preference ?? !isDesktop);

  // Width changes are animated only after the first paint, so a reload never "springs".
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = useCallback(() => {
    if (nexoraFold) {
      setNexoraExpanded((expanded) => !expanded);
      return;
    }
    setPreference(() => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* preference is a convenience only */
      }
      return next;
    });
    setStudioFold(false);
  }, [collapsed, nexoraFold]);

  // Leaving the mobile layout closes the drawer.
  useEffect(() => {
    if (!isMobile) setIsMobileOpen(false);
  }, [isMobile]);

  const width = collapsed ? layout.sidebarCollapsedWidth : layout.sidebarWidth;
  const spring = collapsed ? motion.sidebarClose : motion.sidebarOpen;

  return (
    // View-As: the band is fixed above everything; the shell starts below it (the offset is 0px outside View-As).
    <Box sx={{ display: 'flex', minHeight: '100vh', pt: topOffset, ...(fullBleed ? { height: '100vh', overflow: 'hidden' } : {}), width: '100%', bgcolor: 'background.default', position: 'relative', isolation: 'isolate', boxSizing: 'border-box' }}>
      {/* Read-only View-As band (renders nothing outside a View-As tab). */}
      <ViewAsBanner />
      {/* Portal usage analytics (renders nothing; silent unless collection is on for this person). */}
      <AnalyticsProvider />
      {/* Portal atmosphere: soft brand light and a faint dot grid behind the content. */}
      <Box
        aria-hidden
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          background: `radial-gradient(60% 50% at 100% 0%, rgba(99, 102, 241, 0.10), transparent 70%), radial-gradient(45% 40% at 20% 100%, rgba(34, 211, 238, 0.07), transparent 70%), radial-gradient(40% 35% at 55% 0%, rgba(168, 85, 247, 0.06), transparent 70%)`,
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            backgroundImage: brand.dots,
            backgroundSize: '24px 24px',
            maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 38%)',
            WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 38%)',
          },
        }}
      />
      {/* Studio CMS rail (tablet & desktop), left of the portal sidebar */}
      {showRail && !isMobile && (
        <Box component="aside" aria-label="Studio tools" sx={{ width: STUDIO_RAIL_WIDTH, flexShrink: 0, position: 'sticky', top: topOffset, height: `calc(100vh - ${topOffset})`, zIndex: theme.zIndex.appBar + 2 }}>
          <StudioRail />
        </Box>
      )}

      {/* Push sidebar (tablet & desktop) */}
      {!isMobile && (
        <Box
          component="aside"
          sx={{
            width,
            flexShrink: 0,
            position: 'sticky',
            top: topOffset,
            height: `calc(100vh - ${topOffset})`,
            zIndex: theme.zIndex.appBar + 1,
            bgcolor: brand.navyDeep,
            boxShadow: '1px 0 0 rgba(20, 24, 80, 0.08), 8px 0 30px -18px rgba(20, 24, 80, 0.35)',
            transition: animate ? `width ${spring.duration}ms ${spring.easing}` : 'none',
            willChange: 'width',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
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
          PaperProps={{ sx: { width: 288, maxWidth: '86vw', border: 0, bgcolor: brand.navyDeep, top: topOffset, height: `calc(100% - ${topOffset})` } }}
        >
          <Sidebar isMobile onCloseMobile={() => setIsMobileOpen(false)} />
        </Drawer>
      )}

      {/* Main area */}
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Header onOpenMobile={() => setIsMobileOpen(true)} showMenuButton={isMobile} />
        <ChatPanel />
        {showRail && isMobile && <StudioRail horizontal />}
        <Box
          component="main"
          sx={fullBleed ? {
            flex: 1,
            width: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          } : {
            flex: 1,
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            mx: 'auto',
            px: { xs: 2, sm: 2.25 },
            pt: 1.5,
            pb: { xs: 4, md: 5 },
          }}
        >
          {!fullBleed && <Breadcrumbs />}
          {notEditable && (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              action={<><MuiButton size="small" component={RouterLink} to="/studio/pages">Studio pages</MuiButton><MuiButton size="small" onClick={exit}>Exit Studio</MuiButton></>}
            >
              Studio is on, but this page can&apos;t be edited: it is built by the application from live data, not from a page-builder layout. Studio edits Studio pages (/pages/…) and the Admin and Faculty dashboards on their own pages.
            </Alert>
          )}
          <ErrorBoundary>
            {/* Entrance motion runs whenever a page's root element mounts, as before. */}
            <Box
              sx={{
                ...(fullBleed ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
                '@keyframes enxPageEnter': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
                '& > *': fullBleed ? { flex: 1, minHeight: 0 } : { animation: `enxPageEnter 280ms ${motion.standard} both` },
                // Leaving for Nexora, or leaving Nexora: the outgoing view fades before the route changes.
                '@keyframes enxNexoraPageOut': { to: { opacity: 0, transform: 'scale(0.985)' } },
                '@keyframes enxNexoraOut': { to: { opacity: 0, transform: 'translateY(8px) scale(0.99)', filter: 'blur(2px)' } },
                ...(nexoraPhase === 'opening' && !inNexora ? { animation: `enxNexoraPageOut ${NEXORA_EXIT_MS.opening}ms ${motion.standard} forwards`, pointerEvents: 'none' } : {}),
                ...(nexoraPhase === 'closing' && inNexora ? { animation: `enxNexoraOut ${NEXORA_EXIT_MS.closing}ms ${nexora.ease} forwards`, pointerEvents: 'none' } : {}),
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              {target ? (
                <Suspense fallback={<Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>}>
                  <InPlaceEditor target={target} />
                </Suspense>
              ) : <Outlet />}
            </Box>
          </ErrorBoundary>
        </Box>
      </Box>
      {/* Urgent announcements: a centred popup on any page until the person presses OK. */}
      <UrgentAnnouncementDialog />
      {/* Bottom-right floating system: install prompt + assistant move as one. */}
      {/* Not inside Nexora, which is itself the assistant workspace. */}
      {!showRail && !inNexora && (
        <FloatingDock>
          {showAssistant && <AssistantLauncher />}
          {!isViewAs && <InstallPrompt />}
        </FloatingDock>
      )}
    </Box>
  );
};

export const AppShell = AppLayout;

export default AppLayout;
