import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi } from '../../services/api';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** Teaching timetable, grouped by weekday. */
export const FacultySchedulePage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => facultyApi.getSchedule());
  const courses = data ?? [];

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your teaching schedule…"
      isEmpty={courses.length === 0}
      emptyTitle="No scheduled teaching"
      emptyMessage="Sections you are assigned to teach will appear here."
    >
      {() => (
        <Box>
          <PageHeader
            title="Teaching Schedule"
            description="Weekly lecture and lab commitments for the current term."
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 2 }}>
            {DAYS.map((day) => {
              const dayCourses = courses.filter((course) => (course.days ?? []).includes(day));
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
                            bgcolor: course.bgColor ?? 'background.subtle',
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
