import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/common/Toast';
import { ChangePasswordForm } from '../../components/auth/ChangePasswordForm';

/** The signed-in user's EduNexusAI password. Other sessions are signed out after a change. */
export const ChangePasswordPage = () => {
  const { showToast } = useToast();
  return (
    <Box>
      <PageHeader eyebrow="Profile" title="Change password" description="Your EduNexusAI password. Moodle has its own password, changed in Moodle; other sessions of this account are signed out." />
      <Card sx={{ p: 3, maxWidth: 480 }}>
        <ChangePasswordForm onDone={() => showToast('Password changed.')} />
      </Card>
    </Box>
  );
};

export default ChangePasswordPage;
