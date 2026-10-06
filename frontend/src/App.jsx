import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FinanceProvider } from './context/FinanceContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { PWAProvider } from './context/PWAContext';
import { PWAInstallModal } from './components/pwa/PWAInstallModal';
import { I18nProvider } from './i18n';

import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { HelpSupportPage } from './pages/HelpSupportPage';

// Academics
import { AcademicsPage } from './pages/AcademicsPage';
import { CourseSchedulePage } from './pages/academics/CourseSchedulePage';
import { AssignmentsPage } from './pages/academics/AssignmentsPage';
import { GradesGpaPage } from './pages/academics/GradesGpaPage';
import { AnnouncementsPage } from './pages/academics/AnnouncementsPage';
import { CalendarPage } from './pages/academics/CalendarPage';
import { TranscriptsPage } from './pages/academics/TranscriptsPage';
import { LmsPage } from './pages/academics/LmsPage';

// Finance
import { TuitionPaymentsPage } from './pages/finance/TuitionPaymentsPage';
import { FinancialAidPage } from './pages/FinancialAidPage';

// Campus
import { CampusPage } from './pages/CampusPage';
import { PeopleSearchPage } from './pages/campus/PeopleSearchPage';
import { LibraryPage } from './pages/campus/LibraryPage';
import { CampusSecurityPage } from './pages/campus/CampusSecurityPage';

// Profile
import { ProfilePage } from './pages/ProfilePage';
import { PersonalInfoPage } from './pages/profile/PersonalInfoPage';
import { EmergencyContactPage } from './pages/profile/EmergencyContactPage';
import { PrivacyPreferencesPage } from './pages/profile/PrivacyPreferencesPage';
import { CommunicationPreferencesPage } from './pages/profile/CommunicationPreferencesPage';
import { RequestsHistoryPage } from './pages/profile/RequestsHistoryPage';

// Faculty
import { FacultyDashboardPage } from './pages/faculty/FacultyDashboardPage';
import { FacultyCoursesPage } from './pages/faculty/FacultyCoursesPage';
import { FacultyCourseDetailPage } from './pages/faculty/FacultyCourseDetailPage';
import { FacultyAnnouncementsPage } from './pages/faculty/FacultyAnnouncementsPage';
import { FacultySchedulePage } from './pages/faculty/FacultySchedulePage';

// Admin
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminRolesPage } from './pages/admin/AdminRolesPage';
import { AdminEntitlementsPage } from './pages/admin/AdminEntitlementsPage';
import { AdminIntegrationsPage } from './pages/admin/AdminIntegrationsPage';
import { AdminIntegrationDetailPage } from './pages/admin/AdminIntegrationDetailPage';

// Help & Support (requester side of the cross-persona workflows)
import { MyRequestsPage } from './pages/help/MyRequestsPage';
import { SupportTicketsPage } from './pages/help/SupportTicketsPage';
import { FormsPage } from './pages/help/FormsPage';
import { ResourcesPage } from './pages/help/ResourcesPage';

// Advanced features
import { DegreeProgressPage } from './pages/academics/DegreeProgressPage';
import { RecommendationsPage } from './pages/academics/RecommendationsPage';
import { LearningPathPage } from './pages/academics/LearningPathPage';
import { InsightsPage } from './pages/academics/InsightsPage';
import { AdvisingPage } from './pages/academics/AdvisingPage';
import { CampusMapPage } from './pages/campus/CampusMapPage';
import { ClassroomAvailabilityPage } from './pages/campus/ClassroomAvailabilityPage';
import { OpportunitiesPage } from './pages/career/OpportunitiesPage';
import { PortfolioPage } from './pages/career/PortfolioPage';
import { GroupsPage } from './pages/career/GroupsPage';
import { AchievementsPage } from './pages/career/AchievementsPage';
import { FacultyAdvisingPage } from './pages/faculty/FacultyAdvisingPage';
import { FacultyInterventionsPage } from './pages/faculty/FacultyInterventionsPage';

import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { FullPageLoader } from './components/common/FullPageLoader';

/**
 * Route guards.
 *
 * `initialising` is the important addition: on a page reload the session token exists but
 * GET /auth/me has not returned yet. Without this gate a signed-in user would be
 * redirected to the login page for a moment on every refresh.
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, initialising } = useAuth();
  if (initialising) return <FullPageLoader label="Restoring your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, initialising } = useAuth();
  if (initialising) return <FullPageLoader label="Checking your session…" />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
};

/** Role gate. The backend enforces access; this keeps the UI from offering dead ends. */
const RoleRoute = ({ allow, children }) => {
  const { hasRole, initialising } = useAuth();
  if (initialising) return <FullPageLoader />;
  if (!hasRole(...allow)) return <AccessDeniedPage requiredRoles={allow} />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />

        {/* Persona-aware: DashboardPage renders the student, faculty or admin view */}
        <Route path="dashboard" element={<DashboardPage />} />

        {/* Academics (student) */}
        <Route path="academics" element={<RoleRoute allow={['STUDENT']}><AcademicsPage /></RoleRoute>} />
        <Route path="academics/schedule" element={<RoleRoute allow={['STUDENT']}><CourseSchedulePage /></RoleRoute>} />
        <Route path="academics/assignments" element={<RoleRoute allow={['STUDENT']}><AssignmentsPage /></RoleRoute>} />
        <Route path="academics/grades" element={<RoleRoute allow={['STUDENT']}><GradesGpaPage /></RoleRoute>} />
        <Route path="academics/announcements" element={<RoleRoute allow={['STUDENT']}><AnnouncementsPage /></RoleRoute>} />
        <Route path="academics/calendar" element={<CalendarPage />} />
        <Route path="academics/transcripts" element={<RoleRoute allow={['STUDENT']}><TranscriptsPage /></RoleRoute>} />
        <Route path="academics/lms" element={<RoleRoute allow={['STUDENT']}><LmsPage /></RoleRoute>} />
        <Route path="academics/degree-progress" element={<RoleRoute allow={['STUDENT']}><DegreeProgressPage /></RoleRoute>} />
        <Route path="academics/recommendations" element={<RoleRoute allow={['STUDENT']}><RecommendationsPage /></RoleRoute>} />
        <Route path="academics/learning-path" element={<RoleRoute allow={['STUDENT']}><LearningPathPage /></RoleRoute>} />
        <Route path="academics/insights" element={<RoleRoute allow={['STUDENT']}><InsightsPage /></RoleRoute>} />
        <Route path="academics/advising" element={<RoleRoute allow={['STUDENT']}><AdvisingPage /></RoleRoute>} />

        {/* Career & community (student) */}
        <Route path="career" element={<Navigate to="/career/opportunities" replace />} />
        <Route path="career/opportunities" element={<RoleRoute allow={['STUDENT']}><OpportunitiesPage /></RoleRoute>} />
        <Route path="career/portfolio" element={<RoleRoute allow={['STUDENT']}><PortfolioPage /></RoleRoute>} />
        <Route path="career/groups" element={<RoleRoute allow={['STUDENT']}><GroupsPage /></RoleRoute>} />
        <Route path="career/achievements" element={<RoleRoute allow={['STUDENT']}><AchievementsPage /></RoleRoute>} />

        {/* Finance (student) */}
        <Route path="finance" element={<RoleRoute allow={['STUDENT']}><TuitionPaymentsPage /></RoleRoute>} />
        <Route path="finance/tuition" element={<RoleRoute allow={['STUDENT']}><TuitionPaymentsPage /></RoleRoute>} />
        <Route path="finance/financial-aid" element={<RoleRoute allow={['STUDENT']}><FinancialAidPage /></RoleRoute>} />
        <Route path="financial-aid" element={<Navigate to="/finance/financial-aid" replace />} />

        {/* Campus */}
        <Route path="campus" element={<CampusPage />} />
        <Route path="campus/people" element={<PeopleSearchPage />} />
        <Route path="campus/library" element={<RoleRoute allow={['STUDENT']}><LibraryPage /></RoleRoute>} />
        <Route path="campus/security" element={<CampusSecurityPage />} />
        <Route path="campus/map" element={<CampusMapPage />} />
        <Route path="campus/classrooms" element={<ClassroomAvailabilityPage />} />

        {/* Profile */}
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profile/personal" element={<PersonalInfoPage />} />
        <Route path="profile/emergency" element={<RoleRoute allow={['STUDENT']}><EmergencyContactPage /></RoleRoute>} />
        <Route path="profile/privacy" element={<RoleRoute allow={['STUDENT']}><PrivacyPreferencesPage /></RoleRoute>} />
        <Route path="profile/preferences" element={<CommunicationPreferencesPage />} />
        <Route path="profile/requests" element={<RequestsHistoryPage />} />

        {/* Faculty */}
        <Route path="faculty" element={<RoleRoute allow={['FACULTY', 'ADMIN']}><FacultyDashboardPage /></RoleRoute>} />
        <Route path="faculty/courses" element={<RoleRoute allow={['FACULTY', 'ADMIN']}><FacultyCoursesPage /></RoleRoute>} />
        <Route path="faculty/courses/:courseId" element={<RoleRoute allow={['FACULTY', 'ADMIN']}><FacultyCourseDetailPage /></RoleRoute>} />
        <Route path="faculty/announcements" element={<RoleRoute allow={['FACULTY', 'ADMIN']}><FacultyAnnouncementsPage /></RoleRoute>} />
        <Route path="faculty/schedule" element={<RoleRoute allow={['FACULTY', 'ADMIN']}><FacultySchedulePage /></RoleRoute>} />
        <Route path="faculty/advising" element={<RoleRoute allow={['FACULTY']}><FacultyAdvisingPage /></RoleRoute>} />
        <Route path="faculty/interventions" element={<RoleRoute allow={['FACULTY', 'ADMIN']}><FacultyInterventionsPage /></RoleRoute>} />

        {/* Admin */}
        <Route path="admin" element={<RoleRoute allow={['ADMIN']}><AdminDashboardPage /></RoleRoute>} />
        <Route path="admin/users" element={<RoleRoute allow={['ADMIN']}><AdminUsersPage /></RoleRoute>} />
        <Route path="admin/roles" element={<RoleRoute allow={['ADMIN']}><AdminRolesPage /></RoleRoute>} />
        <Route path="admin/entitlements" element={<RoleRoute allow={['ADMIN']}><AdminEntitlementsPage /></RoleRoute>} />
        <Route path="admin/integrations" element={<RoleRoute allow={['ADMIN']}><AdminIntegrationsPage /></RoleRoute>} />
        <Route path="admin/integrations/:integrationId" element={<RoleRoute allow={['ADMIN']}><AdminIntegrationDetailPage /></RoleRoute>} />

        {/* Help & notifications: every persona */}
        <Route path="help" element={<HelpSupportPage />} />
        <Route path="help/faqs" element={<HelpSupportPage />} />
        <Route path="help/requests" element={<RoleRoute allow={['STUDENT', 'FACULTY']}><MyRequestsPage /></RoleRoute>} />
        <Route path="help/tickets" element={<RoleRoute allow={['STUDENT', 'FACULTY']}><SupportTicketsPage /></RoleRoute>} />
        <Route path="help/forms" element={<RoleRoute allow={['STUDENT', 'FACULTY']}><FormsPage /></RoleRoute>} />
        <Route path="help/resources" element={<ResourcesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <PWAProvider>
        {/* AuthProvider is outermost: both of the providers below read the session.
            NotificationProvider is above FinanceProvider because a payment refreshes
            the notification list. */}
        <AuthProvider>
          <I18nProvider>
          <NotificationProvider>
            <FinanceProvider>
              <ToastProvider>
                <BrowserRouter>
                  <AppRoutes />
                  <PWAInstallModal />
                </BrowserRouter>
              </ToastProvider>
            </FinanceProvider>
          </NotificationProvider>
          </I18nProvider>
        </AuthProvider>
      </PWAProvider>
    </ErrorBoundary>
  );
}

export default App;
