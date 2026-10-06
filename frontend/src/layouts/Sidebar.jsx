import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
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
import { buildNavSections, personaWorkspaceLabel } from './navigation';
import { useI18n } from '../i18n';

/*
 * Geometry is identical in both states so nothing moves while the width animates:
 * the nav has a constant 10px gutter and every row a constant 18px left inset, which
 * centres a 20px icon in the 76px rail. Collapsing only clips and fades the labels.
 */
const GUTTER = '10px';
const ROW_INSET = '18px';

const fade = (collapsed) => ({
  opacity: collapsed ? 0 : 1,
  transition: collapsed ? 'opacity 110ms ease' : 'opacity 220ms ease 150ms',
  whiteSpace: 'nowrap',
  pointerEvents: collapsed ? 'none' : undefined,
});

const rowSx = (active) => (theme) => ({
  minHeight: 38,
  py: '6px',
  '& .MuiListItemText-root': { my: 0 },
  pl: ROW_INSET,
  pr: '10px',
  mb: '2px',
  color: active ? 'primary.main' : 'text.secondary',
  bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
  position: 'relative',
  overflow: 'hidden',
  transition: 'background-color 160ms ease, color 160ms ease',
  '& .MuiListItemIcon-root': {
    minWidth: 36,
    color: active ? 'primary.main' : theme.palette.grey[500],
    transition: 'color 160ms ease',
  },
  '&:hover': {
    bgcolor: active ? alpha(theme.palette.primary.main, 0.11) : theme.palette.action.hover,
    color: active ? 'primary.main' : 'text.primary',
    '& .MuiListItemIcon-root': { color: active ? 'primary.main' : 'text.primary' },
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    left: 0,
    top: 9,
    bottom: 9,
    width: 3,
    borderRadius: '0 3px 3px 0',
    bgcolor: 'primary.main',
    opacity: active ? 1 : 0,
    transition: 'opacity 160ms ease',
  },
});

const labelProps = (active) => ({ variant: 'body2', fontWeight: active ? 600 : 500, noWrap: true });

/**
 * Persona-aware navigation. Renders inside the push sidebar on desktop/tablet (where
 * `collapsed` turns it into an icon rail) and inside a temporary drawer on mobile.
 */
export const Sidebar = ({ collapsed = false, onToggle, onCloseMobile, isMobile = false }) => {
  const { user, isFaculty, isAdmin, can } = useAuth();
  const { unreadCount } = useNotifications();
  const { t } = useI18n();
  const location = useLocation();

  const navSections = buildNavSections({ isAdmin, isFaculty, can, unreadCount });
  const supportIds = ['help', 'notifications'];
  const primarySections = navSections.filter((section) => !supportIds.includes(section.id));
  const supportSections = navSections.filter((section) => supportIds.includes(section.id));

  // Accordion state: Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState(() => {
    const initial = {};
    navSections.forEach((sec) => {
      if (sec.children) {
        // Auto-expand if the current path matches this section
        initial[sec.id] = location.pathname.startsWith(sec.pathPrefix);
      }
    });
    // Default open academics if on /academics or dashboard
    if (location.pathname.startsWith('/academics')) initial.academics = true;
    return initial;
  });

  // Keep expanded state in sync with URL changes
  useEffect(() => {
    navSections.forEach((sec) => {
      if (sec.children && location.pathname.startsWith(sec.pathPrefix)) {
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

  const renderDirect = (section) => {
    const Icon = section.icon;
    const active = location.pathname === section.path || location.pathname.startsWith(`${section.path}/`);

    return (
      <Tooltip key={section.path} title={collapsed ? t(section.label) : ''} placement="right">
        <ListItemButton
          component={NavLink}
          to={section.path}
          onClick={onCloseMobile}
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
    const isParentActive = location.pathname.startsWith(section.pathPrefix);
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
                '& .MuiListItemIcon-root': { minWidth: 36, color: 'primary.main' },
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
            sx={{ ml: '27px', pl: '10px', mt: '2px', mb: 1, borderLeft: 1, borderColor: 'divider' }}
          >
            {section.children.map((child) => (
              <ListItemButton
                key={child.path}
                component={NavLink}
                to={child.path}
                end={child.end}
                onClick={onCloseMobile}
                sx={(theme) => ({
                  minHeight: 31,
                  px: 1.25,
                  py: 0.5,
                  mb: '2px',
                  borderRadius: 2,
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                  },
                })}
              >
                <ListItemText primary={t(child.label)} primaryTypographyProps={{ variant: 'body2', fontSize: '0.8125rem', noWrap: true }} />
              </ListItemButton>
            ))}
          </List>
        </Collapse>
      </Box>
    );
  };

  const renderSection = (section) => (section.isDirect ? renderDirect(section) : renderGroup(section));

  const subheader = (label, extra) => (
    <ListSubheader disableSticky sx={{ pl: ROW_INSET, pr: 1, ...fade(collapsed), ...extra }}>
      {label}
    </ListSubheader>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', bgcolor: 'background.paper' }}>
      {/* Brand + toggle */}
      <Box sx={{ px: GUTTER, pt: 1.25, pb: 0.75, flexShrink: 0 }}>
        <Box sx={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
          {/* Full wordmark (expanded) */}
          <Box
            sx={{
              ...fade(collapsed),
              pl: '12px',
              height: 30,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Box component="img" src="/logo.png" alt="EdunexusAI" sx={{ height: 30, width: 'auto', maxWidth: 'none', display: 'block' }} />
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
                  width: 56,
                  height: 44,
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
                <Box className="mark" sx={{ width: 28, height: 30, overflow: 'hidden' }}>
                  <Box component="img" src="/logo.png" alt="" sx={{ height: 30, width: 'auto', maxWidth: 'none', display: 'block' }} />
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
                  sx={{ color: 'grey.500', width: 32, height: 32 }}
                >
                  <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Institution context */}
        <Tooltip title={collapsed ? 'Demo University • Fall 2026' : ''} placement="right">
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              mt: 1.25,
              pl: '19px',
              pr: 1.25,
              height: 36,
              borderRadius: 2.25,
              bgcolor: 'background.subtle',
              border: 1,
              borderColor: 'divider',
              overflow: 'hidden',
            }}
          >
            <LocationCityOutlinedIcon sx={{ fontSize: 17, color: 'primary.main', flexShrink: 0 }} />
            <Typography variant="caption" noWrap sx={{ ...fade(collapsed), color: 'text.secondary', fontWeight: 500 }}>
              Demo University • Fall 2026
            </Typography>
          </Stack>
        </Tooltip>
      </Box>

      {/* Navigation */}
      <Box
        component="nav"
        aria-label="Sidebar Navigation"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', px: GUTTER, pb: 2 }}
      >
        <List disablePadding subheader={subheader(t(personaWorkspaceLabel({ isAdmin, isFaculty })))}>
          {primarySections.map(renderSection)}
        </List>
        <List disablePadding subheader={subheader('Support', { mt: 1 })}>
          {supportSections.map(renderSection)}
        </List>
      </Box>

      {/* Identity only — Install App and Sign Out live in the header and profile menu. */}
      <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', px: GUTTER, py: 1 }}>
        <Tooltip title={collapsed ? `${user?.fullName ?? '—'} · ID ${userId}` : ''} placement="right">
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ pl: '11px', pr: 1, py: 0.75, overflow: 'hidden' }}>
            <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem', bgcolor: 'primary.main', flexShrink: 0 }}>{initials}</Avatar>
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
            onClick={closeFlyout}
            sx={(theme) => ({
              '&.active': { color: 'primary.main', fontWeight: 600, bgcolor: alpha(theme.palette.primary.main, 0.08) },
            })}
          >
            {t(child.label)}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default Sidebar;
