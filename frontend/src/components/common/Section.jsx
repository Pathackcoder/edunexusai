import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Unboxed content section: a heading row with an optional action, then content. Use it
 * when a group of cards needs a label but not another card around it.
 */
export const Section = ({ title, description, action, icon, children, sx, component = 'section' }) => (
  <Box component={component} sx={{ minWidth: 0, ...sx }}>
    {(title || action) && (
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 1.75 }}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
          {icon}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" component="h2">
              {title}
            </Typography>
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {description}
              </Typography>
            )}
          </Box>
        </Stack>
        {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
      </Stack>
    )}
    {children}
  </Box>
);

/** Small uppercase label above a value, e.g. "Cumulative GPA". */
export const MetricLabel = ({ children, sx }) => (
  <Typography variant="overline" component="span" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5, ...sx }}>
    {children}
  </Typography>
);

/** Thin separator line with supporting text at the bottom of a card. */
export const CardFootnote = ({ children, icon: Icon, sx }) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={0.75}
    sx={{
      mt: 'auto',
      pt: 1.5,
      borderTop: 1,
      borderColor: 'divider',
      color: 'text.secondary',
      typography: 'caption',
      '& strong': { color: 'text.primary', fontWeight: 600 },
      '& svg': { fontSize: 15 },
      ...sx,
    }}
  >
    {Icon && <Icon />}
    <Box component="span" sx={{ minWidth: 0 }}>
      {children}
    </Box>
  </Stack>
);

export default Section;

/** Read-only label / value pair used on record and profile screens. */
export const InfoField = ({ label, children, hint, valueSx }) => (
  <Box sx={{ minWidth: 0 }}>
    <MetricLabel sx={{ fontSize: '0.625rem' }}>{label}</MetricLabel>
    <Typography variant="body1" component="div" sx={{ fontWeight: 600, mt: 0.25, wordBreak: 'break-word', ...valueSx }}>
      {children}
    </Typography>
    {hint && (
      <Typography variant="caption" component="div" sx={{ mt: 0.25 }}>
        {hint}
      </Typography>
    )}
  </Box>
);
