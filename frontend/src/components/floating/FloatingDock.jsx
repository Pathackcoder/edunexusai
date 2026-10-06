import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';

/**
 * One coordinated floating system for the bottom-right corner.
 *
 * The dock is a zero-size fixed anchor. Its children position themselves against its
 * corner. The install prompt reports its rendered height through `setLift`; the dock
 * publishes it as `--dock-lift`, and the assistant button/panel translate upward by
 * that amount. Movement is transform-only (no layout shift) on a shared spring easing,
 * so the button glides up as the prompt arrives and settles back when it leaves.
 */
export const DOCK_GAP = 14;
export const DOCK_EASE = 'cubic-bezier(0.22, 1.18, 0.36, 1)';
export const DOCK_DURATION = 520;

const DockContext = createContext({ setLift: () => {} });
export const useDock = () => useContext(DockContext);

export function FloatingDock({ children }) {
  const root = useRef(null);
  const setLift = useCallback((px) => {
    root.current?.style.setProperty('--dock-lift', `${Math.max(0, Math.round(px))}px`);
  }, []);
  return (
    <DockContext.Provider value={{ setLift }}>
      <Box
        ref={root}
        sx={{
          '--dock-lift': '0px',
          position: 'fixed',
          right: { xs: 16, sm: 28 },
          bottom: { xs: 16, sm: 28 },
          width: 0,
          height: 0,
          zIndex: 1300,
        }}
      >
        {children}
      </Box>
    </DockContext.Provider>
  );
}

/**
 * Wraps an element that should rise above whatever the dock is showing below it.
 * `extra` adds a fixed offset (e.g. the assistant panel sits above the button).
 */
export const liftSx = (extra = 0) => ({
  transform: `translate3d(0, calc((var(--dock-lift) + ${extra}px) * -1), 0)`,
  transition: `transform ${DOCK_DURATION}ms ${DOCK_EASE}`,
});

/** Reports an element's height to the dock while `active`, and zero otherwise. */
export function useDockLift(active) {
  const { setLift } = useDock();
  const ref = useRef(null);
  useEffect(() => {
    if (!active || !ref.current) {
      setLift(0);
      return undefined;
    }
    const el = ref.current;
    const report = () => setLift(el.offsetHeight + DOCK_GAP);
    report();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      setLift(0);
    };
  }, [active, setLift]);
  return ref;
}

/** Mount/unmount with an exit transition, so leaving elements animate out. */
export function usePresence(visible, exitMs = 320) {
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [visible, exitMs]);
  return { mounted, shown };
}

export default FloatingDock;
