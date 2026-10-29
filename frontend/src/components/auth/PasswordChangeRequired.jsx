import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import { useAuth } from '../../context/AuthContext';
import { ChangePasswordForm } from './ChangePasswordForm';

/**
 * Shown instead of the portal while the account still has the temporary password an
 * administrator issued. The API refuses every other request until it is replaced.
 */
export function PasswordChangeRequired() {
  const { user, refreshUser, logout } = useAuth();
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ p: { xs: 2.5, sm: 4 }, width: '100%', maxWidth: 440 }}>
        <Typography variant="h5" component="h1">Choose your own password</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>
          {user?.email} was given a temporary password. Choose a new one to continue. This is your EduNexusAI password; Moodle has its own sign-in.
        </Typography>
        <ChangePasswordForm onDone={refreshUser} submitLabel="Save and continue" />
        <MuiButton size="small" sx={{ mt: 1.5 }} onClick={logout}>Sign out</MuiButton>
      </Card>
    </Box>
  );
}
