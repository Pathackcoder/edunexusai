/**
 * The one failure shape every model provider reports, so the orchestrator and the UI never depend on a vendor's
 * error classes. `kind` drives the message the person sees and whether a retry makes sense.
 */
export const ProviderErrorKind = {
  NOT_CONFIGURED: 'NOT_CONFIGURED', // missing or rejected API key
  ACCOUNT: 'ACCOUNT', // the provider account cannot serve requests (e.g. no credit balance)
  RATE_LIMITED: 'RATE_LIMITED',
  OVERLOADED: 'OVERLOADED', // the provider is temporarily unable to serve
  TIMEOUT: 'TIMEOUT',
  UNREACHABLE: 'UNREACHABLE',
  BAD_REQUEST: 'BAD_REQUEST', // a request the provider refused as invalid (a bug on our side)
  ABORTED: 'ABORTED', // the person left or stopped the turn
};

const MESSAGES = {
  NOT_CONFIGURED: 'Nexora is not connected to its AI service right now. An administrator needs to check its configuration.',
  ACCOUNT: 'Nexora is unavailable: its AI service account needs attention from an administrator.',
  RATE_LIMITED: 'Nexora is handling a lot of requests right now. Please try again in a moment.',
  OVERLOADED: 'The AI service behind Nexora is busy. Please try again in a moment.',
  TIMEOUT: 'Nexora took too long to answer. Please try again.',
  UNREACHABLE: 'Nexora cannot reach its AI service right now. Please try again shortly.',
  BAD_REQUEST: 'Nexora could not process that request. Please rephrase it or start a new conversation.',
  ABORTED: 'The response was stopped.',
};

export class ProviderError extends Error {
  constructor(kind, { status = null, requestId = null, reason = null, cause } = {}) {
    super(MESSAGES[kind] ?? MESSAGES.UNREACHABLE);
    // The provider's own explanation (never contains a credential), for the server log only.
    this.reason = reason;
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
    this.requestId = requestId;
    this.retryable = ['RATE_LIMITED', 'OVERLOADED', 'TIMEOUT', 'UNREACHABLE'].includes(kind);
    if (cause) this.cause = cause;
  }
}
