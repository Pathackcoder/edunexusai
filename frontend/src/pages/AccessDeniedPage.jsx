import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useAuth } from '../context/AuthContext';

/**
 * Shown when a signed-in user reaches a route their role does not cover. The backend
 * already refuses the data; this explains it instead of rendering an empty screen.
 */
export const AccessDeniedPage = ({ requiredRoles = [] }) => {
  const { roles, persona } = useAuth();

  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.75} sx={{ textAlign: 'center', py: { xs: 6, md: 9 }, px: 2.5 }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          bgcolor: 'grey.100',
          color: 'text.secondary',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: (theme) => `0 0 0 10px ${theme.palette.grey[50]}`,
          mb: 1,
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: 32 }} aria-hidden="true" />
      </Box>
      <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
        This area is not available to your role
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '52ch' }}>
        {requiredRoles.length > 0
          ? `This section is for ${requiredRoles.join(' and ')} accounts.`
          : 'Your account does not have access to this section.'}{' '}
        You are signed in as <strong>{persona ?? (roles.join(', ') || 'an unknown role')}</strong>.
      </Typography>
      <Button component={RouterLink} to="/dashboard" variant="contained" startIcon={<ArrowBackRoundedIcon />} sx={{ mt: 1 }}>
        Back to dashboard
      </Button>
    </Stack>
  );
};

export default AccessDeniedPage;
