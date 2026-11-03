import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha, useTheme } from '@mui/material/styles';

export const GradeCard = ({ course }) => {
  const theme = useTheme();
  const letter = String(course?.letterGrade || course?.currentGrade || course?.grade || 'A');
  const courseCode = course?.courseCode || course?.code || 'CS';
  const courseName = course?.courseName || course?.name || 'Course';
  const instructor = course?.instructor || 'Faculty Instructor';
  const credits = course?.credits || 4;
  const percentage = course?.percentage ?? 92;

  const getGradeColor = (gradeStr) => {
    if (!gradeStr || typeof gradeStr !== 'string') return theme.palette.grey[500];
    if (gradeStr.startsWith('A')) return theme.palette.success.main;
    if (gradeStr.startsWith('B')) return theme.palette.primary.main;
    if (gradeStr.startsWith('C')) return theme.palette.warning.main;
    return theme.palette.grey[500];
  };

  const gradeColor = getGradeColor(letter);

  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: 'primary.main', lineHeight: 1.5 }}>{courseCode}</Typography>
          <Typography variant="subtitle1" component="h4" sx={{ lineHeight: 1.35 }}>{courseName}</Typography>
          <Typography variant="caption">{instructor} • {credits} Credits</Typography>
        </Box>

        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{ width: 56, height: 56, borderRadius: 3, flexShrink: 0, bgcolor: alpha(gradeColor, 0.1) }}
        >
          <Typography variant="metric" component="span" sx={{ fontSize: '1.375rem', color: gradeColor, lineHeight: 1 }}>
            {letter}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', lineHeight: 1.4 }}>
            {percentage}%
          </Typography>
        </Stack>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={Math.min(100, Number(percentage) || 0)}
        sx={{ height: 6, bgcolor: 'grey.100', '& .MuiLinearProgress-bar': { bgcolor: gradeColor } }}
      />

      {/* Published gradebook totals from the instructor (drafts are never shown). */}
      {course?.coursework && (
        <Typography variant="caption" component="p" sx={{ pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
          {course.coursework.graded > 0 ? (
            <>
              Published coursework:{' '}
              <Box component="strong" sx={{ color: 'text.primary' }}>
                {course.coursework.percentage}%{course.coursework.letter ? ` (${course.coursework.letter})` : ''}
              </Box>{' '}
              · {course.coursework.graded} of {course.coursework.total} graded · {course.coursework.method === 'WEIGHTED' ? 'weighted' : 'points'}
            </>
          ) : (
            'No coursework grades have been published yet.'
          )}
        </Typography>
      )}
    </Card>
  );
};
