import 'dotenv/config';

/** Read a required variable, failing fast at boot rather than at first request. */
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env.`);
  }
  return value;
}

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isTest = process.env.NODE_ENV === 'test';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest,
  port: toInt(process.env.PORT, 5001),
  logLevel: process.env.LOG_LEVEL ?? 'dev',

  databaseUrl: isTest
    ? required('TEST_DATABASE_URL', process.env.DATABASE_URL)
    : required('DATABASE_URL'),

  jwt: {
    secret: required('JWT_SECRET', isTest ? 'test-access-secret' : undefined),
    refreshSecret: required('JWT_REFRESH_SECRET', isTest ? 'test-refresh-secret' : undefined),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '30m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    issuer: 'edunexusai',
  },
  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, isTest ? 4 : 10),

  cors: {
    origins: toList(process.env.CORS_ORIGINS).length
      ? toList(process.env.CORS_ORIGINS)
      : ['http://localhost:5173'],
  },

  rateLimit: {
    loginWindowMs: toInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    loginMax: toInt(process.env.LOGIN_RATE_LIMIT_MAX, 10),
  },

  integrations: {
    academicReadMode: process.env.ACADEMIC_READ_MODE === 'passthrough' ? 'passthrough' : 'synced',
    mockUniversity: {
      baseUrl: process.env.MOCK_UNIVERSITY_BASE_URL ?? 'http://localhost:5002/external',
      apiKey: process.env.MOCK_UNIVERSITY_API_KEY ?? '',
      timeoutMs: toInt(process.env.MOCK_UNIVERSITY_TIMEOUT_MS, 8000),
    },
    canvas: {
      mode: process.env.CANVAS_MODE === 'live' ? 'live' : 'mock',
      baseUrl: process.env.CANVAS_BASE_URL ?? '',
      apiToken: process.env.CANVAS_API_TOKEN ?? '',
      apiVersion: process.env.CANVAS_API_VERSION ?? 'v1',
      timeoutMs: toInt(process.env.CANVAS_TIMEOUT_MS, 8000),
    },
    banner: {
      baseUrl: process.env.BANNER_BASE_URL ?? '',
      apiKey: process.env.BANNER_API_KEY ?? '',
    },
    ethos: {
      baseUrl: process.env.ETHOS_BASE_URL ?? '',
      apiKey: process.env.ETHOS_API_KEY ?? '',
    },
  },
};

/**
 * Resolve the secret behind an Integration.credentialRef. Integrations store only the
 * NAME of an environment variable; the value is read here, on the server, and is never
 * serialised into an API response.
 */
export function resolveCredential(credentialRef) {
  if (!credentialRef) return '';
  return process.env[credentialRef] ?? '';
}

export function hasCredential(credentialRef) {
  return Boolean(resolveCredential(credentialRef));
}
