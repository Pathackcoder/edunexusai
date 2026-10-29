import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { isSafeUrl } from '../../../../shared/cmsBlocks.js';
import { sanitizeForEditor } from './SafeHtml';

/** Converts existing Markdown content to HTML for the rich-text editor (loaded on demand). */
export function markdownToHtml(markdown) {
  const html = renderToStaticMarkup(<ReactMarkdown urlTransform={(url) => (isSafeUrl(url) ? url : '')}>{String(markdown ?? '')}</ReactMarkdown>);
  return sanitizeForEditor(html.replace(/<h1>/g, '<h2>').replace(/<\/h1>/g, '</h2>')).html;
}
