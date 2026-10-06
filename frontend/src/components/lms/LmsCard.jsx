import React, { useState } from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import NorthEastRoundedIcon from '@mui/icons-material/NorthEastRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { useAuth } from '../../context/AuthContext';

export const LmsCard = ({ isCompact = false }) => {
  const { user } = useAuth();
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const handleLaunchCanvas = () => {
    setIsLaunchModalOpen(true);
    setIsLaunching(true);
    setTimeout(() => {
      setIsLaunching(false);
    }, 700);
  };

  return (
    <>
      <Card sx={{ p: isCompact ? 2 : { xs: 2.5, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2.5,
                bgcolor: 'error.lighter',
                color: 'error.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Rubik, sans-serif',
                fontWeight: 700,
                fontSize: '1.125rem',
              }}
            >
              C
            </Box>
            <Box>
              <Typography variant="h6" component="h3">Canvas LMS</Typography>
              <Typography variant="caption">Single Sign-On Connected</Typography>
            </Box>
          </Stack>
          <Badge variant="success" dot>Active SSO</Badge>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Access lecture modules, discussion threads, quizzes, and digital assignment dropboxes for your 4 registered Fall 2026 courses.
        </Typography>

        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pt: 1.75, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption">4 courses synced</Typography>
          <Button size="sm" variant="primary" icon={NorthEastRoundedIcon} onClick={handleLaunchCanvas}>
            Open Canvas
          </Button>
        </Stack>
      </Card>

      {/* Simulated Canvas Launch Modal */}
      <Modal
        isOpen={isLaunchModalOpen}
        onClose={() => setIsLaunchModalOpen(false)}
        title="Canvas LMS Single Sign-On"
        subtitle="Simulated External Education Link"
        maxWidth="480px"
      >
        <Stack spacing={2} sx={{ textAlign: 'center', py: 1.5 }}>
          {isLaunching ? (
            <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
              <CircularProgress size={48} thickness={3.5} sx={{ mb: 1 }} />
              <Typography variant="h6" component="h4">Establishing Canvas SSO Session...</Typography>
              <Typography variant="caption">
                Verifying university SAML authentication for {user?.fullName} ({user?.studentNumber})...
              </Typography>
            </Stack>
          ) : (
            <>
              <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'success.lighter', color: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto' }}>
                <CheckCircleRoundedIcon sx={{ fontSize: 32 }} />
              </Box>

              <Box>
                <Typography variant="h5" component="h4">Canvas Session Verified</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  In a production campus deployment, this opens your institution's authenticated Canvas LMS portal (<code>canvas.edunexus.ai</code>) in a secure new browser tab.
                </Typography>
              </Box>

              <Stack spacing={0.5} sx={{ bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 1.75, textAlign: 'left' }}>
                <Typography variant="caption">Target Endpoint:</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem', wordBreak: 'break-all' }}>
                  https://canvas.edunexus.ai/courses/fall2026
                </Typography>
                <Typography variant="caption" sx={{ mt: 0.75 }}>Authenticated Student:</Typography>
                <Typography variant="body2" fontWeight={600}>{user?.fullName} ({user?.email})</Typography>
              </Stack>

              <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ pt: 0.5 }}>
                <Button variant="secondary" size="sm" onClick={() => setIsLaunchModalOpen(false)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={OpenInNewRoundedIcon}
                  onClick={() => {
                    setIsLaunchModalOpen(false);
                    window.open('https://canvas.instructure.com', '_blank', 'noopener,noreferrer');
                  }}
                >
                  Simulate New Tab
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
};
