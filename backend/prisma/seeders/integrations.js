import { env } from '../../src/config/env.js';

/**
 * Registers the integrations for the demo tenant.
 *
 * `credentialRef` stores the NAME of a backend environment variable, never a secret.
 * The admin UI shows the reference and whether it currently resolves; the value itself
 * stays in the backend process.
 */
export async function seedIntegrations(prisma, tenant) {
  const definitions = [
    {
      key: 'mock-university',
      provider: 'MOCK_UNIVERSITY',
      displayName: 'Mock University API',
      description:
        'Local stand-in for the institutional SIS. Serves courses, registrations, coursework, grades and financial aid over HTTP so the integration path is exercised end to end.',
      mode: 'MOCK',
      baseUrl: env.integrations.mockUniversity.baseUrl,
      apiVersion: 'v1',
      authType: 'API_KEY',
      credentialRef: 'MOCK_UNIVERSITY_API_KEY',
      enabled: true,
      timeoutMs: env.integrations.mockUniversity.timeoutMs,
      supportedDomains: [
        'COURSES',
        'ENROLLMENTS',
        'ASSIGNMENTS',
        'GRADES',
        'FINANCIAL_AID',
        'SCHEDULE',
        'STUDENTS',
      ],
      status: 'NOT_CONFIGURED',
    },
    {
      key: 'canvas-lms',
      provider: 'CANVAS',
      displayName: 'Canvas LMS',
      description:
        'Read-only Canvas connector for courses, assignments and enrollments. Runs against the Canvas-compatible surface of the mock service in MOCK mode; switch to LIVE and supply CANVAS_BASE_URL + CANVAS_API_TOKEN to use a real Canvas tenant.',
      mode: env.integrations.canvas.mode === 'live' ? 'LIVE' : 'MOCK',
      baseUrl:
        env.integrations.canvas.mode === 'live'
          ? env.integrations.canvas.baseUrl
          : env.integrations.mockUniversity.baseUrl.replace(/\/external$/, ''),
      apiVersion: env.integrations.canvas.apiVersion,
      authType: 'BEARER_TOKEN',
      credentialRef: 'CANVAS_API_TOKEN',
      // Registered but not the serving integration for any domain, so the mock SIS stays
      // the system of record. Enable a domain here to let Canvas serve it instead.
      enabled: true,
      timeoutMs: env.integrations.canvas.timeoutMs,
      supportedDomains: [],
      status: 'NOT_CONFIGURED',
    },
    {
      key: 'banner-sis',
      provider: 'BANNER',
      displayName: 'Ellucian Banner',
      description:
        'Configuration only. No live Banner tenant is available to EdunexusAI, so data calls fail explicitly rather than returning invented records.',
      mode: 'DISABLED',
      baseUrl: env.integrations.banner.baseUrl || null,
      apiVersion: 'v1',
      authType: 'API_KEY',
      credentialRef: 'BANNER_API_KEY',
      enabled: false,
      timeoutMs: 10000,
      supportedDomains: [],
      status: 'NOT_CONNECTED',
    },
    {
      key: 'ethos-integration',
      provider: 'ETHOS',
      displayName: 'Ellucian Ethos',
      description:
        'Configuration only. Ethos would front Banner through a canonical data model; the connector slot and configuration fields exist, the connection does not.',
      mode: 'DISABLED',
      baseUrl: env.integrations.ethos.baseUrl || null,
      apiVersion: 'v1',
      authType: 'OAUTH2_CLIENT_CREDENTIALS',
      credentialRef: 'ETHOS_API_KEY',
      enabled: false,
      timeoutMs: 10000,
      supportedDomains: [],
      status: 'NOT_CONNECTED',
    },
  ];

  const saved = {};
  for (const definition of definitions) {
    const row = await prisma.integration.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: definition.key } },
      create: { tenantId: tenant.id, ...definition },
      update: {
        displayName: definition.displayName,
        description: definition.description,
        baseUrl: definition.baseUrl,
        apiVersion: definition.apiVersion,
        authType: definition.authType,
        credentialRef: definition.credentialRef,
        timeoutMs: definition.timeoutMs,
      },
    });
    saved[definition.key] = row;
  }
  return saved;
}
