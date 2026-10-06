import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import { AssignmentCard } from '../../components/assignments/AssignmentCard';
import { SubmitModal } from '../../components/assignments/SubmitModal';
import { useToast } from '../../components/common/Toast';
import { PageHeader } from '../../components/common/PageHeader';
import { FilterChips } from '../../components/common/FilterChips';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { academicApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

export const AssignmentsPage = () => {
  // Assignments are provider-owned (pulled from the LMS/SIS) and joined on the server
  // with this student's own submission state.
  const { data, loading, error, refetch, setData } = useApiQuery(() => academicApi.getAssignments());
  const assignments = data ?? [];
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const { showToast } = useToast();

  const filteredAssignments = assignments.filter(a => {
    if (assignmentFilter === 'due-soon') return a.urgency === 'due-soon' && a.status !== 'Completed';
    if (assignmentFilter === 'in-progress') return a.status === 'In Progress';
    if (assignmentFilter === 'completed') return a.status === 'Completed';
    return true;
  });

  const handleAssignmentSubmit = async (id, details) => {
    // Optimistic update, then persist. A failure re-reads the server state.
    setData((prev) =>
      (prev ?? []).map((a) => (a.id === id ? { ...a, status: 'Completed', urgency: 'completed' } : a)),
    );
    try {
      await academicApi.submitAssignment(id, { note: details?.note, submissionRef: details?.submissionRef });
      showToast('Assignment submitted successfully!');
    } catch (caught) {
      showToast(caught?.message ?? 'Submission could not be saved.');
      refetch();
    }
  };

  const counts = {
    all: assignments.length,
    dueSoon: assignments.filter(a => a.urgency === 'due-soon' && a.status !== 'Completed').length,
    inProgress: assignments.filter(a => a.status === 'In Progress').length,
    completed: assignments.filter(a => a.status === 'Completed').length
  };

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your assignments…"
      emptyTitle="No assignments yet"
      emptyMessage="Coursework for your enrolled courses will appear here once it is published."
      isEmpty={assignments.length === 0}
    >
      {() => (
        <Box>
          <PageHeader
            title="Assignments & Deadlines"
            description="Track problem sets, lab reports, project milestones, and submit completed coursework."
          />

          <Stack spacing={2.5}>
            {/* Filter Controls */}
            <FilterChips
              ariaLabel="Filter assignments"
              value={assignmentFilter}
              onChange={setAssignmentFilter}
              options={[
                { id: 'all', label: 'All Assignments', count: counts.all },
                { id: 'due-soon', label: 'Due Soon', count: counts.dueSoon },
                { id: 'in-progress', label: 'In Progress', count: counts.inProgress },
                { id: 'completed', label: 'Completed', count: counts.completed }
              ]}
            />

            {/* Assignments List */}
            <Stack spacing={1.5}>
              {filteredAssignments.map(assignment => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  onSubmitClick={setSelectedAssignment}
                />
              ))}

              {filteredAssignments.length === 0 && (
                <Card>
                  <EmptyState compact title="No assignments found matching this filter." description="Try a different filter to see more coursework." />
                </Card>
              )}
            </Stack>
          </Stack>

          {/* Submit Assignment Modal */}
          <SubmitModal
            isOpen={!!selectedAssignment}
            onClose={() => setSelectedAssignment(null)}
            assignment={selectedAssignment}
            onSubmitSuccess={handleAssignmentSubmit}
          />
        </Box>
      )}
    </DataState>
  );
};

export default AssignmentsPage;
