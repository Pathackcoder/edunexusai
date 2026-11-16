import { nexoraConfig } from '../config.js';
import { createAnthropicProvider } from './anthropicProvider.js';

/**
 * The model provider for this process. Adding a provider is one factory here that implements `runTurn` (see
 * anthropicProvider.js); tools, authorisation, persistence and the UI do not change.
 */
const FACTORIES = { anthropic: createAnthropicProvider };

let override = null;

export function getProvider() {
  if (override) return override;
  const config = nexoraConfig();
  return FACTORIES[config.provider]?.(config) ?? null;
}

/** Tests replace the provider with a scripted one; production never calls this. */
export function setProviderForTests(provider) {
  override = provider;
}
