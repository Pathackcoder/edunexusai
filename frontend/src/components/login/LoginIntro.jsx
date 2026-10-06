import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import Box from '@mui/material/Box';

/**
 * Login entrance: a white screen with the EdunexusAI logo at centre, the logo gliding
 * to its place in the brand row, the campus scene arriving at centre, then the scene
 * sliding to its column while the sign-in form emerges from it. Ends on the exact
 * normal page: every intro style is removed in the final phase.
 *
 * Motion is transform/opacity only. It plays once per page load (not after an in-app
 * sign-out), never under prefers-reduced-motion, and a click or key press skips it.
 */

// Phase start times (ms). Phones have no scene column, so they skip the scene beat.
const TIMELINE_SCENE = { dock: 650, scene: 1150, reveal: 1700, done: 2800 };
const TIMELINE_COMPACT = { dock: 600, reveal: 1150, done: 2150 };
const GLIDE = 'cubic-bezier(0.65, 0, 0.25, 1)';
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';
// If the logo image is not ready by then, skip the intro rather than hold a blank screen.
const LOGO_WAIT_MS = 1200;

let playedThisLoad = false;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function useLoginIntro({ logoRef, sceneRef, formRef }) {
  const [playing] = useState(() => typeof window !== 'undefined' && !playedThisLoad && !prefersReducedMotion());
  const [phase, setPhase] = useState(playing ? 'measure' : 'done');
  const [geo, setGeo] = useState(null);
  const [logoReady, setLogoReady] = useState(false);
  const finish = useCallback(() => setPhase('done'), []);

  // The plate's size depends on the logo image, so wait for it (briefly) before measuring.
  useLayoutEffect(() => {
    if (phase !== 'measure') return undefined;
    playedThisLoad = true;
    const img = logoRef.current?.querySelector('img');
    if (!img || (img.complete && img.naturalWidth > 0)) {
      setLogoReady(true);
      return undefined;
    }
    const ready = () => setLogoReady(true);
    const timer = setTimeout(finish, LOGO_WAIT_MS);
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', finish, { once: true });
    return () => {
      clearTimeout(timer);
      img.removeEventListener('load', ready);
      img.removeEventListener('error', finish);
    };
  }, [phase, logoRef, finish]);

  // Measure the final layout before the next paint, then start at "logo".
  useLayoutEffect(() => {
    if (phase !== 'measure' || !logoReady) return;
    const plate = logoRef.current?.getBoundingClientRect();
    if (!plate?.width) {
      setPhase('done');
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sceneEl = sceneRef.current;
    const scene = sceneEl && sceneEl.offsetWidth > 0 ? sceneEl.getBoundingClientRect() : null;
    const form = formRef.current?.getBoundingClientRect();
    const scale = Math.max(1.4, Math.min(2.4, (vw * 0.62) / plate.width));
    setGeo({
      plate: { left: plate.left, top: plate.top, width: plate.width, height: plate.height },
      scale,
      // Offset that puts the enlarged logo at the centre of the screen.
      logoDx: vw / 2 - plate.left - (plate.width * scale) / 2,
      logoDy: vh / 2 - plate.top - (plate.height * scale) / 2,
      sceneDx: scene ? vw / 2 - (scene.left + scene.width / 2) : 0,
      // The form starts part-way toward the centre, behind the scene, and slides out of it.
      formDx: scene && form ? (vw / 2 - (form.left + form.width / 2)) * 0.55 : 0,
      hasScene: Boolean(scene),
    });
    setPhase('logo');
  }, [phase, logoReady, logoRef, sceneRef, formRef]);

  // Advance through the timeline once measured. A skip ("done") is never undone.
  useEffect(() => {
    if (!geo) return undefined;
    const timeline = geo.hasScene ? TIMELINE_SCENE : TIMELINE_COMPACT;
    const timers = Object.entries(timeline).map(([next, at]) =>
      setTimeout(() => setPhase((current) => (current === 'done' ? current : next)), at),
    );
    return () => timers.forEach(clearTimeout);
  }, [geo]);

  // Skip on any key, and finish at once if the layout changes underneath. A pointer press
  // skips only while the form is still hidden: once it is visible and settling, snapping
  // it into place between press and release would swallow that click.
  const running = phase !== 'done';
  const formHidden = running && phase !== 'reveal';
  useEffect(() => {
    if (!running) return undefined;
    const events = ['keydown', 'resize'];
    events.forEach((type) => window.addEventListener(type, finish));
    return () => events.forEach((type) => window.removeEventListener(type, finish));
  }, [running, finish]);
  useEffect(() => {
    if (!formHidden) return undefined;
    window.addEventListener('pointerdown', finish);
    return () => window.removeEventListener('pointerdown', finish);
  }, [formHidden, finish]);

  const active = phase !== 'done';
  const at = (...phases) => phases.includes(phase);
  const g = geo ?? { sceneDx: 0, formDx: 0, hasScene: false };

  const styles = !active
    ? { logo: {}, scene: {}, form: {}, chrome: {}, column: {} }
    : {
        // The real logo stays hidden under the flying copy until the hand-off.
        logo: { visibility: 'hidden' },
        column: { zIndex: 3 },
        scene: at('measure', 'logo', 'dock')
          ? { zIndex: 4, opacity: 0, transform: `translate3d(${g.sceneDx}px, 0, 0) scale(0.86)` }
          : at('scene')
            ? { zIndex: 4, opacity: 1, transform: `translate3d(${g.sceneDx}px, 0, 0) scale(0.9)`, transition: `opacity 550ms ease, transform 900ms ${SETTLE}` }
            : { zIndex: 4, opacity: 1, transform: 'none', transition: `transform 1050ms ${GLIDE}` },
        form: at('reveal')
          ? { opacity: 1, transform: 'none', transition: `opacity 650ms ease 120ms, transform 1000ms ${SETTLE} 60ms` }
          : { opacity: 0, pointerEvents: 'none', transform: g.hasScene ? `translate3d(${g.formDx}px, 0, 0) scale(0.92)` : 'translate3d(0, 22px, 0) scale(0.97)' },
        chrome: at('reveal')
          ? { opacity: 1, transition: 'opacity 600ms ease 450ms' }
          : { opacity: 0 },
      };

  return { active, playing, phase, geo, styles, entranceDelay: playing ? TIMELINE_SCENE.scene : 0 };
}

/** White veil and the flying logo. Rendered only while the intro runs. */
export function LoginIntroOverlay({ intro, logoSrc = '/logo.png' }) {
  const { active, phase, geo } = intro;
  if (!active) return null;
  const docked = phase !== 'logo';
  return (
    <Box aria-hidden sx={{ pointerEvents: 'none' }}>
      {/* White ground: fades as the form emerges, revealing the page atmosphere. */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 2,
          bgcolor: '#FFFFFF',
          opacity: phase === 'reveal' ? 0 : 1,
          transition: 'opacity 800ms ease 100ms',
        }}
      />
      {/* Logo, drawn at the enlarged size and scaled down into place so it stays crisp. */}
      {geo && <IntroLogo geo={geo} docked={docked} logoSrc={logoSrc} />}
    </Box>
  );
}

function IntroLogo({ geo, docked, logoSrc }) {
  const { plate, scale: s } = geo;
  return (
    <Box
      sx={{
        position: 'fixed',
        left: plate.left,
        top: plate.top,
        width: plate.width * s,
        height: plate.height * s,
        zIndex: 6,
        transformOrigin: '0 0',
        transform: docked ? `scale(${1 / s})` : `translate3d(${geo.logoDx}px, ${geo.logoDy}px, 0)`,
        transition: docked ? `transform 850ms ${GLIDE}` : 'none',
        willChange: 'transform',
      }}
    >
      <Box
        sx={{
          '@keyframes enxIntroLogo': {
            from: { opacity: 0, transform: 'scale(0.94)' },
            to: { opacity: 1, transform: 'none' },
          },
          animation: `enxIntroLogo 520ms ${SETTLE} both`,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#FFFFFF',
          borderRadius: `${12 * s}px`,
          border: `${s}px solid rgba(70, 81, 222, 0.1)`,
          boxShadow: `0 ${6 * s}px ${16 * s}px -${10 * s}px rgba(53, 46, 160, 0.35)`,
        }}
      >
        <Box component="img" src={logoSrc} alt="" sx={{ height: 28 * s, width: 'auto', maxWidth: 'none', display: 'block' }} />
      </Box>
    </Box>
  );
}
