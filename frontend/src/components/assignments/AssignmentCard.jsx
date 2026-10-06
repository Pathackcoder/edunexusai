import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export const AssignmentCard = ({
  assignment,
  onSubmitClick,
  onToggleComplete
}) => {
  const isDueSoon = assignment.urgency === 'due-soon' || assignment.status === 'Due Soon';
  const isCompleted = assignment.status === 'Completed';

  const getUrgencyBadge = () => {
    if (isCompleted) {
      return <Badge variant="success" dot>Completed</Badge>;
    }
    if (isDueSoon) {
      return <Badge variant="danger" dot>Due Soon</Badge>;
    }
    if (assignment.status === 'In Progress') {
      return <Badge variant="warning" dot>In Progress</Badge>;
    }
    return <Badge variant="neutral">Upcoming</Badge>;
  };

  const accent = isCompleted ? 'success.main' : isDueSoon ? 'error.main' : assignment.status === 'In Progress' ? 'warning.main' : 'grey.300';

  return (
    <Card
      sx={{
        position: 'relative',
        overflow: 'hidden',
        p: 2,
        pl: 2.5,
        boxShadow: 'none',
        '&:hover': { borderColor: 'grey.300', boxShadow: 2 },
        '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: accent },
      }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', flexShrink: 0 }}>
              {assignment.courseCode}
            </Typography>
            <Typography variant="caption">•</Typography>
            <Typography variant="caption" noWrap>
              {assignment.courseName}
            </Typography>
          </Stack>
          <Typography
            variant="subtitle1"
            component="h4"
            sx={{
              mt: 0.25,
              lineHeight: 1.35,
              color: isCompleted ? 'text.secondary' : 'text.primary',
              textDecoration: isCompleted ? 'line-through' : 'none',
            }}
          >
            {assignment.title}
          </Typography>
        </Box>
        <Box sx={{ flexShrink: 0 }}>{getUrgencyBadge()}</Box>
      </Stack>

      <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between" spacing={1.25} sx={{ mt: 1.5 }}>
        <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" spacing={2} sx={{ color: 'text.secondary' }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <CalendarTodayOutlinedIcon sx={{ fontSize: 15, color: 'grey.400' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{assignment.formattedDueDate}</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <ScheduleRoundedIcon sx={{ fontSize: 15, color: isDueSoon ? 'error.main' : 'grey.400' }} />
            <Typography variant="caption" sx={{ fontWeight: isDueSoon ? 600 : 400, color: isDueSoon ? 'error.main' : 'text.secondary' }}>
              {assignment.dueTime}
            </Typography>
          </Stack>
          {assignment.points && (
            <Typography variant="caption">
              {assignment.score ? `Score: ${assignment.score}/${assignment.points} pts` : `${assignment.points} pts`}
            </Typography>
          )}
        </Stack>

        <Box>
          {isCompleted ? (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'success.main' }}>
              <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main' }}>Submitted</Typography>
            </Stack>
          ) : (
            <Button
              size="sm"
              variant={isDueSoon ? 'primary' : 'secondary'}
              icon={FileUploadOutlinedIcon}
              onClick={() => onSubmitClick && onSubmitClick(assignment)}
            >
              Submit
            </Button>
          )}
        </Box>
      </Stack>
    </Card>
  );
};
