import React, { useId, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

/**
 * Dialog wrapper with the original Modal API (isOpen, onClose, title, subtitle, footer,
 * maxWidth). Escape and backdrop click both call onClose, exactly as before; MUI also
 * handles focus trapping and scroll locking.
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = '560px',
}) => {
  const titleId = useId();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // While the dialog fades out, keep showing what it showed when it was open, so state
  // that a parent resets in onClose does not flash a different view mid-transition.
  const snapshot = useRef({ title, subtitle, children, footer });
  if (isOpen) snapshot.current = { title, subtitle, children, footer };
  const view = isOpen ? { title, subtitle, children, footer } : snapshot.current;

  return (
    <Dialog
      open={Boolean(isOpen)}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth={false}
      aria-labelledby={titleId}
      PaperProps={{ sx: { maxWidth: fullScreen ? '100%' : maxWidth, width: '100%' } }}
    >
      <DialogTitle
        id={titleId}
        component="div"
        sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, pr: 2, pb: view.subtitle ? 1 : 1.5 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="h2">
            {view.title}
          </Typography>
          {view.subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {view.subtitle}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close dialog" size="small" sx={{ mt: -0.25 }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: '12px !important' }}>{view.children}</DialogContent>

      {view.footer && (
        <DialogActions sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.subtle', pt: 1.75 }}>
          {view.footer}
        </DialogActions>
      )}
    </Dialog>
  );
};

export default Modal;
