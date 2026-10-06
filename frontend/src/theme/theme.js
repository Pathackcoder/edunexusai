import { alpha, createTheme } from '@mui/material/styles';

/**
 * EdunexusAI design system.
 *
 * One theme for every persona. Colours are drawn from the logo (navy wordmark, blue →
 * violet mark) and kept deliberately restrained: one primary, one secondary, and the
 * semantic set. Pages read values from here through `sx` and `theme.palette` rather than
 * defining their own.
 */

const HEADING_FONT = '"Rubik", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const BODY_FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const ink = {
  900: '#121833',
  800: '#1F2747',
  700: '#343D5E',
  600: '#4D5675',
  500: '#6B7391',
  400: '#9097AE',
  300: '#BEC3D3',
  200: '#DDE0EA',
  100: '#ECEEF4',
  50: '#F5F6FA',
};

const palette = {
  mode: 'light',
  primary: { main: '#4651DE', dark: '#343EBF', light: '#7079EA', lighter: '#EEF0FD', contrastText: '#FFFFFF' },
  secondary: { main: '#7A4FD8', dark: '#6139BA', light: '#A283E8', lighter: '#F3EEFC', contrastText: '#FFFFFF' },
  success: { main: '#13845A', dark: '#0C6644', light: '#4CB389', lighter: '#E8F6EF', contrastText: '#FFFFFF' },
  warning: { main: '#B26A00', dark: '#8A5200', light: '#E09B33', lighter: '#FDF4E5', contrastText: '#FFFFFF' },
  error: { main: '#D03A3A', dark: '#A82A2A', light: '#E57373', lighter: '#FCEDED', contrastText: '#FFFFFF' },
  info: { main: '#1C7ED6', dark: '#1663AB', light: '#5AA6EA', lighter: '#E8F3FC', contrastText: '#FFFFFF' },
  grey: ink,
  text: { primary: ink[900], secondary: ink[600], disabled: ink[400] },
  divider: '#E5E7EF',
  background: { default: '#F6F7FB', paper: '#FFFFFF', subtle: '#F9FAFC' },
  action: {
    hover: alpha(ink[900], 0.04),
    selected: alpha('#4651DE', 0.08),
    focus: alpha('#4651DE', 0.12),
  },
};

/** Sidebar geometry and motion. Exported so the shell and header agree on them. */
export const layout = {
  sidebarWidth: 244,
  sidebarCollapsedWidth: 72,
  headerHeight: 58,
  contentMaxWidth: 1360,
};

/**
 * Spring-like easing for the sidebar. Opening overshoots by ~6px at 62% of the
 * duration and settles; closing first pushes ~6px outward, then collapses. Both values
 * were tuned numerically against the 196px width delta.
 */
export const motion = {
  sidebarOpen: { duration: 460, easing: 'cubic-bezier(0.3, 1.15, 0.35, 1.06)' },
  sidebarClose: { duration: 420, easing: 'cubic-bezier(0.65, -0.24, 0.35, 0.9)' },
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  cardHover: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
};

const shadows = [
  'none',
  '0 1px 2px rgba(18, 24, 51, 0.05)',
  '0 1px 3px rgba(18, 24, 51, 0.06), 0 1px 2px rgba(18, 24, 51, 0.04)',
  '0 4px 12px -2px rgba(18, 24, 51, 0.08), 0 2px 4px -2px rgba(18, 24, 51, 0.04)',
  '0 8px 20px -4px rgba(18, 24, 51, 0.10), 0 3px 6px -3px rgba(18, 24, 51, 0.05)',
  '0 12px 28px -6px rgba(18, 24, 51, 0.12), 0 4px 8px -4px rgba(18, 24, 51, 0.05)',
  '0 20px 40px -12px rgba(18, 24, 51, 0.18)',
  ...Array(18).fill('0 24px 48px -12px rgba(18, 24, 51, 0.22)'),
];

let theme = createTheme({
  palette,
  shadows,
  // Base unit for `sx` radii (borderRadius: 3 → 12px). Component radii are set in px below.
  shape: { borderRadius: 4 },
  spacing: 8,
  breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
  typography: {
    fontFamily: BODY_FONT,
    htmlFontSize: 16,
    fontSize: 14,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontFamily: HEADING_FONT, fontWeight: 600, fontSize: '2rem', lineHeight: 1.15, letterSpacing: '-0.02em' },
    h2: { fontFamily: HEADING_FONT, fontWeight: 600, fontSize: '1.625rem', lineHeight: 1.2, letterSpacing: '-0.015em' },
    h3: { fontFamily: HEADING_FONT, fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.25, letterSpacing: '-0.015em' },
    h4: { fontFamily: HEADING_FONT, fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.3, letterSpacing: '-0.01em' },
    h5: { fontFamily: HEADING_FONT, fontWeight: 500, fontSize: '1.0625rem', lineHeight: 1.35, letterSpacing: '-0.005em' },
    h6: { fontFamily: HEADING_FONT, fontWeight: 500, fontSize: '0.9375rem', lineHeight: 1.4 },
    subtitle1: { fontFamily: HEADING_FONT, fontWeight: 500, fontSize: '0.90625rem', lineHeight: 1.45 },
    subtitle2: { fontFamily: BODY_FONT, fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.45 },
    body1: { fontSize: '0.875rem', lineHeight: 1.6 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.55 },
    caption: { fontSize: '0.75rem', lineHeight: 1.5, color: ink[500] },
    overline: {
      fontFamily: HEADING_FONT,
      fontWeight: 500,
      fontSize: '0.6875rem',
      lineHeight: 1.6,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
    },
    button: { fontFamily: BODY_FONT, fontWeight: 600, fontSize: '0.875rem', textTransform: 'none', letterSpacing: 0 },
  },
});

/** Display numerals (GPA, balances, counts) use Rubik with tabular figures. */
theme.typography.metric = {
  fontFamily: HEADING_FONT,
  fontWeight: 600,
  fontSize: '1.75rem',
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

theme = createTheme(theme, {
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { WebkitTextSizeAdjust: '100%' },
        body: {
          backgroundColor: palette.background.default,
          overflowX: 'hidden',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '#root': { minHeight: '100vh' },
        'a': { color: 'inherit', textDecoration: 'none' },
        'img, svg': { maxWidth: '100%' },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: alpha(ink[900], 0.14),
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': { backgroundColor: alpha(ink[900], 0.26) },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },

    MuiButtonBase: { defaultProps: { disableRipple: false } },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingInline: 16,
          minHeight: 36,
          whiteSpace: 'nowrap',
          transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
        },
        sizeSmall: { minHeight: 30, paddingInline: 11, fontSize: '0.8125rem', borderRadius: 9 },
        sizeLarge: { minHeight: 42, paddingInline: 22, fontSize: '0.9375rem', borderRadius: 11 },
        containedPrimary: {
          boxShadow: `0 1px 2px ${alpha(palette.primary.main, 0.3)}, inset 0 1px 0 ${alpha('#fff', 0.12)}`,
          '&:hover': { backgroundColor: palette.primary.dark, boxShadow: `0 4px 12px -2px ${alpha(palette.primary.main, 0.4)}` },
        },
        outlined: { borderColor: palette.divider, backgroundColor: palette.background.paper },
        outlinedPrimary: {
          borderColor: alpha(palette.primary.main, 0.35),
          '&:hover': { borderColor: palette.primary.main, backgroundColor: palette.primary.lighter },
        },
        outlinedInherit: {
          borderColor: palette.divider,
          color: ink[800],
          '&:hover': { borderColor: ink[300], backgroundColor: ink[50] },
        },
        text: { paddingInline: 10 },
        startIcon: { marginRight: 6, '& > *:nth-of-type(1)': { fontSize: 18 } },
        endIcon: { marginLeft: 6, '& > *:nth-of-type(1)': { fontSize: 18 } },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 10, color: ink[600], '&:hover': { backgroundColor: alpha(ink[900], 0.05), color: ink[900] } },
        sizeSmall: { padding: 6 },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: 14 },
        outlined: { borderColor: palette.divider },
      },
    },

    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          borderRadius: 14,
          borderColor: palette.divider,
          boxShadow: shadows[1],
          transition: 'box-shadow 280ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 280ms ease, transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: '16px 16px 0' },
        title: { fontFamily: HEADING_FONT, fontWeight: 500, fontSize: '1rem' },
        subheader: { fontSize: '0.8125rem', color: ink[500] },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: 16, '&:last-child': { paddingBottom: 16 } } },
    },

    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { borderRadius: 7, fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.005em' },
        sizeSmall: { height: 24 },
        labelSmall: { paddingInline: 8 },
        iconSmall: { fontSize: 14, marginLeft: 6 },
      },
    },

    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiInputLabel: {
      styleOverrides: { root: { fontSize: '0.875rem', color: ink[600] } },
    },
    MuiFormLabel: {
      styleOverrides: { root: { fontSize: '0.8125rem', fontWeight: 600, color: ink[800], '&.Mui-focused': { color: ink[900] } } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: palette.background.paper,
          fontSize: '0.875rem',
          transition: 'box-shadow 160ms ease',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: ink[200] },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: ink[300] },
          '&.Mui-focused': { boxShadow: `0 0 0 4px ${alpha(palette.primary.main, 0.12)}` },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: palette.primary.main, borderWidth: 1 },
          '&.Mui-error.Mui-focused': { boxShadow: `0 0 0 4px ${alpha(palette.error.main, 0.12)}` },
          '&.Mui-disabled': { backgroundColor: ink[50] },
        },
        input: { '&::placeholder': { color: ink[400], opacity: 1 } },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2, fontSize: '0.75rem' } } },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiCheckbox: { defaultProps: { size: 'small' } },
    MuiRadio: { defaultProps: { size: 'small' } },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: 11, backgroundColor: ink[300], opacity: 1 },
        thumb: { boxShadow: 'none' },
        switchBase: {
          '&.Mui-checked + .MuiSwitch-track': { opacity: 1 },
        },
      },
    },

    MuiTableContainer: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: palette.divider, fontSize: '0.8125rem', padding: '10px 14px' },
        head: {
          fontFamily: BODY_FONT,
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: ink[500],
          backgroundColor: palette.background.subtle,
          whiteSpace: 'nowrap',
        },
        sizeSmall: { padding: '8px 12px' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': { backgroundColor: alpha(palette.primary.main, 0.03) },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: { root: { borderTop: `1px solid ${palette.divider}` }, toolbar: { minHeight: 52 } },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16, boxShadow: shadows[6] },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontFamily: HEADING_FONT, fontWeight: 500, fontSize: '1.125rem', padding: '20px 24px 4px' } },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: '16px 24px' } } },
    MuiDialogActions: {
      styleOverrides: { root: { padding: '14px 24px 18px', gap: 8, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } },
    },
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: alpha(ink[900], 0.42), backdropFilter: 'blur(3px)' } } },
    },

    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: 12, border: `1px solid ${palette.divider}`, boxShadow: shadows[4], marginTop: 6 },
        list: { padding: 6 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { borderRadius: 8, fontSize: '0.875rem', minHeight: 36, gap: 10, '& .MuiListItemIcon-root': { minWidth: 0 } },
      },
    },
    MuiPopover: { styleOverrides: { paper: { borderRadius: 14, border: `1px solid ${palette.divider}`, boxShadow: shadows[5] } } },

    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: { backgroundColor: ink[900], fontSize: '0.75rem', fontWeight: 500, borderRadius: 7, padding: '6px 10px' },
        arrow: { color: ink[900] },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
        indicator: { height: 2.5, borderRadius: 2 },
        flexContainer: { gap: 4 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 40,
          paddingInline: 12,
          fontWeight: 600,
          fontSize: '0.875rem',
          color: ink[500],
          '&.Mui-selected': { color: ink[900] },
        },
      },
    },

    MuiToggleButtonGroup: {
      styleOverrides: { root: { backgroundColor: ink[50], borderRadius: 10, padding: 3, gap: 2 }, grouped: { border: 0, borderRadius: '8px !important' } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.8125rem',
          paddingBlock: 5,
          paddingInline: 12,
          color: ink[600],
          '&.Mui-selected': { backgroundColor: palette.background.paper, color: ink[900], boxShadow: shadows[2] },
          '&.Mui-selected:hover': { backgroundColor: palette.background.paper },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12, fontSize: '0.875rem', alignItems: 'flex-start' },
        standardInfo: { backgroundColor: palette.info.lighter },
        standardSuccess: { backgroundColor: palette.success.lighter },
        standardWarning: { backgroundColor: palette.warning.lighter },
        standardError: { backgroundColor: palette.error.lighter },
        icon: { paddingTop: 9 },
        message: { paddingTop: 8 },
      },
    },
    MuiAlertTitle: { styleOverrides: { root: { fontFamily: HEADING_FONT, fontWeight: 500, fontSize: '0.9375rem', marginBottom: 2 } } },

    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 8, borderRadius: 8, backgroundColor: alpha(palette.primary.main, 0.12) },
        bar: { borderRadius: 8 },
      },
    },

    MuiAvatar: { styleOverrides: { root: { fontFamily: HEADING_FONT, fontWeight: 500 } } },

    MuiBadge: { styleOverrides: { badge: { fontWeight: 700, fontSize: '0.6875rem' } } },

    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 36, color: 'inherit' } } },
    MuiListSubheader: {
      styleOverrides: {
        root: {
          fontFamily: HEADING_FONT,
          fontWeight: 500,
          fontSize: '0.6875rem',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          lineHeight: '32px',
          color: ink[400],
          backgroundColor: 'transparent',
        },
      },
    },

    MuiDivider: { styleOverrides: { root: { borderColor: palette.divider } } },

    MuiBreadcrumbs: {
      styleOverrides: { root: { fontSize: '0.8125rem' }, separator: { marginInline: 6, color: ink[300] } },
    },

    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${palette.divider}`,
          borderRadius: '12px !important',
          '&:before': { display: 'none' },
          '& + &': { marginTop: 8 },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: { root: { minHeight: 52, paddingInline: 18 }, content: { marginBlock: 12 } },
    },
    MuiAccordionDetails: { styleOverrides: { root: { padding: '0 18px 18px' } } },

    MuiSnackbar: { defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'right' } } },

    MuiSkeleton: { defaultProps: { animation: 'wave' } },
  },
});

export default theme;
