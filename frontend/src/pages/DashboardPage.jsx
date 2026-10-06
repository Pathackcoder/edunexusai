import React from 'react';
import { useAuth } from '../context/AuthContext';
import { StudentDashboard } from './dashboard/StudentDashboard';
import { FacultyDashboardPage } from './faculty/FacultyDashboardPage';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { FullPageLoader } from '../components/common/FullPageLoader';

/**
 * `/dashboard` is one route for three personas. Which experience renders is decided by
 * the roles the backend returned for the session, not by anything in the URL.
 */
export const DashboardPage = () => {
  const { initialising, isAdmin, isFaculty } = useAuth();

  if (initialising) return <FullPageLoader />;
  if (isAdmin) return <AdminDashboardPage />;
  if (isFaculty) return <FacultyDashboardPage />;
  return <StudentDashboard />;
};

export default DashboardPage;
