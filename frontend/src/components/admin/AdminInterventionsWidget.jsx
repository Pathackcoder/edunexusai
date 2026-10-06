import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CrisisAlertOutlinedIcon from '@mui/icons-material/CrisisAlertOutlined';
import { WidgetCard } from '../common/WidgetCard';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { FilterChips } from '../common/FilterChips';
import { DataState } from '../common/DataState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminOpsApi, interventionApi } from '../../services/api';

const TYPE_TONE = { ATTENDANCE: 'warning', MISSING_WORK: 'danger', ACADEMIC_CONCERN: 'danger', FOLLOW_UP: 'info', ADVISING: 'purple', REFERRAL: 'purple', TASK: 'neutral' };

/** Institution-wide view of student follow-up flags raised by faculty and advisors. */
export const AdminInterventionsWidget = () => {
  const { showToast } = useToast();
  const [status, setStatus] = useState('OPEN');
  const { data, loading, error, refetch } = useApiQuery(() => adminOpsApi.interventions(status), [status]);
  const flags = (data?.interventions ?? []).filter((flag) => flag.type !== 'TASK');
  const summary = data?.summary ?? {};

  const resolve = async (flag) => {
    try {
      await interventionApi.update(flag.id, { status: 'RESOLVED' });
      showToast('Follow-up resolved.');
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <WidgetCard title="Student interventions" subtitle="Early-alert flags raised by faculty and advisors" icon={CrisisAlertOutlinedIcon} tone="danger" hoverable={false}>
      <Stack spacing={1.75}>
        <Alert severity="info">Flags are entered by people, and indicators are factual counts from course data (e.g. past-due work without a submission). No risk score is calculated.</Alert>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
          {[
            ['Open flags', summary.open ?? 0],
            ['Students flagged', summary.studentsFlagged ?? 0],
            ['Attendance', summary.byType?.ATTENDANCE ?? 0],
            ['Data indicators', summary.indicators ?? 0],
          ].map(([label, value]) => (
            <Box key={label} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.subtle', textAlign: 'center', border: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
              <Typography variant="subtitle1" fontWeight={700}>{value}</Typography>
            </Box>
          ))}
        </Box>
        <FilterChips ariaLabel="Flag status" value={status} onChange={setStatus} options={[{ id: 'OPEN', label: 'Open' }, { id: 'RESOLVED', label: 'Resolved' }, { id: 'ALL', label: 'All' }]} />
        <DataState loading={loading} error={error} onRetry={refetch} minHeight={100}>
          {() => (
            <Stack spacing={1}>
              {flags.length === 0 && <Typography color="text.secondary">No flags match this filter.</Typography>}
              {flags.map((flag) => (
                <Stack key={flag.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Badge variant={TYPE_TONE[flag.type]}>{flag.typeLabel}</Badge>
                      {flag.course && <Badge variant="neutral">{flag.course.code}</Badge>}
                      <Typography variant="caption" color="text.secondary">{flag.subject}{flag.student?.studentNumber ? ` · ${flag.student.studentNumber}` : ''}</Typography>
                    </Stack>
                    <Typography variant="subtitle2" sx={{ mt: 0.25 }}>{flag.title}</Typography>
                    <Typography variant="caption" color="text.secondary">Raised by {flag.createdBy} · {flag.timeAgo}{flag.dueDate ? ` · follow up by ${flag.dueDate}` : ''}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Badge variant={flag.status === 'RESOLVED' ? 'success' : flag.status === 'IN_PROGRESS' ? 'info' : 'warning'} dot>{flag.status.replace('_', ' ')}</Badge>
                    {flag.status !== 'RESOLVED' && <Button size="sm" variant="outline" onClick={() => resolve(flag)}>Resolve</Button>}
                  </Stack>
                </Stack>
              ))}
              {(data?.indicators ?? []).length > 0 && (
                <>
                  <Typography variant="overline" color="text.secondary" sx={{ pt: 1 }}>Indicators from course data</Typography>
                  {data.indicators.map((indicator) => (
                    <Stack key={indicator.key} direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 1, borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                      <Badge variant="danger">{indicator.courseCode}</Badge>
                      <Typography variant="body2" sx={{ flex: 1 }}><strong>{indicator.studentName}</strong> — {indicator.label}</Typography>
                    </Stack>
                  ))}
                </>
              )}
            </Stack>
          )}
        </DataState>
      </Stack>
    </WidgetCard>
  );
};

export default AdminInterventionsWidget;
