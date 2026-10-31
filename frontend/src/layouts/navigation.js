import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
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
export const buildNavSections = ({ isAdmin, isFaculty, can, unreadCount, cmsPages = [] }) => {
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
        { label: 'Class Search', path: '/academics/class-search' },
        { label: 'Assignments & Deadlines', path: '/academics/assignments' },
        { label: 'Grades & GPA', path: '/academics/grades' },
        { label: 'Announcements', path: '/academics/announcements' },
        { label: 'Academic Calendar', path: '/academics/calendar' },
        ...(can('feature.transcripts') ? [{ label: 'Transcripts', path: '/academics/transcripts' }] : []),
        ...(can('feature.lms') ? [{ label: 'LMS Courses', path: '/academics/lms' }] : []),
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
        { label: 'News & Notices', path: '/campus/news' },
        ...(can('feature.directory') ? [{ label: 'People Search', path: '/campus/people' }, { label: 'Campus Directory', path: '/campus/directory' }] : []),
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
        { label: 'Moodle Teaching', path: '/faculty/moodle' },
        { label: 'Local gradebook (demo)', path: '/faculty/gradebook' },
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
        { label: 'News & Notices', path: '/campus/news' },
        { label: 'People Search', path: '/campus/people' },
        { label: 'Campus Directory', path: '/campus/directory' },
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
        { label: 'Sign-in & role mapping', path: '/admin/sign-in' },
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
      id: 'admin-appearance',
      label: 'Portal Appearance',
      path: '/admin/appearance',
      icon: PaletteOutlinedIcon,
      isDirect: true,
    },
    {
      id: 'admin-campus',
      label: 'Campus',
      pathPrefix: '/campus',
      icon: ApartmentOutlinedIcon,
      children: [
        { label: 'Campus Overview', path: '/campus', end: true },
        { label: 'News & Notices', path: '/campus/news' },
        { label: 'People Search', path: '/campus/people' },
        { label: 'Campus Directory', path: '/campus/directory' },
        { label: 'Campus Security', path: '/campus/security' },
        { label: 'Campus Map', path: '/campus/map' },
        { label: 'Classroom Availability', path: '/campus/classrooms' },
      ],
    },
  ];

  const personaSections = isAdmin ? adminSections : isFaculty ? facultySections : studentSections;

  // Published Studio pages marked "show in navigation" for this user's audience (server-filtered).
  const pageSection = cmsPages.length
    ? [{ id: 'cms-pages', label: 'Campus pages', pathPrefix: '/pages', icon: ArticleOutlinedIcon, children: cmsPages.map((p) => ({ label: p.navLabel || p.title, path: `/pages/${p.slug}` })) }]
    : [];

  return [
    ...personaSections,
    ...pageSection,
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

const SUPPORT_IDS = ['help', 'notifications'];
const CONTEXT_GROUP_LABELS = { student: 'Studying', faculty: 'Teaching', staff: 'Working', alumni: 'Alumni' };

/**
 * Sidebar groups. A single-role account gets exactly the sections it always had under its usual
 * workspace label. A multi-role account (e.g. a faculty member who is also a student) gets one
 * group per ACTIVE context, built from that context's own sections and gated by that context's own
 * entitlements, then Administration if they are an administrator, then the shared Campus and
 * Profile sections once. Contexts without a verified record (UNLINKED) contribute nothing.
 *
 * `contexts`: active context keys in order; `canIn(contextKey, widgetKey)`.
 * Returns { groups: [{ id, label, sections }], support: sections }.
 */
export const buildNavGroups = ({ isAdmin, isFaculty, can, canIn, contexts = [], workspaces = [], unreadCount, cmsPages = [] }) => {
  const multi = contexts.length + workspaces.length > 1;
  // A staff member or alumnus with no other role: their dashboard, campus, profile and help.
  if (!multi && (contexts[0] === 'staff' || contexts[0] === 'alumni')) {
    const general = buildNavSections({ isAdmin: false, isFaculty: true, can: () => false, unreadCount, cmsPages });
    const student = buildNavSections({ isAdmin: false, isFaculty: false, can: () => false, unreadCount, cmsPages });
    const pickFrom = (sections, ids) => ids.map((id) => sections.find((s) => s.id === id)).filter(Boolean);
    return {
      groups: [{ id: 'workspace', label: contexts[0] === 'staff' ? 'Staff workspace' : 'Alumni', sections: pickFrom(general, ['faculty-dashboard', 'faculty-campus', 'cms-pages', 'faculty-profile']) }],
      support: pickFrom(student, ['help', 'notifications']),
    };
  }
  if (!multi) {
    const sections = buildNavSections({ isAdmin, isFaculty, can, unreadCount, cmsPages });
    return {
      groups: [{ id: 'workspace', label: personaWorkspaceLabel({ isAdmin, isFaculty }), sections: sections.filter((s) => !SUPPORT_IDS.includes(s.id)) }],
      support: sections.filter((s) => SUPPORT_IDS.includes(s.id)),
    };
  }

  const has = (key) => contexts.includes(key);
  const pick = (sections, ids) => ids.map((id) => sections.find((s) => s.id === id)).filter(Boolean);
  const student = buildNavSections({ isAdmin: false, isFaculty: false, can: (key) => canIn('student', key), unreadCount, cmsPages });
  const faculty = buildNavSections({ isAdmin: false, isFaculty: true, can: () => false, unreadCount, cmsPages });
  const admin = buildNavSections({ isAdmin: true, isFaculty: false, can: () => false, unreadCount, cmsPages });

  const groups = [{ id: 'home', label: 'Overview', sections: pick(student, ['dashboard']) }];
  for (const key of contexts) {
    const sections = key === 'student' ? pick(student, ['academics', 'finance', 'career']) : key === 'faculty' ? pick(faculty, ['faculty-teaching']) : [];
    if (sections.length) groups.push({ id: `context-${key}`, label: CONTEXT_GROUP_LABELS[key] ?? key, sections });
  }
  if (workspaces.includes('admin')) groups.push({ id: 'workspace-admin', label: 'Administration', sections: pick(admin, ['admin-access', 'admin-integrations', 'admin-appearance']) });

  // Shared sections, once. Faculty and administrators always had the full Campus list; a student
  // gets the entitlement-gated one. Students have the fuller Profile.
  const campus = has('faculty') || has('staff') || has('alumni') || workspaces.includes('admin') ? pick(faculty, ['faculty-campus']) : pick(student, ['campus']);
  const profile = has('student') ? pick(student, ['profile']) : contexts.length ? pick(faculty, ['faculty-profile']) : [];
  groups.push({ id: 'shared', label: 'Campus & profile', sections: [...campus, ...pick(student, ['cms-pages']), ...profile] });

  const communityHelp = contexts.length > 0;
  const support = pick(communityHelp ? student : admin, ['help']);
  const notifications = (workspaces.includes('admin') ? admin : student).find((s) => s.id === 'notifications');
  return { groups, support: [...support, notifications].filter(Boolean) };
};
