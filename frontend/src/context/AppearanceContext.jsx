import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { appearanceCssVars, createPortalTheme } from '../theme/theme';
import { DEFAULT_FONT_KEY, DEFAULT_THEME_KEY, FONT_KEYS, RENDERABLE_THEME_KEYS } from '../../../shared/appearancePresets.js';
import { appearanceApi } from '../services/api';

/**
 * Institution-wide portal appearance.
 *
 * The saved choice lives in the database per tenant (GET/PUT /appearance) and arrives
 * with the session after sign-in. A local copy only avoids a flash of the default theme
 * on reload; the server value always wins. Applying an appearance rebuilds the MUI theme
 * from the shared presets and writes the CSS variables behind the `brand` tokens.
 */
const CACHE_KEY = 'enx.appearance';

const sanitise = (value) => ({
  themeKey: RENDERABLE_THEME_KEYS.includes(value?.themeKey) ? value.themeKey : DEFAULT_THEME_KEY,
  fontKey: FONT_KEYS.includes(value?.fontKey) ? value.fontKey : DEFAULT_FONT_KEY,
});

const readCache = () => {
  try {
    return sanitise(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'));
  } catch {
    return sanitise(null);
  }
};

const writeCssVars = (themeKey) => {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(appearanceCssVars(themeKey))) root.style.setProperty(name, value);
};

const AppearanceContext = createContext(null);

export function AppearanceProvider({ children }) {
  const [appearance, setAppearanceState] = useState(() => {
    const initial = readCache();
    writeCssVars(initial.themeKey); // before the first paint
    return initial;
  });

  const apply = useCallback((value) => {
    const next = sanitise(value);
    setAppearanceState((current) => (current.themeKey === next.themeKey && current.fontKey === next.fontKey ? current : next));
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
      /* the cache is only a convenience */
    }
  }, []);

  useLayoutEffect(() => writeCssVars(appearance.themeKey), [appearance.themeKey]);

  // The institution's saved appearance (also what the sign-in page shows).
  const refresh = useCallback(async () => {
    try {
      apply(await appearanceApi.get());
    } catch {
      /* keep the cached or default appearance */
    }
  }, [apply]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const built = useMemo(() => createPortalTheme(appearance.themeKey, appearance.fontKey), [appearance.themeKey, appearance.fontKey]);
  const value = useMemo(
    () => ({ ...appearance, apply, refresh, darkSurfaceTheme: built.darkSurfaceTheme, preset: built.preset, font: built.font }),
    [appearance, apply, refresh, built],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <ThemeProvider theme={built.theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppearanceContext.Provider>
  );
}

export const useAppearance = () => useContext(AppearanceContext);

/** Applies the appearance that arrives with the signed-in user's session. */
export function AppearanceSessionSync({ appearance }) {
  const context = useAppearance();
  const themeKey = appearance?.themeKey;
  const fontKey = appearance?.fontKey;
  useEffect(() => {
    if (context && themeKey) context.apply({ themeKey, fontKey });
  }, [themeKey, fontKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
