import React, { useEffect } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { InstitutionLogo } from '../../components/brand/Brand';
import { viewAsStore } from '../../services/api';
import { ENDED_REASONS, viewAsTone } from '../../viewAs/viewAsStyle';

/**
 * Where a View-As tab lands when its session ends (End Impersonation, time limit, inactivity, access withdrawn).
 * The tab no longer holds the session secret, so anything opened from here is the administrator's own portal.
 */
export const ViewAsEndedPage = () => {
  const [params] = useSearchParams();
  const reason = ENDED_REASONS[params.get('reason')] ?? 'This View-As session has ended.';
  useEffect(() => viewAsStore.clear(), []);

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '100vh', px: 2, bgcolor: viewAsTone.surface }}>
      <Box sx={{ width: '100%', maxWidth: 460, bgcolor: 'background.paper', borderRadius: 4, boxShadow: '0 24px 60px -30px rgba(31, 19, 0, 0.45)', borderTop: `4px solid ${viewAsTone.edge}`, p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
        <InstitutionLogo height={40} />
        <TaskAltRoundedIcon sx={{ fontSize: 44, color: 'success.main', mt: 2.5 }} aria-hidden="true" />
        <Typography variant="h5" component="h1" sx={{ mt: 1 }}>View-As session ended</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{reason}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Nothing was changed in the person&apos;s account. Your administrator tab was not affected.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="center" sx={{ mt: 3 }}>
          <Button component={RouterLink} to="/admin/users" variant="contained">Back to Users &amp; Roles</Button>
          <Button variant="outlined" color="inherit" onClick={() => window.close()}>Close this tab</Button>
        </Stack>
      </Box>
    </Stack>
  );
};

export default ViewAsEndedPage;
