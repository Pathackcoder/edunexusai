import { BaseConnector } from './BaseConnector.js';
import { AppError, ErrorCode } from '../../utils/errors.js';

/**
 * Banner / Ethos / Workday.
 *
 * These are CONFIGURATION-ONLY connectors. No live connection exists and none is
 * simulated: EdunexusAI has no Banner or Ethos tenant, and inventing one would be a
 * false claim about the product's integration status.
 *
 * What is real here:
 *   - the provider can be registered, configured and stored like any other integration
 *   - the admin UI can capture base URL, API version, auth type, credential reference,
 *     timeout and enabled flag
 *   - the connector slot exists, so implementing it later is a subclass, not a redesign
 *
 * What is not real:
 *   - every data call fails with INTEGRATION_NOT_CONFIGURED and an explicit message
 *   - health reports NOT_CONNECTED, never CONNECTED
 */
export class SisPlaceholderConnector extends BaseConnector {
  authHeaders() {
    if (!this.credential) return {};
    return this.integration.authType === 'API_KEY'
      ? { 'x-api-key': this.credential }
      : { Authorization: `Bearer ${this.credential}` };
  }

  #pending(operation) {
    throw new AppError(
      409,
      ErrorCode.INTEGRATION_NOT_CONFIGURED,
      `${this.integration.displayName} is registered for configuration only. ${operation} requires institutional credentials and a tenant endpoint that EdunexusAI does not have. See docs/integrations.md.`,
      {
        integrationKey: this.key,
        provider: this.provider,
        status: 'NOT_CONNECTED',
        requires: [
          'Institution-issued base URL for the provider tenant',
          this.integration.authType === 'OAUTH2_CLIENT_CREDENTIALS'
            ? 'OAuth2 client id and client secret'
            : 'Provider API key',
          'Scoped read permissions for the requested domains',
          'Allow-listing of the EdunexusAI backend egress address',
        ],
      },
    );
  }

  async testConnection() {
    return this.#pending('Connection testing');
  }

  async fetchCourses() {
    return this.#pending('Course retrieval');
  }

  async fetchEnrollments() {
    return this.#pending('Enrollment retrieval');
  }

  async fetchStudent() {
    return this.#pending('Student record retrieval');
  }

  async fetchFinancialAid() {
    return this.#pending('Financial aid retrieval');
  }

  async fetchAssignments() {
    return this.#pending('Coursework retrieval');
  }

  async fetchGrades() {
    return this.#pending('Grade retrieval');
  }

  async fetchSchedule() {
    return this.#pending('Schedule retrieval');
  }
}
