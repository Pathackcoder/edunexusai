/**
 * Nexora settings, read from process.env on every call (not frozen at import) so tests can swap them. The API key
 * itself is never part of the returned object, so a config dump or a log line can never carry it: only whether it is
 * configured. Providers read the key through `providerApiKey()`, on the server, at client construction.
 */

const toInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
};

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The environment variable that holds each provider's key. */
const KEY_VARIABLE = { anthropic: 'CLAUDE_API_KEY' };

export function nexoraConfig() {
  const provider = (process.env.NEXORA_PROVIDER ?? 'anthropic').trim().toLowerCase();
  const effort = (process.env.NEXORA_EFFORT ?? 'medium').trim().toLowerCase();
  const fallback = (process.env.NEXORA_REFUSAL_FALLBACK ?? 'default').trim().toLowerCase();
  const problems = [];
  if (!KEY_VARIABLE[provider]) problems.push(`NEXORA_PROVIDER "${provider}" is not supported (only anthropic).`);
  else if (!process.env[KEY_VARIABLE[provider]]) problems.push(`${KEY_VARIABLE[provider]} is not set.`);
  const switchedOff = ['0', 'false', 'off', 'no'].includes(String(process.env.NEXORA_ENABLED ?? '').trim().toLowerCase());
  return {
    enabled: !switchedOff && problems.length === 0,
    switchedOff,
    provider,
    keyVariable: KEY_VARIABLE[provider] ?? null,
    keyConfigured: Boolean(KEY_VARIABLE[provider] && process.env[KEY_VARIABLE[provider]]),
    // One place to change the model: every request reads it from here.
    model: (process.env.NEXORA_MODEL ?? 'claude-opus-5-5').trim(),
    effort: EFFORTS.includes(effort) ? effort : 'medium',
    maxTokens: toInt(process.env.NEXORA_MAX_TOKENS, 32000, 1024, 128000),
    timeoutMs: toInt(process.env.NEXORA_TIMEOUT_MS, 120_000, 10_000, 600_000),
    maxRetries: toInt(process.env.NEXORA_MAX_RETRIES, 2, 0, 5),
    // Model ↔ tool round trips allowed in one turn before Nexora is asked to answer with what it has.
    maxToolRounds: toInt(process.env.NEXORA_MAX_TOOL_ROUNDS, 8, 1, 20),
    // Server-side refusal fallback ('default' routes by refusal category; 'off' disables it).
    refusalFallback: fallback === 'off' ? null : 'default',
    // Earlier messages replayed to the model on each turn (text only, never raw tool results).
    historyMessages: toInt(process.env.NEXORA_HISTORY_MESSAGES, 30, 4, 200),
    // A conversation is closed to new turns after this many messages; the person starts a new one.
    maxConversationMessages: toInt(process.env.NEXORA_MAX_CONVERSATION_MESSAGES, 120, 10, 1000),
    // How long a proposed action can wait for confirmation.
    actionTtlMinutes: toInt(process.env.NEXORA_ACTION_TTL_MINUTES, 30, 1, 1440),
    turnsPerMinute: toInt(process.env.NEXORA_TURNS_PER_MINUTE, 12, 1, 600),
    problems,
  };
}

/** The provider's API key (server-side only). Never log, return or serialise the value. */
export function providerApiKey(provider) {
  const variable = KEY_VARIABLE[provider];
  return variable ? process.env[variable] ?? '' : '';
}
