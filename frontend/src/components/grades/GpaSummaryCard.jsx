import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { Badge } from '../common/Badge';
import { MetricLabel } from '../common/Section';

export const GpaSummaryCard = ({ gradesData }) => {
  const { cumulativeGpa, majorGpa, creditsCompleted, creditsRequired, honors } = gradesData;
  const progressPercent = Math.round((creditsCompleted / creditsRequired) * 100);

  return (
    <Card sx={{ p: { xs: 2.5, sm: 3 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'auto 1fr' }, gap: { xs: 2.5, md: 5 }, alignItems: 'center' }}>
        {/* GPA ring */}
        <Stack direction="row" alignItems="center" spacing={2.5}>
          <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <CircularProgress variant="determinate" value={100} size={112} thickness={4} sx={{ color: 'grey.100', position: 'absolute' }} />
            <CircularProgress
              variant="determinate"
              value={Math.min(100, (cumulativeGpa / 4) * 100)}
              size={112}
              thickness={4}
              color="secondary"
              sx={{ '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
            />
            <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0 }}>
              <Typography variant="metric" component="span" sx={{ fontSize: '1.75rem' }}>
                {cumulativeGpa.toFixed(2)}
              </Typography>
              <Typography variant="caption" sx={{ lineHeight: 1 }}>/ 4.00</Typography>
            </Stack>
          </Box>
          <Box>
            <MetricLabel>Academic Standing</MetricLabel>
            <Typography variant="h5" component="p" sx={{ mt: 0.5 }}>Cumulative GPA</Typography>
            <Badge variant="success" dot sx={{ mt: 1 }}>Good Standing</Badge>
          </Box>
        </Stack>

        <Stack spacing={2}>
          {honors && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={(theme) => ({
              px: 1.75,
              py: 1.25,
              borderRadius: 2.5,
              bgcolor: alpha(theme.palette.secondary.main, 0.07),
              border: `1px solid ${alpha(theme.palette.secondary.main, 0.18)}`,
            })}
          >
            <EmojiEventsOutlinedIcon sx={{ fontSize: 19, color: 'secondary.main', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ color: 'secondary.dark', fontWeight: 600 }}>
              {honors}
            </Typography>
          </Stack>
          )}

          <Box>
            <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Degree Credit Progress</Typography>
              <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {creditsCompleted} / {creditsRequired} Credits ({progressPercent}%)
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, progressPercent)}
              color="secondary"
              sx={(theme) => ({ height: 10, bgcolor: alpha(theme.palette.secondary.main, 0.12) })}
            />
          </Box>
        </Stack>
      </Box>
    </Card>
  );
};
