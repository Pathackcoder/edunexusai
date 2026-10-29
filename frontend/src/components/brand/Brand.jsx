import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { institution, platform } from '../../branding';

/**
 * Feddrick University logo. `variant`: 'lockup' (crest + wordmark) or 'mark' (crest only);
 * `inverse` uses the light wordmark for dark surfaces. Width is reserved from the height,
 * so the logo never shifts layout while it loads.
 */
export function InstitutionLogo({ height = 36, variant = 'lockup', inverse = false, sx, alt = institution.name, ...rest }) {
  const isMark = variant === 'mark';
  const src = isMark ? institution.mark : inverse ? institution.logoInverse : institution.logo;
  const width = Math.round(height * (isMark ? institution.markAspect : institution.logoAspect));
  return <Box component="img" src={src} alt={alt} width={width} height={height} sx={{ display: 'block', width, height, flexShrink: 0, ...sx }} {...rest} />;
}

/**
 * Subtle platform attribution: "Powered by EduNexusAI". `tone` 'dark' for navy surfaces.
 * With `showLogo` it carries the small EduNexusAI wordmark instead of plain text.
 */
export function PoweredBy({ tone = 'light', showLogo = false, sx }) {
  const muted = tone === 'dark' ? 'rgba(226, 232, 255, 0.55)' : 'text.disabled';
  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0, ...sx }}>
      <Typography component="span" sx={{ fontSize: '0.6875rem', fontWeight: 500, color: muted, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
        Powered by{showLogo ? '' : ` ${platform.name}`}
      </Typography>
      {showLogo && (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            px: 0.625,
            py: 0.25,
            borderRadius: '6px',
            bgcolor: '#FFFFFF',
            boxShadow: tone === 'dark' ? 'none' : 'inset 0 0 0 1px rgba(70, 81, 222, 0.12)',
          }}
        >
          <Box component="img" src={platform.logo} alt={platform.name} sx={{ height: 14, width: 'auto', display: 'block' }} />
        </Box>
      )}
    </Stack>
  );
}
