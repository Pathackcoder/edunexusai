// Portal appearance presets, shared by the API (validation) and the UI (rendering).
// Plain data only. Each theme is a complete palette: brand colours, page and surface
// backgrounds, text, borders, and the dark navigation/hero surfaces with their accents.
// White button text on every `primary.main` meets WCAG AA (4.5:1).

export const APPEARANCE_THEMES = [
  {
    key: 'navy-white',
    label: 'Navy & White',
    description: 'Deep navy navigation with indigo accents. The Feddrick default.',
    palette: {
      primary: { main: '#4651DE', dark: '#343EBF', light: '#7079EA', lighter: '#EEF0FD' },
      secondary: { main: '#7A4FD8', dark: '#6139BA', light: '#A283E8', lighter: '#F3EEFC' },
      background: { default: '#F2F3FB', paper: '#FFFFFF', subtle: '#F7F7FD' },
      text: { primary: '#121833', secondary: '#4D5675' },
      divider: '#E3E5F2',
    },
    nav: { from: '#141850', via: '#1E1A5C', to: '#2D2178', deep: '#141850' },
    accent: '#A5F3FC',
    glows: ['rgba(34, 211, 238, 0.30)', 'rgba(168, 85, 247, 0.32)'],
  },
  {
    key: 'black-gold',
    label: 'Black & Gold',
    description: 'Charcoal navigation with burnished gold accents.',
    palette: {
      primary: { main: '#8A6514', dark: '#6E500F', light: '#C9A042', lighter: '#FBF4E2' },
      secondary: { main: '#3F3F46', dark: '#27272A', light: '#71717A', lighter: '#F2F2F3' },
      background: { default: '#F5F4EF', paper: '#FFFFFF', subtle: '#FAF9F5' },
      text: { primary: '#18181B', secondary: '#52525B' },
      divider: '#E6E2D6',
    },
    nav: { from: '#0B0B0D', via: '#151517', to: '#222226', deep: '#0E0E10' },
    accent: '#E9C46A',
    glows: ['rgba(233, 196, 106, 0.26)', 'rgba(255, 255, 255, 0.08)'],
  },
  {
    key: 'teal-white',
    label: 'Teal & White',
    description: 'Calm deep-teal navigation with fresh aqua accents.',
    palette: {
      primary: { main: '#0F766E', dark: '#0B5D57', light: '#3FA39A', lighter: '#E6F4F2' },
      secondary: { main: '#0E7490', dark: '#155E75', light: '#38A3C2', lighter: '#E5F4F8' },
      background: { default: '#F0F6F5', paper: '#FFFFFF', subtle: '#F6FBFA' },
      text: { primary: '#0F2A27', secondary: '#4A625E' },
      divider: '#DAE8E5',
    },
    nav: { from: '#06302E', via: '#0A433F', to: '#0F5550', deep: '#062C2A' },
    accent: '#5EEAD4',
    glows: ['rgba(94, 234, 212, 0.26)', 'rgba(14, 116, 144, 0.34)'],
  },
  {
    key: 'royal-purple',
    label: 'Royal Purple & White',
    description: 'Deep plum navigation with royal purple (#704D93) accents.',
    palette: {
      primary: { main: '#704D93', dark: '#5A3B78', light: '#9575B5', lighter: '#F3EEF8' },
      secondary: { main: '#9C4D86', dark: '#7E3C6C', light: '#BE7DAB', lighter: '#F8EDF5' },
      background: { default: '#F5F2F9', paper: '#FFFFFF', subtle: '#FAF8FC' },
      text: { primary: '#1F1630', secondary: '#584E68' },
      divider: '#E7E1EF',
    },
    nav: { from: '#25153A', via: '#30194B', to: '#3E225F', deep: '#22133A' },
    accent: '#D9C3F2',
    glows: ['rgba(217, 195, 242, 0.28)', 'rgba(156, 77, 134, 0.30)'],
  },
  {
    key: 'forest-cream',
    label: 'Forest Green & Cream',
    description: 'Collegiate forest green on warm cream paper.',
    palette: {
      primary: { main: '#2F6B3C', dark: '#235230', light: '#5A9367', lighter: '#E9F2EA' },
      secondary: { main: '#7A5C25', dark: '#5F481C', light: '#A88A4E', lighter: '#F6F0E2' },
      background: { default: '#F6F2E7', paper: '#FFFDF8', subtle: '#FAF7EE' },
      text: { primary: '#1C2A1F', secondary: '#55604E' },
      divider: '#E6DEC9',
    },
    nav: { from: '#122B19', via: '#183A22', to: '#214B2C', deep: '#102516' },
    accent: '#D9C88E',
    glows: ['rgba(217, 200, 142, 0.24)', 'rgba(90, 147, 103, 0.30)'],
  },
  {
    key: 'burgundy-ivory',
    label: 'Burgundy & Ivory',
    description: 'Traditional burgundy with soft ivory surfaces.',
    palette: {
      primary: { main: '#8B1E3F', dark: '#6E1631', light: '#B4506D', lighter: '#F8E9EE' },
      secondary: { main: '#8A6A2A', dark: '#6C5220', light: '#B39455', lighter: '#F6F0E3' },
      background: { default: '#F7F3EC', paper: '#FFFEFA', subtle: '#FBF8F2' },
      text: { primary: '#24161A', secondary: '#5D4E51' },
      divider: '#E9E1D3',
    },
    nav: { from: '#350B18', via: '#481021', to: '#5C152B', deep: '#300A16' },
    accent: '#F2C4CE',
    glows: ['rgba(242, 196, 206, 0.24)', 'rgba(179, 148, 85, 0.24)'],
  },
];

// Fonts already in the product (Rubik, DM Sans via the existing stylesheet) or
// installed with the operating system (Georgia, the platform UI font): no new downloads.
export const APPEARANCE_FONTS = [
  {
    key: 'modern-campus',
    label: 'Modern Campus',
    description: 'Rubik headings with DM Sans text. The Feddrick default.',
    heading: '"Rubik", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    body: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headingWeight: 600,
  },
  {
    key: 'collegiate-serif',
    label: 'Collegiate Serif',
    description: 'Georgia serif headings for a traditional academic voice, DM Sans text.',
    heading: 'Georgia, "Times New Roman", Times, serif',
    body: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headingWeight: 700,
  },
  {
    key: 'unified-sans',
    label: 'Unified Sans',
    description: 'DM Sans throughout: clean, compact and highly legible.',
    heading: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    body: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headingWeight: 700,
  },
  {
    key: 'system-native',
    label: 'System Native',
    description: 'Each device’s own interface font (San Francisco, Segoe UI, Roboto).',
    heading: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    headingWeight: 650,
  },
];

// Retired themes are no longer offered, but a tenant that saved one keeps rendering with it
// (no stored setting is changed) until an administrator picks a current theme.
export const RETIRED_THEMES = [
  {
    key: 'indigo-gray',
    label: 'Indigo & Light Gray',
    description: 'Classic indigo with neutral, light-gray canvases. Retired: no longer offered.',
    retired: true,
    palette: {
      primary: { main: '#4338CA', dark: '#3730A3', light: '#6D63E0', lighter: '#EEEDFC' },
      secondary: { main: '#475569', dark: '#334155', light: '#7C8BA1', lighter: '#F0F2F5' },
      background: { default: '#F0F1F4', paper: '#FFFFFF', subtle: '#F6F7F9' },
      text: { primary: '#111827', secondary: '#4B5563' },
      divider: '#E1E3E9',
    },
    nav: { from: '#1E1B4B', via: '#26226A', to: '#312E81', deep: '#1E1B4B' },
    accent: '#A5B4FC',
    glows: ['rgba(165, 180, 252, 0.28)', 'rgba(148, 163, 184, 0.22)'],
  },
];

export const DEFAULT_THEME_KEY = 'navy-white';
export const DEFAULT_FONT_KEY = 'modern-campus';
/** Themes an administrator can choose (and the API accepts). */
export const THEME_KEYS = APPEARANCE_THEMES.map((theme) => theme.key);
/** Every theme that can still render: selectable plus retired. */
export const RENDERABLE_THEME_KEYS = [...THEME_KEYS, ...RETIRED_THEMES.map((theme) => theme.key)];
export const FONT_KEYS = APPEARANCE_FONTS.map((font) => font.key);

export const findTheme = (key) => APPEARANCE_THEMES.find((theme) => theme.key === key) ?? RETIRED_THEMES.find((theme) => theme.key === key) ?? APPEARANCE_THEMES[0];
export const findFont = (key) => APPEARANCE_FONTS.find((font) => font.key === key) ?? APPEARANCE_FONTS[0];
