import { MockUniversityConnector } from './connectors/MockUniversityConnector.js';
import { CanvasConnector } from './connectors/CanvasConnector.js';
import { SisPlaceholderConnector } from './connectors/SisPlaceholderConnector.js';
import { mockUniversityMapper } from './mappers/mockUniversityMapper.js';
import { canvasMapper } from './mappers/canvasMapper.js';
import { resolveCredential } from '../config/env.js';
import { AppError, ErrorCode } from '../utils/errors.js';

/**
 * Provider registry: the one place that knows which connector class and which canonical
 * mapper belong to a provider. Registering a new external system is an entry here plus a
 * connector subclass and a mapper. No controller or route changes.
 */
const REGISTRY = {
  MOCK_UNIVERSITY: {
    connector: MockUniversityConnector,
    mapper: mockUniversityMapper,
    label: 'Mock University API',
    liveCapable: true,
  },
  CANVAS: {
    connector: CanvasConnector,
    mapper: canvasMapper,
    label: 'Canvas LMS',
    liveCapable: true,
  },
  BANNER: {
    connector: SisPlaceholderConnector,
    mapper: null,
    label: 'Ellucian Banner',
    liveCapable: false,
  },
  ETHOS: {
    connector: SisPlaceholderConnector,
    mapper: null,
    label: 'Ellucian Ethos',
    liveCapable: false,
  },
  WORKDAY: {
    connector: SisPlaceholderConnector,
    mapper: null,
    label: 'Workday Student',
    liveCapable: false,
  },
};

export const getProviderMeta = (provider) => REGISTRY[provider] ?? null;

export const listProviders = () =>
  Object.entries(REGISTRY).map(([provider, meta]) => ({
    provider,
    label: meta.label,
    liveCapable: meta.liveCapable,
    implementsDataCalls: meta.mapper !== null,
  }));

/**
 * Build a ready-to-use connector from a stored Integration row.
 * The credential is resolved here, from the backend environment, using the row's
 * `credentialRef`. The secret never touches the database or any API response.
 */
export function createConnector(integration) {
  const meta = REGISTRY[integration.provider];
  if (!meta) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `Unknown integration provider: ${integration.provider}`,
    );
  }
  if (integration.mode === 'DISABLED' || integration.enabled === false) {
    throw new AppError(
      409,
      ErrorCode.INTEGRATION_NOT_CONFIGURED,
      `${integration.displayName} is disabled. Enable it in Admin → Integrations.`,
      { integrationKey: integration.key },
    );
  }
  return new meta.connector({
    integration,
    credential: resolveCredential(integration.credentialRef),
  });
}

export function getMapper(provider) {
  const meta = REGISTRY[provider];
  if (!meta?.mapper) {
    throw new AppError(
      409,
      ErrorCode.INTEGRATION_NOT_CONFIGURED,
      `No canonical mapper is implemented for ${provider}.`,
    );
  }
  return meta.mapper;
}
