import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';

/**
 * Navigation is assembled from the signed-in persona and that persona's entitlements.
 * A student on the Standard tier does not see a Canvas LMS link, because the backend
 * would not serve them that widget either. Links are never rendered for a route the
 * API would refuse.
 *
 * The section lists, paths, labels and entitlement checks are unchanged from the
 * original Sidebar; only the icons moved to MUI and the structure moved to this module.
 */
export const buildNavSections = ({ isAdmin, isFaculty, can, unreadCount }) => {
  const studentSections = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard',
      icon: DashboardOutlinedIcon,
      isDirect: true,
    },
    {
      id: 'academics',
      label: 'Academics',
      pathPrefix: '/academics',
      icon: MenuBookOutlinedIcon,
      children: [
        { label: 'Academic Overview', path: '/academics', end: true },
        { label: 'Course Schedule', path: '/academics/schedule' },
        { label: 'Assignments & Deadlines', path: '/academics/assignments' },
        { label: 'Grades & GPA', path: '/academics/grades' },
        { label: 'Announcements', path: '/academics/announcements' },
        { label: 'Academic Calendar', path: '/academics/calendar' },
        ...(can('feature.transcripts') ? [{ label: 'Transcripts', path: '/academics/transcripts' }] : []),
        ...(can('feature.lms') ? [{ label: 'Canvas LMS', path: '/academics/lms' }] : []),
        ...(can('feature.degree_progress') ? [{ label: 'Degree Progress', path: '/academics/degree-progress' }] : []),
        ...(can('feature.recommendations') ? [{ label: 'Course Recommendations', path: '/academics/recommendations' }] : []),
        ...(can('feature.learning_path') ? [{ label: 'Learning Path', path: '/academics/learning-path' }] : []),
        ...(can('feature.insights') ? [{ label: 'Performance Insights', path: '/academics/insights' }] : []),
        ...(can('feature.advising') ? [{ label: 'Advising', path: '/academics/advising' }] : []),
      ],
    },
    {
      id: 'finance',
      label: 'Finance',
      pathPrefix: '/finance',
      icon: AccountBalanceWalletOutlinedIcon,
      children: [
        { label: 'Tuition & Payments', path: '/finance/tuition' },
        { label: 'Financial Aid', path: '/finance/financial-aid' },
      ],
    },
    {
      id: 'campus',
      label: 'Campus',
      pathPrefix: '/campus',
      icon: ApartmentOutlinedIcon,
      children: [
        { label: 'Campus Overview', path: '/campus', end: true },
        ...(can('feature.directory') ? [{ label: 'People Search', path: '/campus/people' }] : []),
        ...(can('feature.library') ? [{ label: 'Library', path: '/campus/library' }] : []),
        ...(can('feature.security') ? [{ label: 'Campus Security', path: '/campus/security' }] : []),
        ...(can('feature.campus_map') ? [{ label: 'Campus Map', path: '/campus/map' }] : []),
        ...(can('feature.classrooms') ? [{ label: 'Classroom Availability', path: '/campus/classrooms' }] : []),
      ],
    },
    ...(['feature.careers', 'feature.portfolio', 'feature.groups', 'feature.achievements'].some(can)
      ? [
          {
            id: 'career',
            label: 'Career & Community',
            pathPrefix: '/career',
            icon: WorkOutlineRoundedIcon,
            children: [
              ...(can('feature.careers') ? [{ label: 'Jobs & Internships', path: '/career/opportunities' }] : []),
              ...(can('feature.portfolio') ? [{ label: 'Skills Portfolio', path: '/career/portfolio' }] : []),
              ...(can('feature.groups') ? [{ label: 'Groups & Clubs', path: '/career/groups' }] : []),
              ...(can('feature.achievements') ? [{ label: 'Achievements', path: '/career/achievements' }] : []),
            ],
          },
        ]
      : []),
    {
      id: 'profile',
      label: 'Profile',
      pathPrefix: '/profile',
      icon: PersonOutlineRoundedIcon,
      children: [
        { label: 'Profile Hub', path: '/profile', end: true },
        { label: 'Personal Information', path: '/profile/personal' },
        { label: 'Emergency Contact', path: '/profile/emergency' },
        { label: 'Privacy & Preferences', path: '/profile/privacy' },
        { label: 'Communication Preferences', path: '/profile/preferences' },
        { label: 'Requests & Changes', path: '/profile/requests' },
      ],
    },
  ];

  const facultySections = [
    { id: 'faculty-dashboard', label: 'Dashboard', path: '/dashboard', icon: DashboardOutlinedIcon, isDirect: true },
    {
      id: 'faculty-teaching',
      label: 'Teaching',
      pathPrefix: '/faculty',
      icon: SchoolOutlinedIcon,
      children: [
        { label: 'My Courses', path: '/faculty/courses' },
        { label: 'Announcements', path: '/faculty/announcements' },
        { label: 'Teaching Schedule', path: '/faculty/schedule' },
        { label: 'Advising', path: '/faculty/advising' },
        { label: 'Student Follow-ups', path: '/faculty/interventions' },
      ],
    },
    {
      id: 'faculty-campus',
      label: 'Campus',
      pathPrefix: '/campus',
      icon: ApartmentOutlinedIcon,
      children: [
        { label: 'Campus Overview', path: '/campus', end: true },
        { label: 'People Search', path: '/campus/people' },
        { label: 'Campus Security', path: '/campus/security' },
        { label: 'Campus Map', path: '/campus/map' },
        { label: 'Classroom Availability', path: '/campus/classrooms' },
      ],
    },
    {
      id: 'faculty-profile',
      label: 'Profile',
      pathPrefix: '/profile',
      icon: PersonOutlineRoundedIcon,
      children: [
        { label: 'Profile Hub', path: '/profile', end: true },
        { label: 'Personal Information', path: '/profile/personal' },
        { label: 'Communication Preferences', path: '/profile/preferences' },
        { label: 'Requests & Changes', path: '/profile/requests' },
      ],
    },
  ];

  const adminSections = [
    { id: 'admin-dashboard', label: 'Dashboard', path: '/dashboard', icon: DashboardOutlinedIcon, isDirect: true },
    {
      id: 'admin-access',
      label: 'Access Control',
      pathPrefix: '/admin',
      icon: AdminPanelSettingsOutlinedIcon,
      children: [
        { label: 'Users', path: '/admin/users' },
        { label: 'Roles & Permissions', path: '/admin/roles' },
        { label: 'Widget Entitlements', path: '/admin/entitlements' },
      ],
    },
    {
      id: 'admin-integrations',
      label: 'Integrations',
      path: '/admin/integrations',
      icon: HubOutlinedIcon,
      isDirect: true,
    },
    {
      id: 'admin-campus',
      label: 'Campus',
      pathPrefix: '/campus',
      icon: ApartmentOutlinedIcon,
      children: [
        { label: 'Campus Overview', path: '/campus', end: true },
        { label: 'People Search', path: '/campus/people' },
        { label: 'Campus Security', path: '/campus/security' },
        { label: 'Campus Map', path: '/campus/map' },
        { label: 'Classroom Availability', path: '/campus/classrooms' },
      ],
    },
  ];

  const personaSections = isAdmin ? adminSections : isFaculty ? facultySections : studentSections;

  return [
    ...personaSections,
    {
      id: 'help',
      label: 'Help & Support',
      pathPrefix: '/help',
      icon: HelpOutlineRoundedIcon,
      children: [
        { label: 'FAQs', path: '/help', end: true },
        ...(isAdmin
          ? [{ label: 'Resources', path: '/help/resources' }]
          : [
              { label: 'Help Desk', path: '/help/tickets' },
              { label: 'My Requests', path: '/help/requests' },
              { label: 'Forms', path: '/help/forms' },
              { label: 'Resources', path: '/help/resources' },
            ]),
      ],
    },
    {
      id: 'notifications',
      label: isAdmin ? 'Communication Center' : 'Notifications',
      path: '/notifications',
      icon: NotificationsNoneRoundedIcon,
      isDirect: true,
      badge: unreadCount > 0 ? unreadCount : null,
    },
  ];
};

/** Group label shown above each persona's primary sections in the expanded sidebar. */
export const personaWorkspaceLabel = ({ isAdmin, isFaculty }) =>
  isAdmin ? 'Administration' : isFaculty ? 'Teaching workspace' : 'Student workspace';
