import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export const AnnouncementModal = ({ isOpen, onClose, announcement, onMarkRead }) => {
  if (!announcement) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={announcement.title}
      subtitle={`${announcement.courseCode} — ${announcement.courseName}`}
      footer={
        <Stack direction="row" justifyContent="space-between" sx={{ width: '100%' }}>
          <Box>
            {!announcement.isRead && (
              <Button
                variant="outline"
                size="sm"
                icon={DoneAllRoundedIcon}
                onClick={() => {
                  if (onMarkRead) onMarkRead(announcement.id);
                  onClose();
                }}
              >
                Mark as Read
              </Button>
            )}
          </Box>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2.5}>
        <Stack
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={2.5}
          sx={{ px: 2, py: 1.5, bgcolor: 'background.subtle', borderRadius: 3, border: 1, borderColor: 'divider' }}
        >
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <PersonOutlineRoundedIcon sx={{ fontSize: 17, color: 'grey.500' }} />
            <Typography variant="body2" color="text.secondary">
              Instructor: <Box component="strong" sx={{ color: 'text.primary' }}>{announcement.author}</Box>
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <CalendarTodayOutlinedIcon sx={{ fontSize: 15, color: 'grey.500' }} />
            <Typography variant="body2" color="text.secondary">Posted: {announcement.postedAt}</Typography>
          </Stack>
        </Stack>

        <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
          {announcement.content}
        </Typography>

        {announcement.tags && announcement.tags.length > 0 && (
          <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={0.75}>
            <LocalOfferOutlinedIcon sx={{ fontSize: 16, color: 'grey.400' }} />
            {announcement.tags.map(tag => (
              <Badge key={tag} variant="neutral">{tag}</Badge>
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
};
