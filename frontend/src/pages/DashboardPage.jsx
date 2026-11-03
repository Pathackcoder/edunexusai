import React from 'react';
import Alert from '@mui/material/Alert';
import { useAuth } from '../context/AuthContext';
import { StudentDashboard } from './dashboard/StudentDashboard';
import { MultiRoleDashboard } from './dashboard/MultiRoleDashboard';
import { CommunityContextDashboard } from './dashboard/CommunityContextDashboard';
import { FacultyDashboardPage } from './faculty/FacultyDashboardPage';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { FullPageLoader } from '../components/common/FullPageLoader';
import { UnlinkedNotices } from './dashboard/UnlinkedNotices';

/**
 * `/dashboard` is one route for every role. Which experience renders is decided by the role
 * contexts the backend returned for the session, not by anything in the URL:
 * - one role (the common case): that role's dashboard, exactly as before;
 * - several roles: the multi-role dashboard (Overview plus one view per role and workspace);
 * - a role whose record is not linked yet, and nothing else: an explanation, never empty data.
 */
export const DashboardPage = () => {
  const { initialising, isAdmin, isFaculty, isMultiRole, contexts, workspaces, unlinkedContexts } = useAuth();

  if (initialising) return <FullPageLoader />;
  if (isMultiRole) return <MultiRoleDashboard />;
  if (!contexts.length && !workspaces.length && unlinkedContexts.length) {
    return (
      <Alert severity="info" role="status">
        Your account is not linked to a verified institutional record yet, so there is nothing to show here. Contact the registrar or the help desk.
      </Alert>
    );
  }
  // Staff and alumni have their own dashboards; nobody falls through to the student one by default.
  const only = contexts[0]?.key;
  const single = isAdmin ? <AdminDashboardPage /> : isFaculty ? <FacultyDashboardPage />
    : only === 'staff' || only === 'alumni' ? <CommunityContextDashboard contextKey={only} /> : <StudentDashboard />;
  if (!unlinkedContexts.length) return single;
  return (
    <>
      <UnlinkedNotices sx={{ mb: 2 }} />
      {single}
    </>
  );
};

export default DashboardPage;
