import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { alpha } from '@mui/material/styles';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { usePWA } from '../../context/PWAContext';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

const FEATURES = [
  { title: '1-Tap Home Screen & Dock Access', text: 'Launch your courses, schedule, and grade report directly without typing URLs.', color: 'primary' },
  { title: 'Full-Screen Native University Experience', text: 'Immersive interface with zero browser address bar clutter.', color: 'secondary' },
  { title: 'Reliable Offline Cache', text: 'Review saved syllabi, weekly schedules, and contact info even without active Wi-Fi.', color: 'success' },
];

export const PWAInstallModal = () => {
  const {
    isModalOpen,
    closeInstallModal,
    isInstalled,
    canNativeInstall,
    promptInstall,
    platform
  } = usePWA();

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={closeInstallModal}
      title="Install EdunexusAI Portal"
      maxWidth="480px"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={closeInstallModal}>
            Close
          </Button>
          {!isInstalled && canNativeInstall && (
            <Button variant="primary" size="sm" icon={FileDownloadOutlinedIcon} onClick={promptInstall}>
              Install App
            </Button>
          )}
        </>
      }
    >
      <Stack spacing={2.5}>
        {/* App preview */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.75}
          sx={(theme) => ({ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.04), border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}` })}
        >
          <Box
            component="img"
            src="/icons/icon-192x192.png"
            alt="EdunexusAI App Icon"
            sx={{ width: 56, height: 56, borderRadius: 3.5, boxShadow: 3, flexShrink: 0 }}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>EdunexusAI Student Portal</Typography>
            <Typography variant="caption">Official University Student Application (PWA)</Typography>
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mt: 0.75 }}>
              <Badge variant="success">Fast & Offline Ready</Badge>
              <Badge variant="purple">Zero Storage Overhead</Badge>
            </Stack>
          </Box>
        </Stack>

        {isInstalled ? (
          <Alert severity="success" icon={<CheckCircleRoundedIcon fontSize="inherit" />}>
            <AlertTitle>Already Installed!</AlertTitle>
            EdunexusAI is installed and running on your system. You can launch it directly from your home screen or applications menu.
          </Alert>
        ) : (
          <>
            {/* Feature highlights */}
            <Stack spacing={1.5}>
              {FEATURES.map((feature) => (
                <Stack key={feature.title} direction="row" spacing={1.25} alignItems="flex-start">
                  <Box
                    sx={(theme) => ({
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      bgcolor: alpha(theme.palette[feature.color].main, 0.1),
                      color: `${feature.color}.main`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      mt: 0.125,
                    })}
                  >
                    <CheckRoundedIcon sx={{ fontSize: 14 }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{feature.title}</Typography>
                    <Typography variant="caption">{feature.text}</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>

            {/* Platform guidance */}
            {platform === 'ios' ? (
              <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>How to install on iOS / iPadOS Safari:</Typography>
                <Stack component="ol" spacing={0.75} sx={{ m: 0, pl: 2.25, typography: 'caption', color: 'text.secondary' }}>
                  <li>
                    Tap the <strong>Share</strong> button <IosShareRoundedIcon sx={{ fontSize: 14, verticalAlign: 'middle', color: 'primary.main' }} /> in the Safari toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong> <AddBoxOutlinedIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />.
                  </li>
                  <li>
                    Tap <strong>Add</strong> in the top-right corner to finish.
                  </li>
                </Stack>
              </Box>
            ) : canNativeInstall ? (
              <Stack spacing={1}>
                <Button variant="primary" size="lg" icon={FileDownloadOutlinedIcon} onClick={promptInstall} fullWidth>
                  Install EdunexusAI Now
                </Button>
                <Typography variant="caption" sx={{ textAlign: 'center', fontSize: '0.6875rem' }}>
                  Standard browser PWA installation • Verified secure
                </Typography>
              </Stack>
            ) : (
              <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>To install from your browser:</Typography>
                <Typography variant="caption" component="p" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                  Look for the <strong>Install</strong> icon (⊕ or 📥) in your browser address bar, or click your browser's menu (⋮) and select <strong>"Install EdunexusAI"</strong> or <strong>"Add to Home screen"</strong>.
                </Typography>
              </Box>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
};
