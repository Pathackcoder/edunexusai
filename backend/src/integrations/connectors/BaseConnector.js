import { AppError, ErrorCode, integrationError } from '../../utils/errors.js';

/**
 * Connector contract.
 *
 * A connector is the ONLY place in the backend that is allowed to speak a vendor's
 * dialect. It performs the network call and returns the provider's raw payload. It does
 * not touch the database and it does not shape responses for the frontend — a canonical
 * mapper does that (see ../mappers). Controllers never instantiate a connector directly;
 * they go through IntegrationService.
 *
 * Adding a provider (Workday, a different LMS) means adding one subclass and one mapper.
 * Nothing in the React app, the routes or the domain services changes.
 */
export class BaseConnector {
  /**
   * @param {object} options
   * @param {object} options.integration  the Integration row from PostgreSQL
   * @param {string} [options.credential] secret resolved server-side from credentialRef
   */
  constructor({ integration, credential = '' }) {
    if (new.target === BaseConnector) {
      throw new Error('BaseConnector is abstract; subclass it.');
    }
    this.integration = integration;
    this.credential = credential;
    this.provider = integration.provider;
    this.key = integration.key;
    this.baseUrl = (integration.baseUrl ?? '').replace(/\/$/, '');
    this.timeoutMs = integration.timeoutMs ?? 8000;
  }

  /** Domains this connector can serve, e.g. ['COURSES','ENROLLMENTS']. */
  get supportedDomains() {
    return this.integration.supportedDomains ?? [];
  }

  supports(domain) {
    return this.supportedDomains.includes(domain);
  }

  /** Throw when the connector is selected but not usable yet. */
  assertConfigured() {
    if (!this.baseUrl) {
      throw new AppError(
        409,
        ErrorCode.INTEGRATION_NOT_CONFIGURED,
        `${this.integration.displayName} has no base URL configured.`,
        { integrationKey: this.key },
      );
    }
  }

  /** HTTP with a hard timeout, uniform error translation and a response-time reading. */
  async request(path, { method = 'GET', headers = {}, body, query, allowNotFound = false } = {}) {
    this.assertConfigured();
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...this.authHeaders(), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { raw: text.slice(0, 500) };
      }

      // A provider answering 404 for "no record for this id" is a normal negative
      // result, not an outage. Callers that expect it pass allowNotFound so the
      // integration's health is not marked down for an ordinary empty lookup.
      if (response.status === 404 && allowNotFound) {
        return { payload: null, durationMs, status: 404, notFound: true };
      }

      if (!response.ok) {
        throw integrationError(
          `${this.integration.displayName} responded ${response.status}.`,
          {
            integrationKey: this.key,
            status: response.status,
            providerMessage: payload?.message ?? payload?.error ?? payload?.errors?.[0]?.message ?? null,
          },
        );
      }
      return { payload, durationMs, status: response.status };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const durationMs = Date.now() - startedAt;
      if (error.name === 'AbortError') {
        throw integrationError(
          `${this.integration.displayName} timed out after ${this.timeoutMs}ms.`,
          { integrationKey: this.key, durationMs },
        );
      }
      throw integrationError(`${this.integration.displayName} is unreachable.`, {
        integrationKey: this.key,
        reason: error.code ?? error.message,
        durationMs,
      });
    }
  }

  /** Provider-specific auth headers. Secrets stay inside the backend process. */
  // eslint-disable-next-line class-methods-use-this
  authHeaders() {
    return {};
  }

  /* ----- Capability surface. Subclasses override what they support. ----- */

  // eslint-disable-next-line class-methods-use-this
  notSupported(operation) {
    throw new AppError(
      501,
      ErrorCode.INTEGRATION_ERROR,
      `${this.integration?.displayName ?? 'Connector'} does not implement ${operation}.`,
      { integrationKey: this.key },
    );
  }

  /** @returns {Promise<{healthy:boolean,durationMs:number,recordCount:number,details:object}>} */
  async testConnection() { return this.notSupported('testConnection'); }
  async fetchTerms() { return this.notSupported('fetchTerms'); }
  async fetchStudent() { return this.notSupported('fetchStudent'); }
  async fetchCourses() { return this.notSupported('fetchCourses'); }
  async fetchEnrollments() { return this.notSupported('fetchEnrollments'); }
  async fetchSchedule() { return this.notSupported('fetchSchedule'); }
  async fetchAssignments() { return this.notSupported('fetchAssignments'); }
  async fetchGrades() { return this.notSupported('fetchGrades'); }
  async fetchFinancialAid() { return this.notSupported('fetchFinancialAid'); }
}
