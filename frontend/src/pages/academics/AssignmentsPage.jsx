import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import { MoodleAssignmentCard } from '../../components/assignments/MoodleAssignmentCard';
import { MoodleNotice, MoodleUnavailablePart } from '../../components/lms/MoodleNotice';
import { PageHeader } from '../../components/common/PageHeader';
import { FilterChips } from '../../components/common/FilterChips';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { lmsApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const open = (a) => ['NOT_SUBMITTED', 'DRAFT'].includes(a.state);

/**
 * Assignments & Deadlines: live from Moodle for the signed-in student's own courses.
 * No local assignment records are shown, and nothing is filled in when Moodle is empty
 * or unavailable. Submitting happens in Moodle.
 */
export const AssignmentsPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => lmsApi.myMoodleAssignments());
  const assignments = data?.assignments ?? [];
  const [filter, setFilter] = useState('all');
  const now = Date.now();
  const dueSoon = (a) => open(a) && a.dueDate && new Date(a.dueDate).getTime() - now < WEEK;

  const filtered = assignments.filter((a) => {
    if (filter === 'due-soon') return dueSoon(a);
    if (filter === 'to-submit') return open(a);
    if (filter === 'submitted') return ['SUBMITTED', 'GRADED_NOT_RELEASED'].includes(a.state);
    if (filter === 'graded') return a.state === 'GRADED';
    return true;
  });

  return (
    <Box>
      <PageHeader title="Assignments & Deadlines" description="Your Moodle assignments, due dates, submission status and released grades, read live from Moodle." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your Moodle assignments…">
        {() => (
          <Stack spacing={2.5}>
            <MoodleNotice data={data} onRetry={refetch} />
            <MoodleUnavailablePart part={data?.unavailable} what="Assignments" />
            {data?.status === 'CONNECTED' && !data?.unavailable && (
              <>
                <Alert severity="info">
                  Submissions are made in Moodle (each assignment opens there). The status here updates from Moodle once you have submitted.
                </Alert>
                <FilterChips
                  ariaLabel="Filter assignments"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: 'all', label: 'All', count: assignments.length },
                    { id: 'due-soon', label: 'Due soon', count: assignments.filter(dueSoon).length },
                    { id: 'to-submit', label: 'To submit', count: assignments.filter(open).length },
                    { id: 'submitted', label: 'Submitted', count: assignments.filter((a) => ['SUBMITTED', 'GRADED_NOT_RELEASED'].includes(a.state)).length },
                    { id: 'graded', label: 'Graded', count: assignments.filter((a) => a.state === 'GRADED').length },
                  ]}
                />
                <Stack spacing={1.5}>
                  {filtered.map((a) => <MoodleAssignmentCard key={a.assignmentId} assignment={a} />)}
                  {filtered.length === 0 && (
                    <Card>
                      <EmptyState
                        compact
                        title={assignments.length ? 'No assignments match this filter.' : 'No assignments in your Moodle courses yet.'}
                        description={assignments.length ? 'Try a different filter.' : 'Assignments appear here as soon as your instructors publish them in Moodle.'}
                      />
                    </Card>
                  )}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default AssignmentsPage;
