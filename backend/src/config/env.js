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

function passwordStorage() {
  // Passwords are always stored as bcrypt hashes. The former development-only "plaintext"
  // setting is ignored (with a warning) rather than refused, so an old .env still boots.
  const mode = (process.env.PASSWORD_STORAGE ?? 'bcrypt').trim().toLowerCase();
  if (mode !== 'bcrypt') console.warn(`PASSWORD_STORAGE=${mode} is no longer supported; passwords are stored as bcrypt hashes.`);
  return 'bcrypt';
}

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
  /** Always 'bcrypt' (see modules/auth/passwords.js). */
  passwordStorage: passwordStorage(),

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

const toBool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
const toPositiveInt = (value) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Moodle LMS settings, read from process.env on every call (not frozen at import) so the
 * test suite can point the connector at a local stub. The token itself is not returned
 * here: connectors resolve it through the integration's credentialRef (MOODLE_TOKEN).
 *
 * Validation is explicit rather than fail-at-boot: Moodle is optional, and a missing or
 * malformed value disables the integration with a clear reason instead of stopping the
 * whole portal.
 */
export function moodleConfig() {
  const rawBase = (process.env.MOODLE_BASE_URL ?? '').trim();
  const problems = [];
  let baseUrl = '';
  if (rawBase) {
    try {
      const url = new URL(rawBase);
      const local = ['localhost', '127.0.0.1'].includes(url.hostname);
      if (url.protocol !== 'https:' && !(local && process.env.NODE_ENV !== 'production')) {
        problems.push('MOODLE_BASE_URL must use https.');
      } else {
        baseUrl = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
      }
    } catch {
      problems.push('MOODLE_BASE_URL is not a valid URL.');
    }
  } else {
    problems.push('MOODLE_BASE_URL is not set.');
  }
  if (!process.env.MOODLE_TOKEN) problems.push('MOODLE_TOKEN is not set.');
  return {
    baseUrl,
    tokenConfigured: Boolean(process.env.MOODLE_TOKEN),
    timeoutMs: Math.min(Math.max(toInt(process.env.MOODLE_TIMEOUT_MS, 10000), 1000), 60000),
    maxRetries: Math.min(Math.max(toInt(process.env.MOODLE_MAX_RETRIES, 2), 0), 5),
    // Master switch for every operation that changes data in Moodle. Off by default.
    writesEnabled: toBool(process.env.MOODLE_WRITES_ENABLED),
    // Irreversible course deletion: off unless explicitly enabled.
    allowCourseDelete: toBool(process.env.MOODLE_ALLOW_COURSE_DELETE),
    // Moodle ids that must come from the site, never guessed.
    studentRoleId: toPositiveInt(process.env.MOODLE_STUDENT_ROLE_ID),
    teacherRoleId: toPositiveInt(process.env.MOODLE_TEACHER_ROLE_ID),
    // The hosting plan's user-account limit (MoodleCloud plans cap accounts). Not
    // readable through the Moodle API, so it must be stated explicitly; the seed
    // refuses to create accounts without it.
    siteUserQuota: toPositiveInt(process.env.MOODLE_SITE_USER_QUOTA),
    defaultCategoryId: toPositiveInt(process.env.MOODLE_DEFAULT_CATEGORY_ID),
    problems,
    valid: problems.length === 0,
  };
}

/**
 * CampusCore SIS settings (server-side only), read from process.env on every call so tests
 * can point at a stub. The client secret is never returned here or anywhere else: only
 * whether it is configured. Missing values disable the SIS integration with a reason
 * instead of stopping the portal.
 */
export function sisConfig() {
  const provider = (process.env.SIS_PROVIDER ?? '').trim().toLowerCase() || null;
  const baseUrl = (process.env.CAMPUSCORE_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const problems = [];
  if (provider && provider !== 'campuscore') problems.push(`SIS_PROVIDER "${provider}" is not supported (only campuscore).`);
  if (!provider) problems.push('SIS_PROVIDER is not set.');
  if (!baseUrl) problems.push('CAMPUSCORE_BASE_URL is not set.');
  else {
    try {
      const url = new URL(baseUrl);
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') problems.push('CAMPUSCORE_BASE_URL must use https in production.');
    } catch {
      problems.push('CAMPUSCORE_BASE_URL is not a valid URL.');
    }
  }
  if (!process.env.CAMPUSCORE_CLIENT_ID) problems.push('CAMPUSCORE_CLIENT_ID is not set.');
  if (!process.env.CAMPUSCORE_CLIENT_SECRET) problems.push('CAMPUSCORE_CLIENT_SECRET is not set.');
  if (!process.env.SIS_TENANT_KEY) problems.push('SIS_TENANT_KEY is not set.');
  return {
    provider,
    baseUrl,
    clientId: process.env.CAMPUSCORE_CLIENT_ID ?? '',
    clientSecretConfigured: Boolean(process.env.CAMPUSCORE_CLIENT_SECRET),
    expectedInstitution: (process.env.CAMPUSCORE_EXPECTED_INSTITUTION ?? '').trim() || null,
    tenantKey: (process.env.SIS_TENANT_KEY ?? '').trim() || null,
    timeoutMs: Math.min(Math.max(toInt(process.env.CAMPUSCORE_TIMEOUT_MS, 10000), 1000), 60000),
    problems,
    valid: problems.length === 0,
  };
}

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

/**
 * Feddrick CMS (Strapi, in ../feddrick-cms). Server-side only: the token never leaves the
 * backend. `layoutsEnabled` gates applying published dashboard layouts to live dashboards.
 */
export function cmsConfig() {
  const url = (process.env.CMS_URL ?? '').trim().replace(/\/+$/, '');
  const problems = [];
  if (!url) problems.push('CMS_URL is not set.');
  else {
    try {
      const parsed = new URL(url);
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(parsed.hostname)) problems.push('CMS_URL must use https in production.');
    } catch {
      problems.push('CMS_URL is not a valid URL.');
    }
  }
  if (!process.env.CMS_API_TOKEN) problems.push('CMS_API_TOKEN is not set.');
  return {
    url,
    adminUrl: (process.env.CMS_ADMIN_URL ?? '').trim() || null,
    timeoutMs: Math.min(Math.max(toInt(process.env.CMS_TIMEOUT_MS, 8000), 1000), 60000),
    layoutsEnabled: ['1', 'true', 'yes'].includes(String(process.env.CMS_LAYOUTS_ENABLED ?? '').toLowerCase()),
    tokenConfigured: Boolean(process.env.CMS_API_TOKEN),
    problems,
    valid: problems.length === 0,
  };
}

/**
 * Outgoing mail for Studio form notifications (SMTP via nodemailer). Nothing is sent unless
 * SMTP_HOST (or SMTP_URL) and MAIL_FROM are set. FORM_RECIPIENT_DOMAINS optionally limits the
 * notification recipients administrators may configure (e.g. "feddrick.edu").
 */
export function mailConfig() {
  const url = (process.env.SMTP_URL ?? '').trim();
  const host = (process.env.SMTP_HOST ?? '').trim();
  const from = (process.env.MAIL_FROM ?? '').trim();
  const problems = [];
  if (!url && !host) problems.push('SMTP_HOST is not set.');
  if (!from) problems.push('MAIL_FROM is not set.');
  const port = toInt(process.env.SMTP_PORT, 587);
  return {
    url: url || null,
    host: host || null,
    port,
    secure: ['1', 'true', 'yes'].includes(String(process.env.SMTP_SECURE ?? (port === 465 ? 'true' : 'false')).toLowerCase()),
    user: (process.env.SMTP_USER ?? '').trim() || null,
    hasPassword: Boolean(process.env.SMTP_PASS),
    from,
    recipientDomains: String(process.env.FORM_RECIPIENT_DOMAINS ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
    timeoutMs: Math.min(Math.max(toInt(process.env.SMTP_TIMEOUT_MS, 10000), 2000), 60000),
    problems,
    configured: problems.length === 0,
  };
}
