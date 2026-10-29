import nodemailer from 'nodemailer';
import { mailConfig } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * The only code that sends mail. Credentials stay in the server environment; the browser
 * only ever sees { configured, verified, problems }. Message bodies are never logged.
 */
let cached = null; // { key, transporter }
let verifiedAt = 0;
let lastVerify = null;

function transporter() {
  const config = mailConfig();
  if (!config.configured) return null;
  const key = JSON.stringify([config.url, config.host, config.port, config.secure, config.user, process.env.SMTP_PASS ? 'p' : '']);
  if (cached?.key === key) return cached.transporter;
  const t = config.url
    ? nodemailer.createTransport(config.url, { connectionTimeout: config.timeoutMs, greetingTimeout: config.timeoutMs, socketTimeout: config.timeoutMs })
    : nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: process.env.SMTP_PASS ?? '' } : undefined,
        connectionTimeout: config.timeoutMs,
        greetingTimeout: config.timeoutMs,
        socketTimeout: config.timeoutMs,
      });
  cached = { key, transporter: t };
  verifiedAt = 0;
  return t;
}

/** Configuration status, with a connection check cached for five minutes. */
export async function mailStatus({ verify = true } = {}) {
  const config = mailConfig();
  const base = { configured: config.configured, problems: config.problems, from: config.configured ? config.from : null, recipientDomains: config.recipientDomains };
  if (!config.configured || !verify) return { ...base, verified: null };
  if (Date.now() - verifiedAt > 5 * 60_000) {
    try {
      await transporter().verify();
      lastVerify = { ok: true };
    } catch (error) {
      lastVerify = { ok: false, error: error.code ?? 'SMTP_ERROR' };
      logger.warn('SMTP verification failed', { code: error.code });
    }
    verifiedAt = Date.now();
  }
  return { ...base, verified: lastVerify.ok, error: lastVerify.ok ? null : lastVerify.error };
}

/** Send one message. Throws { code: 'MAIL_NOT_CONFIGURED' | 'MAIL_FAILED' }. */
export async function sendMail({ to, subject, text, html, replyTo }) {
  const t = transporter();
  if (!t) {
    const error = new Error('Email is not configured.');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }
  try {
    const info = await t.sendMail({ from: mailConfig().from, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
    return { messageId: info.messageId, accepted: info.accepted?.length ?? 0 };
  } catch (error) {
    logger.warn('Form notification could not be sent', { code: error.code, responseCode: error.responseCode });
    const failure = new Error('The notification email could not be sent.');
    failure.code = 'MAIL_FAILED';
    throw failure;
  }
}

/** For tests: forget the cached transport (e.g. after changing SMTP settings). */
export function resetMailer() {
  cached = null;
  verifiedAt = 0;
  lastVerify = null;
}
