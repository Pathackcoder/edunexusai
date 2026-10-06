import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import { alpha } from '@mui/material/styles';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import { GradeCard } from '../../components/grades/GradeCard';
import { GpaSummaryCard } from '../../components/grades/GpaSummaryCard';
import { WidgetCard } from '../../components/common/WidgetCard';
import { PageHeader } from '../../components/common/PageHeader';
import { Section } from '../../components/common/Section';
import { Button } from '../../components/common/Button';
import { useApiQuery } from '../../hooks/useApiQuery';
import { academicApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

const EMPTY_GRADES = { currentCourses: [], pastTerms: [] };

export const GradesGpaPage = () => {
  // GPA and current-term grades come from the API; prior-term history is read through
  // the integration layer from the student information system.
  const { data, loading, error, refetch } = useApiQuery(() => academicApi.getGrades());
  const gradesSummaryData = data ?? EMPTY_GRADES;
  const coursesData = gradesSummaryData.currentCourses ?? [];
  const [targetGpa, setTargetGpa] = useState('3.90');
  const [calculatedNeeded, setCalculatedNeeded] = useState(null);

  const handleCalculateGpa = (e) => {
    e.preventDefault();
    const target = parseFloat(targetGpa);
    if (isNaN(target) || target < 0 || target > 4.0) {
      alert('Please enter a valid GPA between 0.00 and 4.00');
      return;
    }
    // Simulation formula: (Target * TotalCredits - Current * DoneCredits) / RemainingCredits
    const currentGpa = parseFloat(gradesSummaryData.cumulativeGpa);
    const completed = gradesSummaryData.creditsCompleted;
    const currentTermCredits = 16;
    const required = ((target * (completed + currentTermCredits)) - (currentGpa * completed)) / currentTermCredits;
    setCalculatedNeeded(Math.min(4.0, Math.max(0.0, required)).toFixed(2));
  };

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your grades…"
    >
      {() => (
        <Box>
          <PageHeader
            title="Grades & Academic Standing"
            description="Term performance summary, cumulative GPA analytics, and course grading breakdown."
          />

          <Stack spacing={{ xs: 3, md: 3.5 }}>
            {/* GPA Summary */}
            <GpaSummaryCard gradesData={gradesSummaryData} />

            {/* Target GPA Calculator Widget */}
            <WidgetCard
              title="GPA Target Calculator"
              subtitle="Estimate the term GPA required to hit your target cumulative GPA"
              icon={CalculateOutlinedIcon}
              tone="purple"
            >
              <Box component="form" onSubmit={handleCalculateGpa}>
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'flex-end' }} spacing={1.5}>
                  <TextField
                    label="Target Cumulative GPA"
                    type="number"
                    inputProps={{ step: '0.01', min: '0.0', max: '4.0' }}
                    value={targetGpa}
                    onChange={(e) => setTargetGpa(e.target.value)}
                    sx={{ maxWidth: { sm: 260 } }}
                  />
                  <Button type="submit" variant="primary" sx={{ minHeight: 40 }}>
                    Calculate Needed
                  </Button>

                  {calculatedNeeded !== null && (
                    <Box
                      sx={(theme) => ({
                        px: 1.75,
                        py: 1,
                        borderRadius: 2.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                      })}
                    >
                      <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 600 }}>
                        Required Fall 2026 Term GPA: <strong>{calculatedNeeded}</strong>
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Box>
            </WidgetCard>

            {/* Course Grades Breakdown */}
            <Section title="Current Semester Course Grades (Fall 2026)">
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
                {(gradesSummaryData?.currentCourses || coursesData || []).map((course, idx) => (
                  <GradeCard key={course.courseCode || course.code || course.id || idx} course={course} />
                ))}
              </Box>
            </Section>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default GradesGpaPage;
