import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { prefersReducedMotion } from './nexoraStyle';
import { NEXORA_PATH, backDelta, isNexoraPath, readStoredReturn, returnFromLocation, returnHref, storeReturn } from './nexoraReturn';

let nexoraModule = null;

/** Loads (or preloads) the Nexora route chunk. */
export const loadNexoraPage = () =>
  import('../../pages/nexora/NexoraPage').then((module) => {
    nexoraModule = module;
    return module;
  });

/**
 * The factory App.jsx gives React.lazy. Once the chunk is loaded it answers synchronously, so the route renders on
 * the first pass instead of flashing its loading screen for a frame (lazy always suspends on a real promise).
 */
export const lazyNexoraPage = () => (nexoraModule ? { then: (resolve) => resolve(nexoraModule) } : loadNexoraPage());

/** How long the outgoing view takes to leave (the incoming view then plays its own entrance). */
export const NEXORA_EXIT_MS = { opening: 180, closing: 220 };

const NexoraSessionContext = createContext(null);

const historyIdx = () => {
  const idx = window.history.state?.idx;
  return Number.isInteger(idx) ? idx : null;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Put the window back at `y` once the restored page is tall enough (its data may still be loading); gives up when
 * the person scrolls, taps or types, or after 4s.
 */
function restoreScroll(y) {
  const deadline = performance.now() + 4000;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  events.forEach((name) => window.addEventListener(name, stop, { once: true, passive: true }));
  const step = () => {
    if (stopped) return;
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 1 && performance.now() < deadline) requestAnimationFrame(step);
    else events.forEach((name) => window.removeEventListener(name, stop));
  };
  requestAnimationFrame(step);
}

/**
 * The Nexora toggle. `open()` remembers the page the person is on, lets it fade out while the sidebar folds, then
 * shows Nexora; `close()` plays Nexora out while the sidebar returns to its previous state, then goes back to that
 * page (stepping back through history when possible) and restores its scroll position. `phase` is 'idle',
 * 'opening' or 'closing' while a transition runs; the layout reads it to fold the sidebar and animate the content.
 * With reduced motion the transitions are skipped and the switch is immediate.
 */
export function NexoraSessionProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inNexora = isNexoraPath(location.pathname);
  const [phase, setPhase] = useState('idle');

  const phaseRef = useRef('idle');
  const inNexoraRef = useRef(inNexora);
  const locationRef = useRef(location);
  const returnRef = useRef(undefined);
  if (returnRef.current === undefined) returnRef.current = readStoredReturn();
  const frozenRef = useRef(false); // scroll is not recorded while the layout reflows during a transition
  const pendingRef = useRef(null); // the target a close is travelling to

  const setPhaseBoth = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Every location change: finish a running transition before paint (the new view brings its own entrance), and
  // remember where the person is while outside Nexora.
  useLayoutEffect(() => {
    locationRef.current = location;
    inNexoraRef.current = inNexora;
    if (phaseRef.current !== 'idle') {
      frozenRef.current = false;
      setPhaseBoth('idle');
    }
    if (inNexora) {
      storeReturn(returnRef.current);
      return;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending?.viaBack && pending.key !== location.key) {
      // History did not hold the expected entry (it was replaced or trimmed): go to the page itself.
      pendingRef.current = { ...pending, viaBack: false };
      navigate(returnHref(pending), { replace: true, state: pending.state });
      return;
    }
    returnRef.current = returnFromLocation(location, historyIdx(), pending ? pending.scrollY : window.scrollY);
    if (pending?.scrollY) restoreScroll(pending.scrollY);
  }, [location, inNexora, navigate, setPhaseBoth]);

  // Keep the scroll position of the page outside Nexora current, so closing returns to the same spot.
  useEffect(() => {
    const onScroll = () => {
      if (inNexoraRef.current || frozenRef.current || !returnRef.current) return;
      returnRef.current = { ...returnRef.current, scrollY: Math.round(window.scrollY) };
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const open = useCallback(async () => {
    if (phaseRef.current !== 'idle' || inNexoraRef.current) return;
    const from = locationRef.current;
    const target = returnFromLocation(from, historyIdx(), window.scrollY);
    if (target) {
      returnRef.current = target;
      storeReturn(target);
    }
    frozenRef.current = true;
    setPhaseBoth('opening');
    // The page chunk loads while the current page leaves, so Nexora never flashes a loading screen.
    await Promise.all([loadNexoraPage().catch(() => null), wait(prefersReducedMotion() ? 0 : NEXORA_EXIT_MS.opening)]);
    if (locationRef.current.key !== from.key) return; // the person went somewhere else meanwhile
    navigate(NEXORA_PATH);
  }, [navigate, setPhaseBoth]);

  const close = useCallback(async () => {
    if (phaseRef.current !== 'idle' || !inNexoraRef.current) return;
    setPhaseBoth('closing');
    await wait(prefersReducedMotion() ? 0 : NEXORA_EXIT_MS.closing);
    if (!inNexoraRef.current) return;
    const target = returnRef.current;
    const delta = backDelta(target, historyIdx());
    pendingRef.current = target ? { ...target, viaBack: delta !== null } : null;
    if (delta !== null) navigate(delta);
    else navigate(returnHref(target), { state: target?.state ?? null });
  }, [navigate, setPhaseBoth]);

  const value = useMemo(() => ({ inNexora, phase, open, close, toggle: inNexora ? close : open }), [inNexora, phase, open, close]);
  return <NexoraSessionContext.Provider value={value}>{children}</NexoraSessionContext.Provider>;
}

export function useNexoraSession() {
  const value = useContext(NexoraSessionContext);
  if (!value) throw new Error('useNexoraSession must be used inside NexoraSessionProvider');
  return value;
}
