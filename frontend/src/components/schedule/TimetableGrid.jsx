import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ViewDayOutlinedIcon from '@mui/icons-material/ViewDayOutlined';
import CalendarViewWeekOutlinedIcon from '@mui/icons-material/CalendarViewWeekOutlined';
import { Badge } from '../common/Badge';

const Meta = ({ icon: Icon, children, color }) => (
  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
    <Icon sx={{ fontSize: 15, color: color ?? 'grey.400', flexShrink: 0 }} />
    <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
      {children}
    </Typography>
  </Stack>
);

export const TimetableGrid = ({ courses }) => {
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [viewMode, setViewMode] = useState('day'); // default to 'day' for immediate usability, with 'week' available

  const daysOfWeek = [
    { name: 'Monday', short: 'Mon' },
    { name: 'Tuesday', short: 'Tue' },
    { name: 'Wednesday', short: 'Wed' },
    { name: 'Thursday', short: 'Thu' },
    { name: 'Friday', short: 'Fri' }
  ];

  const getCoursesForDay = (dayName) => {
    return courses.filter(c => c.days.includes(dayName));
  };

  const selectedDayCourses = getCoursesForDay(selectedDay);

  return (
    <Stack spacing={2} sx={{ width: '100%' }}>
      {/* Day selector + view switcher */}
      <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between" spacing={1.5}>
        <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', maxWidth: '100%', pb: 0.25 }}>
          {daysOfWeek.map(day => {
            const count = getCoursesForDay(day.name).length;
            const isSelected = selectedDay === day.name;
            const isToday = day.name === 'Monday'; // Fall 2026 simulation today

            return (
              <ButtonBase
                key={day.name}
                onClick={() => {
                  setSelectedDay(day.name);
                  setViewMode('day');
                }}
                aria-pressed={isSelected}
                sx={(theme) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  height: 34,
                  borderRadius: 2.5,
                  typography: 'body2',
                  fontWeight: isSelected ? 600 : 500,
                  whiteSpace: 'nowrap',
                  border: 1,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected ? 'primary.main' : 'background.paper',
                  color: isSelected ? 'primary.contrastText' : 'text.secondary',
                  transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
                  '&:hover': { borderColor: isSelected ? 'primary.main' : 'grey.300', color: isSelected ? '#fff' : 'text.primary' },
                })}
              >
                {day.short}
                <Box
                  component="span"
                  sx={(theme) => ({
                    minWidth: 20,
                    height: 18,
                    px: 0.5,
                    borderRadius: 9,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: isSelected ? alpha('#fff', 0.22) : theme.palette.grey[100],
                    color: isSelected ? '#fff' : 'text.secondary',
                  })}
                >
                  {count}
                </Box>
                {isToday && (
                  <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: isSelected ? '#fff' : 'primary.main' }} />
                )}
              </ButtonBase>
            );
          })}
        </Stack>

        {/* Desktop View Switcher: Day vs Full Week */}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={viewMode}
          onChange={(_, value) => value && setViewMode(value)}
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        >
          <ToggleButton value="day">
            <ViewDayOutlinedIcon sx={{ fontSize: 17, mr: 0.75 }} /> Day View
          </ToggleButton>
          <ToggleButton value="week">
            <CalendarViewWeekOutlinedIcon sx={{ fontSize: 17, mr: 0.75 }} /> Week Grid
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* VIEW MODE 1: DAY SCHEDULE */}
      {viewMode === 'day' && (
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2">
              Schedule for {selectedDay} {selectedDay === 'Monday' && '• Today'}
            </Typography>
            <Typography variant="caption">
              {selectedDayCourses.length} {selectedDayCourses.length === 1 ? 'class' : 'classes'}
            </Typography>
          </Stack>

          {selectedDayCourses.length === 0 ? (
            <Stack alignItems="center" spacing={1} sx={{ py: 4, px: 2, textAlign: 'center', bgcolor: 'background.subtle', borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'grey.300' }}>
              <EventAvailableOutlinedIcon sx={{ fontSize: 32, color: 'grey.400' }} />
              <Typography variant="subtitle2">No Lectures Scheduled for {selectedDay}</Typography>
              <Typography variant="caption">Open study day. Use this time for lab work or coursework review.</Typography>
            </Stack>
          ) : (
            <Stack spacing={1.25}>
              {selectedDayCourses.map((course) => (
                <Box
                  key={course.id}
                  sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 3,
                    p: 2,
                    pl: 2.5,
                    transition: 'border-color 160ms ease, box-shadow 160ms ease',
                    '&:hover': { borderColor: 'grey.300', boxShadow: 2 },
                    '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: course.color || 'primary.main' },
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'flex-start' }} justifyContent="space-between" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: course.color }}>{course.code}</Typography>
                        <Typography variant="caption">•</Typography>
                        <Typography variant="caption">{course.credits} Credits</Typography>
                      </Stack>
                      <Typography variant="subtitle1" component="h4" sx={{ lineHeight: 1.35 }}>{course.name}</Typography>
                    </Box>
                    <Chip
                      icon={<ScheduleRoundedIcon />}
                      label={course.time}
                      sx={{ bgcolor: 'primary.lighter', color: 'primary.dark', alignSelf: { xs: 'flex-start', sm: 'auto' }, '& .MuiChip-icon': { color: 'primary.main' } }}
                    />
                  </Stack>

                  <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2} sx={{ mt: 1.25 }}>
                    <Meta icon={PlaceOutlinedIcon}>{course.room}</Meta>
                    <Meta icon={PersonOutlineRoundedIcon}>{course.instructor}</Meta>
                  </Stack>

                  <Typography variant="caption" component="p" sx={{ mt: 1 }}>
                    {course.description}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      )}

      {/* VIEW MODE 2: 5-COLUMN WEEKLY GRID (hidden on phones) */}
      {viewMode === 'week' && (
        <Box sx={{ display: { xs: 'none', sm: 'block' }, width: '100%', overflowX: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 1.5, width: '100%' }}>
            {daysOfWeek.map(day => {
              const dayCourses = getCoursesForDay(day.name);
              const isToday = day.name === 'Monday';

              return (
                <Box
                  key={day.name}
                  sx={(theme) => ({
                    border: 1,
                    borderColor: isToday ? alpha(theme.palette.primary.main, 0.35) : 'divider',
                    borderRadius: 3,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: 'background.paper',
                  })}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={(theme) => ({
                      px: 1.5,
                      py: 1.25,
                      bgcolor: isToday ? alpha(theme.palette.primary.main, 0.06) : 'background.subtle',
                      borderBottom: 1,
                      borderColor: 'divider',
                    })}
                  >
                    <Typography variant="subtitle2" sx={{ color: isToday ? 'primary.main' : 'text.primary' }}>
                      {day.name}
                    </Typography>
                    {isToday && <Badge variant="primary">Today</Badge>}
                  </Stack>

                  <Stack spacing={1} sx={{ p: 1.25, minHeight: 150, flex: 1 }}>
                    {dayCourses.length === 0 ? (
                      <Typography variant="caption" sx={{ color: 'grey.400', textAlign: 'center', m: 'auto' }}>
                        No classes
                      </Typography>
                    ) : (
                      dayCourses.map(course => (
                        <Box
                          key={course.id}
                          sx={{
                            p: 1.25,
                            bgcolor: course.bgColor || 'background.subtle',
                            border: 1,
                            borderColor: course.borderColor || 'divider',
                            borderRadius: 2.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.5,
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: course.color }}>{course.code}</Typography>
                            <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>{course.credits} cr</Typography>
                          </Stack>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.3 }}>
                            {course.name}
                          </Typography>
                          <Meta icon={ScheduleRoundedIcon} color="primary.main">{course.time}</Meta>
                          <Meta icon={PlaceOutlinedIcon}>{course.room}</Meta>
                        </Box>
                      ))
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Stack>
  );
};
