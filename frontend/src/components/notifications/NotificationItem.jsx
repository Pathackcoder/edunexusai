import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import AttachMoneyRoundedIcon from '@mui/icons-material/AttachMoneyRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { IconTile } from '../common/IconTile';

const CATEGORY = {
  finance: { icon: AttachMoneyRoundedIcon, tone: 'success' },
  academic: { icon: MenuBookOutlinedIcon, tone: 'primary' },
  'financial-aid': { icon: SchoolOutlinedIcon, tone: 'purple' },
};

/** One notification row. Unread rows carry a tint, an accent edge and a dot. */
export const NotificationItem = ({ notification, onMarkRead, compact = false }) => {
  const meta = CATEGORY[notification.category] ?? { icon: CampaignOutlinedIcon, tone: 'warning' };
  const unread = !notification.isRead;

  return (
    <Box
      sx={(theme) => ({
        p: compact ? 1.5 : 2,
        borderRadius: 3,
        border: 1,
        borderColor: unread ? alpha(theme.palette.primary.main, 0.2) : 'divider',
        bgcolor: unread ? alpha(theme.palette.primary.main, 0.035) : 'background.paper',
        display: 'flex',
        alignItems: 'flex-start',
        gap: compact ? 1.5 : 2,
        position: 'relative',
        overflow: 'hidden',
        transition: 'background-color 160ms ease, border-color 160ms ease',
        '&::before': unread
          ? { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: 'primary.main' }
          : undefined,
      })}
    >
      <IconTile icon={meta.icon} tone={meta.tone} size={compact ? 34 : 38} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" component="h4" sx={{ fontWeight: unread ? 700 : 600, lineHeight: 1.35 }}>
            {notification.title}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0, pt: 0.125 }}>
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
              {notification.timeAgo}
            </Typography>
            {unread && <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />}
          </Stack>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
          {notification.message}
        </Typography>

        {(notification.link || (unread && onMarkRead)) && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
            <Box>
              {notification.link && (
                <Button
                  component={RouterLink}
                  to={notification.link}
                  size="small"
                  endIcon={<ChevronRightRoundedIcon />}
                  onClick={() => onMarkRead && onMarkRead(notification.id)}
                  sx={{ px: 0.75, ml: -0.75, minHeight: 28, color: 'primary.main', '& .MuiButton-endIcon': { ml: 0.25 } }}
                >
                  View details
                </Button>
              )}
            </Box>
            <Box>
              {unread && onMarkRead && (
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<CheckRoundedIcon />}
                  onClick={() => onMarkRead(notification.id)}
                  sx={{ px: 0.75, minHeight: 28, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                >
                  Mark as read
                </Button>
              )}
            </Box>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default NotificationItem;
