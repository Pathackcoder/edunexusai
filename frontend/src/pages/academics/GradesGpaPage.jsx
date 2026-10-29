import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import { alpha } from '@mui/material/styles';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { MoodleNotice, MoodleUnavailablePart } from '../../components/lms/MoodleNotice';
import { WidgetCard } from '../../components/common/WidgetCard';
import { PageHeader } from '../../components/common/PageHeader';
import { Section } from '../../components/common/Section';
import { Button } from '../../components/common/Button';
import { useApiQuery } from '../../hooks/useApiQuery';
import { lmsApi, sisApi } from '../../services/api';
import { SisNotice } from '../../components/sis/SisNotice';
import { pretty } from '../../components/sis/sisData';
import { DataState } from '../../components/common/DataState';


/** Released Moodle grades for one course. Ungraded items say so; nothing is shown as zero. */
function MoodleCourseGrades({ entry }) {
  const { course, grades } = entry;
  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
          <Chip size="small" label={course.shortName} />
          {course.localCourse && <Chip size="small" variant="outlined" color="primary" label={`Academic record: ${course.localCourse.code}`} />}
        </Stack>
        <Typography variant="subtitle1" component="h3">{course.fullName}</Typography>
      </Box>
      {grades.available === false ? (
        <MoodleUnavailablePart part={grades} what="Grades" />
      ) : (
        <>
          {grades.items.length === 0 && <Typography variant="body2" color="text.secondary">No graded items have been released yet.</Typography>}
          {grades.items.map((item, i) => (
            <Box key={`${item.name}-${i}`}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                <Typography variant="body2">{item.grade ? `${item.grade}${item.percentage ? ` (${item.percentage})` : ''}` : 'Not graded yet'}</Typography>
              </Stack>
              {item.feedback && <Typography variant="caption" color="text.secondary" component="p">Feedback: {item.feedback}</Typography>}
            </Box>
          ))}
          <Divider />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="subtitle2">Moodle course total</Typography>
            <Typography variant="subtitle2">{grades.courseTotal?.grade ? `${grades.courseTotal.grade}${grades.courseTotal.percentage ? ` (${grades.courseTotal.percentage})` : ''}` : 'Not available yet'}</Typography>
          </Stack>
        </>
      )}
    </Card>
  );
}

export const GradesGpaPage = () => {
  // Official standing and published grades: CampusCore SIS. LMS grades: Moodle. Neither
  // is derived from the other, and nothing local is shown in their place.
  const { data, loading, error, refetch } = useApiQuery(() => sisApi.myOverview());
  const moodle = useApiQuery(() => lmsApi.myMoodleGrades());
  const [targetGpa, setTargetGpa] = useState('3.50');
  const [calculatedNeeded, setCalculatedNeeded] = useState(null);
  const academic = data?.state === 'OK' && data.academic.state === 'OK' ? data.academic.data : null;
  const history = data?.state === 'OK' && data.grades.state === 'OK' ? data.grades.data : null;

  const handleCalculateGpa = (e) => {
    e.preventDefault();
    const target = parseFloat(targetGpa);
    if (Number.isNaN(target) || target < 0 || target > 4.0) {
      alert('Please enter a valid GPA between 0.00 and 4.00');
      return;
    }
    if (!academic || academic.gpa == null || !academic.creditsInProgress) {
      alert('CampusCore has no GPA or in-progress credits to calculate from.');
      return;
    }
    const required = (target * (academic.creditsEarned + academic.creditsInProgress) - academic.gpa * academic.creditsEarned) / academic.creditsInProgress;
    setCalculatedNeeded(Math.min(4.0, Math.max(0.0, required)).toFixed(2));
  };

  return (
    <Box>
      <PageHeader
        title="Grades & Academic Standing"
        description="Official GPA, standing and published grades from CampusCore SIS, and Moodle course grades and feedback."
      />
      <Stack spacing={{ xs: 3, md: 3.5 }}>
        <Section title="Academic Record (CampusCore SIS)">
          <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your academic record…" minHeight={140}>
            {() => (
              <Stack spacing={2}>
                <SisNotice overview={data} section={data?.academic} what="Your academic summary" onRetry={refetch} />
                {academic && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
                    {[
                      ['Cumulative GPA', academic.gpa != null ? academic.gpa.toFixed(2) : 'No GPA yet'],
                      ['Credits earned', academic.creditsEarned],
                      ['Credits in progress', academic.creditsInProgress],
                      ['Standing', `${pretty(academic.standing)} · ${pretty(academic.level)}`],
                    ].map(([label, value]) => (
                      <Card key={label} sx={{ p: 2 }}>
                        <Typography variant="caption">{label}</Typography>
                        <Typography variant="h6" component="p">{value}</Typography>
                      </Card>
                    ))}
                  </Box>
                )}
                {data?.state === 'OK' && <SisNotice section={data.grades} what="Your published grades" />}
                {history && (history.length === 0 ? (
                  <Alert severity="info">No published grades yet.</Alert>
                ) : (
                  <Stack spacing={1.5}>
                    {history.map((term) => (
                      <Card key={term.termCode} sx={{ p: 2 }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                          <Typography variant="subtitle1" component="h3">{term.termName ?? term.termCode}</Typography>
                          <Typography variant="body2">{term.gpa != null ? `Term GPA ${term.gpa.toFixed(2)}` : 'Term GPA not available'}</Typography>
                        </Stack>
                        {term.courses.map((c) => (
                          <Stack key={c.courseCode} direction="row" justifyContent="space-between" spacing={1} sx={{ py: 0.5, borderTop: 1, borderColor: 'divider' }}>
                            <Typography variant="body2"><b>{c.courseCode}</b> {c.courseTitle} <Typography component="span" variant="caption">· {c.credits} cr</Typography></Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.inProgress ? 'In progress' : c.grade ?? '—'}</Typography>
                          </Stack>
                        ))}
                      </Card>
                    ))}
                  </Stack>
                ))}
              </Stack>
            )}
          </DataState>
        </Section>

        {academic && (
          <WidgetCard
            title="GPA Target Calculator"
            subtitle={`From your CampusCore record · ${academic.creditsInProgress} credits in progress`}
            icon={CalculateOutlinedIcon}
            tone="purple"
          >
            <Box component="form" onSubmit={handleCalculateGpa}>
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'flex-end' }} spacing={1.5}>
                <TextField label="Target Cumulative GPA" type="number" inputProps={{ step: '0.01', min: '0.0', max: '4.0' }} value={targetGpa} onChange={(e) => setTargetGpa(e.target.value)} sx={{ maxWidth: { sm: 260 } }} />
                <Button type="submit" variant="primary" sx={{ minHeight: 40 }}>Calculate Needed</Button>
                {calculatedNeeded !== null && (
                  <Box sx={(theme) => ({ px: 1.75, py: 1, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.06), border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}` })}>
                    <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 600 }}>
                      Required term GPA: <strong>{calculatedNeeded}</strong>
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>
          </WidgetCard>
        )}

        <Section title="Moodle Course Grades">
          <Stack spacing={2}>
            {moodle.loading && <Typography variant="body2">Loading grades from Moodle…</Typography>}
            {moodle.error && <Alert severity="error">{moodle.error.message}</Alert>}
            <MoodleNotice data={moodle.data} onRetry={moodle.refetch} />
            {moodle.data?.status === 'CONNECTED' && (moodle.data.courses.length === 0
              ? <Alert severity="info">You are not enrolled in any visible Moodle courses yet.</Alert>
              : (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
                  {moodle.data.courses.map((entry) => <MoodleCourseGrades key={entry.course.moodleCourseId} entry={entry} />)}
                </Box>
              ))}
          </Stack>
        </Section>
      </Stack>
    </Box>
  );
};

export default GradesGpaPage;
