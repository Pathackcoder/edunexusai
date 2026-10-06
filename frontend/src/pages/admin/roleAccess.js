import { buildNavSections } from '../../layouts/navigation';

/**
 * What each role may do, written from the guards the backend enforces
 * (requireAuth, requireRole, requireStudentProfile, requireFacultyProfile), so the
 * Roles & Permissions page documents real behaviour rather than an aspirational matrix.
 */
export const PERMISSIONS = {
  STUDENT: [
    'Read own courses, schedule, assignments, grades and announcements',
    'Submit assignments and request official transcripts',
    'Make tuition payments and view own financial aid',
    'Manage own profile, preferences and change requests',
  ],
  FACULTY: [
    'Read courses where they are instructor of record',
    'Read the enrolled roster for those courses',
    'Send notifications and post announcements to those courses',
    'No access to another instructor’s roster, and no student financial data',
  ],
  ADMIN: [
    'Manage users, roles and account status',
    'Assign student tiers and configure widget entitlements',
    'Register and configure integrations, run connection tests and syncs',
    'View integration health and sync logs',
  ],
};

/** Extra detail for the role drawer: scope, further permissions, restrictions, guards. */
export const ROLE_DETAILS = {
  STUDENT: {
    scope:
      'Own records only. Student routes check that the caller holds the STUDENT role and has a linked student profile, and every query is scoped to that profile within the tenant.',
    tierGated: true,
    more: [
      'Book advising appointments with faculty',
      'Raise help desk tickets, submit forms and track own service requests',
      'Use campus services (directory, map, security, classrooms) included in their tier',
      'Read and manage own notifications',
    ],
    restrictions: [
      'Cannot open faculty or administration APIs',
      'Cannot read another student’s records',
      'Cannot create student follow-ups (faculty and admin only)',
      'Cannot manage shared help resources',
      'Optional features depend on the student’s tier entitlements',
    ],
    guards: [
      { route: '/academics, /finance, /library', guard: 'requireStudentProfile' },
      { route: 'POST /advising (book)', guard: "requireRole('STUDENT')" },
      { route: '/dashboard, /notifications, /directory, /campus', guard: 'requireAuth' },
    ],
  },
  FACULTY: {
    scope:
      'Teaching scope. Faculty routes require a linked faculty profile and return only courses where the caller is instructor of record, and the students enrolled in them.',
    more: [
      'Publish and manage advising availability',
      'Create and track student follow-ups (interventions)',
      'Manage shared help resources',
      'Use the AI assistant, help desk and service requests',
    ],
    restrictions: [
      'No access to another instructor’s courses or roster',
      'No student financial data (tuition, aid)',
      'Cannot open the administration console or integrations',
      'Cannot use student self-service routes (own grades, tuition)',
    ],
    guards: [
      { route: '/faculty', guard: 'requireFacultyProfile' },
      { route: '/advising slots', guard: "requireRole('FACULTY')" },
      { route: '/interventions, managed resources', guard: "requireRole('FACULTY', 'ADMIN')" },
    ],
  },
  ADMIN: {
    scope:
      'Tenant-wide administration. Every /admin route requires the ADMIN role; admins are also allowed through faculty routes for support and demonstration.',
    more: [
      'Process service requests, forms and help desk tickets',
      'Send broadcasts from the communication center and read the audit log',
      'Create and track student follow-ups (interventions)',
      'Manage shared help resources',
    ],
    restrictions: [
      'Cannot use student self-service routes (academics, finance, library)',
      'The AI study assistant is not offered to administrators',
    ],
    guards: [
      { route: '/admin', guard: "requireRole('ADMIN')" },
      { route: '/faculty (support access)', guard: 'requireFacultyProfile' },
      { route: '/interventions, managed resources', guard: "requireRole('FACULTY', 'ADMIN')" },
    ],
  },
};

const PERSONA_FLAGS = {
  STUDENT: { isAdmin: false, isFaculty: false },
  FACULTY: { isAdmin: false, isFaculty: true },
  ADMIN: { isAdmin: true, isFaculty: false },
};

/**
 * Modules a role can reach, from the same navigation builder that gates the sidebar.
 * Evaluating it with every entitlement on and then off separates the modules that are
 * always available from those that depend on the user's tier.
 */
export function roleModules(roleKey) {
  const flags = PERSONA_FLAGS[roleKey];
  if (!flags) return [];
  const pathsOf = (sections) => new Set(sections.flatMap((section) => (section.children ?? [section]).map((item) => item.path)));
  const all = buildNavSections({ ...flags, can: () => true, unreadCount: 0 });
  const base = pathsOf(buildNavSections({ ...flags, can: () => false, unreadCount: 0 }));
  return all.map((section) => ({
    id: section.id,
    label: section.label,
    icon: section.icon,
    items: (section.children ?? [section]).map((item) => ({ label: item.label, path: item.path, gated: !base.has(item.path) })),
  }));
}
