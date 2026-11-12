import { Router } from 'express';
import { contentRoutes, studioRoutes } from '../modules/cms/cmsRoutes.js';
import { authRoutes } from '../modules/auth/authRoutes.js';
import { ssoRoutes } from '../modules/identity/ssoRoutes.js';
import { healthRoutes } from '../modules/health/healthRoutes.js';
import { dashboardRoutes } from '../modules/dashboard/dashboardRoutes.js';
import { academicsRoutes } from '../modules/academics/academicsRoutes.js';
import { financeRoutes } from '../modules/finance/financeRoutes.js';
import { financialAidRoutes } from '../modules/financialAid/financialAidRoutes.js';
import { notificationRoutes } from '../modules/notifications/notificationRoutes.js';
import {
  campusDirectoryRoutes,
  campusMapRoutes,
  campusSafetyRoutes,
  directoryRoutes,
  libraryRoutes,
} from '../modules/campus/campusRoutes.js';
import { workflowRoutes } from '../modules/workflows/workflowRoutes.js';
import { advisingRoutes, interventionRoutes } from '../modules/success/successRoutes.js';
import { planningRoutes } from '../modules/planning/planningRoutes.js';
import { careerRoutes } from '../modules/career/careerRoutes.js';
import { calendarSyncRoutes } from '../modules/calendarSync/calendarSyncService.js';
import { assistantRoutes } from '../modules/assistant/assistantRoutes.js';
import { profileRoutes } from '../modules/profile/profileRoutes.js';
import { supportRoutes } from '../modules/support/supportRoutes.js';
import { facultyRoutes } from '../modules/faculty/facultyRoutes.js';
import { adminRoutes } from '../modules/admin/adminRoutes.js';
import { appearanceRoutes } from '../modules/appearance/appearanceRoutes.js';
import { lmsRoutes } from '../modules/lms/lmsRoutes.js';
import { sisRoutes } from '../modules/sis/sisRoutes.js';
import { academicAliasRoutes } from '../modules/academics/academicsAliasRoutes.js';
import { publicRoutes } from '../modules/public/publicRoutes.js';
import { chatRoutes } from '../modules/chat/chatRoutes.js';
import { analyticsRoutes } from '../modules/analytics/analyticsRoutes.js';

/**
 * The v1 surface. One line per domain; each module owns its own routes, validation and
 * access rules. Mounting a new domain is one import and one `use`.
 */
export const apiV1 = Router();

apiV1.use('/health', healthRoutes);
// Signed-out landing page content (public CMS audience, public dates); no session, no role.
apiV1.use('/public', publicRoutes);
// Institutional sign-in (OpenID Connect) first: its paths live under /auth/oidc.
apiV1.use('/auth/oidc', ssoRoutes);
apiV1.use('/auth', authRoutes);
apiV1.use('/appearance', appearanceRoutes);
apiV1.use('/lms', lmsRoutes);
apiV1.use('/sis', sisRoutes);

// Student experience
apiV1.use('/dashboard', dashboardRoutes);
apiV1.use('/academics', academicsRoutes);
apiV1.use('/finance', financeRoutes);
apiV1.use('/financial-aid', financialAidRoutes);
apiV1.use('/notifications', notificationRoutes);
apiV1.use('/directory', directoryRoutes);
apiV1.use('/library', libraryRoutes);
apiV1.use('/campus-safety', campusSafetyRoutes);
apiV1.use('/profile', profileRoutes);
apiV1.use('/help', supportRoutes);
// One-to-one messaging (realtime delivery: modules/chat/chatSocket.js on /socket.io)
apiV1.use('/chat', chatRoutes);

// Portal usage analytics: the browser tracker's ingestion route (reports live under /admin/analytics).
apiV1.use('/analytics', analyticsRoutes);

// Feddrick CMS: Studio (ADMIN) and published content delivery. Mounted before the
// root-level workflow routes so those never intercept these paths.
apiV1.use('/studio', studioRoutes);
apiV1.use('/content', contentRoutes);

// Campus Directory (Keycloak, read-only) before the other /campus routes.
apiV1.use('/campus/directory', campusDirectoryRoutes);
apiV1.use('/campus', campusMapRoutes);

// Cross-persona workflows: requests, help desk tickets, forms, resources, attachments
apiV1.use('/', workflowRoutes);

// Student success, planning, career & community, productivity
apiV1.use('/interventions', interventionRoutes);
apiV1.use('/advising', advisingRoutes);
apiV1.use('/planning', planningRoutes);
apiV1.use('/career', careerRoutes);
apiV1.use('/calendar-sync', calendarSyncRoutes);
apiV1.use('/assistant', assistantRoutes);

// Persona-specific
apiV1.use('/faculty', facultyRoutes);
apiV1.use('/admin', adminRoutes);

/**
 * Top-level aliases (GET /api/v1/courses, /schedule, /grades, ...). Mounted at the root
 * of the v1 router, after the domain mounts so an explicit domain path always wins.
 */
apiV1.use('/', academicAliasRoutes);
