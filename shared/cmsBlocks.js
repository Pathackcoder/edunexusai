/**
 * Page-builder block registry, shared by the Studio editor (frontend) and the layout
 * validator (backend). A layout may only contain these block types, each only in the
 * contexts listed, with only these properties and limits. Anything else is rejected by
 * the server before it reaches the CMS, and dropped again before rendering.
 *
 * Field kinds:
 *   text { max }            single line
 *   markdown { max }        Markdown (rendered without raw HTML)
 *   select { options }      one of the listed values
 *   number { min, max }     integer
 *   boolean
 *   url                     https://, http://, mailto:, tel: or a portal path (/...)
 *   image                   a CMS media path (/api/v1/content/media/...) or an https:// URL
 *   list { of, max }        array of objects with the given fields
 *   slot { max }            nested blocks (rows, columns, sections)
 *   widget                  a dashboard widget key from the persona's catalogue
 *   html { max }            rich text as HTML; sanitized by the server (shared/richHtml.js policy)
 *   video                   a YouTube/Vimeo URL (shared/video.js); stored in canonical form
 *   formRef                 the id of a Studio form (empty = not chosen yet)
 *
 * `pageOnly: true` marks a field that only exists in page layouts (box size, position and
 * spacing). Dashboard layouts drop those fields, because the dashboard grid sizes cards.
 *
 * Contexts: 'page' (Studio pages) and 'dashboard' (Student/Faculty/Admin dashboard layouts).
 * Dashboard layouts are flat (the dashboard grid packs cards), so layout containers are
 * page-only and every dashboard block has a `size` (compact | standard | large).
 */

import { canonicalVideoUrl, parseVideoUrl } from './video.js';

export const LIMITS = { maxDepth: 6, maxBlocks: 300, maxBytes: 300_000, maxIdLength: 64 };

const ALIGN = { kind: 'select', options: ['left', 'center', 'right'], default: 'left' };
const SIZE = { kind: 'select', options: ['compact', 'standard', 'large'], default: 'large', label: 'Card size (dashboard)' };
const TONE = { kind: 'select', options: ['info', 'success', 'warning', 'error'], default: 'info' };
const ICONS = ['info', 'school', 'calendar', 'people', 'support', 'library', 'health', 'money', 'computer', 'location', 'star', 'campaign', 'book', 'career', 'heart', 'chat'];
const SPACING = ['none', 'sm', 'md', 'lg', 'xl'];
const ACCENTS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

/**
 * Box layout, available on every page block. Widths are a percentage of the containing
 * row or column (20–100) and apply from tablet width up; phones always use the full width.
 * Heights are pixels (0 = automatic) and are capped on phones so nothing becomes unusable.
 */
export const BOX_LIMITS = { minWidth: 20, maxWidth: 100, widthStep: 5, minHeight: 80, maxHeight: 1200, heightStep: 10, phoneMaxHeight: 520, minColumn: 10 };
const BOX = {
  boxWidth: { kind: 'number', min: BOX_LIMITS.minWidth, max: BOX_LIMITS.maxWidth, default: 100, label: 'Width (% of the row)', pageOnly: true },
  boxAlign: { kind: 'select', options: ['left', 'center', 'right'], default: 'left', label: 'Position in the row', pageOnly: true },
  spaceAbove: { kind: 'select', options: SPACING, default: 'none', label: 'Space above', pageOnly: true },
  spaceBelow: { kind: 'select', options: SPACING, default: 'none', label: 'Space below', pageOnly: true },
};
const HEIGHT = { kind: 'number', min: 0, max: BOX_LIMITS.maxHeight, default: 0, label: 'Height (px, 0 = automatic)', pageOnly: true };
const LINK_ITEM = { label: { kind: 'text', max: 100, default: 'Link' }, url: { kind: 'url', default: '/' }, description: { kind: 'text', max: 200, default: '' }, icon: { kind: 'select', options: ICONS, default: 'info' } };
const FRAME = { kind: 'select', options: ['card', 'plain'], default: 'card', label: 'Frame' };
const ANNOUNCEMENT_CATEGORIES = ['all', 'general', 'academic', 'events', 'campus-life', 'finance', 'it-services', 'safety', 'wellness'];

export const BLOCKS = {
  Section: {
    label: 'Section', group: 'layout', contexts: ['page'],
    fields: {
      title: { kind: 'text', max: 160, default: '' },
      subtitle: { kind: 'text', max: 300, default: '' },
      background: { kind: 'select', options: ['none', 'subtle', 'tint', 'brand', 'dark'], default: 'none' },
      backgroundImage: { kind: 'image', default: '' },
      padding: { kind: 'select', options: ['none', 'sm', 'md', 'lg'], default: 'md' },
      align: ALIGN,
      heightPx: HEIGHT,
      content: { kind: 'slot', max: 40 },
      ...BOX,
    },
  },
  Columns: {
    label: 'Row with columns', group: 'layout', contexts: ['page'],
    fields: {
      layout: { kind: 'select', options: ['1', '1-1', '2-1', '1-2', '1-1-1', '1-2-1', '1-1-1-1'], default: '1-1', label: 'Column widths' },
      gap: { kind: 'select', options: ['sm', 'md', 'lg'], default: 'md' },
      verticalAlign: { kind: 'select', options: ['start', 'center', 'stretch'], default: 'start' },
      stackOn: { kind: 'select', options: ['mobile', 'tablet'], default: 'mobile', label: 'Stack columns on' },
      col1Width: { kind: 'number', min: 0, max: 90, default: 0, label: 'Column 1 width (%, 0 = preset)' },
      col2Width: { kind: 'number', min: 0, max: 90, default: 0, label: 'Column 2 width (%, 0 = preset)' },
      col3Width: { kind: 'number', min: 0, max: 90, default: 0, label: 'Column 3 width (%, 0 = preset)' },
      col4Width: { kind: 'number', min: 0, max: 90, default: 0, label: 'Column 4 width (%, 0 = preset)' },
      column1: { kind: 'slot', max: 30 },
      column2: { kind: 'slot', max: 30 },
      column3: { kind: 'slot', max: 30 },
      column4: { kind: 'slot', max: 30 },
      ...BOX,
    },
  },
  Spacer: { label: 'Spacer', group: 'layout', contexts: ['page'], fields: { size: { kind: 'select', options: ['sm', 'md', 'lg', 'xl'], default: 'md' }, heightPx: HEIGHT } },
  Divider: { label: 'Divider', group: 'layout', contexts: ['page'], fields: { spacing: { kind: 'select', options: ['sm', 'md', 'lg'], default: 'md' }, ...BOX } },

  Heading: {
    label: 'Heading', group: 'content', contexts: ['page', 'dashboard'],
    fields: { text: { kind: 'text', max: 200, default: 'Heading' }, level: { kind: 'select', options: ['h1', 'h2', 'h3', 'h4'], default: 'h2' }, subtitle: { kind: 'text', max: 300, default: '' }, align: ALIGN, size: SIZE, ...BOX },
  },
  RichText: {
    label: 'Text', group: 'content', contexts: ['page', 'dashboard'],
    // `format` decides which of `markdown` (the original storage) and `html` (rich editor) is used.
    fields: { format: { kind: 'select', options: ['markdown', 'html'], default: 'markdown', label: 'Text format' }, markdown: { kind: 'markdown', max: 20000, default: 'Write something…' }, html: { kind: 'html', max: 50000, default: '' }, align: ALIGN, size: SIZE, ...BOX },
  },
  Image: {
    label: 'Image', group: 'content', contexts: ['page', 'dashboard'],
    fields: {
      src: { kind: 'image', default: '' },
      alt: { kind: 'text', max: 200, default: '', label: 'Alternative text' },
      caption: { kind: 'text', max: 300, default: '' },
      fit: { kind: 'select', options: ['cover', 'contain'], default: 'cover' },
      height: { kind: 'select', options: ['auto', 'sm', 'md', 'lg'], default: 'auto', label: 'Height preset' },
      heightPx: HEIGHT,
      aspectRatio: { kind: 'select', options: ['auto', '21:9', '16:9', '3:2', '4:3', '1:1'], default: 'auto', label: 'Aspect ratio' },
      focus: { kind: 'select', options: ['center', 'top', 'bottom'], default: 'center', label: 'Crop focus' },
      rounded: { kind: 'boolean', default: true },
      link: { kind: 'url', default: '' },
      size: SIZE,
      ...BOX,
    },
  },
  Banner: {
    label: 'Banner', group: 'content', contexts: ['page', 'dashboard'],
    fields: {
      eyebrow: { kind: 'text', max: 80, default: '' },
      title: { kind: 'text', max: 160, default: 'Welcome' },
      highlight: { kind: 'text', max: 60, default: '', label: 'Highlighted word in the title' },
      titleSize: { kind: 'select', options: ['md', 'lg', 'xl'], default: 'md', label: 'Title size' },
      description: { kind: 'markdown', max: 1000, default: '' },
      ctaLabel: { kind: 'text', max: 60, default: '' },
      ctaUrl: { kind: 'url', default: '' },
      secondaryLabel: { kind: 'text', max: 60, default: '', label: 'Second button label' },
      secondaryUrl: { kind: 'url', default: '', label: 'Second button link' },
      image: { kind: 'image', default: '' },
      overlay: { kind: 'select', options: ['none', 'light', 'medium', 'strong'], default: 'medium', label: 'Image overlay (text contrast)' },
      tone: { kind: 'select', options: ['brand', 'dark', 'light'], default: 'brand' },
      align: ALIGN,
      contentWidth: { kind: 'number', min: 30, max: 100, default: 65, label: 'Text width (%)', pageOnly: true },
      heightPx: HEIGHT,
      stats: { kind: 'list', max: 4, of: { value: { kind: 'text', max: 20, default: '100+' }, label: { kind: 'text', max: 60, default: 'Resources' }, icon: { kind: 'select', options: ICONS, default: 'book' } }, default: [] },
      size: SIZE,
      ...BOX,
    },
  },
  Callout: {
    label: 'Callout', group: 'content', contexts: ['page', 'dashboard'],
    fields: { title: { kind: 'text', max: 160, default: 'Note' }, body: { kind: 'markdown', max: 4000, default: '' }, tone: TONE, size: SIZE, ...BOX },
  },
  InfoCard: {
    label: 'Info card', group: 'content', contexts: ['page', 'dashboard'],
    fields: {
      title: { kind: 'text', max: 160, default: 'Card title' },
      body: { kind: 'markdown', max: 4000, default: '' },
      icon: { kind: 'select', options: ICONS, default: 'info' },
      image: { kind: 'image', default: '' },
      variant: { kind: 'select', options: ['standard', 'feature'], default: 'standard', label: 'Card style' },
      accent: { kind: 'select', options: ACCENTS, default: 'primary', label: 'Accent colour' },
      linkLabel: { kind: 'text', max: 60, default: '' },
      linkUrl: { kind: 'url', default: '' },
      heightPx: HEIGHT,
      size: SIZE,
      ...BOX,
    },
  },
  LinkList: {
    label: 'Link list', group: 'content', contexts: ['page', 'dashboard'],
    fields: {
      heading: { kind: 'text', max: 160, default: 'Useful links' },
      links: { kind: 'list', max: 20, of: LINK_ITEM, default: [] },
      variant: { kind: 'select', options: ['card', 'buttons'], default: 'card', label: 'Style' },
      size: SIZE,
      ...BOX,
    },
  },
  ButtonLink: {
    label: 'Button', group: 'content', contexts: ['page'],
    fields: { label: { kind: 'text', max: 60, default: 'Learn more' }, url: { kind: 'url', default: '/' }, variant: { kind: 'select', options: ['contained', 'outlined', 'text'], default: 'contained' }, align: ALIGN, ...BOX },
  },
  ContactCard: {
    label: 'Contact card', group: 'content', contexts: ['page', 'dashboard'],
    fields: {
      name: { kind: 'text', max: 120, default: 'Office name' },
      role: { kind: 'text', max: 120, default: '' },
      email: { kind: 'text', max: 160, default: '' },
      phone: { kind: 'text', max: 40, default: '' },
      location: { kind: 'text', max: 200, default: '' },
      hours: { kind: 'text', max: 200, default: '' },
      size: SIZE,
      ...BOX,
    },
  },

  AnnouncementsFeed: {
    label: 'Campus news', group: 'live', contexts: ['page', 'dashboard'],
    fields: { title: { kind: 'text', max: 160, default: 'Campus news' }, subtitle: { kind: 'text', max: 300, default: '' }, category: { kind: 'select', options: ANNOUNCEMENT_CATEGORIES, default: 'all' }, limit: { kind: 'number', min: 1, max: 12, default: 5 }, layout: { kind: 'select', options: ['list', 'cards'], default: 'list' }, frame: FRAME, linkLabel: { kind: 'text', max: 60, default: '' }, linkUrl: { kind: 'url', default: '' }, size: SIZE, ...BOX },
  },
  FaqList: {
    label: 'FAQs', group: 'live', contexts: ['page', 'dashboard'],
    fields: { title: { kind: 'text', max: 160, default: 'Frequently asked questions' }, subtitle: { kind: 'text', max: 300, default: '' }, category: { kind: 'text', max: 60, default: '' }, limit: { kind: 'number', min: 1, max: 30, default: 10 }, frame: FRAME, linkLabel: { kind: 'text', max: 60, default: '' }, linkUrl: { kind: 'url', default: '' }, size: SIZE, ...BOX },
  },
  EventsList: {
    label: 'Academic calendar', group: 'live', contexts: ['page', 'dashboard'],
    fields: { title: { kind: 'text', max: 160, default: 'Upcoming dates' }, limit: { kind: 'number', min: 1, max: 12, default: 5 }, size: SIZE, ...BOX },
  },
  Video: {
    label: 'Video (YouTube / Vimeo)', group: 'content', contexts: ['page'],
    fields: {
      url: { kind: 'video', label: 'Video address' },
      title: { kind: 'text', max: 120, default: 'Video', label: 'Title (for screen readers)' },
      caption: { kind: 'text', max: 300, default: '' },
      aspectRatio: { kind: 'select', options: ['16:9', '4:3', '1:1', '21:9', '9:16'], default: '16:9', label: 'Aspect ratio' },
      ...BOX,
    },
  },
  Form: {
    label: 'Form', group: 'live', contexts: ['page'],
    fields: {
      formId: { kind: 'formRef', label: 'Form' },
      showTitle: { kind: 'boolean', default: true, label: 'Show the form name' },
      showDescription: { kind: 'boolean', default: true, label: 'Show the description' },
      ...BOX,
    },
  },
  Quote: {
    label: 'Quote / testimonial', group: 'content', contexts: ['page'],
    fields: {
      quote: { kind: 'text', max: 400, default: 'A supportive campus makes all the difference.' },
      attribution: { kind: 'text', max: 120, default: '' },
      image: { kind: 'image', default: '' },
      heightPx: HEIGHT,
      ...BOX,
    },
  },

  DashboardWidget: {
    label: 'Dashboard widget', group: 'widgets', contexts: ['dashboard'],
    fields: {
      widgetKey: { kind: 'widget' },
      title: { kind: 'text', max: 120, default: '', label: 'Title (blank = original)' },
      subtitle: { kind: 'text', max: 160, default: '', label: 'Subtitle (blank = original)' },
      size: { kind: 'select', options: ['default', 'compact', 'standard', 'large'], default: 'default', label: 'Card size' },
    },
  },
};

export const ROOT_FIELDS = {
  page: { width: { kind: 'select', options: ['narrow', 'normal', 'wide'], default: 'normal' }, showTitle: { kind: 'boolean', default: true, label: 'Show the page title bar' } },
  dashboard: { hidden: { kind: 'hidden-list' } },
};

export const PERSONAS = ['student', 'faculty', 'admin'];

/** Admin dashboard sections that a layout can reorder, hide or retitle (see AdminDashboardPage). */
export const ADMIN_SECTIONS = [
  { key: 'admin.hero', label: 'Operations control center (banner)' },
  { key: 'admin.communications', label: 'Communication analytics & emergency broadcast' },
  { key: 'admin.tiers', label: 'Student tiers' },
  { key: 'admin.integrations', label: 'Integration health' },
  { key: 'admin.operations', label: 'Operations workspace' },
  { key: 'admin.audit', label: 'Audit activity' },
  { key: 'admin.sync', label: 'Recent integration activity' },
];

const SAFE_URL = /^(https?:\/\/[^\s<>"']{1,490}|mailto:[^\s<>"']{1,300}|tel:[+0-9()\-\s]{3,40}|\/(?!\/)[^\s<>"']{0,300})$/i;
const SAFE_IMAGE = /^(\/api\/v1\/content\/media\/[A-Za-z0-9._\-/]{1,200}|https:\/\/[^\s<>"']{1,490})$/;
export const isSafeUrl = (value) => value === '' || SAFE_URL.test(String(value));
export const isSafeImage = (value) => value === '' || SAFE_IMAGE.test(String(value));

/** A fresh, empty layout for the context. */
export const emptyLayout = (context) => ({ root: { props: context === 'dashboard' ? { hidden: [] } : { width: 'normal' } }, content: [] });

/**
 * Validate and normalise layout JSON. Returns { ok: true, layout } with only allowed blocks
 * and props (unknown props removed, defaults filled), or { ok: false, errors }.
 * `widgetKeys` is the allowed widget catalogue for dashboard layouts.
 */
export function validateLayout(input, { context, widgetKeys = [], sanitizeHtml = null } = {}) {
  const errors = [];
  let count = 0;
  const err = (path, message) => { if (errors.length < 50) errors.push({ path, message }); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: [{ path: '', message: 'Layout must be an object.' }] };
  let size;
  try { size = JSON.stringify(input).length; } catch { return { ok: false, errors: [{ path: '', message: 'Layout is not serialisable.' }] }; }
  if (size > LIMITS.maxBytes) return { ok: false, errors: [{ path: '', message: `Layout is too large (${size} bytes; the limit is ${LIMITS.maxBytes}).` }] };
  if (input.zones && Object.keys(input.zones).length) err('zones', 'Drop zones are not supported; use Section and Row blocks.');

  const value = (spec, raw, path, depth) => {
    const fallback = spec.default ?? '';
    switch (spec.kind) {
      case 'text':
      case 'markdown': {
        if (raw === undefined || raw === null) return fallback;
        if (typeof raw !== 'string') { err(path, 'Must be text.'); return fallback; }
        if (raw.length > spec.max) err(path, `At most ${spec.max} characters.`);
        return raw.slice(0, spec.max);
      }
      case 'select':
        if (raw === undefined || raw === null || raw === '') return fallback;
        if (!spec.options.includes(raw)) { err(path, `Must be one of: ${spec.options.join(', ')}.`); return fallback; }
        return raw;
      case 'number': {
        if (raw === undefined || raw === null || raw === '') return fallback;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < spec.min || n > spec.max) { err(path, `Must be a whole number from ${spec.min} to ${spec.max}.`); return fallback; }
        return n;
      }
      case 'boolean':
        if (raw === undefined || raw === null) return fallback;
        if (typeof raw !== 'boolean') { err(path, 'Must be true or false.'); return fallback; }
        return raw;
      case 'url':
        if (raw === undefined || raw === null) return '';
        if (typeof raw !== 'string' || !isSafeUrl(raw.trim())) { err(path, 'Use https://, mailto:, tel: or a portal path such as /help.'); return ''; }
        return raw.trim();
      case 'image':
        if (raw === undefined || raw === null) return '';
        if (typeof raw !== 'string' || !isSafeImage(raw.trim())) { err(path, 'Choose an image from the media library or use an https:// address.'); return ''; }
        return raw.trim();
      case 'html': {
        if (raw === undefined || raw === null) return '';
        if (typeof raw !== 'string') { err(path, 'Must be text.'); return ''; }
        if (raw.length > spec.max) { err(path, `At most ${spec.max} characters.`); return ''; }
        // The server passes its sanitizer; the browser only checks the length.
        return sanitizeHtml ? sanitizeHtml(raw) : raw;
      }
      case 'video': {
        if (raw === undefined || raw === null || raw === '') return '';
        const video = typeof raw === 'string' ? parseVideoUrl(raw) : null;
        if (!video) { err(path, 'Use a YouTube or Vimeo video address.'); return ''; }
        return canonicalVideoUrl(video);
      }
      case 'formRef':
        if (raw === undefined || raw === null || raw === '') return '';
        if (typeof raw !== 'string' || !/^[A-Za-z0-9]{10,64}$/.test(raw)) { err(path, 'Choose a form from the list.'); return ''; }
        return raw;
      case 'widget':
        if (typeof raw !== 'string' || !widgetKeys.includes(raw)) { err(path, 'Unknown dashboard widget for this dashboard.'); return null; }
        return raw;
      case 'list': {
        if (raw === undefined || raw === null) return [];
        if (!Array.isArray(raw)) { err(path, 'Must be a list.'); return []; }
        if (raw.length > spec.max) err(path, `At most ${spec.max} items.`);
        return raw.slice(0, spec.max).map((item, i) => {
          const out = {};
          for (const [k, s] of Object.entries(spec.of)) out[k] = value(s, item?.[k], `${path}[${i}].${k}`, depth);
          return out;
        });
      }
      case 'slot':
        if (raw === undefined || raw === null) return [];
        if (!Array.isArray(raw)) { err(path, 'Must be a list of blocks.'); return []; }
        if (raw.length > spec.max) err(path, `At most ${spec.max} blocks here.`);
        return blocks(raw.slice(0, spec.max), path, depth + 1);
      default:
        return undefined;
    }
  };

  const blocks = (list, path, depth) => {
    if (depth > LIMITS.maxDepth) { err(path, `Blocks are nested more than ${LIMITS.maxDepth} levels deep.`); return []; }
    const out = [];
    list.forEach((block, i) => {
      const at = `${path}[${i}]`;
      count += 1;
      if (count > LIMITS.maxBlocks) { if (count === LIMITS.maxBlocks + 1) err(at, `A layout may contain at most ${LIMITS.maxBlocks} blocks.`); return; }
      const def = BLOCKS[block?.type];
      if (!def) { err(at, `Unknown block type "${block?.type}".`); return; }
      if (!def.contexts.includes(context)) { err(at, `${def.label} cannot be used in a ${context} layout.`); return; }
      const id = String(block.props?.id ?? '');
      if (!id || id.length > LIMITS.maxIdLength || !/^[A-Za-z0-9_:-]+$/.test(id)) err(`${at}.props.id`, 'Each block needs a short id.');
      const props = { id: id.slice(0, LIMITS.maxIdLength) };
      for (const [name, spec] of Object.entries(def.fields)) {
        if (context === 'dashboard' && (spec.kind === 'slot' || spec.pageOnly)) continue;
        props[name] = value(spec, block.props?.[name], `${at}.props.${name}`, depth);
      }
      out.push({ type: block.type, props });
    });
    return out;
  };

  const content = Array.isArray(input.content) ? blocks(input.content, 'content', 1) : (err('content', 'Must be a list of blocks.'), []);
  const rootIn = input.root?.props ?? {};
  const root = { props: {} };
  if (context === 'page') {
    root.props.width = value(ROOT_FIELDS.page.width, rootIn.width, 'root.props.width', 0);
    root.props.showTitle = value(ROOT_FIELDS.page.showTitle, rootIn.showTitle, 'root.props.showTitle', 0);
  }
  if (context === 'dashboard') {
    const hidden = Array.isArray(rootIn.hidden) ? rootIn.hidden : [];
    root.props.hidden = [...new Set(hidden.filter((k) => typeof k === 'string' && widgetKeys.includes(k)))];
    const used = content.filter((b) => b.type === 'DashboardWidget').map((b) => b.props.widgetKey);
    if (new Set(used).size !== used.length) err('content', 'Each dashboard widget can appear only once.');
  }
  return errors.length ? { ok: false, errors } : { ok: true, layout: { root, content } };
}
