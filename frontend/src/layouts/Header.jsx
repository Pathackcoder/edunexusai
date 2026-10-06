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
import Button from '@mui/material/Button';
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
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import EmergencyOutlinedIcon from '@mui/icons-material/EmergencyOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useFinance } from '../context/FinanceContext';
import { useToast } from '../components/common/Toast';
import { NotificationDropdown } from '../components/notifications/NotificationDropdown';
import { Badge as StatusBadge } from '../components/common/Badge';
import { useApiQuery } from '../hooks/useApiQuery';
import { directoryApi, academicApi } from '../services/api';
import { PWAInstallButton } from '../components/pwa/PWAInstallButton';
import { usePWA } from '../context/PWAContext';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { layout } from '../theme/theme';

const PERSONA_LABEL = { STUDENT: 'Student', FACULTY: 'Faculty', ADMIN: 'Administrator' };

export const Header = ({ onOpenMobile, showMenuButton = false }) => {
  const { user, logout, isStudent, persona } = useAuth();
  const { isInstalled, promptInstall } = usePWA();
  const { unreadCount } = useNotifications();
  const { resetFinanceBalance } = useFinance();
  const { showToast } = useToast();
  const [notifAnchor, setNotifAnchor] = useState(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const navigate = useNavigate();

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
        { label: 'Canvas LMS Launch', path: '/academics/lms', match: 'canvas' },
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

  const handleSelectResult = (path) => {
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
        top: 0,
        bgcolor: alpha(theme.palette.background.default, 0.82),
        backdropFilter: 'saturate(180%) blur(14px)',
        borderBottom: 1,
        borderColor: 'divider',
        zIndex: theme.zIndex.appBar,
      })}
    >
      <Toolbar
        sx={{
          minHeight: `${layout.headerHeight}px !important`,
          px: { xs: 1.5, sm: 2.5, lg: 3 },
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
              <Box component="img" src="/logo.png" alt="EdunexusAI" sx={{ height: 24, width: 'auto' }} />
            </Box>
          )}

          {/* Global Multi-Entity Search Bar */}
          <Box ref={searchContainerRef} sx={{ position: 'relative', width: '100%', maxWidth: 420, display: { xs: 'none', sm: 'block' } }}>
            <Box
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                height: 36,
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
              <SearchRoundedIcon sx={{ fontSize: 20, color: 'grey.500' }} />
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
                    setIsSearchDropdownOpen(false);
                    navigate(`/campus/people?q=${encodeURIComponent(searchTerm.trim())}`);
                  }
                }}
                inputProps={{ 'aria-label': 'Search students, faculty, staff, courses' }}
                sx={{ flex: 1, fontSize: '0.875rem', '& input::placeholder': { color: 'grey.500', opacity: 1 } }}
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
                            onClick={() => handleSelectResult(`/campus/people?q=${encodeURIComponent(person.name)}`)}
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
                              onClick={() => handleSelectResult('/academics/schedule')}
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
                            <ListItemButton key={idx} onClick={() => handleSelectResult(item.path)} sx={{ borderRadius: 2 }}>
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
                        setIsSearchDropdownOpen(false);
                        navigate(`/campus/people?q=${encodeURIComponent(searchTerm.trim())}`);
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

        {/* Right: install, quick payment, notifications, account */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1 }} sx={{ flexShrink: 0 }}>
          <PWAInstallButton sx={{ display: { xs: 'none', md: 'inline-flex' } }} />

          {/* Quick Payment Shortcut */}
          {isStudent && (
            <Button
              component={RouterLink}
              to="/finance/tuition"
              variant="contained"
              size="small"
              startIcon={<CreditCardRoundedIcon />}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Pay Tuition
            </Button>
          )}

          {/* Notifications Popover Trigger */}
          <LanguageSelector />
          <Tooltip title="Notifications">
            <IconButton
              data-notif-trigger="true"
              onClick={(e) => setNotifAnchor((prev) => (prev ? null : e.currentTarget))}
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
            <Avatar sx={{ width: 34, height: 34, fontSize: '0.8125rem', bgcolor: 'primary.main' }}>{initials}</Avatar>
            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left', maxWidth: 160 }}>
              <Typography variant="body2" fontWeight={600} noWrap sx={{ lineHeight: 1.25 }}>
                {user?.fullName ?? '—'}
              </Typography>
              <Typography variant="caption" noWrap component="div" sx={{ lineHeight: 1.3 }}>
                {PERSONA_LABEL[persona] ?? persona ?? ''}
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
                    ID: {user?.studentNumber ?? user?.employeeNumber ?? '—'}
                  </Typography>
                </Box>
              </Stack>
            </Box>
            <Divider sx={{ mb: 0.75 }} />

            <MenuItem component={RouterLink} to="/profile" onClick={() => setIsUserMenuOpen(false)}>
              <ListItemIcon><PersonOutlineRoundedIcon fontSize="small" /></ListItemIcon>
              My Profile
            </MenuItem>
            <MenuItem component={RouterLink} to="/help" onClick={() => setIsUserMenuOpen(false)}>
              <ListItemIcon><HelpOutlineRoundedIcon fontSize="small" /></ListItemIcon>
              Help & FAQs
            </MenuItem>
            <MenuItem
              component={RouterLink}
              to="/campus/security"
              onClick={() => setIsUserMenuOpen(false)}
              sx={{ color: 'error.dark', '&:hover': { bgcolor: 'error.lighter' } }}
            >
              <ListItemIcon sx={{ color: 'error.main' }}><EmergencyOutlinedIcon fontSize="small" /></ListItemIcon>
              Emergency Hotline (911)
            </MenuItem>

            {/* Demo-only control; only a student has a tuition balance to reset. */}
            {isStudent && (
              <MenuItem onClick={handleResetDemo} sx={{ color: 'primary.main' }}>
                <ListItemIcon sx={{ color: 'primary.main' }}><RestartAltRoundedIcon fontSize="small" /></ListItemIcon>
                Reset demo tuition balance
              </MenuItem>
            )}

            {/* Below md the header's Install button is hidden, so offer it here instead. */}
            {!isInstalled && (
              <MenuItem onClick={() => { setIsUserMenuOpen(false); promptInstall(); }} sx={{ display: { md: 'none' } }}>
                <ListItemIcon><FileDownloadOutlinedIcon fontSize="small" /></ListItemIcon>
                Install Portal App
              </MenuItem>
            )}

            <Divider sx={{ my: 0.75 }} />
            <MenuItem onClick={handleLogout} sx={{ color: 'error.main', '&:hover': { bgcolor: 'error.lighter' } }}>
              <ListItemIcon sx={{ color: 'error.main' }}><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
              Sign Out
            </MenuItem>
          </Menu>
        </Stack>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
