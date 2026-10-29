import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import StackedBarChartRoundedIcon from '@mui/icons-material/StackedBarChartRounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { StatCard } from '../../components/common/StatCard';
import { DataState } from '../../components/common/DataState';
import { LineChart, BarChart, ChartTable } from '../../components/charts/Charts';
import { useApiQuery } from '../../hooks/useApiQuery';
import { lmsApi, sisApi } from '../../services/api';
import { useSisProfile } from '../../hooks/useSisProfile';
import { SisNotice } from '../../components/sis/SisNotice';
import { pretty } from '../../components/sis/sisData';

const gpa = (value) => (value == null ? '—' : Number(value).toFixed(2));
const GRADE_ORDER = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

/**
 * Academic analytics from CampusCore SIS (published grades and the academic record),
 * plus Moodle for coursework counts. Nothing here reads the local transcript tables.
 */
export const InsightsPage = () => {
  const { data: overview, loading, error, refetch } = useApiQuery(() => sisApi.myOverview());
  const sisProfile = useSisProfile();
  const moodleWork = useApiQuery(() => lmsApi.myMoodleAssignments());
  const [tables, setTables] = useState(false);

  const academic = overview?.state === 'OK' && overview.academic.state === 'OK' ? overview.academic.data : null;
  const history = overview?.state === 'OK' && overview.grades.state === 'OK' ? overview.grades.data : [];
  const completed = history.flatMap((term) => term.courses.filter((course) => !course.inProgress));
  const inProgress = history.flatMap((term) => term.courses.filter((course) => course.inProgress).map((course) => ({ ...course, term: term.termName ?? term.termCode })));
  const gpaTrend = history.filter((term) => term.gpa != null).map((term) => ({ term: term.termName ?? term.termCode, termGpa: term.gpa }));
  const distribution = GRADE_ORDER.map((grade) => ({ grade, count: completed.filter((course) => course.grade === grade).length })).filter((row) => row.count > 0);
  const creditsByTerm = history.map((term) => ({ term: term.termName ?? term.termCode, credits: term.courses.reduce((sum, course) => sum + (course.credits ?? 0), 0), inProgress: term.courses.some((course) => course.inProgress) }));
  const required = sisProfile.student?.program?.requiredCredits ?? null;
  const degreePercent = required && academic ? Math.min(100, Math.round(((academic.creditsEarned ?? 0) / required) * 100)) : null;
  const moodleAssignments = moodleWork.data?.status === 'CONNECTED' ? moodleWork.data.assignments ?? [] : null;
  const submitted = moodleAssignments?.filter((a) => ['SUBMITTED', 'GRADED', 'GRADED_NOT_RELEASED'].includes(a.state)).length ?? null;

  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Performance Insights" description="Trends in your published grades and GPA from CampusCore SIS, and your Moodle coursework." actions={<FormControlLabel control={<Switch checked={tables} onChange={(e) => setTables(e.target.checked)} />} label="Show data tables" />} />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Analysing your record…">
        {() => (
          <Stack spacing={2.5}>
            <SisNotice overview={overview} section={overview?.state === 'OK' ? overview.academic : null} what="Your academic record" onRetry={refetch} />
            {overview?.state === 'OK' && (
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                  <StatCard title="Cumulative GPA" value={gpa(academic?.gpa)} subtitle="CampusCore" icon={SchoolOutlinedIcon} tone="primary" />
                  <StatCard title="Academic standing" value={academic ? pretty(academic.standing) : '—'} subtitle="CampusCore" icon={TrendingUpRoundedIcon} tone="purple" />
                  <StatCard title="Degree complete" value={degreePercent != null ? `${degreePercent}%` : '—'} subtitle={required ? `${academic?.creditsEarned ?? 0} of ${required} credits` : 'Program credits not published'} icon={SpeedRoundedIcon} tone="success" />
                  <StatCard title="Assignments submitted" value={moodleAssignments ? `${submitted}/${moodleAssignments.length}` : '—'} subtitle={moodleAssignments ? 'Moodle' : 'Moodle not available'} icon={TaskAltRoundedIcon} tone="info" />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 2 }}>
                  <WidgetCard title="GPA trend" subtitle="Term GPA by term, CampusCore published grades" icon={InsightsRoundedIcon}>
                    {gpaTrend.length ? (
                      tables ? (
                        <ChartTable columns={[{ key: 'term', label: 'Term' }, { key: 'termGpa', label: 'Term GPA' }]} rows={gpaTrend.map((row) => ({ ...row, termGpa: gpa(row.termGpa) }))} />
                      ) : (
                        <LineChart ariaLabel="Term GPA by term" data={gpaTrend.map((row) => ({ label: row.term, termGpa: row.termGpa }))} series={[{ key: 'termGpa', label: 'Term GPA' }]} yDomain={[0, 4]} format={gpa} />
                      )
                    ) : (
                      <Typography color="text.secondary">No completed terms with a GPA in CampusCore yet.</Typography>
                    )}
                  </WidgetCard>
                  <WidgetCard title="Grade distribution" subtitle="Letter grades across completed courses" icon={BarChartRoundedIcon} tone="purple">
                    {distribution.length === 0 ? (
                      <Typography color="text.secondary">No published letter grades yet.</Typography>
                    ) : tables ? (
                      <ChartTable columns={[{ key: 'grade', label: 'Grade' }, { key: 'count', label: 'Courses' }]} rows={distribution} />
                    ) : (
                      <BarChart ariaLabel="Number of courses by letter grade" data={distribution.map((row) => ({ label: row.grade, value: row.count, note: `${row.count} course${row.count === 1 ? '' : 's'}` }))} />
                    )}
                  </WidgetCard>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
                  <WidgetCard title="Courses in progress" subtitle="Grades are published by CampusCore at the end of term; coursework scores are in Moodle" icon={StackedBarChartRoundedIcon} tone="success">
                    {inProgress.length === 0 ? (
                      <Typography color="text.secondary">No courses in progress in CampusCore.</Typography>
                    ) : (
                      <ChartTable columns={[{ key: 'courseCode', label: 'Course' }, { key: 'courseTitle', label: 'Title' }, { key: 'credits', label: 'Credits' }]} rows={inProgress} />
                    )}
                  </WidgetCard>
                  <WidgetCard title="Credits per term" subtitle="Current term shown lighter (in progress)" icon={BarChartRoundedIcon} tone="info">
                    {creditsByTerm.length === 0 ? (
                      <Typography color="text.secondary">No terms in CampusCore yet.</Typography>
                    ) : tables ? (
                      <ChartTable columns={[{ key: 'term', label: 'Term' }, { key: 'credits', label: 'Credits' }]} rows={creditsByTerm} />
                    ) : (
                      <BarChart ariaLabel="Credits per term" data={creditsByTerm.map((row) => ({ label: row.term, value: row.credits, muted: row.inProgress, note: row.inProgress ? 'in progress' : 'attempted' }))} />
                    )}
                  </WidgetCard>
                </Box>
              </>
            )}
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default InsightsPage;
