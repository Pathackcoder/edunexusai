import React from 'react';
import Box from '@mui/material/Box';
import { ThemeProvider } from '@mui/material/styles';
import { brand, darkSurfaceTheme } from '../../theme/theme';

/**
 * The EdunexusAI dark surface — the navy/indigo atmosphere of the login page — as a
 * reusable container. Children render inside the dark-surface theme, so shared
 * components (Badge, Typography with text.secondary, LinearProgress, IconButton…)
 * automatically switch to light-on-dark colours.
 *
 * glow: where the coloured light sits ('tr' | 'bl' | 'both' | 'none').
 */
export const DarkSurface = ({ children, glow = 'both', grid = true, sx, component, className, ...rest }) => (
  <ThemeProvider theme={darkSurfaceTheme}>
    <Box
      component={component}
      className={className}
      sx={{
        position: 'relative',
        isolation: 'isolate',
        overflow: 'hidden',
        color: 'text.primary',
        background: brand.navy,
        '& > .dark-surface-decor': { position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' },
        ...sx,
      }}
      {...rest}
    >
      <Box aria-hidden className="dark-surface-decor">
        {(glow === 'tr' || glow === 'both') && (
          <Box sx={{ position: 'absolute', top: '-40%', right: '-15%', width: '70%', aspectRatio: '1', borderRadius: '50%', background: `radial-gradient(circle, ${brand.glowCyan} 0%, transparent 65%)` }} />
        )}
        {(glow === 'bl' || glow === 'both') && (
          <Box sx={{ position: 'absolute', bottom: '-50%', left: '-20%', width: '75%', aspectRatio: '1', borderRadius: '50%', background: `radial-gradient(circle, ${brand.glowViolet} 0%, transparent 65%)` }} />
        )}
        {grid && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundImage: brand.grid,
              backgroundSize: '36px 36px',
              maskImage: 'radial-gradient(ellipse 80% 80% at 70% 20%, #000 10%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 70% 20%, #000 10%, transparent 75%)',
            }}
          />
        )}
      </Box>
      {children}
    </Box>
  </ThemeProvider>
);

/** Use the dark-surface theme for children without drawing a surface (e.g. on a gradient you already own). */
export const OnDark = ({ children }) => <ThemeProvider theme={darkSurfaceTheme}>{children}</ThemeProvider>;

export default DarkSurface;
