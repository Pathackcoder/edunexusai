import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { institution, platform } from '../../branding';
import { useAppearance } from '../../context/AppearanceContext';

/** The institution's uploaded logo ({ url, width, height }), or null while the bundled logo is used. */
export const useInstitutionLogo = () => useAppearance()?.logo ?? null;

/** Plate around an uploaded logo on dark surfaces: padding and corner radius for a given height. */
export const logoPlate = (height) => ({ pad: Math.max(2, Math.round(height * 0.12)), radius: Math.max(4, Math.round(height * 0.2)) });

/**
 * Feddrick University logo. `variant`: 'lockup' (crest + wordmark) or 'mark' (crest only);
 * `inverse` uses the light wordmark for dark surfaces. Width is reserved from the height,
 * so the logo never shifts layout while it loads.
 *
 * When an administrator has uploaded the institution's logo (Portal Appearance), that one logo is
 * shown everywhere instead: contained in the same height (never stretched or cropped), and, on dark
 * surfaces (`inverse` and the crest spots, which sit on the navy sidebar and dark prompts), on a light
 * plate so a dark-coloured logo stays legible. If it cannot be loaded, the bundled logo is shown.
 */
export function InstitutionLogo({ height = 36, variant = 'lockup', inverse = false, sx, alt = institution.name, ...rest }) {
  const isMark = variant === 'mark';
  const uploaded = useInstitutionLogo();
  const [failed, setFailed] = useState(null);
  const custom = uploaded && failed !== uploaded.url ? uploaded : null;

  if (!custom) {
    const src = isMark ? institution.mark : inverse ? institution.logoInverse : institution.logo;
    const width = Math.round(height * (isMark ? institution.markAspect : institution.logoAspect));
    return <Box component="img" src={src} alt={alt} width={width} height={height} sx={{ display: 'block', width, height, flexShrink: 0, ...sx }} {...rest} />;
  }

  const onDark = inverse || isMark;
  const { pad, radius } = onDark ? logoPlate(height) : { pad: 0, radius: 0 };
  const inner = height - pad * 2;
  const imgWidth = isMark ? inner : Math.round(inner * (custom.width / custom.height));
  const imgSx = { display: 'block', width: imgWidth, height: inner, maxWidth: '100%', objectFit: 'contain', objectPosition: isMark ? 'center' : 'left center', flexShrink: 0 };
  const image = (extraSx, extra) => <Box component="img" src={custom.url} alt={alt} width={imgWidth} height={inner} onError={() => setFailed(custom.url)} sx={{ ...imgSx, ...extraSx }} {...extra} />;
  if (!onDark) return image(sx, rest);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', height, width: imgWidth + pad * 2, maxWidth: '100%', p: `${pad}px`, borderRadius: `${radius}px`, bgcolor: '#FFFFFF', flexShrink: 0, ...sx }} {...rest}>
      {image()}
    </Box>
  );
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
