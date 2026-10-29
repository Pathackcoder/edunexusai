import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { institution } from '../../branding';

/**
 * Login entrance over the campus video (about two seconds):
 *
 *   1. The campus footage fades in from the night tone (never a white screen).
 *   2. The Feddrick University logo appears large at centre.
 *   3. The logo glides to its place at the top left.
 *   4. The sign-in card fades and slides into position; the page is interactive.
 *
 * Transform/opacity only. Plays once per page load, never under prefers-reduced-motion;
 * any key skips it, as does a click while the card is still hidden. Every intro style is
 * removed at the end, leaving the exact normal page.
 */

const TIMELINE = { dock: 750, reveal: 1050, done: 2000 };
const GLIDE = 'cubic-bezier(0.65, 0, 0.25, 1)';
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const LOGO_WAIT_MS = 1000;

let playedThisLoad = false;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Layout box (ignores transforms, so entrance motion never skews the measurement). */
function layoutRect(el) {
  let left = 0;
  let top = 0;
  let node = el;
  while (node) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent;
  }
  return { left: left - window.scrollX, top: top - window.scrollY, width: el.offsetWidth, height: el.offsetHeight };
}

export function useLoginIntro({ logoRef }) {
  const [playing] = useState(() => typeof window !== 'undefined' && !playedThisLoad && !prefersReducedMotion());
  const [phase, setPhase] = useState(playing ? 'measure' : 'done');
  const [geo, setGeo] = useState(null);
  const [logoReady, setLogoReady] = useState(false);
  const finish = useCallback(() => setPhase('done'), []);

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

  useLayoutEffect(() => {
    if (phase !== 'measure' || !logoReady) return;
    const logo = logoRef.current;
    if (!logo?.offsetWidth) {
      setPhase('done');
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const plate = layoutRect(logo);
    const scale = Math.max(1.5, Math.min(2.8, Math.min(vw * 0.7, 520) / plate.width));
    setGeo({
      plate,
      scale,
      logoDx: vw / 2 - plate.left - (plate.width * scale) / 2,
      logoDy: vh * 0.42 - plate.top - (plate.height * scale) / 2,
    });
    setPhase('logo');
  }, [phase, logoReady, logoRef]);

  // Advance once measured; a skip ("done") is never undone.
  useEffect(() => {
    if (!geo) return undefined;
    const timers = Object.entries(TIMELINE).map(([name, at]) =>
      setTimeout(() => setPhase((current) => (current === 'done' ? current : name)), at),
    );
    return () => timers.forEach(clearTimeout);
  }, [geo]);

  const running = phase !== 'done';
  const cardHidden = running && phase !== 'reveal';
  useEffect(() => {
    if (!running) return undefined;
    const events = ['keydown', 'resize'];
    events.forEach((type) => window.addEventListener(type, finish));
    return () => events.forEach((type) => window.removeEventListener(type, finish));
  }, [running, finish]);
  useEffect(() => {
    if (!cardHidden) return undefined;
    window.addEventListener('pointerdown', finish);
    return () => window.removeEventListener('pointerdown', finish);
  }, [cardHidden, finish]);

  const active = phase !== 'done';
  const revealed = phase === 'reveal';
  const styles = !active
    ? { logo: {}, card: {}, chrome: {} }
    : {
        logo: { visibility: 'hidden' },
        card: revealed
          ? { opacity: 1, transform: 'none', transition: `opacity 600ms ease, transform 850ms ${SETTLE}` }
          : { opacity: 0, pointerEvents: 'none', transform: 'translate3d(0, 22px, 0) scale(0.98)' },
        chrome: revealed ? { opacity: 1, transition: 'opacity 600ms ease 250ms' } : { opacity: 0 },
      };

  return {
    active,
    playing,
    phase,
    geo,
    styles,
    // The footage fades in from the night tone as the intro begins.
    videoVisible: phase !== 'measure',
  };
}

/** The flying logo. Rendered only while the intro runs. */
export function LoginIntroOverlay({ intro }) {
  const { active, phase, geo } = intro;
  if (!active || !geo) return null;
  const { plate, scale: s } = geo;
  const docked = phase !== 'logo';
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        left: plate.left,
        top: plate.top,
        width: plate.width * s,
        height: plate.height * s,
        zIndex: 6,
        pointerEvents: 'none',
        transformOrigin: '0 0',
        transform: docked ? `scale(${1 / s})` : `translate3d(${geo.logoDx}px, ${geo.logoDy}px, 0)`,
        transition: docked ? `transform 800ms ${GLIDE}` : 'none',
        willChange: 'transform',
      }}
    >
      <Box
        component="img"
        src={institution.logoInverse}
        alt=""
        sx={{
          display: 'block',
          width: '100%',
          height: '100%',
          filter: 'drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45))',
          '@keyframes fuIntroLogo': { from: { opacity: 0, transform: 'scale(0.94)' }, to: { opacity: 1, transform: 'none' } },
          animation: `fuIntroLogo 600ms ${SETTLE} both`,
        }}
      />
    </Box>
  );
}
