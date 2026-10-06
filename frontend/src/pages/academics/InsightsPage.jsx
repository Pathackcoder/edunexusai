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
import { LineChart, BarChart, HBarList, ChartTable, SERIES_COLORS } from '../../components/charts/Charts';
import { useApiQuery } from '../../hooks/useApiQuery';
import { planningApi } from '../../services/api';

const gpa = (value) => (value == null ? '—' : Number(value).toFixed(2));

/** Academic analytics drawn from the transcript and current enrollments. */
export const InsightsPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => planningApi.insights());
  const [tables, setTables] = useState(false);
  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Performance Insights" description="Trends in your grades and GPA, how your grades are distributed, and where each current course stands." actions={<FormControlLabel control={<Switch checked={tables} onChange={(e) => setTables(e.target.checked)} />} label="Show data tables" />} />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Analysing your record…">
        {() => (
          <Stack spacing={2.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              <StatCard title="Cumulative GPA" value={gpa(data.summary.cumulativeGpa)} icon={SchoolOutlinedIcon} tone="primary" />
              <StatCard title="Major GPA" value={gpa(data.summary.majorGpa)} icon={TrendingUpRoundedIcon} tone="purple" />
              <StatCard title="Degree complete" value={`${data.summary.degreePercent}%`} icon={SpeedRoundedIcon} tone="success" />
              <StatCard title="Assignments submitted" value={`${data.assignments.submitted}/${data.assignments.total}`} icon={TaskAltRoundedIcon} tone="info" />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 2 }}>
              <WidgetCard title="GPA trend" subtitle="Term GPA vs cumulative GPA, completed terms" icon={InsightsRoundedIcon}>
                {data.gpaTrend.length ? (
                  tables ? (
                    <ChartTable columns={[{ key: 'term', label: 'Term' }, { key: 'termGpa', label: 'Term GPA' }, { key: 'cumulativeGpa', label: 'Cumulative' }]} rows={data.gpaTrend.map((row) => ({ ...row, termGpa: gpa(row.termGpa), cumulativeGpa: gpa(row.cumulativeGpa) }))} />
                  ) : (
                    <LineChart ariaLabel="GPA trend by term" data={data.gpaTrend.map((row) => ({ label: row.term, termGpa: row.termGpa, cumulativeGpa: row.cumulativeGpa }))} series={[{ key: 'termGpa', label: 'Term GPA' }, { key: 'cumulativeGpa', label: 'Cumulative GPA' }]} yDomain={[3, 4]} format={gpa} />
                  )
                ) : (
                  <Typography color="text.secondary">No completed terms on record yet.</Typography>
                )}
              </WidgetCard>
              <WidgetCard title="Grade distribution" subtitle="Letter grades across completed courses" icon={BarChartRoundedIcon} tone="purple">
                {tables ? (
                  <ChartTable columns={[{ key: 'grade', label: 'Grade' }, { key: 'count', label: 'Courses' }]} rows={data.gradeDistribution} />
                ) : (
                  <BarChart ariaLabel="Number of courses by letter grade" data={data.gradeDistribution.map((row) => ({ label: row.grade, value: row.count, note: `${row.count} course${row.count === 1 ? '' : 's'}` }))} />
                )}
              </WidgetCard>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
              <WidgetCard title="Current course performance" subtitle="Percentage to date this term" icon={StackedBarChartRoundedIcon} tone="success">
                {tables ? (
                  <ChartTable columns={[{ key: 'code', label: 'Course' }, { key: 'percentage', label: '%' }, { key: 'letterGrade', label: 'Grade' }]} rows={data.currentCourses} />
                ) : (
                  <HBarList rows={data.currentCourses.map((course) => ({ label: `${course.code} · ${course.name}`, value: course.percentage, suffix: course.letterGrade }))} format={(v) => `${v}%`} color={SERIES_COLORS[1]} />
                )}
              </WidgetCard>
              <WidgetCard title="Credits per term" subtitle="Current term shown lighter (in progress)" icon={BarChartRoundedIcon} tone="info">
                {tables ? (
                  <ChartTable columns={[{ key: 'term', label: 'Term' }, { key: 'credits', label: 'Credits' }]} rows={data.creditsByTerm} />
                ) : (
                  <BarChart ariaLabel="Credits per term" data={data.creditsByTerm.map((row) => ({ label: row.term, value: row.credits, muted: row.inProgress, note: row.inProgress ? 'in progress' : 'earned' }))} />
                )}
              </WidgetCard>
            </Box>
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default InsightsPage;
