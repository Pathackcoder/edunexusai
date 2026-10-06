import { alpha } from '@mui/material/styles';

/**
 * Soft colour tones used by chips, icon tiles and status markers. Each legacy badge
 * variant name maps to a palette key, so `<Badge variant="purple">` and
 * `<IconTile tone="purple">` stay readable at the call site.
 */
const VARIANT_TO_PALETTE = {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  error: 'error',
  urgent: 'error',
  emergency: 'error',
  purple: 'secondary',
  secondary: 'secondary',
  info: 'info',
  cyan: 'info',
  academic: 'info',
  communication: 'secondary',
  campus: 'teal',
  teal: 'teal',
  analytics: 'indigo',
  indigo: 'indigo',
  neutral: 'grey',
};

const EXTRA_PALETTES = {
  teal: { main: '#0D9488', dark: '#0F766E', light: '#14B8A6', lighter: '#F0FDFA' },
  indigo: { main: '#4F46E5', dark: '#4338CA', light: '#6366F1', lighter: '#EEF2FF' },
};

export const paletteKey = (variant = 'neutral') => VARIANT_TO_PALETTE[variant] ?? 'grey';

/** { fg, bg, border, solid } for a tone name. */
export const getTone = (theme, variant = 'neutral') => {
  const key = paletteKey(variant);
  if (key === 'grey') {
    return {
      fg: theme.palette.grey[700],
      bg: theme.palette.grey[100],
      border: theme.palette.grey[200],
      solid: theme.palette.grey[600],
    };
  }
  if (EXTRA_PALETTES[key]) {
    const color = EXTRA_PALETTES[key];
    return {
      fg: color.dark,
      bg: color.lighter,
      border: alpha(color.main, 0.25),
      solid: color.main,
    };
  }
  const color = theme.palette[key] || theme.palette.primary;
  return {
    fg: color.dark,
    bg: color.lighter ?? alpha(color.main, 0.1),
    border: alpha(color.main, 0.22),
    solid: color.main,
  };
};

/**
 * Two-stop gradient per tone for filled icon tiles and accents. Categories:
 * academics → blue/indigo, finance → amber, communication → violet, campus → teal,
 * success → green, urgent → red.
 */
const TONE_GRADIENTS = {
  primary: ['#4651DE', '#7A4FD8'],
  secondary: ['#7A4FD8', '#C084FC'],
  info: ['#1C7ED6', '#22D3EE'],
  success: ['#13845A', '#2DD4BF'],
  warning: ['#D97706', '#F59E0B'],
  error: ['#DC2626', '#FB7185'],
  teal: ['#0D9488', '#22D3EE'],
  indigo: ['#4F46E5', '#8B5CF6'],
  grey: ['#4D5675', '#8B93AE'],
};
export const toneGradient = (variant = 'primary') => TONE_GRADIENTS[paletteKey(variant)] ?? TONE_GRADIENTS.primary;
