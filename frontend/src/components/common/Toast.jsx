import React, { createContext, useContext, useState, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Grow from '@mui/material/Grow';
import Box from '@mui/material/Box';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

const ToastContext = createContext(null);

const TYPE_STYLE = {
  success: { Icon: CheckCircleRoundedIcon, color: '#4CD69B' },
  error: { Icon: ErrorRoundedIcon, color: '#FF8A8A' },
  info: { Icon: InfoRoundedIcon, color: '#7DB8FF' },
};

/**
 * Toast stack. `showToast(message, type = 'success', duration = 4000)` is unchanged;
 * only the presentation moved to MUI.
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Stack
        aria-live="polite"
        spacing={1}
        sx={{
          position: 'fixed',
          bottom: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          left: { xs: 16, sm: 'auto' },
          zIndex: (theme) => theme.zIndex.snackbar,
          maxWidth: { sm: 420 },
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => {
          const { Icon, color } = TYPE_STYLE[toast.type] ?? TYPE_STYLE.info;
          return (
            <Grow in key={toast.id} style={{ transformOrigin: 'bottom right' }}>
              <Paper
                role="status"
                sx={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  py: 1.25,
                  pl: 1.75,
                  pr: 0.75,
                  bgcolor: 'grey.900',
                  color: '#fff',
                  borderRadius: 3,
                  boxShadow: 5,
                }}
              >
                <Box sx={{ display: 'flex', color }}>
                  <Icon fontSize="small" />
                </Box>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, color: 'inherit' }}>
                  {toast.message}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Dismiss toast"
                  sx={{ color: 'grey.400', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Paper>
            </Grow>
          );
        })}
      </Stack>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
