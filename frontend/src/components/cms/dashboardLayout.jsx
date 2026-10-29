import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { contentApi } from '../../services/api';
import { BLOCK_COMPONENTS } from './blocks/CmsBlocks';

/**
 * Published dashboard layouts (Studio → Dashboards), applied on top of a dashboard's
 * existing widget items. A layout is presentation only:
 *   - it can reorder, retitle, resize or hide widgets the user ALREADY has (the items passed
 *     in are already filtered by role, tier entitlements and data availability); it cannot
 *     add a widget the user is not entitled to, because such a widget is not in `items`;
 *   - widgets keep their own components, API calls and permission checks;
 *   - widgets the layout does not mention keep their original position (so new widgets are
 *     never lost), and the user's own drag-and-drop order still applies on top.
 * With no published layout, the feature switched off, or the CMS unavailable, `layout` is
 * null and the dashboard renders exactly as before.
 */

export function useCmsDashboardLayout(persona) {
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    let active = true;
    contentApi.dashboardLayout(persona).then(
      (res) => { if (active) setLayout(res?.layout ?? null); },
      () => { if (active) setLayout(null); },
    );
    return () => { active = false; };
  }, [persona]);
  return layout;
}

const BLOCK_SIZES = ['compact', 'standard', 'large'];
const SPAN = { compact: { md: 6, lg: 4 }, standard: { md: 6, lg: 4 }, large: { md: 12, lg: 8 } };

/** A CMS content card inside the dashboard grid. */
export function CmsDashboardBlock({ type, props }) {
  const Block = BLOCK_COMPONENTS[type];
  if (!Block) return null;
  const wrapped = ['Heading', 'RichText', 'Image', 'Banner', 'Callout'].includes(type);
  return wrapped ? <Box sx={{ height: '100%', p: type === 'Banner' || type === 'Image' ? 0 : 2.5, borderRadius: 4, bgcolor: type === 'Banner' || type === 'Image' ? 'transparent' : 'background.paper', border: type === 'Banner' || type === 'Image' ? 0 : 1, borderColor: 'divider' }}><Block {...props} /></Box> : <Block {...props} />;
}

/**
 * items: the dashboard's own [{ key, label, span, size, node }]. Returns the items to render.
 * Content blocks become items keyed `cms.<id>`; DashboardWidget blocks carry `presentation`
 * (title/subtitle overrides, read by WidgetCard through the widget slot context).
 */
export function applyCmsLayout(items, layout) {
  if (!layout || !Array.isArray(layout.content)) return items;
  const byKey = new Map(items.map((item) => [item.key, item]));
  const hidden = new Set(layout.root?.props?.hidden ?? []);
  const placed = new Set();
  const out = [];
  for (const block of layout.content) {
    const props = block.props ?? {};
    if (block.type === 'DashboardWidget') {
      const item = byKey.get(props.widgetKey);
      if (!item || placed.has(item.key)) continue; // not available to this user: never forced in
      placed.add(item.key);
      const size = BLOCK_SIZES.includes(props.size) ? props.size : item.size;
      const presentation = props.title || props.subtitle ? { title: props.title || null, subtitle: props.subtitle || null } : null;
      out.push({ ...item, size, span: size !== item.size && SPAN[size] ? SPAN[size] : item.span, presentation });
      continue;
    }
    if (!BLOCK_COMPONENTS[block.type] || !props.id) continue;
    const size = BLOCK_SIZES.includes(props.size) ? props.size : 'large';
    out.push({ key: `cms.${props.id}`, label: props.title || props.text || props.heading || block.type, size, span: SPAN[size], node: <CmsDashboardBlock type={block.type} props={props} /> });
  }
  // Widgets the layout does not mention (and does not hide) keep their original place.
  items.forEach((item, index) => {
    if (placed.has(item.key) || hidden.has(item.key)) return;
    const before = items.slice(0, index).map((i) => i.key).filter((k) => placed.has(k)).pop();
    const at = before ? out.findIndex((i) => i.key === before) + 1 : out.findIndex((i) => !i.key.startsWith('cms.') && placed.has(i.key));
    out.splice(at < 0 ? out.length : at, 0, item);
    placed.add(item.key);
  });
  return out;
}
