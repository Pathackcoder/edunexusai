import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { getTone } from '../../theme/tones';
import { statusTone, formatDateTime } from './status';

const ACTION_LABELS = {
  SUBMITTED: 'Submitted',
  MARKED_IN_REVIEW: 'Moved to review',
  IN_REVIEW: 'Moved to review',
  INFO_REQUESTED: 'More information requested',
  NEEDS_INFO: 'More information requested',
  INFO_PROVIDED: 'Information provided',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  WITHDRAWN: 'Withdrawn by requester',
};

/** Shared request history: the requester and the administrator see the same timeline. */
export function RequestTimeline({ history = [] }) {
  const theme = useTheme();
  return (
    <Stack spacing={0}>
      {history.map((event, index) => {
        const tone = getTone(theme, statusTone(event.toStatus ?? 'PENDING'));
        const last = index === history.length - 1;
        return (
          <Stack key={event.id} direction="row" spacing={1.5} sx={{ pb: last ? 0 : 2 }}>
            <Stack alignItems="center" sx={{ pt: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: tone.solid, boxShadow: `0 0 0 3px ${tone.bg}` }} />
              {!last && <Box sx={{ flex: 1, width: 2, bgcolor: 'divider', mt: 0.75 }} />}
            </Stack>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2">{ACTION_LABELS[event.action] ?? event.action}</Typography>
              <Typography variant="caption" color="text.secondary">
                {event.actor} · {formatDateTime(event.at)}
              </Typography>
              {event.note && (
                <Typography variant="body2" sx={{ mt: 0.5, p: 1, borderRadius: 2, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', overflowWrap: 'anywhere' }}>
                  {event.note}
                </Typography>
              )}
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
