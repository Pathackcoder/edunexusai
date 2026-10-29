import { BaseConnector } from './BaseConnector.js';
import { sisConfig } from '../../config/env.js';
import { integrationError, integrationNotConfigured } from '../../utils/errors.js';
import { health } from '../../modules/sis/sisService.js';

/**
 * CampusCore SIS in the Integrations registry: health and institution verification only.
 * Academic data is never synced into local tables (see LIVE_ONLY_PROVIDERS); it is read live
 * through modules/sis, which uses the vendored CampusCore connector.
 */
export class CampusCoreSisConnector extends BaseConnector {
  assertConfigured() {
    const config = sisConfig();
    if (!config.valid) throw integrationNotConfigured(`CampusCore SIS is not configured: ${config.problems.join(' ')}`, { integrationKey: this.key });
  }

  async testConnection() {
    this.assertConfigured();
    const startedAt = Date.now();
    const h = await health();
    if (!h.ok) {
      throw integrationError(h.error?.message ?? `CampusCore is ${h.state.toLowerCase()}.`, { integrationKey: this.key, kind: h.state === 'AUTH_FAILED' ? 'AUTH_FAILED' : h.state === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR', sisCode: h.error?.code ?? null });
    }
    return {
      healthy: true,
      durationMs: Date.now() - startedAt,
      recordCount: 0,
      details: { institution: h.institution, institutionVerified: h.institutionVerified, client: h.client, scopes: h.scopes, tokenExpiresAt: h.tokenExpiresAt },
    };
  }
}
