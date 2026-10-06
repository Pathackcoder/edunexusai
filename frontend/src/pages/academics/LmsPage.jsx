import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import { LmsCard } from '../../components/lms/LmsCard';
import { useApiQuery } from '../../hooks/useApiQuery';
import { academicApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';

/**
 * Canvas LMS launch points.
 *
 * The course list comes from the API, and `lms` describes the configured Canvas
 * integration. The badge reports the connector's real mode so the screen never implies a
 * live LMS connection that has not been configured.
 */
export const LmsPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => academicApi.getLms());
  const coursesData = data?.courses ?? [];
  const lms = data?.lms ?? null;

  const modeLabel =
    lms?.mode === 'LIVE'
      ? 'Live Canvas tenant'
      : lms?.mode === 'MOCK'
        ? 'Mock Canvas connector'
        : 'Not configured';

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your course modules…"
      isEmpty={coursesData.length === 0}
      emptyTitle="No LMS courses"
      emptyMessage="Course modules appear here once your enrollments are synced from the LMS."
    >
      {() => (
        <Box>
          <PageHeader
            title="Canvas Learning Management System (LMS)"
            description="Direct SSO access to course modules, discussion forums, lecture slides, and digital assignments."
          />

          <Stack spacing={2}>
            {lms && (
              <Stack
                direction="row"
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
                spacing={1.25}
                sx={{ px: 2, py: 1.25, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}
              >
                <HubOutlinedIcon sx={{ fontSize: 18, color: 'grey.500' }} aria-hidden="true" />
                <Typography variant="body2" color="text.secondary">
                  Connector: <Box component="strong" sx={{ color: 'text.primary' }}>{lms.displayName}</Box> · {modeLabel}
                </Typography>
                <Badge variant={lms.status === 'CONNECTED' ? 'success' : 'neutral'}>{lms.status}</Badge>
              </Stack>
            )}

            {/* LMS Component */}
            <LmsCard courses={coursesData} />
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default LmsPage;
