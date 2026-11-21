import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { SisTeachingPanel } from '../../components/sis/SisTeachingPanel';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { InfoField } from '../../components/common/Section';
import { ErrorPanel } from '../../components/common/DataState';

/**
 * Local EduNexusAI course records the signed-in faculty member is instructor of record for (demo data). Shown
 * only when there are some, below the official CampusCore sections, and labelled as demo records.
 */
function LocalDemoCourses() {
  const { data, error, refetch } = useApiQuery(() => facultyApi.getCourses());
  const courses = data ?? [];
  if (error) return <ErrorPanel compact error={error} onRetry={refetch} />;
  if (courses.length === 0) return null;
  return (
    <Box component="section" aria-labelledby="local-demo-courses">
      <Typography id="local-demo-courses" variant="h6" component="h2" sx={{ mb: 1 }}>Demo courses (local EduNexusAI records)</Typography>
      <Alert severity="info" sx={{ mb: 2.5 }} action={<MuiButton component={RouterLink} to="/faculty/moodle" size="small">Moodle Teaching</MuiButton>}>
        These are local EduNexusAI demo records, not CampusCore or Moodle data. Notifications sent from them reach only
        the students enrolled in the demo course. Official sections are above; Moodle courses, assignments and grading
        are under Moodle Teaching.
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2.5 }}>
        {courses.map((course) => (
          <Card key={course.id} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, '&:hover': { boxShadow: 3 } }}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" component="h3">{course.code}</Typography>
                <Typography variant="body2" color="text.secondary">{course.name}</Typography>
              </Box>
              <Stack spacing={0.5} alignItems="flex-end">
                <Badge variant="neutral">Demo</Badge>
                <Badge variant="purple">{course.credits} credits</Badge>
              </Stack>
            </Stack>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, p: 1.75, borderRadius: 3, bgcolor: 'background.subtle', border: 1, borderColor: 'divider' }}>
              <InfoField label="Enrolled" valueSx={{ color: 'primary.main', fontSize: '0.9375rem' }}>
                <Stack component="span" direction="row" alignItems="center" spacing={0.5}>
                  <GroupsOutlinedIcon sx={{ fontSize: 17 }} />
                  <span>{course.enrolledCount} students</span>
                </Stack>
              </InfoField>
              <InfoField label="Meets" valueSx={{ fontSize: '0.875rem' }}>{(course.days ?? []).join(', ') || '—'}</InfoField>
              <InfoField label="Time" valueSx={{ fontSize: '0.875rem' }}>{course.time ?? '—'}</InfoField>
              <InfoField label="Room" valueSx={{ fontSize: '0.875rem' }}>{course.room ?? '—'}</InfoField>
            </Box>

            {course.dataSource?.system && (
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'text.secondary' }}>
                <StorageRoundedIcon sx={{ fontSize: 14 }} aria-hidden="true" />
                <Typography variant="caption" sx={{ fontSize: '0.6875rem' }}>
                  Source: {course.dataSource.system} · {course.dataSource.externalId}
                </Typography>
              </Stack>
            )}

            <Box sx={{ mt: 'auto' }}>
              <Button
                component={RouterLink}
                to={`/faculty/courses/${course.id}`}
                variant="outlined"
                color="primary"
                fullWidth
                endIcon={<ArrowForwardRoundedIcon />}
              >
                View demo roster & send notification
              </Button>
            </Box>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

/**
 * My Courses: the sections CampusCore assigns the signed-in faculty member, always shown first (with their own
 * loading, empty and error states), then any local demo course records, clearly labelled.
 */
export const FacultyCoursesPage = () => (
  <Box>
    <PageHeader
      title="My Courses"
      description="Sections you teach in the current and upcoming terms, with enrolment counts and where each section's announcements are published."
    />
    <SisTeachingPanel />
    <LocalDemoCourses />
  </Box>
);

export default FacultyCoursesPage;
