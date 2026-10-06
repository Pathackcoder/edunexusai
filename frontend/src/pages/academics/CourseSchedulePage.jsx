import React from 'react';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { TimetableGrid } from '../../components/schedule/TimetableGrid';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { Section } from '../../components/common/Section';
import { useApiQuery } from '../../hooks/useApiQuery';
import { academicApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

const DetailRow = ({ label, children, strong }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Typography variant="caption" sx={{ flexShrink: 0 }}>{label}</Typography>
    <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: strong ? 600 : 500, textAlign: 'right' }}>
      {children}
    </Typography>
  </Stack>
);

export const CourseSchedulePage = () => {
  // The timetable is built from the student's enrolled courses, which the integration
  // layer pulled from the registrar system.
  const { data, loading, error, refetch } = useApiQuery(() => academicApi.getCourses());
  const coursesData = data ?? [];

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your timetable…"
      isEmpty={coursesData.length === 0}
      emptyTitle="No enrolled courses"
      emptyMessage="Your timetable will appear here once you are registered for courses."
    >
      {() => (
        <Box>
          <PageHeader
            title="Course Schedule & Timetable"
            description="Weekly lecture timetable, lab sessions, and instructor office hours for Fall 2026."
          />

          <Stack spacing={{ xs: 3, md: 3.5 }}>
            {/* Main Timetable Component */}
            <WidgetCard
              title="Class Schedule Grid"
              subtitle="Fall 2026 Semester (16 Graduate Credits Enrolled)"
              icon={CalendarMonthOutlinedIcon}
            >
              <TimetableGrid courses={coursesData} />
            </WidgetCard>

            {/* Enrolled Courses Details */}
            <Section title="Enrolled Courses Overview">
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
                {coursesData.map(course => (
                  <Card key={course.id} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="overline" sx={{ color: course.color || 'primary.main', lineHeight: 1.5 }}>
                          {course.code}
                        </Typography>
                        <Typography variant="subtitle1" component="h4" sx={{ lineHeight: 1.35 }}>
                          {course.name}
                        </Typography>
                      </Box>
                      <Badge variant="purple">{course.credits} Credits</Badge>
                    </Stack>

                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>
                      {course.description}
                    </Typography>

                    <Stack spacing={0.75} sx={{ mt: 'auto', pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                      <DetailRow label="Instructor:" strong>{course.instructor}</DetailRow>
                      <DetailRow label="Classroom:">{course.room}</DetailRow>
                      <DetailRow label="Days & Time:" strong>{course.days.join(', ')} ({course.time})</DetailRow>
                      <DetailRow label="Office Hours:">{course.officeHours}</DetailRow>
                    </Stack>
                  </Card>
                ))}
              </Box>
            </Section>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default CourseSchedulePage;
