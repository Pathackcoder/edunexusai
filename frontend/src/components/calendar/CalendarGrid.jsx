import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { calendarCategories, categoryTone } from '../../constants/calendarCategories';
import { getTone } from '../../theme/tones';
import { Button } from '../common/Button';
import { IconTile } from '../common/IconTile';

export const CalendarGrid = ({ events, onSelectEvent }) => {
  const theme = useTheme();
  // Demo starts on October 2026 (Fall 2026 Semester)
  const [currentDate, setCurrentDate] = useState(new Date(2026, 9, 1)); // October 2026
  const [selectedCategory, setSelectedCategory] = useState('all');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleGoToday = () => {
    setCurrentDate(new Date(2026, 9, 1)); // Reset to Fall 2026 October
  };

  // Filter events
  const filteredEvents = events.filter(e => {
    if (selectedCategory !== 'all' && e.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  // Calculate calendar days
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays = [];

  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    calendarDays.push({
      day: daysInPrevMonth - i,
      monthOffset: -1,
      dateString: `${year}-${String(month).padStart(2, '0')}-${String(daysInPrevMonth - i).padStart(2, '0')}`
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    calendarDays.push({
      day: i,
      monthOffset: 0,
      dateString: formattedDate
    });
  }

  // Next month leading days (fill up to 35 or 42 cells)
  const totalCells = calendarDays.length > 35 ? 42 : 35;
  const remainingCells = totalCells - calendarDays.length;
  for (let i = 1; i <= remainingCells; i++) {
    calendarDays.push({
      day: i,
      monthOffset: 1,
      dateString: `${year}-${String(month + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    });
  }

  const getEventsForDate = (dateString) => {
    return filteredEvents.filter(e => e.date === dateString);
  };

  const getCategoryColor = (cat) => {
    const tone = getTone(theme, categoryTone(cat));
    return { text: tone.fg, bg: tone.bg, border: tone.border, solid: tone.solid };
  };

  // Events occurring in current month for sidebar
  const currentMonthEvents = filteredEvents.filter(e => {
    const eventDate = new Date(e.date + 'T12:00:00');
    return eventDate.getFullYear() === year && eventDate.getMonth() === month;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <Stack spacing={2.5} sx={{ width: '100%' }}>
      {/* Calendar Controls & Category Filter Bar */}
      <Stack direction={{ xs: 'column', lg: 'row' }} alignItems={{ xs: 'flex-start', lg: 'center' }} justifyContent="space-between" spacing={2}>
        {/* Navigation & Month Heading */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Stack direction="row" spacing={0.5}>
            <IconButton onClick={handlePrevMonth} aria-label="Previous month" size="small" sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
              <ChevronLeftRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={handleNextMonth} aria-label="Next month" size="small" sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
              <ChevronRightRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Typography variant="h4" component="h2" sx={{ minWidth: { sm: 190 } }}>
            {monthNames[month]} {year}
          </Typography>

          <Button size="sm" variant="outline" onClick={handleGoToday}>
            Today
          </Button>
        </Stack>

        {/* Category Filters */}
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
          {calendarCategories.map(cat => {
            const isSelected = selectedCategory === cat.id;
            const tone = getTone(theme, cat.tone);
            return (
              <Chip
                key={cat.id}
                clickable
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={isSelected}
                label={cat.label}
                icon={cat.id !== 'all' ? <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tone.solid }} /> : undefined}
                variant={isSelected ? 'filled' : 'outlined'}
                sx={{
                  height: 30,
                  ...(isSelected
                    ? { bgcolor: 'grey.900', color: '#fff', '&:hover': { bgcolor: 'grey.800' }, '& .MuiChip-icon': { ml: 1 } }
                    : { borderColor: 'divider', color: 'text.secondary', bgcolor: 'background.paper', '& .MuiChip-icon': { ml: 1 } }),
                }}
              />
            );
          })}
        </Stack>
      </Stack>

      {/* Main Split Layout: Calendar Grid + Events Sidebar */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 320px' }, gap: 2.5, alignItems: 'start' }}>
        {/* Month Grid */}
        <Card sx={{ overflow: 'hidden' }}>
          {/* Day of week headers */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', bgcolor: 'background.subtle', borderBottom: 1, borderColor: 'divider' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <Typography key={day} variant="overline" component="div" sx={{ textAlign: 'center', py: 1.25, color: 'text.secondary' }}>
                {day}
              </Typography>
            ))}
          </Box>

          {/* Month Cells Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: { xs: 'minmax(58px, auto)', sm: 'minmax(104px, auto)' } }}>
            {calendarDays.map((cell, idx) => {
              const dayEvents = getEventsForDate(cell.dateString);
              const isOtherMonth = cell.monthOffset !== 0;
              const isCurrentDay = cell.monthOffset === 0 && cell.day === 15; // October 15 is current demo day

              return (
                <Box
                  key={idx}
                  sx={{
                    borderRight: (idx + 1) % 7 === 0 ? 0 : 1,
                    borderBottom: idx >= calendarDays.length - 7 ? 0 : 1,
                    borderColor: 'divider',
                    p: { xs: 0.5, sm: 0.875 },
                    bgcolor: isOtherMonth ? 'background.subtle' : isCurrentDay ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    minWidth: 0,
                    transition: 'background-color 160ms ease',
                    '&:hover': { bgcolor: isOtherMonth ? 'background.subtle' : alpha(theme.palette.primary.main, 0.025) },
                  }}
                >
                  {/* Date number */}
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box
                      component="span"
                      sx={{
                        fontSize: '0.75rem',
                        fontWeight: isCurrentDay ? 700 : cell.monthOffset === 0 ? 600 : 400,
                        color: isCurrentDay ? '#fff' : isOtherMonth ? 'grey.400' : 'text.primary',
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        bgcolor: isCurrentDay ? 'primary.main' : 'transparent',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {cell.day}
                    </Box>

                    {dayEvents.length > 0 && (
                      <Box component="span" sx={{ display: { xs: 'block', lg: 'none' }, width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }} />
                    )}
                  </Stack>

                  {/* Day Events List */}
                  <Stack spacing={0.375} sx={{ mt: 0.25 }}>
                    {dayEvents.slice(0, 2).map(ev => {
                      const colors = getCategoryColor(ev.category);
                      return (
                        <ButtonBase
                          key={ev.id}
                          onClick={() => onSelectEvent(ev)}
                          title={ev.title}
                          sx={{
                            display: 'block',
                            width: '100%',
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1.5,
                            bgcolor: colors.bg,
                            borderLeft: `2px solid ${colors.solid}`,
                            color: colors.text,
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            '&:hover': { filter: 'brightness(0.97)' },
                          }}
                        >
                          {ev.title}
                        </ButtonBase>
                      );
                    })}

                    {dayEvents.length > 2 && (
                      <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', pl: 0.5, fontWeight: 600 }}>
                        +{dayEvents.length - 2} more
                      </Typography>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Card>

        {/* Month Agenda / Events List */}
        <Card sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 2, height: 'fit-content' }}>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <IconTile icon={EventNoteOutlinedIcon} tone="primary" size={34} />
            <Box>
              <Typography variant="h6" component="h3">{monthNames[month]} Schedule</Typography>
              <Typography variant="caption">{currentMonthEvents.length} scheduled events & deadlines</Typography>
            </Box>
          </Stack>

          <Stack spacing={1}>
            {currentMonthEvents.length === 0 ? (
              <Box sx={{ py: 3, px: 1.5, textAlign: 'center', bgcolor: 'background.subtle', borderRadius: 2.5, border: 1, borderStyle: 'dashed', borderColor: 'grey.300' }}>
                <Typography variant="body2" color="text.secondary">
                  No events found for this category in {monthNames[month]}.
                </Typography>
              </Box>
            ) : (
              currentMonthEvents.map(ev => {
                const colors = getCategoryColor(ev.category);
                const evDate = new Date(ev.date + 'T12:00:00');
                const dayNum = evDate.getDate();
                const dayName = evDate.toLocaleDateString('en-US', { weekday: 'short' });

                return (
                  <ButtonBase
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      gap: 1.5,
                      width: '100%',
                      textAlign: 'left',
                      p: 1.25,
                      borderRadius: 2.5,
                      border: 1,
                      borderColor: 'divider',
                      transition: 'border-color 160ms ease, background-color 160ms ease',
                      '&:hover': { borderColor: 'grey.300', bgcolor: 'background.subtle' },
                    }}
                  >
                    <Stack alignItems="center" justifyContent="center" sx={{ minWidth: 44, py: 0.5, borderRadius: 2, bgcolor: colors.bg, color: colors.text }}>
                      <Typography sx={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'inherit' }}>
                        {dayName}
                      </Typography>
                      <Typography variant="metric" component="span" sx={{ fontSize: '1.125rem', lineHeight: 1.1, color: 'inherit' }}>
                        {dayNum}
                      </Typography>
                    </Stack>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {ev.category}
                        </Typography>
                        {ev.isImportant && (
                          <Typography sx={{ fontSize: '0.6875rem', color: 'error.main', fontWeight: 700 }}>• Urgent</Typography>
                        )}
                      </Stack>
                      <Typography variant="body2" fontWeight={600} sx={{ mt: 0.25, lineHeight: 1.35 }}>
                        {ev.title}
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5, color: 'text.secondary' }}>
                        <ScheduleRoundedIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption">{ev.startTime}</Typography>
                      </Stack>
                    </Box>
                  </ButtonBase>
                );
              })
            )}
          </Stack>
        </Card>
      </Box>
    </Stack>
  );
};
