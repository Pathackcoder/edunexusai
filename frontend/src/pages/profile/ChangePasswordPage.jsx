import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/common/Toast';
import { ChangePasswordForm } from '../../components/auth/ChangePasswordForm';

/** The signed-in user's EduNexusAI password. Other sessions are signed out after a change. */
export const ChangePasswordPage = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  return (
    <Box>
      <PageHeader eyebrow="Profile" title="Change password" description="Your EduNexusAI password. Moodle has its own password, changed in Moodle; other sessions of this account are signed out." />
      {user?.hasPassword === false ? (
        <Alert severity="info" sx={{ maxWidth: 560 }}>
          You sign in with your institution's sign-in, so this account has no EduNexusAI password. Your password is managed by your university.
        </Alert>
      ) : (
        <Card sx={{ p: 3, maxWidth: 480 }}>
          <ChangePasswordForm onDone={() => showToast('Password changed.')} />
        </Card>
      )}
    </Box>
  );
};

export default ChangePasswordPage;
