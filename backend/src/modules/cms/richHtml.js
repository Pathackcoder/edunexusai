import sanitizeHtmlLib from 'sanitize-html';
import { ALIGNABLE, ALIGN_VALUES, RICH_ATTRIBUTES, RICH_HTML_MAX, RICH_TAGS, safeHref, safeImageSrc } from '../../../../shared/richHtml.js';

/**
 * Server-side sanitizer for rich text (Studio Source/Visual editor). Applied when content is
 * saved and again before it is delivered. Only the shared allowlist survives: no scripts,
 * iframes, forms, event handlers, classes or arbitrary styles; links and images must pass the
 * same URL checks as everywhere else in the CMS.
 */
const OPTIONS = {
  allowedTags: RICH_TAGS,
  allowedAttributes: { ...RICH_ATTRIBUTES, ...Object.fromEntries(ALIGNABLE.map((tag) => [tag, ['style']])) },
  allowedStyles: Object.fromEntries(ALIGNABLE.map((tag) => [tag, { 'text-align': [new RegExp(`^(${ALIGN_VALUES.join('|')})$`)] }])),
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template', 'svg', 'math'],
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  transformTags: {
    a: (tagName, attribs) => {
      const href = safeHref(attribs.href);
      const out = {};
      if (href) out.href = href;
      if (attribs.title) out.title = String(attribs.title).slice(0, 200);
      if (href && attribs.target === '_blank') { out.target = '_blank'; out.rel = 'noopener noreferrer'; }
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => {
      const src = safeImageSrc(attribs.src);
      return { tagName, attribs: src ? { src, alt: String(attribs.alt ?? '').slice(0, 200), ...(attribs.title ? { title: String(attribs.title).slice(0, 200) } : {}) } : {} };
    },
    b: 'strong',
    i: 'em',
    del: 's',
  },
};

export function sanitizeRichHtml(html) {
  return sanitizeHtmlLib(String(html ?? '').slice(0, RICH_HTML_MAX), OPTIONS).trim();
}
