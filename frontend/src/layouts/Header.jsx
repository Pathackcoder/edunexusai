import React, { useState, useRef, useEffect } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import EmergencyOutlinedIcon from '@mui/icons-material/EmergencyOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '../context/AuthContext';
import { sisStateLabel, useSisProfile } from '../hooks/useSisProfile';
import { useNotifications } from '../context/NotificationContext';
import { useChat } from '../context/ChatContext';
import { useFinance } from '../context/FinanceContext';
import { useToast } from '../components/common/Toast';
import { NotificationDropdown } from '../components/notifications/NotificationDropdown';
import { Badge as StatusBadge } from '../components/common/Badge';
import { useApiQuery } from '../hooks/useApiQuery';
import { directoryApi, academicApi } from '../services/api';
import { usePWA } from '../context/PWAContext';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { InstitutionLogo } from '../components/brand/Brand';
import { useStudioMode } from '../pages/studio/studioMode';
import { layout } from '../theme/theme';
import { trackFeature, trackNav } from '../analytics/index.js';
import { NexoraMark } from '../components/nexora/NexoraMark';
import { loadNexoraPage, useNexoraSession } from '../components/nexora/NexoraSession';

const PERSONA_LABEL = { STUDENT: 'Student', FACULTY: 'Faculty', STAFF: 'Staff', ALUMNI: 'Alumni', ADMIN: 'Administrator' };

export const Header = ({ onOpenMobile, showMenuButton = false }) => {
  const { user, logout, isStudent, persona, contexts, workspaces, isMultiRole, isViewAs, endViewAs } = useAuth();
  // A person with several roles is described by all of them (e.g. "Faculty · Student").
  const roleLabel = isMultiRole
    ? [...contexts.map((c) => PERSONA_LABEL[c.role] ?? c.role), ...workspaces.map((w) => (w === 'admin' ? PERSONA_LABEL.ADMIN : w))].join(' · ')
    : PERSONA_LABEL[persona] ?? persona ?? '';
  const studio = useStudioMode();
  // Student and faculty IDs are CampusCore's institutional IDs, read live (never the local copy).
  const isSisPerson = (user?.roles ?? []).some((role) => role === 'STUDENT' || role === 'FACULTY');
  const sis = useSisProfile({ enabled: isSisPerson });
  const sisRecord = sis.student ?? sis.faculty;
  const { isInstalled, promptInstall } = usePWA();
  const { unreadCount } = useNotifications();
  const chat = useChat();
  const chatUnread = chat?.unreadTotal ?? 0;
  const { resetFinanceBalance } = useFinance();
  const { showToast } = useToast();
  const [notifAnchor, setNotifAnchor] = useState(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const navigate = useNavigate();
  const { inNexora, phase: nexoraPhase, toggle: toggleNexora } = useNexoraSession();
  // The pill switches as soon as the toggle is pressed, ahead of the route change.
  const nexoraOn = (inNexora && nexoraPhase !== 'closing') || nexoraPhase === 'opening';

  const isNotifOpen = Boolean(notifAnchor);
  const isUserMenuOpen = Boolean(userMenuAnchor);
  const setIsUserMenuOpen = (open) => {
    if (!open) setUserMenuAnchor(null);
  };

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = (options) => {
    logout(options);
    navigate('/login');
  };
  const ssoSession = user?.signInMethod === 'SSO';

  const handleResetDemo = async () => {
    try {
      const reset = await resetFinanceBalance();
      showToast(`Demo balance reset to ${reset.formattedBalance}. Tuition is ready to settle.`);
    } catch (caught) {
      showToast(caught?.message ?? 'The demo balance could not be reset.');
    }
    setIsUserMenuOpen(false);
  };

  /**
   * Global search sources. Both are fetched from the API; the directory is available to
   * every persona, while the course list is a student-scoped read and is skipped for
   * faculty and admin sessions.
   */
  const { data: directoryResult } = useApiQuery(() => directoryApi.search());
  const { data: courseResult } = useApiQuery(() => academicApi.getCourses(), [isStudent], {
    enabled: isStudent,
  });
  /** Initials come from the signed-in user, so every persona gets their own avatar. */
  const initials = `${(user?.firstName ?? '').charAt(0)}${(user?.lastName ?? '').charAt(0)}`.toUpperCase() || '—';

  const directoryData = directoryResult?.people ?? [];
  const coursesData = courseResult ?? [];

  // Search Results Matching
  const query = searchTerm.toLowerCase().trim();

  const matchedPeople = query.length > 0
    ? directoryData.filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.role?.toLowerCase().includes(query) ||
        p.department?.toLowerCase().includes(query) ||
        p.email?.toLowerCase().includes(query)
      ).slice(0, 4)
    : [];

  const matchedCourses = query.length > 0
    ? coursesData.filter(c =>
        c.code?.toLowerCase().includes(query) ||
        c.name?.toLowerCase().includes(query) ||
        c.instructor?.toLowerCase().includes(query)
      ).slice(0, 3)
    : [];

  const quickNavMatches = query.length > 0
    ? [
        { label: 'Academic Calendar', path: '/academics/calendar', match: 'calendar' },
        { label: 'Official Transcripts', path: '/academics/transcripts', match: 'transcript' },
        { label: 'LMS Courses (Moodle)', path: '/academics/lms', match: 'lms moodle canvas' },
        { label: 'Tuition & Payments', path: '/finance/tuition', match: 'tuition pay balance' },
        { label: 'Campus Security & SafeWalk', path: '/campus/security', match: 'security safewalk police' },
        { label: 'Degree Progress', path: '/academics/degree-progress', match: 'degree credits requirements audit graduate' },
        { label: 'Course Recommendations', path: '/academics/recommendations', match: 'recommend courses electives' },
        { label: 'Virtual Advising', path: '/academics/advising', match: 'advisor advising appointment book' },
        { label: 'Jobs & Internships', path: '/career/opportunities', match: 'jobs internships career' },
        { label: 'Campus Map', path: '/campus/map', match: 'map building directions' },
        { label: 'Classroom Availability', path: '/campus/classrooms', match: 'room classroom study space available' },
        { label: 'Help Desk Tickets', path: '/help/tickets', match: 'help desk ticket support issue' },
        { label: 'My Requests', path: '/help/requests', match: 'request petition status approval' }
      ].filter(item => item.match.includes(query) || item.label.toLowerCase().includes(query))
    : [];

  const hasAnyResults = matchedPeople.length > 0 || matchedCourses.length > 0 || quickNavMatches.length > 0;

  const handleSelectResult = (path, kind) => {
    // Analytics keeps only the kind of result and the page it leads to, never the search text.
    trackFeature('search.result_selected', kind);
    trackNav(path, 'SEARCH');
    setIsSearchDropdownOpen(false);
    setSearchTerm('');
    navigate(path);
  };

  const searchActive = isSearchDropdownOpen && query;

  const groupLabel = (label) => (
    <ListSubheader disableSticky sx={{ lineHeight: '28px', px: 1.25, bgcolor: 'transparent' }}>
      {label}
    </ListSubheader>
  );

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={(theme) => ({
        // Below the View-As band when there is one (0px otherwise).
        top: 'var(--enx-top-offset, 0px)',
        bgcolor: alpha('#FFFFFF', 0.72),
        backdropFilter: 'saturate(180%) blur(16px)',
        borderBottom: 1,
        borderColor: 'color-mix(in srgb, var(--enx-primary) 8%, transparent)',
        boxShadow: '0 8px 24px -20px rgba(30, 27, 92, 0.5)',
        zIndex: theme.zIndex.appBar,
      })}
    >
      <Toolbar
        sx={{
          minHeight: `${layout.headerHeight}px !important`,
          px: { xs: 1.5, sm: 2.25, lg: 2.5 },
          gap: { xs: 1, sm: 1.5 },
        }}
      >
        {/* Left: mobile menu + global search */}
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
          {showMenuButton && (
            <IconButton onClick={onOpenMobile} aria-label="Toggle navigation menu" edge="start">
              <MenuRoundedIcon />
            </IconButton>
          )}

          {/* Mobile brand */}
          {showMenuButton && (
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', minWidth: 0 }}>
              <InstitutionLogo height={30} />
            </Box>
          )}

          {/* Global Multi-Entity Search Bar */}
          <Box ref={searchContainerRef} sx={{ position: 'relative', width: '100%', maxWidth: 400, display: { xs: 'none', sm: 'block' } }}>
            <Box
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                height: 34,
                px: 1.5,
                borderRadius: 2.5,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: searchActive ? 'primary.main' : 'divider',
                boxShadow: searchActive ? `0 0 0 4px ${alpha(theme.palette.primary.main, 0.12)}` : theme.shadows[1],
                transition: 'border-color 160ms ease, box-shadow 160ms ease',
                '&:hover': { borderColor: searchActive ? 'primary.main' : 'grey.300' },
              })}
            >
              <SearchRoundedIcon sx={{ fontSize: 19, color: 'grey.500' }} />
              <InputBase
                placeholder="Search students, faculty, staff, courses..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsSearchDropdownOpen(true);
                }}
                onFocus={() => setIsSearchDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    handleSelectResult(`/campus/people?q=${encodeURIComponent(searchTerm.trim())}`, 'SEE_ALL');
                  }
                }}
                inputProps={{ 'aria-label': 'Search students, faculty, staff, courses' }}
                sx={{ flex: 1, fontSize: '0.84375rem', '& input::placeholder': { color: 'grey.500', opacity: 1 } }}
              />
              {searchTerm && (
                <IconButton size="small" onClick={() => setSearchTerm('')} aria-label="Clear search" sx={{ p: 0.5 }}>
                  <CloseRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>

            {/* Interactive Floating Search Dropdown */}
            {isSearchDropdownOpen && query.length > 0 && (
              <Paper
                sx={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  width: { sm: 400, md: 440 },
                  maxWidth: 'calc(100vw - 32px)',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 3.5,
                  boxShadow: 5,
                  zIndex: (theme) => theme.zIndex.modal,
                  maxHeight: 440,
                  overflowY: 'auto',
                }}
              >
                {hasAnyResults ? (
                  <Box sx={{ p: 1 }}>
                    {/* Category: People */}
                    {matchedPeople.length > 0 && (
                      <List dense disablePadding subheader={groupLabel('People (Directory)')}>
                        {matchedPeople.map(person => (
                          <ListItemButton
                            key={person.id}
                            onClick={() => handleSelectResult(`/campus/people?q=${encodeURIComponent(person.name)}`, 'PERSON')}
                            sx={{ borderRadius: 2, gap: 1.5 }}
                          >
                            <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: 'primary.lighter', color: 'primary.dark' }}>
                              {person.name?.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('')}
                            </Avatar>
                            <ListItemText
                              primary={person.name}
                              secondary={`${person.role} • ${person.department}`}
                              primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                              secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                            />
                            <StatusBadge variant={person.type === 'faculty' ? 'purple' : person.type === 'staff' ? 'neutral' : 'primary'}>
                              {person.type}
                            </StatusBadge>
                          </ListItemButton>
                        ))}
                      </List>
                    )}

                    {/* Category: Courses */}
                    {matchedCourses.length > 0 && (
                      <>
                        {matchedPeople.length > 0 && <Divider sx={{ my: 0.75 }} />}
                        <List dense disablePadding subheader={groupLabel('Courses (Curriculum)')}>
                          {matchedCourses.map(course => (
                            <ListItemButton
                              key={course.id}
                              onClick={() => handleSelectResult('/academics/schedule', 'COURSE')}
                              sx={{ borderRadius: 2 }}
                            >
                              <ListItemText
                                primary={
                                  <>
                                    <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>{course.code}: </Box>
                                    {course.name}
                                  </>
                                }
                                secondary={`Instructor: ${course.instructor}`}
                                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                                secondaryTypographyProps={{ variant: 'caption' }}
                              />
                              <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: 'grey.400' }} />
                            </ListItemButton>
                          ))}
                        </List>
                      </>
                    )}

                    {/* Category: Quick Nav */}
                    {quickNavMatches.length > 0 && (
                      <>
                        <Divider sx={{ my: 0.75 }} />
                        <List dense disablePadding subheader={groupLabel('Services & Portals')}>
                          {quickNavMatches.map((item, idx) => (
                            <ListItemButton key={idx} onClick={() => handleSelectResult(item.path, 'QUICK_NAV')} sx={{ borderRadius: 2 }}>
                              <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }} />
                              <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: 'grey.400' }} />
                            </ListItemButton>
                          ))}
                        </List>
                      </>
                    )}

                    {/* Press Enter to see all */}
                    <Divider sx={{ my: 0.75 }} />
                    <ListItemButton
                      onClick={() => {
                        handleSelectResult(`/campus/people?q=${encodeURIComponent(searchTerm.trim())}`, 'SEE_ALL');
                      }}
                      sx={{ borderRadius: 2, justifyContent: 'center', py: 1 }}
                    >
                      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                        View all matching directory records for "{searchTerm}" →
                      </Typography>
                    </ListItemButton>
                  </Box>
                ) : (
                  <Box sx={{ py: 3, px: 2, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No matches found for "{searchTerm}". Press Enter to search directory.
                    </Typography>
                  </Box>
                )}
              </Paper>
            )}
          </Box>
        </Stack>

        {/* Right: quick payment, language, notifications, account. Install lives in the floating prompt. */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1 }} sx={{ flexShrink: 0 }}>
          {/* Nexora, the AI workspace (every persona), as a toggle: pressed again it closes and returns to the page
              the person came from. Tuition & Accounts stays in the sidebar under Finance. */}
          <Tooltip title={inNexora ? 'Close Nexora and return to where you were' : 'Open Nexora, your AI workspace'}>
            <Box
              component={RouterLink}
              to="/nexora"
              aria-label={inNexora ? 'Close Nexora' : 'Open Nexora'}
              aria-current={inNexora ? 'page' : undefined}
              onPointerEnter={() => loadNexoraPage().catch(() => {})}
              onFocus={() => loadNexoraPage().catch(() => {})}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                toggleNexora();
              }}
              sx={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                height: 34,
                borderRadius: 999,
                p: '1.5px',
                textDecoration: 'none',
                background: 'linear-gradient(125deg, var(--enx-primary, #4651DE) 0%, #8B5CF6 52%, #22D3EE 100%)',
                boxShadow: nexoraOn ? '0 8px 22px -10px rgba(91, 75, 227, 0.75)' : '0 6px 18px -12px rgba(91, 75, 227, 0.7)',
                transition: 'transform 220ms cubic-bezier(0.22, 1.18, 0.36, 1), box-shadow 220ms ease',
                '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 12px 26px -12px rgba(91, 75, 227, 0.85)' },
                '&:hover .enx-nexora-mark': { transform: 'rotate(18deg) scale(1.08)' },
                '&:active': { transform: 'scale(0.97)' },
                '&:focus-visible': { outline: (theme) => `2px solid ${theme.palette.primary.main}`, outlineOffset: 3 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' }, '& .enx-nexora-mark': { transition: 'none' } },
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  height: '100%',
                  pl: { xs: 0.85, sm: 1.1 },
                  pr: { xs: 0.85, sm: 1.5 },
                  borderRadius: 999,
                  bgcolor: nexoraOn ? 'transparent' : 'rgba(255, 255, 255, 0.94)',
                  color: nexoraOn ? '#fff' : 'text.primary',
                  transition: 'background-color 200ms ease, color 200ms ease',
                }}
              >
                <NexoraMark size={18} mono={nexoraOn} sx={{ transition: 'transform 320ms cubic-bezier(0.22, 1.18, 0.36, 1)' }} className="enx-nexora-mark" />
                <Box
                  component="span"
                  sx={{
                    display: { xs: 'none', sm: 'inline' },
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                    ...(nexoraOn ? {} : { background: 'linear-gradient(125deg, var(--enx-primary, #4651DE) 0%, #7A4FD8 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }),
                  }}
                >
                  Nexora
                </Box>
              </Box>
            </Box>
          </Tooltip>

          {/* Messages: the inbox panel; the count is the signed-in person's unread chat messages. */}
          {chat && (
            <Tooltip title="Messages">
              <IconButton
                onClick={chat.openInbox}
                aria-label={chatUnread ? `Messages, ${chatUnread} unread` : 'Messages'}
                sx={{ color: chat.panel.open ? 'primary.main' : 'text.secondary', bgcolor: chat.panel.open ? 'primary.lighter' : undefined }}
              >
                <Badge color="error" badgeContent={chatUnread} max={99} invisible={!chatUnread} overlap="circular"
                  sx={{ '& .MuiBadge-badge': { border: '2px solid #fff', fontSize: '0.65rem', fontWeight: 700, height: 18, minWidth: 18, px: 0.5 } }}>
                  <ChatBubbleOutlineRoundedIcon />
                </Badge>
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Notifications">
            <IconButton
              data-notif-trigger="true"
              onClick={(e) => { if (!notifAnchor) trackFeature('notifications.opened'); setNotifAnchor((prev) => (prev ? null : e.currentTarget)); }}
              aria-label="View notifications"
              sx={{ color: isNotifOpen ? 'primary.main' : 'text.secondary', bgcolor: isNotifOpen ? 'primary.lighter' : undefined }}
            >
              <Badge color="error" variant="dot" invisible={!(unreadCount > 0)} overlap="circular"
                sx={{ '& .MuiBadge-dot': { border: '2px solid #fff', width: 10, height: 10, borderRadius: 5 } }}>
                <NotificationsNoneRoundedIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <NotificationDropdown isOpen={isNotifOpen} anchorEl={notifAnchor} onClose={() => setNotifAnchor(null)} />

          {/* Avatar & User Menu */}
          <Box
            component="button"
            type="button"
            onClick={(e) => setUserMenuAnchor(isUserMenuOpen ? null : e.currentTarget)}
            aria-label="User profile menu"
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              border: 0,
              bgcolor: isUserMenuOpen ? 'action.hover' : 'transparent',
              p: 0.5,
              pr: { xs: 0.5, md: 1 },
              ml: 0.5,
              borderRadius: 999,
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
              transition: 'background-color 160ms ease',
              '&:hover': { bgcolor: 'action.hover' },
              '&:focus-visible': { outline: (theme) => `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            }}
          >
            <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: 'primary.main' }}>{initials}</Avatar>
            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left', maxWidth: 160 }}>
              <Typography variant="body2" fontWeight={600} noWrap sx={{ lineHeight: 1.25 }}>
                {user?.fullName ?? '—'}
              </Typography>
              <Typography variant="caption" noWrap component="div" sx={{ lineHeight: 1.3 }}>
                {roleLabel}
              </Typography>
            </Box>
            <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'grey.500', display: { xs: 'none', md: 'block' } }} />
          </Box>

          <Menu
            anchorEl={userMenuAnchor}
            open={isUserMenuOpen}
            onClose={() => setUserMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { width: 264 } } }}
          >
            <Box sx={{ px: 1.5, pt: 1, pb: 1.5 }}>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Avatar sx={{ width: 38, height: 38, fontSize: '0.875rem', bgcolor: 'primary.main' }}>{initials}</Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>{user?.fullName ?? '—'}</Typography>
                  <Typography variant="caption" component="div" noWrap>
                    ID: {sisRecord ? sisRecord.institutionalId : isSisPerson ? sisStateLabel(sis.data, sis.loading) : user?.employeeNumber ?? '—'}
                  </Typography>
                </Box>
              </Stack>
            </Box>
            <Divider sx={{ mb: 0.75 }} />

            <MenuItem component={RouterLink} to="/profile" onClick={() => { trackNav('/profile', 'HEADER_MENU'); setIsUserMenuOpen(false); }}>
              <ListItemIcon><PersonOutlineRoundedIcon fontSize="small" /></ListItemIcon>
              My Profile
            </MenuItem>
            {user?.hasPassword !== false && !isViewAs && (
              <MenuItem component={RouterLink} to="/profile/password" onClick={() => { trackNav('/profile/password', 'HEADER_MENU'); setIsUserMenuOpen(false); }}>
                <ListItemIcon><KeyRoundedIcon fontSize="small" /></ListItemIcon>
                Change password
              </MenuItem>
            )}
            <MenuItem component={RouterLink} to="/help" onClick={() => { trackNav('/help', 'HEADER_MENU'); setIsUserMenuOpen(false); }}>
              <ListItemIcon><HelpOutlineRoundedIcon fontSize="small" /></ListItemIcon>
              Help & FAQs
            </MenuItem>
            <MenuItem
              component={RouterLink}
              to="/campus/security"
              onClick={() => { trackNav('/campus/security', 'HEADER_MENU'); setIsUserMenuOpen(false); }}
              sx={{ color: 'error.dark', '&:hover': { bgcolor: 'error.lighter' } }}
            >
              <ListItemIcon sx={{ color: 'error.main' }}><EmergencyOutlinedIcon fontSize="small" /></ListItemIcon>
              Emergency Hotline (911)
            </MenuItem>

            {/* Demo-only control; only a student has a tuition balance to reset (never in a read-only View-As tab). */}
            {isStudent && !isViewAs && (
              <MenuItem onClick={handleResetDemo} sx={{ color: 'primary.main' }}>
                <ListItemIcon sx={{ color: 'primary.main' }}><RestartAltRoundedIcon fontSize="small" /></ListItemIcon>
                Reset demo tuition balance
              </MenuItem>
            )}

            {/* Always reachable here, including after "Don't show again" on the floating prompt. */}
            {!isInstalled && !isViewAs && (
              <MenuItem onClick={() => { trackFeature('pwa.install_prompted'); setIsUserMenuOpen(false); promptInstall(); }}>
                <ListItemIcon><FileDownloadOutlinedIcon fontSize="small" /></ListItemIcon>
                Install Portal App
              </MenuItem>
            )}

            <Divider sx={{ my: 0.75 }} />
            {(user?.roles ?? []).includes('ADMIN') && (
              // Studio edits the page being viewed: it switches edit mode on without navigating.
              <MenuItem onClick={() => { setIsUserMenuOpen(false); if (studio.editing) studio.exit(); else studio.enter(); }}>
                <ListItemIcon><DashboardCustomizeOutlinedIcon fontSize="small" /></ListItemIcon>
                {studio.editing ? 'Exit Studio' : 'Studio'}
              </MenuItem>
            )}
            {/* View-As: the tokens are the administrator's own session; this tab can only end its View-As session. */}
            {isViewAs && (
              <MenuItem onClick={() => { setIsUserMenuOpen(false); endViewAs(); }} sx={{ color: 'warning.dark', '&:hover': { bgcolor: 'warning.lighter' } }}>
                <ListItemIcon sx={{ color: 'warning.dark' }}><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="End Impersonation" secondary="Closes this read-only View-As session" />
              </MenuItem>
            )}
            {!isViewAs && [
              ssoSession && (
                <MenuItem key="local" onClick={() => handleLogout({ everywhere: false })}>
                  <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Sign out of EdunexusAI only" secondary="Other university apps stay signed in" />
                </MenuItem>
              ),
              <MenuItem key="all" onClick={() => handleLogout({ everywhere: true })} sx={{ color: 'error.main', '&:hover': { bgcolor: 'error.lighter' } }}>
                <ListItemIcon sx={{ color: 'error.main' }}><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
                {ssoSession ? <ListItemText primary="Sign out of all university apps" secondary="Ends your Feddrick University ID sign-in" /> : 'Sign Out'}
              </MenuItem>,
            ]}
          </Menu>
        </Stack>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
