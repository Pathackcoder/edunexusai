import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { MetricLabel } from '../common/Section';
import { useToast } from '../common/Toast';

const DetailLine = ({ icon: Icon, label, children }) => (
  <Stack direction="row" alignItems="center" spacing={1.25}>
    <Icon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
    <Typography variant="body2" color="text.secondary">
      {label}: <Box component="strong" sx={{ color: 'text.primary' }}>{children}</Box>
    </Typography>
  </Stack>
);

export const CalendarEventModal = ({ event, isOpen, onClose }) => {
  const { showToast } = useToast();

  if (!event) return null;

  const handleAddToCalendar = () => {
    showToast(`"${event.title}" saved to your personal university calendar!`);
    onClose();
  };

  const getCategoryBadgeVariant = (cat) => {
    switch (cat) {
      case 'examination':
        return 'danger';
      case 'registration':
        return 'purple';
      case 'holiday':
        return 'success';
      case 'administrative':
        return 'warning';
      default:
        return 'primary';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Academic Calendar Event"
      subtitle="Demo University Academic Schedule 2026–2027"
      maxWidth="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={EventAvailableOutlinedIcon} onClick={handleAddToCalendar}>
            Add to Calendar
          </Button>
        </>
      }
    >
      <Stack spacing={2.5}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 1.25 }}>
            <Badge variant={getCategoryBadgeVariant(event.category)}>
              {event.category.toUpperCase()}
            </Badge>
            {event.isImportant && <Badge variant="danger" dot>Important Date</Badge>}
          </Stack>
          <Typography variant="h4" component="h3">
            {event.title}
          </Typography>
        </Box>

        {/* Schedule Details Card */}
        <Stack spacing={1.25} sx={{ bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2 }}>
          <DetailLine icon={EventOutlinedIcon} label="Date">
            {new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </DetailLine>
          <DetailLine icon={ScheduleRoundedIcon} label="Time">
            {event.startTime === event.endTime ? event.startTime : `${event.startTime} – ${event.endTime}`}
          </DetailLine>
          <DetailLine icon={PlaceOutlinedIcon} label="Location">
            {event.location}
          </DetailLine>
        </Stack>

        {/* Description */}
        <Box>
          <MetricLabel>Event Details</MetricLabel>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {event.description}
          </Typography>
        </Box>
      </Stack>
    </Modal>
  );
};
