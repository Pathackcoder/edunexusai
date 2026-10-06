import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CrisisAlertOutlinedIcon from '@mui/icons-material/CrisisAlertOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { StatCard } from '../../components/common/StatCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { FilterChips } from '../../components/common/FilterChips';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi, interventionApi } from '../../services/api';
import { FollowUpDialog } from '../../components/faculty/FacultyWorkspaceWidgets';

const TYPE_TONE = { ATTENDANCE: 'warning', MISSING_WORK: 'danger', ACADEMIC_CONCERN: 'danger', FOLLOW_UP: 'info', ADVISING: 'purple', REFERRAL: 'purple', TASK: 'neutral' };

/** Proactive intervention workspace for faculty: flags they raised + factual indicators. */
export const FacultyInterventionsPage = () => {
  const { showToast } = useToast();
  const [status, setStatus] = useState('OPEN');
  const { data, loading, error, refetch } = useApiQuery(() => interventionApi.list(status), [status]);
  const { data: courses = [] } = useApiQuery(() => facultyApi.getCourses(), [], { initialData: [] });
  const [open, setOpen] = useState(false);
  const summary = data?.summary ?? {};

  const update = async (flag, next) => {
    try {
      await interventionApi.update(flag.id, { status: next });
      showToast(`Marked ${next.replace('_', ' ').toLowerCase()}.`);
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Teaching workspace" title="Student Follow-ups" description="Early-alert flags for students on your rosters, your personal tasks, and referrals to support offices." actions={<Button icon={AddRoundedIcon} onClick={() => setOpen(true)}>New follow-up</Button>} />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading follow-ups…">
        {() => (
          <Stack spacing={2.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              <StatCard title="Open follow-ups" value={summary.open ?? 0} icon={CrisisAlertOutlinedIcon} tone="warning" />
              <StatCard title="Students flagged" value={summary.studentsFlagged ?? 0} icon={CrisisAlertOutlinedIcon} tone="danger" />
              <StatCard title="Attendance concerns" value={summary.byType?.ATTENDANCE ?? 0} icon={CrisisAlertOutlinedIcon} tone="info" />
              <StatCard title="Course-data indicators" value={summary.indicators ?? 0} icon={QueryStatsRoundedIcon} tone="purple" />
            </Box>
            <Alert severity="info">Flags record your professional judgement; indicators are factual counts from course data. Neither is a predicted risk score.</Alert>
            <WidgetCard title="Follow-ups" icon={CrisisAlertOutlinedIcon} tone="warning" hoverable={false}>
              <Stack spacing={1.25}>
                <FilterChips ariaLabel="Status" value={status} onChange={setStatus} options={[{ id: 'OPEN', label: 'Open' }, { id: 'RESOLVED', label: 'Resolved' }, { id: 'ALL', label: 'All' }]} />
                {(data?.interventions ?? []).length === 0 && <Typography color="text.secondary">Nothing here.</Typography>}
                {(data?.interventions ?? []).map((flag) => (
                  <Stack key={flag.id} direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <Badge variant={TYPE_TONE[flag.type]}>{flag.typeLabel}</Badge>
                        {flag.course && <Badge variant="neutral">{flag.course.code}</Badge>}
                        {flag.studentNotified && <Badge variant="info">Student notified</Badge>}
                        <Typography variant="caption" color="text.secondary">{flag.subject}</Typography>
                      </Stack>
                      <Typography variant="subtitle2" sx={{ mt: 0.25 }}>{flag.title}</Typography>
                      {flag.note && <Typography variant="body2" color="text.secondary">{flag.note}</Typography>}
                      <Typography variant="caption" color="text.secondary">{flag.createdBy} · {flag.timeAgo}{flag.dueDate ? ` · follow up by ${flag.dueDate}` : ''}</Typography>
                    </Box>
                    <TextField select size="small" value={flag.status} onChange={(e) => update(flag, e.target.value)} sx={{ minWidth: 150 }}>
                      <MenuItem value="OPEN">Open</MenuItem>
                      <MenuItem value="IN_PROGRESS">In progress</MenuItem>
                      <MenuItem value="RESOLVED">Resolved</MenuItem>
                    </TextField>
                  </Stack>
                ))}
              </Stack>
            </WidgetCard>
            <WidgetCard title="Indicators from course data" subtitle="Past-due assignments with no submission, per student" icon={QueryStatsRoundedIcon} tone="purple" hoverable={false}>
              <Stack spacing={1}>
                {(data?.indicators ?? []).length === 0 && <Typography color="text.secondary">No indicators — every past-due assignment has a submission.</Typography>}
                {(data?.indicators ?? []).map((indicator) => (
                  <Stack key={indicator.key} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                    <Badge variant="danger">{indicator.courseCode}</Badge>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2">{indicator.studentName} <Typography component="span" variant="caption" color="text.secondary">· {indicator.studentNumber}</Typography></Typography>
                      <Typography variant="caption" color="text.secondary">{indicator.label}: {indicator.detail}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </WidgetCard>
          </Stack>
        )}
      </DataState>
      <FollowUpDialog open={open} courses={courses ?? []} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); }} />
    </Box>
  );
};

export default FacultyInterventionsPage;
