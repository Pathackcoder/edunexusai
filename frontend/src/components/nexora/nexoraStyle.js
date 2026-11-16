import { brand } from '../../theme/theme';

/**
 * Nexora's visual language, layered on the portal theme: the institution's brand gradient for primary surfaces,
 * plus an "aurora" of the theme's glow colours that gives Nexora its own identity without leaving the design
 * system (every value follows the institution's appearance preset through the --enx-* custom properties).
 */
export const nexora = {
  gradient: brand.gradient,
  gradientHover: brand.gradientHover,
  // Mark and accents: brand primary → violet → cyan.
  spectrum: 'linear-gradient(125deg, var(--enx-primary, #4651DE) 0%, #8B5CF6 52%, #22D3EE 100%)',
  aurora: `radial-gradient(40% 50% at 18% 12%, ${brand.glowIndigo}, transparent 70%), radial-gradient(35% 45% at 88% 8%, ${brand.glowCyan}, transparent 72%), radial-gradient(45% 55% at 60% 100%, ${brand.glowViolet}, transparent 70%)`,
  surface: 'rgba(255, 255, 255, 0.78)',
  hairline: 'color-mix(in srgb, var(--enx-primary, #4651DE) 14%, transparent)',
  ink: '#121833',
  muted: '#5B6383',
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  spring: 'cubic-bezier(0.22, 1.18, 0.36, 1)',
};

/** Keyframes shared by the workspace (MUI sx accepts them at any level). */
export const keyframes = {
  '@keyframes nxFadeUp': { from: { opacity: 0, transform: 'translateY(10px) scale(0.99)' }, to: { opacity: 1, transform: 'none' } },
  '@keyframes nxFadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
  '@keyframes nxShimmer': { '0%': { backgroundPosition: '-160% 0' }, '100%': { backgroundPosition: '160% 0' } },
  '@keyframes nxDot': { '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: 0.35 }, '40%': { transform: 'scale(1)', opacity: 1 } },
  '@keyframes nxSpin': { to: { transform: 'rotate(360deg)' } },
  '@keyframes nxPulse': { '0%, 100%': { opacity: 0.55, transform: 'scale(0.96)' }, '50%': { opacity: 1, transform: 'scale(1.04)' } },
  '@keyframes nxDrift': { '0%, 100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(0,-10px,0)' } },
  '@keyframes nxWorkspaceIn': { from: { opacity: 0, transform: 'translateY(8px) scale(0.995)', filter: 'blur(2px)' }, to: { opacity: 1, transform: 'none', filter: 'none' } },
  '@keyframes nxCaret': { '0%, 100%': { opacity: 0 }, '50%': { opacity: 1 } },
};

/** Turns animations and transitions off for people who ask their system for reduced motion. */
export const reducedMotion = {
  '@media (prefers-reduced-motion: reduce)': {
    '&, & *': { animation: 'none !important', transition: 'none !important', scrollBehavior: 'auto !important' },
  },
};

export const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
