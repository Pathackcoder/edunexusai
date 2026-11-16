import Anthropic from '@anthropic-ai/sdk';
import { providerApiKey } from '../config.js';
import { logger } from '../../../utils/logger.js';
import { ProviderError, ProviderErrorKind } from './providerError.js';

/**
 * Claude (Anthropic Messages API) behind the provider contract used by the orchestrator:
 *
 *   runTurn({ system, history, tools, executeTool, onText, onToolStart, signal })
 *     system       { stable, context }: stable instructions (cached) and per-request context
 *     history      [{ role: 'user' | 'assistant', text }], ending with the new user message
 *     tools        [{ name, description, inputSchema }]
 *     executeTool  ({ id, name, input }) => Promise<{ content: string, isError: boolean }>
 *   → { text, stopReason: 'end' | 'max_tokens' | 'refusal' | 'tool_limit', usage, model }
 *
 * The tool loop lives here because its wire format is the vendor's; what a tool does, who may run it and whether
 * an action is executed are decided by the orchestrator through executeTool, never by this file.
 *
 * Prior turns are replayed as text only (no earlier thinking blocks or tool results), so the history sent on each
 * turn is append-only and stable; inside one turn the assistant content is appended back unchanged.
 */

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let cached = null;
function clientFor(config) {
  const key = providerApiKey('anthropic');
  const signature = `${config.timeoutMs}:${config.maxRetries}:${key.length}`;
  if (cached?.signature !== signature) {
    cached = { signature, client: new Anthropic({ apiKey: key, timeout: config.timeoutMs, maxRetries: config.maxRetries }) };
  }
  return cached.client;
}

/** Map the SDK's typed errors (most specific first) to the provider-neutral shape. Never includes the key. */
function toProviderError(error) {
  if (error instanceof ProviderError) return error;
  const meta = { status: error?.status ?? null, requestId: error?.requestID ?? error?.request_id ?? null, cause: error };
  if (error instanceof Anthropic.APIUserAbortError) return new ProviderError(ProviderErrorKind.ABORTED, meta);
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError(ProviderErrorKind.TIMEOUT, meta);
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError(ProviderErrorKind.UNREACHABLE, meta);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new ProviderError(ProviderErrorKind.NOT_CONFIGURED, meta);
  if (error instanceof Anthropic.RateLimitError) return new ProviderError(ProviderErrorKind.RATE_LIMITED, meta);
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError || error instanceof Anthropic.UnprocessableEntityError) {
    // The API reports an exhausted credit balance as a 400 with no dedicated type; it is an account problem, not ours.
    const reason = error.error?.error?.message ?? '';
    return new ProviderError(/credit balance/i.test(reason) ? ProviderErrorKind.ACCOUNT : ProviderErrorKind.BAD_REQUEST, { ...meta, reason });
  }
  if (error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIError) return new ProviderError(ProviderErrorKind.OVERLOADED, meta);
  if (error?.name === 'AbortError') return new ProviderError(ProviderErrorKind.ABORTED, meta);
  return null;
}

export function createAnthropicProvider(config) {
  const toolDefs = (tools) =>
    tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema, eager_input_streaming: true }));

  async function streamOnce(client, params, { onText, signal }) {
    const stream = client.beta.messages.stream(params, { signal });
    stream.on('text', (delta) => onText?.(delta));
    return stream.finalMessage();
  }

  return {
    key: 'anthropic',
    model: config.model,

    async runTurn({ system, history, tools, executeTool, onText, onToolStart, signal }) {
      const client = clientFor(config);
      const messages = history.map((m) => ({ role: m.role, content: m.text }));
      const base = {
        model: config.model,
        max_tokens: config.maxTokens,
        // Stable instructions first (cached together with the tool list), then this request's context.
        system: [
          { type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: system.context },
        ],
        tools: toolDefs(tools),
        thinking: { type: 'adaptive' },
        output_config: { effort: config.effort },
        ...(config.refusalFallback ? { betas: [FALLBACK_BETA], fallbacks: config.refusalFallback } : {}),
      };
      const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      let text = '';
      let jsonRetries = 0;
      let freshRound = false;
      const emit = (delta) => {
        // Text from separate rounds is kept apart, so two sentences never run together.
        const piece = freshRound && text && delta ? `\n\n${delta.replace(/^\s+/, '')}` : delta;
        freshRound = false;
        text += piece;
        onText?.(piece);
      };

      for (let round = 0; round <= config.maxToolRounds; round += 1) {
        const lastRound = round === config.maxToolRounds;
        let message;
        try {
          freshRound = true;
          message = await streamOnce(client, { ...base, messages, ...(lastRound ? { tool_choice: { type: 'none' } } : {}) }, { onText: emit, signal });
          jsonRetries = 0;
        } catch (error) {
          const mapped = toProviderError(error);
          if (mapped) {
            logger.warn('[nexora] model request failed', { kind: mapped.kind, status: mapped.status, requestId: mapped.requestId, reason: mapped.reason ?? null });
            throw mapped;
          }
          // A tool input that could not be parsed at all (eager input streaming): re-issue the turn, a few times at most.
          if (jsonRetries++ < 2) {
            logger.warn('[nexora] unparseable tool input, re-issuing the request');
            round -= 1;
            continue;
          }
          throw error;
        }
        usage.inputTokens += message.usage?.input_tokens ?? 0;
        usage.outputTokens += message.usage?.output_tokens ?? 0;
        usage.cacheReadTokens += message.usage?.cache_read_input_tokens ?? 0;
        usage.cacheWriteTokens += message.usage?.cache_creation_input_tokens ?? 0;

        if (message.stop_reason === 'refusal') return { text, stopReason: 'refusal', usage, model: message.model };
        if (message.stop_reason === 'pause_turn') {
          messages.push({ role: 'assistant', content: message.content });
          continue;
        }
        const calls = message.content.filter((block) => block.type === 'tool_use');
        // A tool input cut off by max_tokens can still look valid: never run it.
        if (message.stop_reason === 'max_tokens') return { text, stopReason: 'max_tokens', usage, model: message.model };
        if (!calls.length) return { text, stopReason: 'end', usage, model: message.model };

        messages.push({ role: 'assistant', content: message.content });
        for (const call of calls) onToolStart?.({ id: call.id, name: call.name });
        const results = await Promise.all(
          calls.map(async (call) => {
            const outcome = await executeTool({ id: call.id, name: call.name, input: call.input });
            return { type: 'tool_result', tool_use_id: call.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}) };
          }),
        );
        // Every result of one round goes back in a single user message.
        messages.push({ role: 'user', content: results });
      }
      return { text, stopReason: 'tool_limit', usage, model: config.model };
    },
  };
}
