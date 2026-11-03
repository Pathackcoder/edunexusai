/**
 * Rich-text HTML policy, shared by the server sanitizer (backend, sanitize-html) and the
 * portal renderer (frontend, which builds React elements from parsed HTML and never injects
 * raw markup). Anything not listed here is removed: scripts, iframes, forms, event-handler
 * attributes, inline styles other than text alignment, classes, and unsafe URLs.
 */
import { isSafeImage, isSafeUrl } from './cmsBlocks.js';

export const RICH_HTML_MAX = 50_000;
export const RICH_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'code', 'pre'];
export const RICH_ATTRIBUTES = { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'title'] };
/** Elements that may carry `style="text-align: …"`. */
export const ALIGNABLE = ['p', 'h2', 'h3', 'h4', 'li', 'blockquote'];
export const ALIGN_VALUES = ['left', 'center', 'right', 'justify'];

export const safeHref = (value) => {
  const v = String(value ?? '').trim();
  return v && !/^#/.test(v) && isSafeUrl(v) ? v : null;
};
export const safeImageSrc = (value) => {
  const v = String(value ?? '').trim();
  return v && isSafeImage(v) ? v : null;
};
/** text-align value from a style attribute, if it is one of the allowed values. */
export const alignFromStyle = (style) => {
  const m = /(?:^|;)\s*text-align\s*:\s*([a-z]+)\s*(?:;|$)/i.exec(String(style ?? ''));
  return m && ALIGN_VALUES.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
};
