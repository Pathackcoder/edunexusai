import React from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import MuiBreadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';

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
  assignments: 'Assignments & Deadlines',
  grades: 'Grades & GPA',
  announcements: 'Announcements',
  calendar: 'Academic Calendar',
  transcripts: 'Transcripts',
  lms: 'Canvas LMS',

  // Finance
  tuition: 'Tuition & Payments',
  'financial-aid': 'Financial Aid',

  // Campus
  people: 'People Search',
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
  users: 'Users',
  roles: 'Roles & Permissions',
  entitlements: 'Widget Entitlements',
  integrations: 'Integrations',
  faqs: 'FAQs',
};

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
        const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

        return isLast ? (
          <Typography key={to} variant="body2" color="text.primary" fontWeight={600} aria-current="page" noWrap sx={{ maxWidth: 260 }}>
            {label}
          </Typography>
        ) : (
          <Link
            key={to}
            component={RouterLink}
            to={to}
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
