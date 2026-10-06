import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Popover from '@mui/material/Popover';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useNotifications } from '../../context/NotificationContext';
import { NotificationItem } from './NotificationItem';
import { EmptyState } from '../common/EmptyState';

/**
 * Header notification panel. Shows the four most recent notifications with the same
 * mark-read / mark-all-read actions. MUI Popover replaces the hand-written
 * click-outside handling; Escape and outside clicks still call onClose.
 */
export const NotificationDropdown = ({ isOpen = true, onClose, anchorEl }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const recentNotifications = notifications.slice(0, 4);

  return (
    <Popover
      open={Boolean(isOpen && anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { mt: 1, width: 400, maxWidth: 'calc(100vw - 24px)', overflow: 'hidden' } } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" component="h4">
            Notifications
          </Typography>
          {unreadCount > 0 && <Chip label={unreadCount} color="primary" sx={{ height: 22, fontWeight: 700 }} />}
        </Stack>

        {unreadCount > 0 && (
          <Button size="small" onClick={markAllAsRead} startIcon={<DoneAllRoundedIcon />} sx={{ color: 'primary.main' }}>
            Mark all read
          </Button>
        )}
      </Stack>

      <Box sx={{ maxHeight: 400, overflowY: 'auto', p: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {recentNotifications.length === 0 ? (
          <EmptyState compact title="No notifications available." description="New alerts from your courses and campus will appear here." />
        ) : (
          recentNotifications.map((item) => (
            <NotificationItem key={item.id} notification={item} onMarkRead={markAsRead} compact />
          ))
        )}
      </Box>

      <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.subtle', p: 1 }}>
        <Button
          component={RouterLink}
          to="/notifications"
          onClick={onClose}
          fullWidth
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ color: 'primary.main' }}
        >
          View all notifications
        </Button>
      </Box>
    </Popover>
  );
};

export default NotificationDropdown;
