import React from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { DarkSurface } from './DarkSurface';

/**
 * Right-hand detail drawer in the EdunexusAI language: a navy identity header, a
 * scrollable body and an optional pinned footer. Full-width on phones. MUI handles
 * focus trapping, Escape and backdrop close.
 */
export function DetailDrawer({ open, onClose, labelId, header, children, footer, width = 480 }) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        role: 'dialog',
        'aria-labelledby': labelId,
        sx: {
          width: { xs: '100%', sm: width },
          maxWidth: '100vw',
          border: 0,
          bgcolor: 'background.default',
          boxShadow: '-24px 0 60px -30px rgba(20, 24, 80, 0.45)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      transitionDuration={{ enter: 340, exit: 240 }}
    >
      <DarkSurface glow="tr" sx={{ flexShrink: 0, px: { xs: 2.5, sm: 3 }, pt: 2.5, pb: 2.75 }}>
        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1 }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
        {header}
      </DarkSurface>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2.5, sm: 3 }, py: 2.5 }}>
        <Stack spacing={2.5}>{children}</Stack>
      </Box>
      {footer && (
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexShrink: 0, px: { xs: 2.5, sm: 3 }, py: 1.75, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          {footer}
        </Stack>
      )}
    </Drawer>
  );
}

/** Titled group inside a DetailDrawer body. */
export const DrawerSection = ({ title, action, children }) => (
  <Box component="section">
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
      <Typography variant="overline" component="h3" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
        {title}
      </Typography>
      {action}
    </Stack>
    {children}
  </Box>
);

/** Bordered list of label/value rows. */
export const DetailList = ({ children }) => (
  <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: '14px', overflow: 'hidden', '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
    {children}
  </Box>
);

export const DetailRow = ({ icon: Icon, label, children }) => (
  <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ px: 1.75, py: 1.25 }}>
    {Icon && <Icon sx={{ fontSize: 18, color: 'primary.main', mt: 0.25, flexShrink: 0 }} />}
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography variant="caption" component="div" sx={{ lineHeight: 1.4 }}>{label}</Typography>
      <Box sx={{ typography: 'body2', fontWeight: 600, color: 'text.primary', overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  </Stack>
);

export default DetailDrawer;
