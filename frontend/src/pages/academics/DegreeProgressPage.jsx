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
import { planningApi } from '../../services/api';

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

/** Degree audit: credits by requirement category, computed from the transcript. */
export const DegreeProgressPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => planningApi.degreeProgress());
  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Degree Progress" description="Where you stand against your program requirements — completed, in progress and still needed." actions={<MuiButton component={RouterLink} to="/academics/recommendations" endIcon={<ArrowForwardRoundedIcon />}>Plan next courses</MuiButton>} />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Running your degree audit…">
        {() => (
          <Stack spacing={2.5}>
            <Card sx={(theme) => ({ p: { xs: 2.5, md: 3.5 }, background: `linear-gradient(120deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${theme.palette.background.paper} 60%)` })}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3.5} alignItems={{ md: 'center' }}>
                <ProgressRing value={data.percentComplete} secondary={data.projectedPercent - data.percentComplete} size={168} sublabel="complete" label="Degree completion" />
                <Box sx={{ flex: 1 }}>
                  <Chip icon={<SchoolOutlinedIcon />} label={data.program} sx={{ mb: 1.5, bgcolor: 'background.paper' }} />
                  <Typography variant="h4" component="h2">{data.completedCredits} of {data.totalRequired} credits earned</Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {data.inProgressCredits} credits in progress this term · {data.remainingCredits} still needed after that ({data.projectedPercent}% once current courses finish)
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5, mt: 2.5, maxWidth: 520 }}>
                    {[
                      ['Completed', data.completedCredits, SERIES_COLORS[0]],
                      ['In progress', data.inProgressCredits, SERIES_COLORS[1]],
                      ['Remaining', data.remainingCredits, '#B26A00'],
                    ].map(([label, value, color]) => (
                      <Box key={label} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                        <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} /><Typography variant="caption" color="text.secondary">{label}</Typography></Stack>
                        <Typography variant="metric" sx={{ fontSize: '1.5rem' }}>{value}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Stack>
            </Card>
            {!data.hasCourseHistory && <Alert severity="info">Course-level history is not available from the SIS for your record, so totals come from your credit summary. Category detail will appear once your transcript is synced.</Alert>}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
              {data.categories.map((cat) => {
                const status = STATUS[cat.status] ?? STATUS.REMAINING;
                const Icon = status.icon;
                return (
                  <WidgetCard key={cat.id} title={cat.title} subtitle={cat.description} icon={Icon} tone={status.tone} badge={<Badge variant={status.tone}>{status.label}</Badge>}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">{cat.creditsCompleted} done · {cat.creditsInProgress} in progress</Typography><Typography variant="body2" fontWeight={700}>{cat.creditsCompleted + cat.creditsInProgress} / {cat.creditsRequired} cr</Typography></Stack>
                      <CreditBar completed={cat.creditsCompleted} inProgress={cat.creditsInProgress} required={cat.creditsRequired} />
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                        {cat.completedCourses.map((course) => <Chip key={course.code} size="small" icon={<TaskAltRoundedIcon />} label={`${course.code} · ${course.grade}`} color="success" variant="outlined" />)}
                        {cat.inProgressCourses.map((course) => <Chip key={course.code} size="small" icon={<PendingOutlinedIcon />} label={`${course.code} · in progress`} color="info" variant="outlined" />)}
                      </Stack>
                      {cat.creditsRemaining > 0 && (
                        <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'warning.lighter' }}>
                          <Typography variant="caption" fontWeight={700} color="warning.dark">{cat.creditsRemaining} credits still needed</Typography>
                          {cat.options.length > 0 ? (
                            <Typography variant="body2" color="text.secondary">Options: {cat.options.map((option) => `${option.code} ${option.title}`).join(' · ')}</Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">Any eligible graduate course counts here.</Typography>
                          )}
                        </Box>
                      )}
                    </Stack>
                  </WidgetCard>
                );
              })}
            </Box>
            <Typography variant="caption" color="text.secondary">Source: {data.source}. Unofficial audit — confirm graduation clearance with your advisor.</Typography>
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default DegreeProgressPage;
