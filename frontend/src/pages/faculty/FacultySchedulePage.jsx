import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { sisApi } from '../../services/api';
import { SisNotice } from '../../components/sis/SisNotice';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';

const DAYS = [['MON', 'Monday'], ['TUE', 'Tuesday'], ['WED', 'Wednesday'], ['THU', 'Thursday'], ['FRI', 'Friday']];
const COLORS = ['#4651DE', '#0E9F6E', '#C2410C', '#7A4FD8', '#0891B2', '#BE185D'];

/**
 * Teaching timetable from CampusCore SIS (the official teaching assignments), grouped by
 * weekday. Unlinked accounts and outages show an explicit state, never local demo sections.
 */
export const FacultySchedulePage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => sisApi.facultyTeaching());
  const schedule = data?.state === 'OK' && data.schedule.state === 'OK' ? data.schedule.data : null;
  const courses = (schedule?.items ?? []).flatMap((section, index) =>
    (section.meetings ?? []).map((m) => ({
      id: `${section.source.id}-${m.day}-${m.start}`,
      day: m.day,
      code: `${section.courseCode}-${section.sectionCode}`,
      time: `${m.start} – ${m.end}`,
      room: m.location ?? 'Room not listed',
      color: COLORS[index % COLORS.length],
    })),
  ).sort((a, b) => a.time.localeCompare(b.time));
  const notice = data && !schedule ? <SisNotice overview={data} section={data.state === 'OK' ? data.schedule : null} what="Your teaching schedule" onRetry={refetch} /> : null;

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your teaching schedule…"
      isEmpty={Boolean(schedule) && courses.length === 0}
      emptyTitle="No scheduled teaching"
      emptyMessage="Sections you are assigned to teach will appear here."
    >
      {() => (
        <Box>
          <PageHeader
            title="Teaching Schedule"
            description={`Weekly teaching commitments${schedule?.term?.name ? ` for ${schedule.term.name}` : ''}, from CampusCore SIS.`}
          />
          {notice && <Box sx={{ mb: 2 }}>{notice}</Box>}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 2 }}>
            {schedule && DAYS.map(([code, day]) => {
              const dayCourses = courses.filter((course) => course.day === code);
              return (
                <Card key={day} sx={{ display: 'flex', flexDirection: 'column', minHeight: 170 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.75, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
                    <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>{day}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>{dayCourses.length}</Typography>
                  </Stack>

                  <Stack spacing={1} sx={{ p: 1.5, flex: 1 }}>
                    {dayCourses.length === 0 ? (
                      <Typography variant="caption" sx={{ color: 'grey.400', m: 'auto' }}>No classes</Typography>
                    ) : (
                      dayCourses.map((course) => (
                        <Box
                          key={course.id}
                          sx={{
                            position: 'relative',
                            overflow: 'hidden',
                            p: 1.25,
                            pl: 1.75,
                            borderRadius: 2.5,
                            bgcolor: 'background.subtle',
                            '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: course.color ?? 'primary.main' },
                          }}
                        >
                          <Typography variant="subtitle2">{course.code}</Typography>
                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25, color: 'text.secondary' }}>
                            <ScheduleRoundedIcon sx={{ fontSize: 13 }} />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{course.time}</Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
                            <PlaceOutlinedIcon sx={{ fontSize: 13 }} />
                            <Typography variant="caption" sx={{ fontSize: '0.6875rem' }}>{course.room}</Typography>
                          </Stack>
                        </Box>
                      ))
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Box>
        </Box>
      )}
    </DataState>
  );
};

export default FacultySchedulePage;
