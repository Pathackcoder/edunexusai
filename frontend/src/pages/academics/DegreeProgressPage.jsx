import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { DataState } from '../../components/common/DataState';
import { ProgressRing, SERIES_COLORS } from '../../components/charts/Charts';
import { useApiQuery } from '../../hooks/useApiQuery';
import { sisApi } from '../../services/api';
import { SisNotice } from '../../components/sis/SisNotice';
import { pretty } from '../../components/sis/sisData';

const STATUS = {
  COMPLETE: { label: 'Complete', tone: 'success', icon: TaskAltRoundedIcon },
  IN_PROGRESS: { label: 'In progress', tone: 'info', icon: PendingOutlinedIcon },
  REMAINING: { label: 'Remaining', tone: 'warning', icon: RadioButtonUncheckedRoundedIcon },
  UNKNOWN: { label: 'Not on record', tone: 'neutral', icon: RadioButtonUncheckedRoundedIcon },
};

/** Stacked bar: completed (solid) + in progress (lighter) out of required credits. */
const CreditBar = ({ completed, inProgress, required }) => (
  <Box sx={{ display: 'flex', gap: '2px', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'grey.100' }}>
    <Box sx={{ width: `${(completed / required) * 100}%`, bgcolor: SERIES_COLORS[0], transition: 'width 700ms ease' }} />
    <Box sx={{ width: `${(inProgress / required) * 100}%`, bgcolor: alpha(SERIES_COLORS[1], 0.55), transition: 'width 700ms ease' }} />
  </Box>
);

/**
 * Degree progress. Program, credits and standing come from CampusCore SIS. CampusCore's
 * integration API (v1) does not expose degree requirements or a requirement-by-requirement
 * audit, so none is invented here from local records.
 */
export const DegreeProgressPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => sisApi.myOverview());
  const academic = data?.state === 'OK' && data.academic.state === 'OK' ? data.academic.data : null;
  const profile = data?.state === 'OK' && data.profile.state === 'OK' ? data.profile.data : null;
  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Degree Progress" description="Your program, credits and standing from CampusCore SIS." actions={<MuiButton component={RouterLink} to="/academics/recommendations" endIcon={<ArrowForwardRoundedIcon />}>Plan next courses</MuiButton>} />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your record from CampusCore…">
        {() => (
          <Stack spacing={2.5}>
            <SisNotice overview={data} section={data?.academic} what="Your academic summary" onRetry={refetch} />
            {academic && (
              <Card sx={(theme) => ({ p: { xs: 2.5, md: 3.5 }, background: `linear-gradient(120deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${theme.palette.background.paper} 60%)` })}>
                {profile?.program && <Chip icon={<SchoolOutlinedIcon />} label={`${profile.program.name} (${profile.program.credential})`} sx={{ mb: 1.5, bgcolor: 'background.paper' }} />}
                <Typography variant="h4" component="h2">{academic.creditsEarned} credits earned</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {academic.creditsInProgress} credits in progress · {pretty(academic.level)} · {pretty(academic.standing)}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5, mt: 2.5, maxWidth: 520 }}>
                  {[
                    ['Earned', academic.creditsEarned, SERIES_COLORS[0]],
                    ['In progress', academic.creditsInProgress, SERIES_COLORS[1]],
                    ['Cumulative GPA', academic.gpa != null ? academic.gpa.toFixed(2) : '—', '#B26A00'],
                  ].map(([label, value, color]) => (
                    <Box key={label} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                      <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} /><Typography variant="caption" color="text.secondary">{label}</Typography></Stack>
                      <Typography variant="metric" sx={{ fontSize: '1.5rem' }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Card>
            )}
            {data?.state === 'OK' && (
              <Alert severity="info">
                Requirement-by-requirement progress (degree audit) is kept in CampusCore and is not shared through its integration API yet, so it is not shown here. Use the degree audit in the CampusCore student portal.
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary">Source: CampusCore SIS. Unofficial view — confirm graduation clearance with your advisor.</Typography>
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default DegreeProgressPage;
