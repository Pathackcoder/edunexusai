import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded';

const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.25;
const MAX_ZOOM = 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * A draggable, zoomable viewport over a fixed-size world (no map library).
 *
 * - Drag to pan (mouse, pen or touch); arrow keys pan and +/- zoom when focused;
 *   ctrl/⌘ + wheel or a trackpad pinch zooms around the pointer.
 * - The window keeps its normal size (aspect ratio) until maximised; the top-right
 *   control enters full screen (Fullscreen API, or a fixed overlay where unavailable)
 *   and the same control or Escape restores it.
 * - `renderWorld(scale)` draws the world at the current scale (crisp SVG, HTML markers
 *   at true size). A drag never triggers a click on a marker underneath.
 * - Imperative `focusOn(x, y)` glides a world point to the centre.
 */
export const PannableMap = forwardRef(function PannableMap({ worldWidth, worldHeight, initialCenter, initialZoom = 1.35, aspectRatio = '16 / 10', renderWorld, overlay, label = 'Map' }, ref) {
  const frameRef = useRef(null);
  const viewportRef = useRef(null);
  const layerRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null); // { scale, x, y } — screen = world * scale + offset
  const [animate, setAnimate] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [overlayMode, setOverlayMode] = useState(false);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const fitScale = size.w ? Math.max(size.w / worldWidth, size.h / worldHeight) : 1;

  const clampView = useCallback(
    (next) => {
      const minScale = fitScale;
      const scale = clamp(next.scale, minScale, fitScale * MAX_ZOOM);
      const ww = worldWidth * scale;
      const wh = worldHeight * scale;
      return {
        scale,
        x: ww <= size.w ? (size.w - ww) / 2 : clamp(next.x, size.w - ww, 0),
        y: wh <= size.h ? (size.h - wh) / 2 : clamp(next.y, size.h - wh, 0),
      };
    },
    [fitScale, size.w, size.h, worldWidth, worldHeight],
  );

  const centerOn = useCallback(
    (wx, wy, scale) => clampView({ scale, x: size.w / 2 - wx * scale, y: size.h / 2 - wy * scale }),
    [clampView, size.w, size.h],
  );

  // Track the viewport size (window resizes, entering or leaving full screen).
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // First layout and every resize: keep the same world point in the middle.
  const lastSize = useRef(null);
  useLayoutEffect(() => {
    if (!size.w) return;
    const prev = lastSize.current;
    lastSize.current = size;
    const current = viewRef.current;
    if (!current || !prev) {
      const start = initialCenter ?? { x: worldWidth / 2, y: worldHeight / 2 };
      setView(centerOn(start.x, start.y, fitScale * initialZoom));
      return;
    }
    const wx = (prev.w / 2 - current.x) / current.scale;
    const wy = (prev.h / 2 - current.y) / current.scale;
    const ratio = current.scale / (prev.w ? Math.max(prev.w / worldWidth, prev.h / worldHeight) : 1);
    setView(centerOn(wx, wy, fitScale * ratio));
  }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = useCallback(
    (factor, px = size.w / 2, py = size.h / 2) => {
      const current = viewRef.current;
      if (!current) return;
      const scale = clamp(current.scale * factor, fitScale, fitScale * MAX_ZOOM);
      const wx = (px - current.x) / current.scale;
      const wy = (py - current.y) / current.scale;
      setAnimate(true);
      setView(clampView({ scale, x: px - wx * scale, y: py - wy * scale }));
    },
    [clampView, fitScale, size.w, size.h],
  );

  useImperativeHandle(ref, () => ({
    focusOn(wx, wy) {
      const current = viewRef.current;
      if (!current) return;
      setAnimate(true);
      setView(centerOn(wx, wy, Math.max(current.scale, fitScale * initialZoom)));
    },
  }), [centerOn, fitScale, initialZoom]);

  /* ---- dragging (transform applied directly while moving, committed on release) ---- */
  const onPointerDown = (event) => {
    if (event.button !== 0 || !view || event.target.closest('[data-map-control]')) return;
    drag.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x: view.x, y: view.y, moved: false };
    suppressClick.current = false;
  };
  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.sx;
    const dy = event.clientY - state.sy;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!state.moved) {
      state.moved = true;
      setAnimate(false);
      viewportRef.current.setPointerCapture(event.pointerId);
    }
    const next = clampView({ scale: view.scale, x: state.x + dx, y: state.y + dy });
    state.next = next;
    layerRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
  };
  const endDrag = (event) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (state.moved) {
      suppressClick.current = true;
      if (state.next) setView(state.next);
    }
  };

  const onKeyDown = (event) => {
    if (!view) return;
    const step = 80;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      setAnimate(true);
      setView(clampView({ scale: view.scale, x: view.x + moves[event.key][0], y: view.y + moves[event.key][1] }));
    } else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP);
  };

  // ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer; plain wheel scrolls the page.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  /* ---- maximise / restore ---- */
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!overlayMode) return undefined;
    const onKey = (event) => event.key === 'Escape' && setOverlayMode(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayMode]);

  const maximised = fullscreen || overlayMode;
  const toggleMaximise = async () => {
    if (maximised) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setOverlayMode(false);
      return;
    }
    if (frameRef.current?.requestFullscreen && document.fullscreenEnabled) {
      try {
        await frameRef.current.requestFullscreen();
        return;
      } catch {
        /* fall through to the overlay */
      }
    }
    setOverlayMode(true);
  };

  const controlSx = { bgcolor: 'background.paper', boxShadow: 2, '&:hover': { bgcolor: 'background.paper' } };

  return (
    <Box
      ref={frameRef}
      sx={{
        position: overlayMode ? 'fixed' : 'relative',
        inset: overlayMode ? 0 : 'auto',
        zIndex: overlayMode ? (theme) => theme.zIndex.modal : 'auto',
        width: '100%',
        height: maximised ? '100%' : 'auto',
        bgcolor: 'background.paper',
        borderRadius: maximised ? 0 : 4,
        overflow: 'hidden',
        border: maximised ? 0 : 1,
        borderColor: 'divider',
      }}
    >
      <Box
        ref={viewportRef}
        role="application"
        aria-label={`${label}. Drag or use the arrow keys to move around; plus and minus to zoom.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.stopPropagation();
            event.preventDefault();
            suppressClick.current = false;
          }
        }}
        onKeyDown={onKeyDown}
        sx={{
          position: 'relative',
          width: '100%',
          ...(maximised ? { height: '100%' } : { aspectRatio }),
          overflow: 'hidden',
          cursor: drag.current?.moved ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          bgcolor: '#DCE7C6',
          '&:focus-visible': { outline: (theme) => `3px solid ${theme.palette.primary.main}`, outlineOffset: -3 },
        }}
      >
        {view && (
          <Box
            ref={layerRef}
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: worldWidth * view.scale,
              height: worldHeight * view.scale,
              transform: `translate3d(${view.x}px, ${view.y}px, 0)`,
              transition: animate ? 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
              willChange: 'transform',
            }}
            onTransitionEnd={() => setAnimate(false)}
          >
            {renderWorld(view.scale)}
          </Box>
        )}

        {/* Zoom controls (bottom right) */}
        <Stack data-map-control spacing={0.75} sx={{ position: 'absolute', right: 12, bottom: 12 }}>
          <Tooltip title="Zoom in" placement="left"><IconButton size="small" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} sx={controlSx}><AddRoundedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Zoom out" placement="left"><IconButton size="small" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} sx={controlSx}><RemoveRoundedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Re-centre" placement="left">
            <IconButton
              size="small"
              aria-label="Re-centre the map"
              onClick={() => {
                const start = initialCenter ?? { x: worldWidth / 2, y: worldHeight / 2 };
                setAnimate(true);
                setView(centerOn(start.x, start.y, fitScale * initialZoom));
              }}
              sx={controlSx}
            >
              <CenterFocusStrongRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Maximise / restore (top right) */}
        <Box data-map-control sx={{ position: 'absolute', right: 12, top: 12 }}>
          <Tooltip title={maximised ? 'Exit full screen (Esc)' : 'Full screen'} placement="left">
            <IconButton size="small" aria-label={maximised ? 'Exit full screen' : 'View map full screen'} aria-pressed={maximised} onClick={toggleMaximise} sx={controlSx}>
              {maximised ? <CloseFullscreenRoundedIcon fontSize="small" /> : <OpenInFullRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {overlay && <Box data-map-control>{overlay({ maximised })}</Box>}
      </Box>
    </Box>
  );
});

export default PannableMap;
