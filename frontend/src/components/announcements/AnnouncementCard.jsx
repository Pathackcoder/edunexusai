import React from 'react';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Badge } from '../common/Badge';

export const AnnouncementCard = ({ announcement, onClick, onToggleRead }) => {
  const unread = !announcement.isRead;

  return (
    <Card
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'none',
        borderColor: unread ? alpha(theme.palette.primary.main, 0.22) : 'divider',
        bgcolor: unread ? alpha(theme.palette.primary.main, 0.03) : 'background.paper',
        '&:hover': { boxShadow: 2, borderColor: unread ? alpha(theme.palette.primary.main, 0.35) : 'grey.300' },
        '&::before': unread ? { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: 'primary.main', zIndex: 1 } : undefined,
      })}
    >
      <CardActionArea onClick={() => onClick && onClick(announcement)} sx={{ p: 2, pl: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
              {announcement.courseCode}
            </Typography>
            <Typography variant="caption">•</Typography>
            <Typography variant="caption">{announcement.postedAt}</Typography>
          </Stack>
          {unread && <Badge variant="primary" dot>New</Badge>}
        </Stack>

        <Typography variant="subtitle1" component="h4" sx={{ mt: 0.75, lineHeight: 1.35, fontWeight: unread ? 600 : 500 }}>
          {announcement.title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {announcement.content}
        </Typography>

        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5 }}>
          <Typography variant="caption">By {announcement.author}</Typography>
          <Stack direction="row" alignItems="center" sx={{ color: 'primary.main' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>Read details</Typography>
            <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
};
