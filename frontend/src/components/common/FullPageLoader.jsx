import React from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

/** Shown while the session is being restored on a page load. */
export const FullPageLoader = ({ label = 'Loading…' }) => (
  <Stack
    role="status"
    aria-live="polite"
    alignItems="center"
    justifyContent="center"
    spacing={2.5}
    sx={{ minHeight: '100vh', bgcolor: 'background.default', px: 2 }}
  >
    <Box component="img" src="/logo.png" alt="EdunexusAI" sx={{ height: 36, width: 'auto' }} />
    <LinearProgress sx={{ width: 160, height: 4 }} />
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  </Stack>
);

export default FullPageLoader;
