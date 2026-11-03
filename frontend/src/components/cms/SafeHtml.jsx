import React, { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { ALIGNABLE, RICH_TAGS, alignFromStyle, safeHref, safeImageSrc } from '../../../../shared/richHtml.js';
import { Markdown, richTextSx } from './Markdown';

/**
 * Renders CMS rich text (HTML) without ever injecting markup: the HTML is parsed into an inert
 * document (DOMParser runs no scripts and loads nothing), then rebuilt as React elements using
 * the shared allowlist. Unknown elements are unwrapped (their text kept), dangerous ones dropped,
 * and only safe attributes are copied. The server has already sanitized it; this is the second layer.
 */
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'noscript', 'textarea', 'select', 'button', 'input', 'form', 'link', 'meta', 'title', 'head']);
const ALLOWED = new Set(RICH_TAGS);
const RENAME = { b: 'strong', i: 'em', del: 's' };

function convert(node, key) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (DROP.has(tag)) return null;
  const children = Array.from(node.childNodes).map((child, i) => convert(child, `${key}.${i}`));
  if (!ALLOWED.has(tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
  const name = RENAME[tag] ?? tag;
  const props = { key };
  if (ALIGNABLE.includes(tag)) {
    const align = alignFromStyle(node.getAttribute('style'));
    if (align) props.style = { textAlign: align };
  }
  if (tag === 'a') {
    const href = safeHref(node.getAttribute('href'));
    if (!href) return <React.Fragment key={key}>{children}</React.Fragment>;
    if (href.startsWith('/')) return <Link key={key} component={RouterLink} to={href}>{children}</Link>;
    return <Link key={key} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{children}</Link>;
  }
  if (tag === 'img') {
    const src = safeImageSrc(node.getAttribute('src'));
    return src ? <img key={key} src={src} alt={node.getAttribute('alt') ?? ''} loading="lazy" /> : null;
  }
  if (tag === 'br' || tag === 'hr') return React.createElement(name, props);
  return React.createElement(name, props, children);
}

export function htmlToReact(html) {
  if (typeof window === 'undefined' || !window.DOMParser || !html) return null;
  const doc = new window.DOMParser().parseFromString(`<body>${String(html)}</body>`, 'text/html');
  return Array.from(doc.body.childNodes).map((n, i) => convert(n, `n${i}`));
}

/**
 * Client-side mirror of the server policy, used by the editor to warn before saving.
 * Returns { html, removed: string[] } where `removed` names what the policy will drop.
 */
export function sanitizeForEditor(html) {
  const removed = new Set();
  if (typeof window === 'undefined' || !window.DOMParser) return { html: String(html ?? ''), removed: [] };
  const doc = new window.DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
  const walk = (el) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (DROP.has(tag)) { removed.add(`<${tag}> element`); child.remove(); continue; }
      walk(child);
      for (const attr of Array.from(child.attributes)) {
        const n = attr.name.toLowerCase();
        const keep = (tag === 'a' && ['href', 'title', 'target', 'rel'].includes(n) && (n !== 'href' || safeHref(attr.value)))
          || (tag === 'img' && ['src', 'alt', 'title'].includes(n) && (n !== 'src' || safeImageSrc(attr.value)))
          || (n === 'style' && ALIGNABLE.includes(tag) && alignFromStyle(attr.value));
        if (!keep) {
          removed.add(n.startsWith('on') ? `${n} event handler` : n === 'href' || n === 'src' ? `unsafe ${n} address` : `${n} attribute`);
          child.removeAttribute(attr.name);
        } else if (n === 'style') child.setAttribute('style', `text-align: ${alignFromStyle(attr.value)}`);
      }
      if (!ALLOWED.has(tag)) { removed.add(`<${tag}> tag (text kept)`); child.replaceWith(...child.childNodes); }
    }
  };
  walk(doc.body);
  return { html: doc.body.innerHTML, removed: [...removed] };
}

/** Rough well-formedness check for Source mode: unclosed / mismatched non-void tags. */
export function markupProblems(html) {
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
  const stack = [];
  const problems = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(String(html ?? '')))) {
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      if (stack[stack.length - 1] === tag) stack.pop();
      else if (stack.includes(tag)) { while (stack.length && stack[stack.length - 1] !== tag) problems.push(`<${stack.pop()}> was not closed`); stack.pop(); }
      else problems.push(`</${tag}> has no opening tag`);
    } else if (!VOID.has(tag) && m[2] !== '/') stack.push(tag);
  }
  while (stack.length) problems.push(`<${stack.pop()}> was not closed`);
  return problems;
}

export function SafeHtml({ html, align, sx }) {
  const nodes = useMemo(() => htmlToReact(html), [html]);
  return <Box sx={{ ...richTextSx, textAlign: align, ...sx }}>{nodes}</Box>;
}

/** CMS text in either stored format. */
export function RichContent({ format = 'markdown', value, align, sx }) {
  return format === 'html' ? <SafeHtml html={value} align={align} sx={sx} /> : <Markdown align={align} sx={sx}>{value}</Markdown>;
}
