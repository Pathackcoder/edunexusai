import { env } from '../config/env.js';

const SENSITIVE = /password|secret|token|authorization|apikey|api_key|credential/i;

/** Strip anything that looks like a secret before writing a log line. */
export function redact(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE.test(key) ? '[redacted]' : redact(val);
  }
  return out;
}

const write = (level, message, context) => {
  if (env.isTest && level !== 'error') return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const payload = context ? ` ${JSON.stringify(redact(context))}` : '';
  if (level === 'error') console.error(line + payload);
  else if (level === 'warn') console.warn(line + payload);
  else console.log(line + payload);
};

export const logger = {
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
};
