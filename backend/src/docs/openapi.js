/**
 * OpenAPI 3.0 description of the EdunexusAI API, served at /api-docs.
 *
 * Hand-written rather than generated from annotations so the examples stay meaningful
 * and the integration semantics (what is Edunexus-owned versus provider-owned) are
 * stated where a reader will actually see them.
 */

const envelope = (dataSchema, extra = {}) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
    meta: { type: 'object', additionalProperties: true, ...extra },
  },
});

const errorResponse = {
  description: 'Standard error envelope',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'RESOURCE_NOT_FOUND' },
              message: { type: 'string', example: 'Course not found' },
              details: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
};

const responses = {
  400: { ...errorResponse, description: 'Validation failed (VALIDATION_ERROR)' },
  401: { ...errorResponse, description: 'Not authenticated (UNAUTHENTICATED / TOKEN_EXPIRED)' },
  403: { ...errorResponse, description: 'Role or tenant check failed (FORBIDDEN)' },
  404: { ...errorResponse, description: 'Not found (RESOURCE_NOT_FOUND)' },
  409: { ...errorResponse, description: 'Conflict or integration not configured' },
  502: { ...errorResponse, description: 'External system failed (INTEGRATION_ERROR)' },
};

const ok = (description, schema, example) => ({
  description,
  content: {
    'application/json': {
      schema: envelope(schema),
      ...(example ? { example } : {}),
    },
  },
});

const jsonBody = (schema, example) => ({
  required: true,
  content: { 'application/json': { schema, ...(example ? { example } : {}) } },
});

const object = (properties) => ({ type: 'object', properties });
const arrayOf = (items) => ({ type: 'array', items });
const str = (example) => ({ type: 'string', ...(example !== undefined ? { example } : {}) });
const num = (example) => ({ type: 'number', ...(example !== undefined ? { example } : {}) });
const bool = (example) => ({ type: 'boolean', ...(example !== undefined ? { example } : {}) });

const courseSchema = object({
  id: str('8f2b1c4e-...'),
  code: str('CS 501'),
  courseCode: str('CS 501'),
  name: str('Advanced Database Systems'),
  instructor: str('Dr. Sarah Mitchell'),
  room: str('Science Building 204'),
  credits: num(4),
  days: arrayOf(str('Monday')),
  time: str('10:00 AM - 11:30 AM'),
  currentGrade: str('A'),
  percentage: num(95),
  dataSource: object({
    system: str('MOCK_UNIVERSITY'),
    externalId: str('SIS-CRS-1000'),
    lastSyncedAt: str('2026-10-04T09:09:30.000Z'),
  }),
});

const uuidParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description,
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'EdunexusAI API',
    version: '1.0.0',
    description: `
Experience-layer API for the EdunexusAI student digital experience platform.

**Architecture.** React never reads a database and never holds an external credential.
Every screen calls this API. This API owns application data in PostgreSQL and reaches
external institutional systems only through the integration layer:

    React -> API -> Auth/RBAC -> Domain service -> Integration service
                 -> Connector -> External system -> Canonical mapper -> API -> React

**Data ownership.**
* *Edunexus-owned* — users, roles, tiers, entitlements, tuition and payments,
  announcements, notifications, transcripts, library, directory, FAQs, preferences,
  profile change requests, integration configuration.
* *Provider-owned* — courses, enrollments, assignments, grade breakdowns and financial
  aid. These arrive through a connector and carry a \`dataSource\` block naming the
  system of record, the external id and the last sync time.

**Authentication.** Demo JWT: \`POST /auth/login\` returns a short-lived access token and
a rotating refresh token. Production will federate to the institution's identity provider
over SAML or OIDC; only this module changes, because every route depends on the resolved
request context rather than on how the user authenticated.

**Tenancy.** The tenant is taken from the authenticated user. No endpoint accepts a
tenant id, so one institution's data can never be requested from another's session.
    `.trim(),
    contact: { name: 'EdunexusAI engineering' },
  },
  servers: [
    { url: 'http://localhost:5001/api/v1', description: 'Local development' },
  ],
  tags: [
    { name: 'Health', description: 'Liveness and database readiness' },
    { name: 'Authentication', description: 'Login, refresh, session' },
    { name: 'Dashboard', description: 'Persona-aware aggregated dashboard' },
    { name: 'Academics', description: 'Courses, schedule, assignments, grades, announcements, calendar, transcripts' },
    { name: 'Finance', description: 'Tuition account and payments' },
    { name: 'Financial Aid', description: 'Award package, read through the provider' },
    { name: 'Notifications', description: 'Notification centre' },
    { name: 'Campus', description: 'Directory, library, campus safety' },
    { name: 'Profile', description: 'Self-service profile and change requests' },
    { name: 'Help', description: 'FAQs and support contacts' },
    { name: 'Faculty', description: 'Faculty courses, rosters and class messaging' },
    { name: 'Admin', description: 'Users, roles, tiers, entitlements, integrations, health' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `accessToken` returned by POST /auth/login.',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Service and database health',
        security: [],
        responses: {
          200: {
            description: 'Service is up',
            content: {
              'application/json': {
                example: {
                  status: 'ok',
                  database: 'connected',
                  service: 'edunexusai-api',
                  version: '1.0.0',
                  environment: 'development',
                  academicReadMode: 'synced',
                },
              },
            },
          },
          503: { description: 'Database unreachable' },
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Exchange credentials for tokens',
        security: [],
        requestBody: jsonBody(
          object({ email: str(), password: str(), tenantSlug: str('demo-university') }),
          { email: 'student@edunexus.ai', password: 'Student@Demo2026!' },
        ),
        responses: {
          200: ok(
            'Authenticated',
            object({
              accessToken: str(),
              refreshToken: str(),
              tokenType: str('Bearer'),
              expiresIn: str('30m'),
              user: object({
                id: str(),
                email: str('student@edunexus.ai'),
                fullName: str('Amit Pathak'),
                roles: arrayOf(str('STUDENT')),
                persona: str('STUDENT'),
                tier: object({ key: str('STANDARD'), name: str('Standard') }),
                entitlements: arrayOf(str('dashboard.schedule')),
              }),
            }),
          ),
          400: responses[400],
          401: { ...responses[401], description: 'INVALID_CREDENTIALS' },
          429: { ...errorResponse, description: 'Too many attempts (RATE_LIMITED)' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate the refresh token and issue a new access token',
        security: [],
        requestBody: jsonBody(object({ refreshToken: str() })),
        responses: { 200: ok('New token pair', object({ accessToken: str(), refreshToken: str() })), 401: responses[401] },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Current user with roles, tier and entitlements',
        responses: { 200: ok('Session user', object({ user: object({}) })), 401: responses[401] },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke refresh tokens',
        responses: { 200: ok('Revoked', object({ revoked: bool(true) })), 401: responses[401] },
      },
    },

    '/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Aggregated dashboard for the caller persona',
        description:
          'Returns only the widgets the caller is entitled to. Students receive `panels` keyed by widget; faculty receive courses and rosters; admins receive tenant counts and integration health. A panel that fails to load is marked `status: "error"` instead of failing the whole response.',
        responses: {
          200: ok(
            'Dashboard payload',
            object({
              persona: str('STUDENT'),
              tier: object({ key: str('STANDARD') }),
              widgets: arrayOf(str('dashboard.schedule')),
              panels: object({}),
            }),
          ),
          401: responses[401],
        },
      },
    },

    '/courses': {
      get: {
        tags: ['Academics'],
        summary: "The student's enrolled courses",
        description:
          'Provider-owned. Each item carries `dataSource` naming the system of record. Also available at `/academics/courses`.',
        responses: { 200: ok('Courses', arrayOf(courseSchema)), 401: responses[401], 403: responses[403] },
      },
    },
    '/courses/{id}': {
      get: {
        tags: ['Academics'],
        summary: 'One course with its grade breakdown',
        parameters: [uuidParam('id', 'Course id')],
        responses: { 200: ok('Course', courseSchema), 404: responses[404] },
      },
    },
    '/schedule': {
      get: {
        tags: ['Academics'],
        summary: "Today's classes plus the full timetable",
        responses: {
          200: ok('Schedule', object({ dayName: str('Monday'), date: str('2026-10-04'), courses: arrayOf(courseSchema), allCourses: arrayOf(courseSchema) })),
        },
      },
    },
    '/assignments': {
      get: {
        tags: ['Academics'],
        summary: 'Assignments for enrolled courses, with this student\'s submission state',
        responses: { 200: ok('Assignments', arrayOf(object({ id: str(), title: str('Database Schema Design'), courseCode: str('CS 501'), dueDate: str('2026-09-28'), status: str('Pending'), urgency: str('due-soon') }))) },
      },
    },
    '/assignments/{id}/submit': {
      post: {
        tags: ['Academics'],
        summary: 'Submit an assignment',
        parameters: [uuidParam('id', 'Assignment id')],
        requestBody: jsonBody(object({ note: str('Attached ER diagram and DDL.') })),
        responses: { 200: ok('Updated assignment', object({})), 404: responses[404] },
      },
    },
    '/grades': {
      get: {
        tags: ['Academics'],
        summary: 'GPA summary, current-term grades and prior-term history',
        description: 'Prior-term history is read through the provider; if the provider is unreachable the stored transcript terms are used and `meta.historySource` says so.',
        responses: { 200: ok('Grades', object({ cumulativeGpa: num(3.72), currentCourses: arrayOf(object({})), pastTerms: arrayOf(object({})) })) },
      },
    },
    '/announcements': {
      get: {
        tags: ['Academics'],
        summary: 'Announcements for enrolled courses',
        responses: { 200: ok('Announcements', arrayOf(object({ id: str(), title: str(), author: str('Dr. Sarah Mitchell'), isRead: bool(false) }))) },
      },
    },
    '/announcements/{id}/read': {
      patch: {
        tags: ['Academics'],
        summary: 'Mark an announcement read for the current user',
        parameters: [uuidParam('id', 'Announcement id')],
        responses: { 200: ok('Read receipt', object({ id: str(), isRead: bool(true) })) },
      },
    },
    '/calendar': {
      get: {
        tags: ['Academics'],
        summary: 'Academic calendar events',
        parameters: [{ name: 'category', in: 'query', schema: str('examination') }],
        responses: { 200: ok('Events', arrayOf(object({ id: str(), title: str(), date: str('2026-10-12'), category: str('holiday') }))) },
      },
    },
    '/transcripts': {
      get: {
        tags: ['Academics'],
        summary: 'Unofficial transcript: summary plus every term',
        responses: { 200: ok('Transcript', object({ summary: object({}), terms: arrayOf(object({})) })) },
      },
    },
    '/transcript-requests': {
      get: {
        tags: ['Academics'],
        summary: 'Official transcript request history',
        responses: { 200: ok('Requests', arrayOf(object({}))) },
      },
      post: {
        tags: ['Academics'],
        summary: 'Submit an official transcript request',
        requestBody: jsonBody(
          object({ deliveryType: str(), recipient: str(), recipientEmail: str(), copies: num(1) }),
          {
            deliveryType: 'Electronic PDF (Secure Parchment)',
            recipient: 'Graduate Admissions Office',
            recipientEmail: 'admissions@example.edu',
            copies: 1,
          },
        ),
        responses: { 201: ok('Created', object({})), 400: responses[400] },
      },
    },

    '/finance': {
      get: {
        tags: ['Finance'],
        summary: 'Tuition account, charge breakdown and transactions',
        responses: { 200: ok('Account', object({ currentBalance: num(4280), formattedBalance: str('$4,280.00'), status: str('Due in 11 days'), breakdown: arrayOf(object({})), transactions: arrayOf(object({})) })) },
      },
    },
    '/finance/payments': {
      get: { tags: ['Finance'], summary: 'Transaction history', responses: { 200: ok('Payments', arrayOf(object({}))) } },
      post: {
        tags: ['Finance'],
        summary: 'Record a tuition payment',
        description: 'Decrements the balance, writes the transaction and creates a notification in one database transaction.',
        requestBody: jsonBody(object({ amount: num(500), methodType: str('Card'), methodDisplay: str('Visa ending in 4242') })),
        responses: { 201: ok('Payment recorded', object({ transactionId: str(), receiptNumber: str(), newBalance: num(3780) })), 400: responses[400] },
      },
    },
    '/finance/reset': {
      post: { tags: ['Finance'], summary: 'Demo only — restore the seeded balance', responses: { 200: ok('Reset', object({})) } },
    },

    '/financial-aid': {
      get: {
        tags: ['Financial Aid'],
        summary: 'Aid package, read through the provider',
        description: 'Read-through: the connector is called on each request. If the provider is unreachable the cached copy is returned with `meta.degraded: true` so the UI can say it is not live.',
        responses: { 200: ok('Aid package', object({ status: str('Approved'), totalAidAwarded: num(7220), awards: arrayOf(object({})), meta: object({ source: str('INTEGRATION'), live: bool(true) }) })), 404: responses[404] },
      },
    },

    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Notifications for the current user',
        parameters: [{ name: 'unreadOnly', in: 'query', schema: bool(false) }],
        responses: { 200: ok('Notifications', arrayOf(object({ id: str(), title: str(), isRead: bool(false), timeAgo: str('2 hours ago') }))) },
      },
    },
    '/notifications/{id}/read': {
      patch: { tags: ['Notifications'], summary: 'Mark one read', parameters: [uuidParam('id', 'Notification id')], responses: { 200: ok('Updated', object({})), 404: responses[404] } },
    },
    '/notifications/read-all': {
      patch: { tags: ['Notifications'], summary: 'Mark every notification read', responses: { 200: ok('Updated', object({ updated: num(3) })) } },
    },

    '/directory': {
      get: {
        tags: ['Campus'],
        summary: 'Campus directory search',
        parameters: [
          { name: 'search', in: 'query', schema: str('mitchell') },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['all', 'student', 'faculty', 'staff'] } },
          { name: 'department', in: 'query', schema: str() },
        ],
        responses: { 200: ok('Directory', object({ people: arrayOf(object({})), departments: arrayOf(str()) })) },
      },
    },
    '/library': {
      get: { tags: ['Campus'], summary: 'Library account, loans and catalogue', responses: { 200: ok('Library', object({ summary: object({}), loans: arrayOf(object({})), catalog: arrayOf(object({})) })) } },
    },
    '/library/loans/{id}/renew': {
      post: { tags: ['Campus'], summary: 'Renew a loan', parameters: [uuidParam('id', 'Loan id')], responses: { 200: ok('Renewed', object({})), 404: responses[404] } },
    },
    '/campus-safety': {
      get: { tags: ['Campus'], summary: 'Security contacts, dispatch details and emergency procedures', responses: { 200: ok('Campus safety', object({ contacts: arrayOf(object({})), procedures: arrayOf(object({})), safeWalk: object({}) })) } },
    },

    '/profile': {
      get: { tags: ['Profile'], summary: 'Current profile', responses: { 200: ok('Profile', object({ user: object({}) })) } },
      patch: {
        tags: ['Profile'],
        summary: 'Update self-service fields',
        description: 'Contact details, pronouns, directory visibility and emergency contact. Legal name and address of record are NOT editable here; they require a change request.',
        requestBody: jsonBody(object({ phone: str('(555) 234-5678'), pronouns: str('he/him'), emergencyContact: object({ name: str(), phone: str() }) })),
        responses: { 200: ok('Updated profile', object({ user: object({}) })), 400: responses[400] },
      },
    },
    '/profile/requests': {
      get: { tags: ['Profile'], summary: 'Change request history', responses: { 200: ok('Requests', object({ addressRequests: arrayOf(object({})), nameRequests: arrayOf(object({})) })) } },
    },
    '/profile/address-change': {
      post: {
        tags: ['Profile'],
        summary: 'Request an address-of-record change',
        requestBody: jsonBody(object({ addressLine1: str('42 Campus Way, Apt 3B'), city: str('Boston'), state: str('MA'), postalCode: str('02115'), reason: str() })),
        responses: { 201: ok('Request created', object({})), 400: responses[400] },
      },
    },
    '/profile/name-change': {
      post: {
        tags: ['Profile'],
        summary: 'Request a legal name change',
        requestBody: jsonBody(object({ firstName: str(), lastName: str(), reason: str('Marriage') })),
        responses: { 201: ok('Request created', object({})), 400: responses[400] },
      },
    },
    '/profile/communication-preferences': {
      get: { tags: ['Profile'], summary: 'Communication preferences by category', responses: { 200: ok('Preferences', arrayOf(object({ id: str('academic'), isMandatory: bool(false), channels: object({ email: bool(true), sms: bool(true), push: bool(true) }) }))) } },
      patch: {
        tags: ['Profile'],
        summary: 'Update communication preferences',
        description: 'Categories flagged mandatory (emergency alerts) cannot be disabled and are ignored if submitted.',
        requestBody: jsonBody(object({ preferences: arrayOf(object({ categoryKey: str('events'), email: bool(true), sms: bool(false), push: bool(true) })) })),
        responses: { 200: ok('Updated preferences', arrayOf(object({}))) },
      },
    },

    '/help': {
      get: { tags: ['Help'], summary: 'FAQ categories, FAQs and support contacts', responses: { 200: ok('Help content', object({ categories: arrayOf(object({})), faqs: arrayOf(object({})), supportContacts: object({}) })) } },
    },

    '/faculty/courses': {
      get: { tags: ['Faculty'], summary: 'Courses this faculty member teaches', responses: { 200: ok('Courses', arrayOf(object({ code: str('CS 501'), enrolledCount: num(2) }))), 403: responses[403] } },
    },
    '/faculty/courses/{courseId}/students': {
      get: { tags: ['Faculty'], summary: 'Enrolled student roster', description: 'Only the instructor of record for the course (or an admin) may read a roster.', parameters: [uuidParam('courseId', 'Course id')], responses: { 200: ok('Roster', object({ enrolledCount: num(2), students: arrayOf(object({})) })), 403: responses[403] } },
    },
    '/faculty/courses/{courseId}/notifications': {
      post: {
        tags: ['Faculty'],
        summary: 'Send a notification to every enrolled student',
        description: 'Writes one Notification row per enrolled student. Those rows appear in each student\'s notification centre.',
        parameters: [uuidParam('courseId', 'Course id')],
        requestBody: jsonBody(object({ title: str('Midterm review session added'), message: str('Extra review session Friday 3pm in Sci 204.'), priority: { type: 'string', enum: ['low', 'normal', 'high'] } })),
        responses: { 201: ok('Sent', object({ notificationsCreated: num(2), recipientCount: num(2) })), 403: responses[403] },
      },
    },
    '/faculty/courses/{courseId}/announcements': {
      post: { tags: ['Faculty'], summary: 'Post a course announcement', parameters: [uuidParam('courseId', 'Course id')], requestBody: jsonBody(object({ title: str(), content: str(), tags: arrayOf(str()) })), responses: { 201: ok('Posted', object({})) } },
    },
    '/faculty/announcements': {
      get: { tags: ['Faculty'], summary: 'Announcements authored by this faculty member', responses: { 200: ok('Announcements', arrayOf(object({}))) } },
    },
    '/faculty/schedule': {
      get: { tags: ['Faculty'], summary: 'Teaching timetable', responses: { 200: ok('Schedule', arrayOf(object({}))) } },
    },

    '/admin/dashboard': {
      get: { tags: ['Admin'], summary: 'Tenant counts, tiers and integration health', responses: { 200: ok('Admin dashboard', object({ counts: object({}), integrationHealth: arrayOf(object({})), recentSyncLogs: arrayOf(object({})) })), 403: responses[403] } },
    },
    '/admin/users': {
      get: { tags: ['Admin'], summary: 'List users', parameters: [{ name: 'role', in: 'query', schema: { type: 'string', enum: ['STUDENT', 'FACULTY', 'ADMIN'] } }, { name: 'search', in: 'query', schema: str() }], responses: { 200: ok('Users', arrayOf(object({}))), 403: responses[403] } },
      post: {
        tags: ['Admin'],
        summary: 'Create a user',
        description: 'Creating a STUDENT also creates the student record, so the new account has something to show on first login.',
        requestBody: jsonBody(object({ email: str(), password: str(), firstName: str(), lastName: str(), roles: arrayOf(str('STUDENT')), tierKey: str('ADVANCED') })),
        responses: { 201: ok('Created', object({})), 400: responses[400], 409: responses[409] },
      },
    },
    '/admin/users/{id}': {
      get: { tags: ['Admin'], summary: 'One user', parameters: [uuidParam('id', 'User id')], responses: { 200: ok('User', object({})), 404: responses[404] } },
      patch: {
        tags: ['Admin'],
        summary: 'Update a user, their roles or their tier',
        description: 'Changing `tierKey` changes which widgets that student\'s dashboard returns on the next load. This is the configurability demonstration.',
        parameters: [uuidParam('id', 'User id')],
        requestBody: jsonBody(object({ tierKey: str('ADVANCED'), roles: arrayOf(str('STUDENT')), status: str('ACTIVE') })),
        responses: { 200: ok('Updated', object({})), 400: responses[400], 404: responses[404] },
      },
    },
    '/admin/roles': {
      get: { tags: ['Admin'], summary: 'Roles and how many users hold each', responses: { 200: ok('Roles', arrayOf(object({ key: str('STUDENT'), userCount: num(2) }))) } },
    },
    '/admin/student-tiers': {
      get: { tags: ['Admin'], summary: 'Student tiers with their enabled widgets', responses: { 200: ok('Tiers', arrayOf(object({ key: str('STANDARD'), studentCount: num(1), enabledWidgets: arrayOf(str()) }))) } },
    },
    '/admin/widget-entitlements': {
      get: { tags: ['Admin'], summary: 'Full tier x widget entitlement matrix', responses: { 200: ok('Matrix', object({ tiers: arrayOf(object({})), widgets: arrayOf(object({})), matrix: arrayOf(object({})) })) } },
      patch: {
        tags: ['Admin'],
        summary: 'Enable or disable widgets for a tier',
        requestBody: jsonBody(object({ updates: arrayOf(object({ tierId: str(), widgetKey: str('dashboard.financial_aid'), enabled: bool(false) })) })),
        responses: { 200: ok('Applied', object({ applied: arrayOf(object({})) })), 400: responses[400] },
      },
    },
    '/admin/integrations': {
      get: { tags: ['Admin'], summary: 'Registered integrations with health', description: 'Secrets are never returned. Each row reports `credentialRef` (the environment variable name) and `credentialConfigured` (whether it currently resolves).', responses: { 200: ok('Integrations', arrayOf(object({ key: str('mock-university'), provider: str('MOCK_UNIVERSITY'), mode: str('MOCK'), status: str('CONNECTED'), credentialRef: str('MOCK_UNIVERSITY_API_KEY'), credentialConfigured: bool(true) }))) } },
      post: { tags: ['Admin'], summary: 'Register an integration', requestBody: jsonBody(object({ key: str('canvas-prod'), provider: str('CANVAS'), displayName: str(), baseUrl: str(), authType: str('BEARER_TOKEN'), credentialRef: str('CANVAS_API_TOKEN') })), responses: { 201: ok('Created', object({})), 409: responses[409] } },
    },
    '/admin/integrations/providers': {
      get: { tags: ['Admin'], summary: 'Providers the registry can build a connector for', responses: { 200: ok('Providers', arrayOf(object({ provider: str('CANVAS'), label: str('Canvas LMS'), liveCapable: bool(true), implementsDataCalls: bool(true) }))) } },
    },
    '/admin/integrations/{id}': {
      get: { tags: ['Admin'], summary: 'Integration detail with recent logs', parameters: [uuidParam('id', 'Integration id')], responses: { 200: ok('Integration', object({})), 404: responses[404] } },
      patch: { tags: ['Admin'], summary: 'Update integration configuration', parameters: [uuidParam('id', 'Integration id')], requestBody: jsonBody(object({ mode: str('LIVE'), baseUrl: str(), enabled: bool(true), timeoutMs: num(8000), supportedDomains: arrayOf(str('COURSES')) })), responses: { 200: ok('Updated', object({})), 400: responses[400] } },
    },
    '/admin/integrations/{id}/test': {
      post: { tags: ['Admin'], summary: 'Test the connection', description: 'Calls the provider through the connector, records a sync log row and updates the stored health. A provider that is configuration-only answers 409 INTEGRATION_NOT_CONFIGURED and is recorded as NOT_CONNECTED.', parameters: [uuidParam('id', 'Integration id')], responses: { 200: ok('Test result', object({ healthy: bool(true), responseTimeMs: num(124), recordCount: num(17) })), 409: responses[409], 502: responses[502] } },
    },
    '/admin/integrations/{id}/sync': {
      post: { tags: ['Admin'], summary: 'Pull courses, enrollments and assignments now', parameters: [uuidParam('id', 'Integration id')], responses: { 200: ok('Sync result', object({ courses: num(4), enrollments: num(6), assignments: num(5) })), 409: responses[409], 502: responses[502] } },
    },
    '/admin/integrations/{id}/health': {
      get: { tags: ['Admin'], summary: 'Current health for one integration', parameters: [uuidParam('id', 'Integration id')], responses: { 200: ok('Health', object({ status: str('CONNECTED'), lastSuccessfulSyncAt: str(), lastRecordCount: num(17), lastResponseTimeMs: num(124) })) } },
    },
    '/admin/integrations/{id}/logs': {
      get: { tags: ['Admin'], summary: 'Sync log history', parameters: [uuidParam('id', 'Integration id'), { name: 'limit', in: 'query', schema: num(25) }], responses: { 200: ok('Logs', arrayOf(object({ operation: str('COURSES.SYNC'), status: str('SUCCESS'), recordsProcessed: num(4), durationMs: num(159) }))) } },
    },
  },
};
