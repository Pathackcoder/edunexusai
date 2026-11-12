import React, { useState, useEffect } from 'react';
import { groupOwnsPath } from './navState';
import { NavLink, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import Collapse from '@mui/material/Collapse';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha } from '@mui/material/styles';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { buildNavGroups } from './navigation';
import { useCmsNavPages } from '../components/cms/useCmsNavPages';
import { useI18n } from '../i18n';
import { DarkSurface } from '../components/common/DarkSurface';
import { InstitutionLogo, PoweredBy } from '../components/brand/Brand';
import { institution } from '../branding';
import { trackFeature, trackNav } from '../analytics/index.js';

/*
 * Geometry is identical in both states so nothing moves while the width animates:
 * the nav has a constant 8px gutter and every row a constant 14px left inset, which
 * centres a 20px icon in the 64px rail. Collapsing only clips and fades the labels.
 */
const GUTTER = '8px';
const ROW_INSET = '14px';

const fade = (collapsed) => ({
  opacity: collapsed ? 0 : 1,
  transition: collapsed ? 'opacity 110ms ease' : 'opacity 220ms ease 150ms',
  whiteSpace: 'nowrap',
  pointerEvents: collapsed ? 'none' : undefined,
});

const rowSx = (active) => (theme) => ({
  minHeight: 34,
  py: '5px',
  '& .MuiListItemText-root': { my: 0 },
  pl: ROW_INSET,
  pr: '10px',
  mb: '2px',
  color: active ? '#FFFFFF' : 'text.secondary',
  bgcolor: 'transparent',
  backgroundImage: active ? 'linear-gradient(100deg, color-mix(in srgb, var(--enx-primary) 60%, transparent), color-mix(in srgb, var(--enx-secondary) 28%, transparent))' : 'none',
  boxShadow: active ? 'inset 0 0 0 1px color-mix(in srgb, var(--enx-accent) 24%, transparent), 0 8px 20px -12px color-mix(in srgb, var(--enx-primary) 90%, transparent)' : 'none',
  position: 'relative',
  overflow: 'hidden',
  transition: 'background-color 160ms ease, color 160ms ease',
  '& .MuiListItemIcon-root': {
    minWidth: 32,
    color: active ? 'var(--enx-accent)' : theme.palette.grey[500],
    transition: 'color 160ms ease',
  },
  '&:hover': {
    bgcolor: active ? 'transparent' : theme.palette.action.hover,
    color: '#FFFFFF',
    '& .MuiListItemIcon-root': { color: active ? 'var(--enx-accent)' : '#FFFFFF', transform: 'translateX(1px)' },
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: '0 3px 3px 0',
    backgroundImage: 'linear-gradient(180deg, var(--enx-accent), var(--enx-secondary))',
    boxShadow: '0 0 10px color-mix(in srgb, var(--enx-accent) 80%, transparent)',
    opacity: active ? 1 : 0,
    transition: 'opacity 160ms ease',
  },
});

// Navigation labels have their own size (not body2), so denser page text never makes them harder to read.
const labelProps = (active) => ({ variant: 'body2', fontSize: '0.8125rem', lineHeight: 1.35, fontWeight: active ? 600 : 500, noWrap: true });

/**
 * Persona-aware navigation. Renders inside the push sidebar on desktop/tablet (where
 * `collapsed` turns it into an icon rail) and inside a temporary drawer on mobile.
 */
export const Sidebar = ({ collapsed = false, onToggle, onCloseMobile, isMobile = false }) => {
  const { user, isFaculty, isAdmin, can, canIn, contexts, workspaces } = useAuth();
  const { unreadCount } = useNotifications();
  const { t } = useI18n();
  const location = useLocation();

  const cmsPages = useCmsNavPages();
  // One group per active role context for multi-role accounts; the usual single group otherwise.
  const nav = buildNavGroups({ isAdmin, isFaculty, can, canIn, contexts: contexts.map((c) => c.key), workspaces, unreadCount, cmsPages });
  const supportSections = nav.support;
  const navSections = [...nav.groups.flatMap((group) => group.sections), ...supportSections];

  // Accordion state: Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState(() => {
    const initial = {};
    navSections.forEach((sec) => {
      if (sec.children) {
        // Auto-expand only the group that owns the current route
        initial[sec.id] = groupOwnsPath(sec, location.pathname);
      }
    });
    // Default open academics if on /academics or dashboard
    if (location.pathname.startsWith('/academics')) initial.academics = true;
    return initial;
  });

  // Keep expanded state in sync with URL changes
  useEffect(() => {
    navSections.forEach((sec) => {
      if (sec.children && groupOwnsPath(sec, location.pathname)) {
        setExpandedSections((prev) => ({ ...prev, [sec.id]: true }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleSection = (sectionId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  // In the collapsed rail a group opens a flyout menu with its child links instead.
  const [flyout, setFlyout] = useState({ anchorEl: null, section: null });
  const closeFlyout = () => setFlyout({ anchorEl: null, section: null });

  const initials = `${(user?.firstName ?? '').charAt(0)}${(user?.lastName ?? '').charAt(0)}`.toUpperCase() || '—';
  const userId = user?.studentNumber ?? user?.employeeNumber ?? '—';
  const termLabel = user?.currentTerm ?? 'Fall 2026';

  const renderDirect = (section) => {
    const Icon = section.icon;
    const active = location.pathname === section.path || location.pathname.startsWith(`${section.path}/`);

    return (
      <Tooltip key={section.path} title={collapsed ? t(section.label) : ''} placement="right">
        <ListItemButton
          component={NavLink}
          to={section.path}
          onClick={() => { trackNav(section.path, 'SIDEBAR'); onCloseMobile?.(); }}
          aria-label={collapsed ? t(section.label) : undefined}
          sx={rowSx(active)}
        >
          <ListItemIcon>
            <Badge
              color="error"
              variant="dot"
              overlap="circular"
              invisible={!collapsed || !section.badge}
              sx={{ '& .MuiBadge-dot': { border: '2px solid #fff', width: 10, height: 10, borderRadius: 5 } }}
            >
              <Icon fontSize="small" />
            </Badge>
          </ListItemIcon>
          <ListItemText primary={t(section.label)} primaryTypographyProps={labelProps(active)} sx={{ ...fade(collapsed), minWidth: 0 }} />
          {section.badge ? (
            <Box
              component="span"
              sx={{
                ...fade(collapsed),
                ml: 1,
                minWidth: 22,
                height: 20,
                px: 0.75,
                borderRadius: 10,
                bgcolor: 'error.main',
                color: '#fff',
                fontSize: '0.6875rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {section.badge}
            </Box>
          ) : null}
        </ListItemButton>
      </Tooltip>
    );
  };

  const renderGroup = (section) => {
    const Icon = section.icon;
    const isExpanded = !!expandedSections[section.id];
    const isParentActive = groupOwnsPath(section, location.pathname);
    const highlight = isParentActive && (collapsed || !isExpanded);

    return (
      <Box key={section.id}>
        <Tooltip title={collapsed ? t(section.label) : ''} placement="right">
          <ListItemButton
            onClick={(e) => (collapsed ? setFlyout({ anchorEl: e.currentTarget, section }) : toggleSection(section.id, e))}
            aria-expanded={collapsed ? undefined : isExpanded}
            aria-haspopup={collapsed ? 'menu' : undefined}
            aria-label={collapsed ? t(section.label) : undefined}
            sx={(theme) => ({
              ...rowSx(highlight)(theme),
              ...(isParentActive && !highlight && {
                color: 'text.primary',
                '& .MuiListItemIcon-root': { minWidth: 32, color: 'primary.main' },
              }),
            })}
          >
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t(section.label)} primaryTypographyProps={labelProps(isParentActive)} sx={{ ...fade(collapsed), minWidth: 0 }} />
            <ExpandMoreRoundedIcon
              sx={{
                ...fade(collapsed),
                fontSize: 18,
                flexShrink: 0,
                color: 'grey.400',
                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: `${fade(collapsed).transition}, transform 200ms ease`,
              }}
            />
          </ListItemButton>
        </Tooltip>

        <Collapse in={isExpanded && !collapsed} timeout={collapsed ? 120 : 220} unmountOnExit>
          <List
            disablePadding
            sx={{ ml: '23px', pl: '8px', mt: '2px', mb: 0.75, borderLeft: 1, borderColor: 'divider' }}
          >
            {section.children.map((child) => (
              <ListItemButton
                key={child.path}
                component={NavLink}
                to={child.path}
                end={child.end}
                onClick={() => { trackNav(child.path, 'SIDEBAR'); onCloseMobile?.(); }}
                sx={(theme) => ({
                  minHeight: 28,
                  px: 1.25,
                  py: 0.375,
                  mb: '2px',
                  borderRadius: 2,
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  '&.active': {
                    color: '#FFFFFF',
                    bgcolor: alpha(theme.palette.primary.main, 0.16),
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                  },
                })}
              >
                <ListItemText primary={t(child.label)} primaryTypographyProps={{ variant: 'body2', fontSize: '0.78125rem', lineHeight: 1.35, noWrap: true }} />
              </ListItemButton>
            ))}
          </List>
        </Collapse>
      </Box>
    );
  };

  const renderSection = (section) => (section.isDirect ? renderDirect(section) : renderGroup(section));

  const subheader = (label, extra) => (
    <ListSubheader disableSticky sx={{ pl: ROW_INSET, pr: 1, lineHeight: '28px', fontSize: '0.65625rem', ...fade(collapsed), ...extra }}>
      {label}
    </ListSubheader>
  );

  return (
    <DarkSurface glow="bl" sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Brand + toggle */}
      <Box sx={{ px: GUTTER, pt: 1, pb: 0.5, flexShrink: 0 }}>
        <Box sx={{ position: 'relative', height: 38, display: 'flex', alignItems: 'center' }}>
          {/* Full wordmark (expanded) */}
          <Box sx={{ ...fade(collapsed), ml: '8px', display: 'flex', alignItems: 'center', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.35))' }}>
            <InstitutionLogo inverse height={36} />
          </Box>

          {/* Mark only (collapsed rail): doubles as the expand control */}
          {!isMobile && (
            <Tooltip title={collapsed ? 'Expand sidebar' : ''} placement="right">
              <Box
                component={collapsed ? 'button' : 'div'}
                type={collapsed ? 'button' : undefined}
                onClick={collapsed ? onToggle : undefined}
                aria-label={collapsed ? 'Expand sidebar' : undefined}
                aria-hidden={collapsed ? undefined : true}
                tabIndex={collapsed ? 0 : -1}
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 48,
                  height: 40,
                  border: 0,
                  p: 0,
                  bgcolor: 'transparent',
                  borderRadius: 2.5,
                  cursor: collapsed ? 'pointer' : 'default',
                  opacity: collapsed ? 1 : 0,
                  pointerEvents: collapsed ? 'auto' : 'none',
                  transition: collapsed ? 'opacity 200ms ease 120ms' : 'opacity 100ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '& .mark': { transition: 'opacity 150ms ease' },
                  '& .arrow': { position: 'absolute', opacity: 0, transition: 'opacity 150ms ease', color: 'text.secondary' },
                  '&:hover, &:focus-visible': {
                    bgcolor: 'action.hover',
                    '& .mark': { opacity: 0 },
                    '& .arrow': { opacity: 1 },
                  },
                  '&:focus-visible': { outline: (theme) => `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                }}
              >
                <Box className="mark" sx={{ display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.35))' }}>
                  <InstitutionLogo variant="mark" height={32} alt="" />
                </Box>
                <KeyboardDoubleArrowRightRoundedIcon className="arrow" sx={{ fontSize: 20 }} />
              </Box>
            </Tooltip>
          )}

          {/* Collapse control (expanded) / close control (mobile drawer) */}
          <Box sx={{ ml: 'auto', ...(isMobile ? {} : fade(collapsed)) }}>
            {isMobile ? (
              <IconButton onClick={onCloseMobile} size="small" aria-label="Close navigation menu">
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            ) : (
              <Tooltip title="Collapse sidebar" placement="right">
                <IconButton
                  onClick={onToggle}
                  size="small"
                  aria-label="Collapse sidebar"
                  aria-expanded={!collapsed}
                  tabIndex={collapsed ? -1 : 0}
                  sx={{ color: 'grey.500', width: 30, height: 30 }}
                >
                  <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Institution context */}
        <Tooltip title={collapsed ? `${institution.name} · ${termLabel}` : ''} placement="right">
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              mt: 1,
              pl: '15px',
              pr: 1.25,
              height: 32,
              borderRadius: 2.25,
              bgcolor: 'rgba(255,255,255,0.06)',
              border: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}
          >
            <LocationCityOutlinedIcon sx={{ fontSize: 17, color: 'var(--enx-accent)', flexShrink: 0 }} />
            <Typography variant="caption" noWrap sx={{ ...fade(collapsed), color: 'text.secondary', fontWeight: 500 }}>
              {termLabel} · Main campus
            </Typography>
          </Stack>
        </Tooltip>
      </Box>

      {/* Navigation */}
      <Box
        component="nav"
        aria-label="Sidebar Navigation"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', px: GUTTER, pb: 1.5 }}
      >
        {nav.groups.map((group, index) => (
          <List key={group.id} disablePadding subheader={subheader(t(group.label), index ? { mt: 1 } : undefined)}>
            {group.sections.map(renderSection)}
          </List>
        ))}
        {/* Other university systems this person may open. Each starts that system's own university
            sign-in in a new tab; the system decides access from its own account and role. */}
        {(user?.apps ?? []).length > 0 && (
          <List disablePadding subheader={subheader('University systems', { mt: 1 })}>
            {user.apps.map((app) => (
              <Tooltip key={app.key} title={collapsed ? app.label : app.description ?? ''} placement="right">
                <ListItemButton component="a" href={app.url} target="_blank" rel="noopener noreferrer" onClick={() => { trackNav(`app.${app.key}`, 'SIDEBAR'); trackFeature('campuscore.opened'); }} aria-label={`${app.label} (opens in a new tab)`} sx={rowSx(false)}>
                  <ListItemIcon><OpenInNewRoundedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={app.label} primaryTypographyProps={labelProps(false)} sx={{ ...fade(collapsed), minWidth: 0 }} />
                </ListItemButton>
              </Tooltip>
            ))}
          </List>
        )}
        <List disablePadding subheader={subheader('Support', { mt: 1 })}>
          {supportSections.map(renderSection)}
        </List>
      </Box>

      {/* Identity only — Install App and Sign Out live in the header and profile menu. */}
      <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', px: GUTTER, py: 0.75 }}>
        <Tooltip title={collapsed ? `${user?.fullName ?? '—'} · ID ${userId}` : ''} placement="right">
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ pl: '9px', pr: 1, py: 0.5, overflow: 'hidden' }}>
            <Avatar sx={{ width: 30, height: 30, fontSize: '0.71875rem', color: '#fff', background: 'linear-gradient(135deg, var(--enx-primary), var(--enx-secondary))', boxShadow: '0 0 0 2px rgba(255,255,255,0.14)', flexShrink: 0 }}>{initials}</Avatar>
            <Box sx={{ ...fade(collapsed), flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap>
                {user?.fullName ?? '—'}
              </Typography>
              <Typography variant="caption" noWrap component="div">
                ID: <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{userId}</Box>
              </Typography>
            </Box>
          </Stack>
        </Tooltip>
        {/* Platform attribution, kept quiet beneath the university identity. */}
        <Box sx={{ ...fade(collapsed), pl: '11px', pt: 0.25, pb: 0.25 }}>
          <PoweredBy tone="dark" />
        </Box>
      </Box>

      {/* Collapsed-rail flyout for grouped sections */}
      <Menu
        anchorEl={flyout.anchorEl}
        open={Boolean(flyout.anchorEl)}
        onClose={closeFlyout}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { ml: 1.5, mt: 0, minWidth: 230 } } }}
      >
        {flyout.section && (
          <ListSubheader disableSticky sx={{ lineHeight: '30px', px: 1.25 }}>
            {t(flyout.section.label)}
          </ListSubheader>
        )}
        {flyout.section?.children.map((child) => (
          <MenuItem
            key={child.path}
            component={NavLink}
            to={child.path}
            end={child.end}
            onClick={() => { trackNav(child.path, 'SIDEBAR_FLYOUT'); closeFlyout(); }}
            sx={(theme) => ({
              '&.active': { color: 'primary.main', fontWeight: 600, bgcolor: alpha(theme.palette.primary.main, 0.08) },
            })}
          >
            {t(child.label)}
          </MenuItem>
        ))}
      </Menu>
    </DarkSurface>
  );
};

export default Sidebar;
