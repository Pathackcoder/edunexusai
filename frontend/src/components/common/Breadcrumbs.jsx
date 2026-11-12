import React from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import MuiBreadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { trackNav } from '../../analytics/index.js';
import { ANALYTICS_SECTIONS } from '../../pages/admin/analytics/sections.js';

const routeLabels = {
  // Top-level
  dashboard: 'Dashboard',
  academics: 'Academics',
  finance: 'Finance',
  campus: 'Campus',
  profile: 'Profile',
  help: 'Help & Support',
  notifications: 'Notifications',
  faculty: 'Teaching',
  admin: 'Administration',

  // Academics
  schedule: 'Course Schedule',
  'class-search': 'Class Search',
  campuscore: 'CampusCore SIS',
  assignments: 'Assignments & Deadlines',
  grades: 'Grades & GPA',
  announcements: 'Announcements',
  calendar: 'Academic Calendar',
  transcripts: 'Transcripts',
  lms: 'LMS Courses',

  // Finance
  tuition: 'Tuition & Payments',
  'financial-aid': 'Financial Aid',

  // Campus
  people: 'People Search',
  directory: 'Campus Directory',
  library: 'Library',
  security: 'Campus Security',

  // Profile
  personal: 'Personal Information',
  emergency: 'Emergency Contact',
  privacy: 'Privacy & Preferences',
  preferences: 'Communication Preferences',
  requests: 'Requests & Changes',

  // Faculty & admin
  courses: 'Courses',
  gradebook: 'Gradebook',
  users: 'Users',
  roles: 'Roles & Permissions',
  entitlements: 'Widget Entitlements',
  integrations: 'Integrations',
  moodle: 'Moodle LMS',
  appearance: 'Portal Appearance',
  analytics: 'Analytics',
  faqs: 'FAQs',
};

// Full-path labels win over the per-segment ones (an Analytics section named "people" is not People Search).
const pathLabels = Object.fromEntries(ANALYTICS_SECTIONS.filter((section) => section.id !== 'overview').map((section) => [section.path, section.label]));

/** Context row above the page heading. Hidden on the dashboard, as before. */
export const Breadcrumbs = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  if (pathnames.length === 0 || (pathnames.length === 1 && pathnames[0] === 'dashboard')) {
    return null;
  }

  return (
    <MuiBreadcrumbs
      aria-label="Breadcrumb"
      separator={<ChevronRightRoundedIcon sx={{ fontSize: 16 }} />}
      sx={{ mb: 2, '& .MuiBreadcrumbs-ol': { flexWrap: 'wrap', rowGap: 0.5 } }}
    >
      <Link
        component={RouterLink}
        to="/dashboard"
        onClick={() => trackNav('/dashboard', 'BREADCRUMB')}
        underline="none"
        color="text.secondary"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, '&:hover': { color: 'primary.main' } }}
      >
        <HomeOutlinedIcon sx={{ fontSize: 17 }} />
        Home
      </Link>

      {pathnames.map((segment, index) => {
        const isLast = index === pathnames.length - 1;
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const label = pathLabels[to] || routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

        return isLast ? (
          <Typography key={to} variant="body2" color="text.primary" fontWeight={600} aria-current="page" noWrap sx={{ maxWidth: 260 }}>
            {label}
          </Typography>
        ) : (
          <Link
            key={to}
            component={RouterLink}
            to={to}
            onClick={() => trackNav(to, 'BREADCRUMB')}
            underline="none"
            color="text.secondary"
            sx={{ '&:hover': { color: 'primary.main' } }}
          >
            {label}
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  );
};

export default Breadcrumbs;
