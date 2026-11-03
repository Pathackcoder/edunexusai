import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

const STATE = {
  GRADED: ['success', 'Graded'],
  GRADED_NOT_RELEASED: ['neutral', 'Graded · not released yet'],
  SUBMITTED: ['success', 'Submitted'],
  DRAFT: ['warning', 'Draft in Moodle'],
  NOT_SUBMITTED: ['neutral', 'Not submitted'],
  NO_ONLINE_SUBMISSION: ['neutral', 'No online submission'],
  UNKNOWN: ['neutral', 'Status not available'],
};
const TYPE = { ONLINE_TEXT: 'Online text', FILE: 'File upload' };

const formatDue = (iso) =>
  iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No due date';

/**
 * One Moodle assignment, in the same card style as the rest of the portal. Everything
 * shown comes from Moodle; submitting happens in Moodle (opened in a new tab).
 */
export const MoodleAssignmentCard = ({ assignment }) => {
  const [variant, label] = assignment.overdue ? ['danger', 'Overdue'] : STATE[assignment.state] ?? ['neutral', assignment.state];
  const accent = assignment.state === 'GRADED' || assignment.state === 'SUBMITTED' ? 'success.main' : assignment.overdue ? 'error.main' : 'grey.300';
  const canSubmit = ['NOT_SUBMITTED', 'DRAFT'].includes(assignment.state) && assignment.submissionTypes.length > 0;
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
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', flexShrink: 0 }}>{assignment.course?.shortName}</Typography>
            <Typography variant="caption">•</Typography>
            <Typography variant="caption" noWrap>{assignment.course?.fullName}</Typography>
          </Stack>
          <Typography variant="subtitle1" component="h4" sx={{ mt: 0.25, lineHeight: 1.35 }}>{assignment.name}</Typography>
          {assignment.instructions && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {assignment.instructions}
            </Typography>
          )}
        </Box>
        <Box sx={{ flexShrink: 0 }}>
          <Badge variant={variant} dot>{label}</Badge>
        </Box>
      </Stack>

      <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between" spacing={1.25} sx={{ mt: 1.5 }}>
        <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" spacing={1.5} sx={{ color: 'text.secondary' }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <CalendarTodayOutlinedIcon sx={{ fontSize: 15, color: assignment.overdue ? 'error.main' : 'grey.400' }} />
            <Typography variant="caption" sx={{ color: assignment.overdue ? 'error.main' : 'text.secondary', fontWeight: assignment.overdue ? 600 : 400 }}>
              {formatDue(assignment.dueDate)}
            </Typography>
          </Stack>
          {assignment.submissionTypes.map((t) => <Chip key={t} size="small" variant="outlined" label={TYPE[t] ?? t} />)}
          {assignment.grade ? (
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main' }}>
              Grade {assignment.grade}{assignment.maxGrade ? ` / ${assignment.maxGrade}` : ''}
            </Typography>
          ) : assignment.maxGrade ? (
            <Typography variant="caption">out of {assignment.maxGrade}</Typography>
          ) : null}
        </Stack>
        <Button size="sm" variant={canSubmit ? 'primary' : 'secondary'} icon={OpenInNewRoundedIcon} component="a" href={assignment.url} target="_blank" rel="noopener noreferrer">
          {canSubmit ? 'Submit in Moodle' : 'Open in Moodle'}
        </Button>
      </Stack>

      {assignment.feedback && (
        <Box sx={{ mt: 1.25, p: 1.25, borderRadius: 2, bgcolor: 'success.lighter' }}>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>Feedback</Typography>
          <Typography variant="body2">{assignment.feedback}</Typography>
        </Box>
      )}
    </Card>
  );
};

export default MoodleAssignmentCard;
