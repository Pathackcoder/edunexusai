import React from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Consistent page heading: optional eyebrow, title (Rubik), supporting description
 * (DM Sans) and an actions slot that wraps under the title on narrow screens.
 */
export const PageHeader = ({ title, description, eyebrow, actions, icon, children, sx }) => (
  <Stack
    direction={{ xs: 'column', md: 'row' }}
    alignItems={{ xs: 'flex-start', md: 'flex-end' }}
    justifyContent="space-between"
    spacing={{ xs: 2, md: 3 }}
    sx={{ mb: { xs: 2.25, md: 2.75 }, ...sx }}
  >
    <Box sx={{ minWidth: 0, flex: 1 }}>
      {eyebrow && (
        <Typography variant="overline" color="primary.main" component="div" sx={{ mb: 0.5 }}>
          {eyebrow}
        </Typography>
      )}
      <Stack direction="row" alignItems="center" spacing={1.25}>
        {icon}
        <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '1.3125rem', md: '1.5rem' } }}>
          {title}
        </Typography>
      </Stack>
      {description && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
          {description}
        </Typography>
      )}
      {children}
    </Box>
    {actions && (
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
        {actions}
      </Stack>
    )}
  </Stack>
);

export default PageHeader;
