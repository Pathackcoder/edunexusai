import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionBar, createUsePuck, useGetPuck } from '@puckeditor/core';
import { BLOCKS, BOX_LIMITS } from '../../../../../shared/cmsBlocks.js';

/**
 * Studio canvas controls on top of Puck's selection overlay.
 *
 * Resizing is constrained, not freeform: every handle writes one of the block's validated
 * layout properties through Puck's own state (`replace`), so the change is undoable, saved
 * with the layout, checked by the server and rendered identically on the live page.
 *
 *   right/left edge  → boxWidth   (% of the row, 20–100, steps of 5)
 *   bottom edge      → heightPx   (80–1200 px, steps of 10)
 *   column dividers  → col1Width … col4Width (each ≥ 10 %, sum 100)
 *   dashboard edge   → size       (compact | standard | large)
 *
 * Every handle is a focusable button: arrow keys change the value by one step, so nothing
 * needs a mouse. Handles use native listeners because the overlay lives in the canvas
 * iframe, outside the draggable element, and its clicks must not deselect the block.
 */

const usePuck = createUsePuck();
const componentSelector = (id) => `[data-puck-component=${JSON.stringify(String(id))}]`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snap = (v, step) => Math.round(v / step) * step;
const DASH_SIZES = ['compact', 'standard', 'large'];
const COLUMN_COUNT = { 1: 1, '1-1': 2, '2-1': 2, '1-2': 2, '1-1-1': 3, '1-2-1': 3, '1-1-1-1': 4 };
const PRESET = { 1: [100], '1-1': [50, 50], '2-1': [67, 33], '1-2': [33, 67], '1-1-1': [34, 33, 33], '1-2-1': [25, 50, 25], '1-1-1-1': [25, 25, 25, 25] };

function useUpdate(id) {
  const getPuck = useGetPuck();
  return useCallback((patch, recordHistory = true) => {
    const api = getPuck();
    const item = api.getItemById(id);
    const sel = api.getSelectorForId(id);
    if (!item || !sel) return;
    // Live drag frames skip no-op updates; the final (recorded) update always lands, so the
    // whole drag becomes one undo step even when the last frame already applied the value.
    if (!recordHistory && Object.entries(patch).every(([k, v]) => item.props[k] === v)) return;
    api.dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone, data: { ...item, props: { ...item.props, ...patch } }, recordHistory });
  }, [getPuck, id]);
}

/** A drag + keyboard handle. `onDrag(event, start)` returns a patch; `onKey(delta)` too. */
function Handle({ style, cursor, label, valueText, onDrag, onKey, onEnd, update }) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  const latest = useRef({});
  latest.current = { onDrag, onKey, onEnd, update };
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    let last = null;
    const stop = (e) => { e.stopPropagation(); };
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      setActive(true);
      const start = { x: e.clientX, y: e.clientY };
      const move = (ev) => {
        ev.stopPropagation();
        last = latest.current.onDrag(ev, start);
        if (!frame && last) frame = requestAnimationFrame(() => { frame = 0; latest.current.update(last, false); });
      };
      const up = (ev) => {
        ev.stopPropagation();
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        setActive(false);
        if (last) latest.current.update(last, true);
        last = null;
        latest.current.onEnd?.();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    const key = (e) => {
      const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!delta) return;
      e.preventDefault();
      e.stopPropagation();
      const patch = latest.current.onKey(delta, e.key);
      if (patch) latest.current.update(patch, true);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('click', stop);
    el.addEventListener('mousedown', stop);
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('click', stop);
      el.removeEventListener('mousedown', stop);
      el.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${label}: ${valueText}. Use the arrow keys to change it.`}
      title={`${label}: ${valueText} (drag, or focus and use the arrow keys)`}
      data-cms-handle=""
      style={{
        position: 'absolute',
        pointerEvents: 'auto',
        cursor,
        padding: 0,
        border: '2px solid #fff',
        borderRadius: 999,
        background: active ? '#1d4ed8' : '#2563eb',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        zIndex: 3,
        touchAction: 'none',
        ...style,
      }}
    >
      {active && (
        <span style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', font: '600 11px/1 system-ui, sans-serif', padding: '5px 7px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{valueText}</span>
      )}
    </button>
  );
}

/** Measures the component (and its columns) inside the canvas, relative to the overlay box. */
function useGeometry(id, anchor) {
  const [geo, setGeo] = useState(null);
  const measure = useCallback(() => {
    const doc = anchor.current?.ownerDocument;
    const el = doc?.querySelector(componentSelector(id));
    if (!el) return;
    // Puck wraps each block in a full-width element; the visible box is its first child.
    const outer = el.getBoundingClientRect();
    const box = el.firstElementChild ?? el;
    const rect = box.getBoundingClientRect();
    const parentRect = outer;
    const zoneRect = el.parentElement?.getBoundingClientRect() ?? outer;
    const grid = box.querySelector('[data-cms-columns]');
    const cols = grid ? [...grid.children].filter((c) => c.hasAttribute('data-cms-column')).map((c) => c.getBoundingClientRect()) : [];
    const sideBySide = cols.length > 1 && cols.every((c) => Math.abs(c.top - cols[0].top) < 2);
    setGeo((prev) => {
      const next = { rect, outer, zone: zoneRect, parentWidth: parentRect.width, parentLeft: parentRect.left, cols: sideBySide ? cols : [] };
      if (prev && prev.outer.width === outer.width && prev.outer.left === outer.left && prev.outer.top === outer.top && prev.rect.width === rect.width && prev.rect.height === rect.height && prev.rect.left === rect.left && prev.rect.top === rect.top && prev.cols.length === next.cols.length && prev.cols.every((c, i) => c.left === next.cols[i].left && c.width === next.cols[i].width)) return prev;
      return next;
    });
  }, [anchor, id]);
  useLayoutEffect(() => {
    measure();
    const doc = anchor.current?.ownerDocument;
    const el = doc?.querySelector(componentSelector(id));
    if (!el) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    const grid = el.querySelector('[data-cms-columns]');
    if (grid) [...grid.children].forEach((c) => observer.observe(c));
    const timer = setInterval(measure, 400);
    return () => { observer.disconnect(); clearInterval(timer); };
  }, [anchor, id, measure]);
  return geo;
}

function Handles({ id, type, context }) {
  const anchor = useRef(null);
  const update = useUpdate(id);
  const getPuck = useGetPuck();
  const geo = useGeometry(id, anchor);
  const props = usePuck((s) => s.getItemById(id)?.props);
  const fields = BLOCKS[type]?.fields ?? {};
  const page = context === 'page';
  const canWidth = page && 'boxWidth' in fields;
  const canHeight = page && 'heightPx' in fields;
  const canSize = !page && 'size' in fields;
  const isColumns = page && type === 'Columns';

  const props0 = () => getPuck().getItemById(id)?.props ?? {};
  const align = props?.boxAlign ?? 'left';
  const width = clamp(Number(props?.boxWidth) || 100, BOX_LIMITS.minWidth, BOX_LIMITS.maxWidth);
  const height = Number(props?.heightPx) || 0;

  const dragWidth = useCallback((e) => {
    if (!geo) return null;
    const { rect, parentWidth, parentLeft } = geo;
    let px;
    const a = props0().boxAlign ?? 'left';
    if (a === 'right') px = rect.right - e.clientX;
    else if (a === 'center') px = 2 * Math.abs(e.clientX - (parentLeft + parentWidth / 2));
    else px = e.clientX - rect.left;
    return { boxWidth: clamp(snap((px / parentWidth) * 100, BOX_LIMITS.widthStep), BOX_LIMITS.minWidth, BOX_LIMITS.maxWidth) };
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps
  const keyWidth = useCallback((d) => ({ boxWidth: clamp((Number(props0().boxWidth) || 100) + d * BOX_LIMITS.widthStep, BOX_LIMITS.minWidth, BOX_LIMITS.maxWidth) }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const dragHeight = useCallback((e) => {
    if (!geo) return null;
    return { heightPx: clamp(snap(e.clientY - geo.rect.top, BOX_LIMITS.heightStep), BOX_LIMITS.minHeight, BOX_LIMITS.maxHeight) };
  }, [geo]);
  const keyHeight = useCallback((d) => {
    const current = Number(props0().heightPx) || Math.round(geo?.rect.height ?? 200);
    return { heightPx: clamp(snap(current + d * 20, BOX_LIMITS.heightStep), BOX_LIMITS.minHeight, BOX_LIMITS.maxHeight) };
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragSize = useCallback((e) => {
    if (!geo) return null;
    // Relative to the whole row (the dashboard grid), so a card can grow beyond its current cell.
    const fraction = (e.clientX - geo.rect.left) / geo.zone.width;
    return { size: fraction < 0.42 ? 'compact' : fraction < 0.72 ? 'standard' : 'large' };
  }, [geo]);
  const keySize = useCallback((d) => {
    const current = props0().size;
    const at = DASH_SIZES.indexOf(current === 'default' || !DASH_SIZES.includes(current) ? 'standard' : current);
    return { size: DASH_SIZES[clamp(at + d, 0, DASH_SIZES.length - 1)] };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Current column percentages: custom widths if all set, otherwise measured. */
  const columnPercents = useCallback(() => {
    const p = props0();
    const count = COLUMN_COUNT[p.layout] ?? 2;
    const custom = [p.col1Width, p.col2Width, p.col3Width, p.col4Width].slice(0, count).map((w) => Number(w) || 0);
    if (custom.every((w) => w >= BOX_LIMITS.minColumn)) {
      const total = custom.reduce((a, b) => a + b, 0);
      return custom.map((w) => (w / total) * 100);
    }
    if (geo?.cols.length === count) {
      const total = geo.cols.reduce((a, c) => a + c.width, 0);
      return geo.cols.map((c) => (c.width / total) * 100);
    }
    return PRESET[p.layout] ?? [50, 50];
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps
  const toPatch = (percents) => {
    const rounded = percents.map((v) => Math.round(v));
    rounded[rounded.length - 1] += 100 - rounded.reduce((a, b) => a + b, 0);
    return { col1Width: rounded[0] ?? 0, col2Width: rounded[1] ?? 0, col3Width: rounded[2] ?? 0, col4Width: rounded[3] ?? 0 };
  };
  const moveDivider = (i, nextLeftPercent) => {
    const pct = columnPercents();
    const pair = pct[i] + pct[i + 1];
    const left = clamp(nextLeftPercent, BOX_LIMITS.minColumn, pair - BOX_LIMITS.minColumn);
    const next = [...pct];
    next[i] = left;
    next[i + 1] = pair - left;
    return toPatch(next);
  };

  if (!geo) return <div ref={anchor} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
  const H = 12;
  const handles = [];
  // Overlay coordinates are relative to Puck's wrapper (geo.outer); place handles on the box.
  const bx = geo.rect.left - geo.outer.left;
  const by = geo.rect.top - geo.outer.top;
  const bw = geo.rect.width;
  const bh = geo.rect.height;
  handles.push(<div key="box" aria-hidden style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, outline: '2px dashed rgba(37,99,235,0.9)', outlineOffset: 2, borderRadius: 6, pointerEvents: 'none' }} />);

  if (canWidth) {
    const onLeft = align === 'right';
    handles.push(
      <Handle key="w" update={update} label="Width" valueText={`${width}% of the row`} cursor="ew-resize"
        style={{ top: by + bh / 2 - 20, left: (onLeft ? bx : bx + bw) - H / 2, width: H, height: 40 }}
        onDrag={dragWidth} onKey={(d) => keyWidth(onLeft ? -d : d)} />,
    );
  }
  if (canHeight) {
    handles.push(
      <Handle key="h" update={update} label="Height" valueText={height ? `${height}px` : 'automatic'} cursor="ns-resize"
        style={{ left: bx + bw / 2 - 20, top: by + bh - H / 2, width: 40, height: H }}
        onDrag={dragHeight} onKey={keyHeight} />,
    );
  }
  if (canSize) {
    const size = props?.size === 'default' || !props?.size ? 'original' : props.size;
    handles.push(
      <Handle key="s" update={update} label="Card size" valueText={size} cursor="ew-resize"
        style={{ top: by + bh / 2 - 20, left: bx + bw - H / 2, width: H, height: 40 }}
        onDrag={dragSize} onKey={keySize} />,
    );
  }
  if (isColumns && geo.cols.length > 1) {
    const pct = columnPercents();
    for (let i = 0; i < geo.cols.length - 1; i += 1) {
      const a = geo.cols[i];
      const b = geo.cols[i + 1];
      const x = (a.right + b.left) / 2 - geo.outer.left;
      handles.push(
        <Handle key={`c${i}`} update={update} label={`Columns ${i + 1} and ${i + 2}`} valueText={`${Math.round(pct[i])}% / ${Math.round(pct[i + 1])}%`} cursor="col-resize"
          style={{ left: x - 5, top: a.top - geo.outer.top + 8, height: Math.max(24, a.height - 16), width: 10, borderRadius: 6, background: 'rgba(37,99,235,0.85)' }}
          onDrag={(e) => {
            const g = geo;
            const startLeft = g.cols[i].left;
            const pairWidth = g.cols[i + 1].right - startLeft;
            const pair = columnPercents()[i] + columnPercents()[i + 1];
            const leftPct = ((e.clientX - startLeft) / pairWidth) * pair;
            return moveDivider(i, snap(leftPct, 1));
          }}
          onKey={(d) => moveDivider(i, pct[i] + d * 5)} />,
      );
    }
  }
  return <div ref={anchor} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{handles}</div>;
}

/** `overrides.componentOverlay`: Puck's outline plus our handles on the selected block. */
export function makeCmsOverlay(context) {
  return function CmsOverlay({ children, isSelected, componentId, componentType }) {
    return (
      <>
        {children}
        {isSelected && <Handles id={componentId} type={componentType} context={context} />}
      </>
    );
  };
}

/** `overrides.actionBar`: keeps Puck's actions and adds keyboard-friendly Move up / Move down. */
export function CmsActionBar({ label, children, parentAction }) {
  const getPuck = useGetPuck();
  const selector = usePuck((s) => s.appState.ui.itemSelector);
  const count = usePuck((s) => {
    const sel = s.appState.ui.itemSelector;
    if (!sel?.zone) return 0;
    const item = s.getItemBySelector(sel);
    const parent = item ? s.getParentById(item.props.id) : null;
    const [parentId, slot] = sel.zone.split(':');
    if (parentId === 'root') return s.appState.data.content?.length ?? 0;
    return parent?.props?.[slot]?.length ?? 0;
  });
  const move = (delta) => {
    const { dispatch, appState } = getPuck();
    const sel = appState.ui.itemSelector;
    if (!sel?.zone) return;
    const to = sel.index + delta;
    if (to < 0 || to >= count) return;
    dispatch({ type: 'reorder', sourceIndex: sel.index, destinationIndex: to, destinationZone: sel.zone });
    dispatch({ type: 'setUi', ui: { itemSelector: { zone: sel.zone, index: to } }, recordHistory: false });
  };
  const index = selector?.index ?? 0;
  return (
    <ActionBar>
      <ActionBar.Group>
        {parentAction}
        {label && <ActionBar.Label label={label} />}
      </ActionBar.Group>
      <ActionBar.Group>
        <ActionBar.Action label="Move up" disabled={index <= 0} onClick={() => move(-1)}><span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>↑</span></ActionBar.Action>
        <ActionBar.Action label="Move down" disabled={index >= count - 1} onClick={() => move(1)}><span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>↓</span></ActionBar.Action>
        {children}
      </ActionBar.Group>
    </ActionBar>
  );
}
