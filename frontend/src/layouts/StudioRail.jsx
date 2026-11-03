import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import PermMediaOutlinedIcon from '@mui/icons-material/PermMediaOutlined';
import DynamicFormOutlinedIcon from '@mui/icons-material/DynamicFormOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import { returnPath } from '../pages/studio/studioSession';
import { editableTarget, useStudioMode } from '../pages/studio/studioMode';

/**
 * Studio's CMS rail. Shown to administrators in Studio edit mode, to the left of the portal's
 * own sidebar (which stays in place). "Design" is the page being edited (or resumes the last
 * one); "Exit Studio" leaves edit mode and keeps the current page.
 */
export const STUDIO_RAIL_WIDTH = 84;
const PANEL_WIDTH = 300;

// The Add page dialog renders live block previews (the page-builder library), so it loads on demand.
const AddPageDialog = lazy(() => import('../pages/studio/AddPageDialog').then((m) => ({ default: m.AddPageDialog })));

const ITEMS = [
  { to: '/studio', label: 'Design', icon: DesignServicesOutlinedIcon, match: (p) => p === '/studio' || p === '/studio/start' || /\/edit$/.test(p) || p.startsWith('/studio/preview') || Boolean(editableTarget(p)) },
  { to: '/studio/pages', label: 'Sites & Pages', icon: AutoStoriesOutlinedIcon, match: (p) => p === '/studio/pages', panel: 'sites' },
  { to: '/studio/dashboards', label: 'Widgets', icon: WidgetsOutlinedIcon, match: (p) => p === '/studio/dashboards' },
  { to: '/studio/news', label: 'News', icon: CampaignOutlinedIcon },
  { to: '/studio/faqs', label: 'Help articles', icon: HelpOutlineRoundedIcon },
  { to: '/studio/forms', label: 'Forms', icon: DynamicFormOutlinedIcon, match: (p) => p.startsWith('/studio/forms') },
  { to: '/studio/media', label: 'Media', icon: PermMediaOutlinedIcon },
  { to: '/studio/overview', label: 'Activity', icon: InsightsOutlinedIcon },
  { to: '/studio/settings', label: 'Settings', icon: SettingsOutlinedIcon },
];

function RailItem({ item, active, horizontal, onToggle, expanded, buttonRef }) {
  const Icon = item.icon;
  const link = item.panel ? { onClick: onToggle, 'aria-expanded': expanded, 'aria-haspopup': 'true', ref: buttonRef } : { component: NavLink, to: item.to, end: true };
  return (
    <Tooltip title={item.label} placement="right" disableHoverListener={!horizontal}>
      <ButtonBase
        {...link}
        aria-current={active && !item.panel ? 'page' : undefined}
        sx={{
          flexDirection: 'column',
          gap: 0.4,
          width: horizontal ? 76 : '100%',
          flexShrink: 0,
          py: 1,
          px: 0.5,
          minHeight: 58,
          borderRadius: 2,
          color: active ? 'primary.main' : 'text.secondary',
          bgcolor: active ? 'primary.lighter' : 'transparent',
          '&:hover': { bgcolor: active ? 'primary.lighter' : 'action.hover', color: 'primary.main' },
          '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
        }}
      >
        <Icon fontSize="small" />
        <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.2, textAlign: 'center', color: 'inherit' }}>{item.label}</Typography>
      </ButtonBase>
    </Tooltip>
  );
}

/** "Sites & Pages" panel: opens beside the rail, over the edge of the portal sidebar. */
function SitesPanel({ open, onClose, onCreate, onTemplates, anchorRef, horizontal }) {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    panelRef.current?.querySelector('[data-first]')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  const options = [
    { label: 'Create Page', hint: 'Start from a template or a blank layout', icon: AddCircleOutlineRoundedIcon, action: onCreate },
    { label: 'Manage Pages', hint: 'Edit, preview, publish or remove pages', icon: ListAltRoundedIcon, action: () => { onClose(); navigate('/studio/pages'); } },
    { label: 'View Templates', hint: 'Browse the page templates and layouts', icon: DashboardCustomizeOutlinedIcon, action: onTemplates },
  ];
  return (
    <Box
      ref={panelRef}
      role="dialog"
      aria-label="Sites & Pages"
      sx={(theme) => ({
        position: 'fixed',
        top: horizontal ? 'auto' : 0,
        left: horizontal ? 0 : STUDIO_RAIL_WIDTH,
        bottom: 0,
        height: horizontal ? 'auto' : '100vh',
        width: { xs: '100vw', sm: PANEL_WIDTH },
        maxWidth: '100vw',
        zIndex: theme.zIndex.appBar + 3,
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        boxShadow: '12px 0 32px -18px rgba(20, 24, 80, 0.45)',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      <Stack direction="row" alignItems="center" sx={{ pl: 2.5, pr: 1, height: 58, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="subtitle1" component="h2" sx={{ flex: 1, fontWeight: 700 }}>Sites &amp; Pages</Typography>
        <IconButton size="small" aria-label="Close Sites & Pages" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
      </Stack>
      <Stack component="nav" sx={{ p: 1.25 }} spacing={0.5} divider={<Divider flexItem sx={{ mx: 1 }} />}>
        {options.map((o, i) => (
          <ButtonBase
            key={o.label}
            data-first={i === 0 ? '' : undefined}
            onClick={o.action}
            sx={{ justifyContent: 'flex-start', gap: 1.5, px: 1.5, py: 1.25, borderRadius: 2, textAlign: 'left', color: 'text.primary', '&:hover': { bgcolor: 'primary.lighter', color: 'primary.main' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}
          >
            <o.icon sx={{ color: 'primary.main' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'inherit' }}>{o.label}</Typography>
              <Typography variant="caption" color="text.secondary" component="div">{o.hint}</Typography>
            </Box>
            <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
          </ButtonBase>
        ))}
      </Stack>
    </Box>
  );
}

export function StudioRail({ horizontal = false }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const studioMode = useStudioMode();
  const leave = () => {
    if (!studioMode.exit()) return;
    if (pathname.startsWith('/studio')) navigate(returnPath());
  };
  const [panel, setPanel] = useState(null);
  const [dialog, setDialog] = useState(null); // null | 'templates'
  const sitesButton = useRef(null);
  const closePanel = React.useCallback(() => setPanel(null), []);
  useEffect(() => { setPanel(null); }, [pathname]);
  const isActive = (item) => (item.panel && panel === item.panel) || (item.match ? item.match(pathname) : pathname === item.to);
  const railItem = (item) => (
    <RailItem
      key={item.to}
      item={item}
      active={isActive(item)}
      horizontal={horizontal}
      expanded={item.panel ? panel === item.panel : undefined}
      onToggle={item.panel ? () => setPanel((p) => (p === item.panel ? null : item.panel)) : undefined}
      buttonRef={item.panel === 'sites' ? sitesButton : undefined}
    />
  );
  const overlays = (
    <>
      <SitesPanel
        open={panel === 'sites'}
        horizontal={horizontal}
        anchorRef={sitesButton}
        onClose={closePanel}
        onCreate={() => { setPanel(null); setDialog('templates'); }}
        onTemplates={() => { setPanel(null); setDialog('templates'); }}
      />
      {dialog && (
        <Suspense fallback={null}>
          <AddPageDialog open onClose={() => setDialog(null)} initialSection={dialog} />
        </Suspense>
      )}
    </>
  );
  const exit = (
    <ButtonBase onClick={leave} aria-label="Exit Studio and return to the portal" sx={{ flexDirection: 'column', gap: 0.4, width: horizontal ? 76 : '100%', flexShrink: 0, py: 1, borderRadius: 2, color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'action.hover' } }}>
      <LogoutRoundedIcon fontSize="small" />
      <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'inherit' }}>Exit Studio</Typography>
    </ButtonBase>
  );
  if (horizontal) {
    return (
      <Stack component="nav" aria-label="Studio" direction="row" spacing={0.5} sx={{ overflowX: 'auto', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        {ITEMS.map(railItem)}
        {exit}
        {overlays}
      </Stack>
    );
  }
  return (
    <Box component="nav" aria-label="Studio" sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.5, px: 0.75, py: 1.25, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>
      {/* EduNexusAI mark (public/logo_icon.png), separated from the first tool by a rule. */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 0.5, pb: 1.25, mb: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box component="img" src="/logo_icon.png" alt="EduNexusAI Studio" sx={{ width: 36, height: 36, objectFit: 'contain', display: 'block' }} />
      </Box>
      {ITEMS.map(railItem)}
      <Box sx={{ flex: 1 }} />
      {exit}
      {overlays}
    </Box>
  );
}
