import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { Badge } from '../common/Badge';
import { MetricLabel } from '../common/Section';

export const DisbursementTimeline = ({ disbursements, requirements }) => {
  return (
    <Stack spacing={3}>
      {/* Requirements Verification Checklist */}
      <Box>
        <MetricLabel sx={{ mb: 1.25 }}>Aid Requirements & Action Items</MetricLabel>
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          {requirements.map((req, i) => (
            <Stack
              key={i}
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              justifyContent="space-between"
              spacing={1}
              sx={{ px: 2, py: 1.5, '& + &': { borderTop: 1, borderColor: 'divider' } }}
            >
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <CheckCircleRoundedIcon sx={{ fontSize: 19, color: 'success.main', flexShrink: 0 }} />
                <Typography variant="body2" fontWeight={600}>{req.title}</Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1.25} sx={{ pl: { xs: 3.75, sm: 0 } }}>
                <Typography variant="caption">{req.date}</Typography>
                <Badge variant="success">{req.status}</Badge>
              </Stack>
            </Stack>
          ))}
        </Box>
      </Box>

      {/* Disbursement Schedule */}
      <Box>
        <MetricLabel sx={{ mb: 1.25 }}>Disbursement Schedule</MetricLabel>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1.5 }}>
          {disbursements.map((d, i) => (
            <Box
              key={i}
              sx={{
                p: 2,
                borderRadius: 3,
                border: 1,
                borderColor: 'divider',
                bgcolor: d.status === 'Processed' ? 'background.subtle' : 'background.paper',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
                  <CalendarTodayOutlinedIcon sx={{ fontSize: 15 }} />
                  <Typography variant="body2" color="text.secondary">{d.date}</Typography>
                </Stack>
                <Badge variant={d.status === 'Processed' ? 'success' : 'neutral'} dot>
                  {d.status}
                </Badge>
              </Stack>
              <Typography variant="metric" component="div" sx={{ fontSize: '1.375rem' }}>
                {d.amount}
              </Typography>
              <Typography variant="caption">Applied to: {d.appliedTo}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Stack>
  );
};
