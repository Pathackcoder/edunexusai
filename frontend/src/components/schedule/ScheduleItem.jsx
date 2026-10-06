import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { Badge } from '../common/Badge';

export const ScheduleItem = ({ course, isNext = false, onSelect }) => {
  return (
    <Box
      onClick={() => onSelect && onSelect(course)}
      sx={(theme) => ({
        p: 2,
        borderRadius: 3,
        border: 1,
        borderColor: isNext ? alpha(theme.palette.primary.main, 0.3) : 'divider',
        bgcolor: isNext ? alpha(theme.palette.primary.main, 0.05) : 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        cursor: onSelect ? 'pointer' : 'default',
        transition: 'box-shadow 160ms ease',
        '&:hover': onSelect ? { boxShadow: 2 } : undefined,
      })}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600 }}>{course.code}</Typography>
          <Typography variant="body2" color="text.secondary">•</Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={600} noWrap>{course.name}</Typography>
        </Stack>
        {isNext ? <Badge variant="primary" dot>Next Up</Badge> : <Badge variant="neutral">{course.credits} Credits</Badge>}
      </Stack>

      <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" spacing={2}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <ScheduleRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={600}>{course.time}</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <PlaceOutlinedIcon sx={{ fontSize: 16, color: 'grey.500' }} />
          <Typography variant="body2" color="text.secondary">{course.room}</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <PersonOutlineRoundedIcon sx={{ fontSize: 16, color: 'grey.500' }} />
          <Typography variant="body2" color="text.secondary">{course.instructor}</Typography>
        </Stack>
      </Stack>
    </Box>
  );
};
