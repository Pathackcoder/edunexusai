import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
import { DataState } from '../../components/common/DataState';

/**
 * Courses the signed-in faculty member is instructor of record for. The `dataSource`
 * footnote on each card answers "where did this course come from?" directly in the UI.
 */
export const FacultyCoursesPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => facultyApi.getCourses());
  const courses = data ?? [];

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your courses…"
      isEmpty={courses.length === 0}
      emptyTitle="No assigned courses"
      emptyMessage="You are not listed as instructor of record for any course in the current term."
    >
      {() => (
        <Box>
          <PageHeader
            title="My Courses"
            description="Sections you teach this term, with enrolment counts and the system each record came from."
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2.5 }}>
            {courses.map((course) => (
              <Card key={course.id} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, '&:hover': { boxShadow: 3 } }}>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h5" component="h3">{course.code}</Typography>
                    <Typography variant="body2" color="text.secondary">{course.name}</Typography>
                  </Box>
                  <Badge variant="purple">{course.credits} credits</Badge>
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
                    View roster & send notification
                  </Button>
                </Box>
              </Card>
            ))}
          </Box>
        </Box>
      )}
    </DataState>
  );
};

export default FacultyCoursesPage;
