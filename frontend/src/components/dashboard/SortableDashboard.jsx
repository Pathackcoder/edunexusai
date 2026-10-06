import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import DragHandleRoundedIcon from '@mui/icons-material/DragHandleRounded';
import { FadeIn } from '../common/Skeletons';
import { dashboardApi } from '../../services/api';
import { useI18n } from '../../i18n';

/**
 * Drag-and-drop dashboard grid.
 *
 * - Grab a card anywhere that is not a control (buttons, links, inputs keep working), or
 *   use the grip handle that appears on hover. Touch devices drag from the grip only, so
 *   scrolling a phone never starts a drag.
 * - While dragging, the card follows the pointer and the others glide to their new
 *   slots (FLIP animation); a dashed placeholder marks where it will land.
 * - On drop the card settles into place and the order is saved for this user
 *   (PUT /dashboard/layout/:key). Arrow keys on the grip reorder without a mouse.
 *
 * items: [{ key, span: { md, lg, xl? }, node }]
 */

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [contenteditable="true"], .MuiChip-clickable, [data-no-drag]';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const THRESHOLD = 6;
// Masonry track: cards keep their natural height and span as many 4px rows as they need,
// so a short card is never stretched to match a tall neighbour.
const ROW_UNIT = 4;
const GAP = 16;
// Usable width at which the dashboard switches from three to four columns. Measured on the
// grid itself (not the viewport) so it follows the sidebar collapsing and expanding.
const WIDE_MIN_WIDTH = 1280;

/** Four-column tier: a third becomes a quarter and two thirds becomes a half, unless set. */
const wideSpan = (span) => {
  if (span.xl) return span.xl;
  const lg = span.lg ?? span.md ?? 12;
  return lg === 4 || lg === 8 ? (lg * 3) / 4 : lg;
};

/** Merge the saved order with the widgets the user is entitled to right now. */
export function mergeOrder(saved = [], available = []) {
  const known = saved.filter((key) => available.includes(key));
  const result = [...known];
  available.forEach((key, defaultIndex) => {
    if (result.includes(key)) return;
    // A widget the user has never placed goes where it sits in the default layout.
    const before = available.slice(0, defaultIndex).filter((other) => result.includes(other)).pop();
    const index = before ? result.indexOf(before) + 1 : 0;
    result.splice(index, 0, key);
  });
  return result;
}

const storageKey = (key) => `edunexus.layout.${key}`;

/**
 * Order state for one dashboard. The server copy is the source of truth; localStorage
 * is only a fallback so an offline save is not lost on refresh.
 */
export function useDashboardLayout(dashboardKey, serverOrder, availableKeys) {
  const [saved, setSaved] = useState(() => {
    if (serverOrder?.length) return serverOrder;
    try {
      return JSON.parse(localStorage.getItem(storageKey(dashboardKey)) ?? '[]');
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (serverOrder?.length) setSaved(serverOrder);
  }, [serverOrder]);

  const availableSig = availableKeys.join('|');
  const order = useMemo(() => mergeOrder(saved, availableKeys), [saved, availableSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(
    async (next) => {
      // Keep keys for widgets that are currently hidden so they return to their place.
      const full = [...next, ...saved.filter((key) => !next.includes(key))];
      setSaved(full);
      try {
        localStorage.setItem(storageKey(dashboardKey), JSON.stringify(full));
      } catch {
        /* ignore */
      }
      try {
        await dashboardApi.saveLayout(dashboardKey, full);
        return true;
      } catch {
        return false;
      }
    },
    [dashboardKey, saved],
  );

  const reset = useCallback(async () => {
    setSaved([]);
    try {
      localStorage.removeItem(storageKey(dashboardKey));
    } catch {
      /* ignore */
    }
    try {
      await dashboardApi.resetLayout(dashboardKey);
    } catch {
      /* ignore */
    }
  }, [dashboardKey]);

  return { order, persist, reset, isCustomised: saved.length > 0 };
}

/**
 * Skyline packing. CSS Grid's sparse auto-placement never moves a later card into a
 * hole above an earlier one, which leaves gaps in lower sections. Instead each card,
 * in the user's order, is placed at the column position whose current bottom is
 * highest (the "shortest column"), with explicit grid coordinates. Cards keep their
 * natural height; wide cards span two columns; order is still left-to-right, top-down
 * (with a three-card look-ahead so wide cards never strand a gap).
 */
export function packLayout(keys, { widthOf, heightOf, columns = 12, lookAhead = 3 }) {
  const widths = new Map(keys.map((key) => [key, Math.min(columns, widthOf(key))]));
  const step = Math.max(1, Math.min(...widths.values(), columns));
  const skyline = new Array(columns).fill(0);
  const placement = {};

  const bestSpot = (key) => {
    const width = widths.get(key);
    let best = { col: 0, top: Infinity };
    for (let col = 0; col + width <= columns; col += step) {
      const top = Math.max(...skyline.slice(col, col + width));
      if (top < best.top) best = { col, top };
    }
    return best;
  };

  // Small look-ahead: among the next few cards, place the one that sits highest
  // (ties go to the user's order). A wide card waiting for two columns to free up
  // therefore lets a narrow card fill the hole first instead of leaving a gap.
  const remaining = [...keys];
  while (remaining.length) {
    let pick = 0;
    let spot = bestSpot(remaining[0]);
    for (let index = 1; index < Math.min(lookAhead, remaining.length); index += 1) {
      const candidate = bestSpot(remaining[index]);
      if (candidate.top < spot.top) {
        pick = index;
        spot = candidate;
      }
    }
    const [key] = remaining.splice(pick, 1);
    const width = widths.get(key);
    const height = heightOf(key);
    placement[key] = { col: spot.col, row: spot.top, width, height };
    for (let col = spot.col; col < spot.col + width; col += 1) skyline[col] = spot.top + height;
  }
  return placement;
}

export function SortableDashboard({ items, order, onOrderChange, ariaLabel = 'Dashboard widgets', disabled = false }) {
  const theme = useTheme();
  const isLg = useMediaQuery(theme.breakpoints.up('lg'));
  const isMd = useMediaQuery(theme.breakpoints.up('md'));
  const { t } = useI18n();
  const byKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
  const [localOrder, setLocalOrder] = useState(order);
  const [draggingKey, setDraggingKey] = useState(null);
  const [settlingKey, setSettlingKey] = useState(null);
  const [spans, setSpans] = useState({});
  const [isWide, setIsWide] = useState(false);

  const containerRef = useRef(null);
  const slots = useRef(new Map());
  const movers = useRef(new Map());
  const previous = useRef(null);
  const drag = useRef(null);
  const orderRef = useRef(order);

  useEffect(() => {
    if (!drag.current?.started) {
      setLocalOrder(order);
      orderRef.current = order;
    }
  }, [order]);

  const visible = localOrder.filter((key) => byKey.has(key));

  // Track the grid's own width to pick the column tier.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const check = () => setIsWide(el.clientWidth >= WIDE_MIN_WIDTH);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure each card's natural height and translate it into a row span.
  useLayoutEffect(() => {
    const measure = () => {
      const next = {};
      movers.current.forEach((el, key) => {
        next[key] = Math.ceil((el.offsetHeight + GAP) / ROW_UNIT);
      });
      setSpans((current) => {
        const keys = Object.keys(next);
        return keys.length === Object.keys(current).length && keys.every((key) => current[key] === next[key]) ? current : next;
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    movers.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [visible.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const layoutOf = (key) => {
    const el = slots.current.get(key);
    return el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null;
  };

  /** Remember where every card is before the order changes (the "F" in FLIP). */
  const snapshot = () => {
    const map = new Map();
    visible.forEach((key) => map.set(key, layoutOf(key)));
    previous.current = map;
  };

  const applyDragTransform = useCallback(() => {
    const state = drag.current;
    if (!state?.started) return;
    const mover = movers.current.get(state.key);
    const slot = layoutOf(state.key);
    if (!mover || !slot) return;
    const dx = state.pointerX - state.startX + (state.startLeft - slot.left);
    const dy = state.pointerY - state.startY + (state.startTop - slot.top);
    mover.style.transition = 'box-shadow 200ms ease';
    mover.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.015)`;
  }, []);

  // Invert + play: slide every displaced card from its old slot to its new one.
  useLayoutEffect(() => {
    const before = previous.current;
    if (!before) return;
    previous.current = null;
    visible.forEach((key) => {
      if (drag.current?.started && key === drag.current.key) return;
      const old = before.get(key);
      const now = layoutOf(key);
      const mover = movers.current.get(key);
      if (!old || !now || !mover) return;
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (!dx && !dy) return;
      mover.style.transition = 'none';
      mover.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      mover.getBoundingClientRect();
      requestAnimationFrame(() => {
        mover.style.transition = `transform 280ms ${EASE}`;
        mover.style.transform = '';
      });
    });
    applyDragTransform();
  }, [localOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveKey = (key, toIndex) => {
    const current = orderRef.current.filter((item) => byKey.has(item));
    const from = current.indexOf(key);
    if (from === -1 || toIndex === from || toIndex < 0 || toIndex >= current.length) return null;
    const next = [...current];
    next.splice(from, 1);
    next.splice(toIndex, 0, key);
    snapshot();
    orderRef.current = next;
    setLocalOrder(next);
    return next;
  };

  const containerPoint = (event) => {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hitTest = (point, draggedKey) => {
    const own = layoutOf(draggedKey);
    if (own && point.x >= own.left && point.x <= own.left + own.width && point.y >= own.top && point.y <= own.top + own.height) return null;
    for (const key of orderRef.current) {
      if (key === draggedKey || !byKey.has(key)) continue;
      const box = layoutOf(key);
      if (box && point.x >= box.left && point.x <= box.left + box.width && point.y >= box.top && point.y <= box.top + box.height) return key;
    }
    return null;
  };

  const stopAutoScroll = () => {
    if (drag.current?.scrollTimer) cancelAnimationFrame(drag.current.scrollTimer);
  };
  const autoScroll = () => {
    const state = drag.current;
    if (!state?.started) return;
    const edge = 72;
    const y = state.clientY;
    const delta = y < edge ? -Math.ceil((edge - y) / 6) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 6) : 0;
    if (delta) window.scrollBy(0, delta);
    state.scrollTimer = requestAnimationFrame(autoScroll);
  };

  // Window listeners must keep one identity for add/remove across re-renders, so they
  // delegate to the latest handlers through a ref.
  const handlers = useRef({});
  const stableMove = useRef((event) => handlers.current.move(event)).current;
  const stableUp = useRef((event) => handlers.current.up(event)).current;

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    const point = containerPoint(event);
    state.pointerX = point.x;
    state.pointerY = point.y;
    state.clientY = event.clientY;
    if (!state.started) {
      if (Math.hypot(point.x - state.startX, point.y - state.startY) < THRESHOLD) return;
      state.started = true;
      setDraggingKey(state.key);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      state.scrollTimer = requestAnimationFrame(autoScroll);
    }
    event.preventDefault();
    applyDragTransform();
    const now = performance.now();
    if (now - (state.lastSwap ?? 0) < 90) return;
    const target = hitTest(point, state.key);
    if (target) {
      const index = orderRef.current.filter((key) => byKey.has(key)).indexOf(target);
      if (moveKey(state.key, index)) state.lastSwap = now;
    }
  };

  const finish = (event) => {
    const state = drag.current;
    if (!state || (event && event.pointerId !== state.pointerId)) return;
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableUp);
    window.removeEventListener('pointercancel', stableUp);
    stopAutoScroll();
    drag.current = null;
    if (!state.started) return;

    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    // A drag must never turn into a click on whatever is under the pointer.
    const swallow = (clickEvent) => {
      clickEvent.stopPropagation();
      clickEvent.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

    const mover = movers.current.get(state.key);
    if (mover) {
      mover.style.transition = `transform 320ms ${EASE}, box-shadow 320ms ease`;
      mover.style.transform = '';
    }
    setDraggingKey(null);
    setSettlingKey(state.key);
    setTimeout(() => setSettlingKey((key) => (key === state.key ? null : key)), 340);
    const changed = orderRef.current.join('|') !== state.initialOrder.join('|');
    if (changed) onOrderChange?.(orderRef.current.filter((key) => byKey.has(key)));
  };
  handlers.current = { move: onPointerMove, up: finish };

  const onPointerDown = (key) => (event) => {
    if (event.button !== 0 || drag.current) return;
    const onHandle = Boolean(event.target.closest('[data-drag-handle]'));
    if (!onHandle && (event.pointerType === 'touch' || event.target.closest(INTERACTIVE))) return;
    const point = containerPoint(event);
    const slot = layoutOf(key);
    drag.current = {
      key,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      pointerX: point.x,
      pointerY: point.y,
      clientY: event.clientY,
      startLeft: slot.left,
      startTop: slot.top,
      started: false,
      initialOrder: [...orderRef.current],
    };
    if (onHandle) event.preventDefault();
    window.addEventListener('pointermove', stableMove, { passive: false });
    window.addEventListener('pointerup', stableUp);
    window.addEventListener('pointercancel', stableUp);
  };

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', stableMove);
      window.removeEventListener('pointerup', stableUp);
      window.removeEventListener('pointercancel', stableUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onHandleKeyDown = (key) => (event) => {
    const keys = orderRef.current.filter((item) => byKey.has(item));
    const index = keys.indexOf(key);
    const delta = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = moveKey(key, index + delta);
    if (next) {
      onOrderChange?.(next);
      requestAnimationFrame(() => slots.current.get(key)?.querySelector('[data-drag-handle]')?.focus());
    }
  };

  // Width of each card at the current breakpoint, in 12-column units.
  const widthOf = (key) => {
    const span = byKey.get(key)?.span ?? { md: 12 };
    if (!isMd) return 12;
    if (isLg && isWide) return wideSpan(span);
    if (isLg) return span.lg ?? span.md ?? 12;
    return span.md ?? 12;
  };
  const placement = packLayout(visible, { widthOf, heightOf: (key) => spans[key] ?? 1 });

  return (
    <Box
      ref={containerRef}
      role="list"
      aria-label={ariaLabel}
      sx={{
        position: 'relative',
        display: 'grid',
        // Always 12 tracks: placement is explicit, and phones simply give every card all 12.
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: `${GAP}px`,
        rowGap: 0,
        gridAutoRows: `${ROW_UNIT}px`,
        alignItems: 'start',
      }}
    >
      {visible.map((key) => {
        const item = byKey.get(key);
        const place = placement[key];
        const isDragging = draggingKey === key;
        return (
          <Box
            key={key}
            role="listitem"
            ref={(el) => (el ? slots.current.set(key, el) : slots.current.delete(key))}
            sx={{
              gridColumn: place ? `${place.col + 1} / span ${place.width}` : '1 / -1',
              gridRow: place ? `${place.row + 1} / span ${place.height}` : 'auto',
              minWidth: 0,
              position: 'relative',
            }}
          >
            {/* Placeholder: where the dragged card will land */}
            <Box
              aria-hidden
              sx={(theme) => ({
                position: 'absolute',
                inset: `0 0 ${GAP}px 0`,
                borderRadius: 4,
                border: `2px dashed ${alpha(theme.palette.primary.main, 0.45)}`,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                opacity: isDragging ? 1 : 0,
                transition: 'opacity 180ms ease',
                pointerEvents: 'none',
              })}
            />
            <Box
              ref={(el) => (el ? movers.current.set(key, el) : movers.current.delete(key))}
              onPointerDown={disabled ? undefined : onPointerDown(key)}
              className={isDragging ? 'is-dragging' : settlingKey === key ? 'is-settling' : undefined}
              sx={(theme) => ({
                position: 'relative',
                minWidth: 0,
                display: 'flex',
                zIndex: isDragging ? 20 : settlingKey === key ? 10 : 'auto',
                cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
                willChange: isDragging ? 'transform' : 'auto',
                '& [data-no-drag], & button, & a, & input, & textarea, & select, & label': { cursor: 'auto' },
                '& button, & a': { cursor: 'pointer' },
                '& > .MuiCard-root': { transition: `transform 280ms ${EASE}, box-shadow 280ms ${EASE}, border-color 280ms ease` },
                '&.is-dragging > .MuiCard-root': {
                  boxShadow: `0 24px 48px -12px ${alpha(theme.palette.primary.dark, 0.28)}, 0 8px 16px -8px ${alpha(theme.palette.common.black, 0.12)}`,
                  borderColor: alpha(theme.palette.primary.main, 0.5),
                  transform: 'none',
                },
                '&:hover .drag-grip, &:focus-within .drag-grip, &.is-dragging .drag-grip': { opacity: 1 },
              })}
            >
              <FadeIn delay={Math.min(visible.indexOf(key), 8) * 45} sx={{ width: '100%', display: 'flex' }}>{item.node}</FadeIn>
              {!disabled && (
              <Tooltip title={`${t('Drag to reorder')} · ${item.label ?? key}`} placement="top" disableInteractive>
                <IconButton
                  className="drag-grip"
                  data-drag-handle
                  size="small"
                  aria-label={`${t('Drag to reorder')}: ${item.label ?? key}. Use arrow keys to move.`}
                  onKeyDown={onHandleKeyDown(key)}
                  sx={(theme) => ({
                    position: 'absolute',
                    top: 1,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 40,
                    height: 15,
                    borderRadius: '0 0 8px 8px',
                    borderTop: 0,
                    opacity: { xs: 0.7, md: 0 },
                    color: 'text.secondary',
                    bgcolor: alpha(theme.palette.background.paper, 0.9),
                    border: `1px solid ${theme.palette.divider}`,
                    cursor: isDragging ? 'grabbing' : 'grab !important',
                    touchAction: 'none',
                    zIndex: 3,
                    transition: 'opacity 160ms ease, background-color 160ms ease',
                    '&:hover, &:focus-visible': { bgcolor: theme.palette.primary.lighter, color: 'primary.main', opacity: 1 },
                  })}
                >
                  <DragHandleRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export default SortableDashboard;
