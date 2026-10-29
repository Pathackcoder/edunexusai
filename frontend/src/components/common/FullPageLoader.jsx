import React from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { InstitutionLogo, PoweredBy } from '../brand/Brand';

/** Shown while the session is being restored on a page load. */
export const FullPageLoader = ({ label = 'Loading…' }) => (
  <Stack
    role="status"
    aria-live="polite"
    alignItems="center"
    justifyContent="center"
    spacing={2.5}
    sx={{ minHeight: '100vh', bgcolor: 'background.default', px: 2, position: 'relative' }}
  >
    <InstitutionLogo height={56} />
    <LinearProgress sx={{ width: 160, height: 4 }} />
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Box sx={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <PoweredBy />
    </Box>
  </Stack>
);

export default FullPageLoader;
