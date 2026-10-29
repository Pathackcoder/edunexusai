import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import MuiButton from '@mui/material/Button';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { MoodleUnavailablePart } from '../../components/lms/MoodleNotice';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyMoodleApi } from '../../services/api';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const SUBMISSION = { submitted: 'Submitted', draft: 'Draft', new: 'Not submitted', reopened: 'Reopened' };

/** One student's grade + feedback editor; saves to Moodle, then the table re-reads Moodle. */
function GradeRow({ row, assignment, canSave, onSave }) {
  const [grade, setGrade] = useState(row.grade ?? '');
  const [feedback, setFeedback] = useState(row.feedback ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setGrade(row.grade ?? '');
    setFeedback(row.feedback ?? '');
  }, [row.grade, row.feedback]);
  const value = grade === '' ? null : Number(grade);
  const invalid = value !== null && (!Number.isFinite(value) || value < 0 || (assignment.maxGrade && value > assignment.maxGrade));
  const changed = value !== row.grade || (feedback || null) !== (row.feedback || null);
  return (
    <TableRow hover>
      <TableCell>
        <Typography variant="subtitle2">{row.localIdentity ? row.fullName : row.fullName}</Typography>
        <Typography variant="caption">{row.localIdentity ? 'Linked to EduNexusAI' : 'Moodle only'} · Moodle user {row.moodleUserId}</Typography>
      </TableCell>
      <TableCell>
        {row.submission ? (
          <>
            <Typography variant="body2">{SUBMISSION[row.submission.status] ?? row.submission.status}</Typography>
            <Typography variant="caption">{row.submission.submittedAt ? when(row.submission.submittedAt) : ''}</Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">No submission</Typography>
        )}
      </TableCell>
      <TableCell sx={{ minWidth: 120 }}>
        <TextField
          size="small"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          error={invalid}
          disabled={!canSave || !assignment.maxGrade}
          placeholder="—"
          helperText={assignment.maxGrade ? `of ${assignment.maxGrade}` : 'Grade in Moodle'}
          inputProps={{ inputMode: 'decimal', 'aria-label': `Grade for ${row.fullName}` }}
        />
      </TableCell>
      <TableCell sx={{ minWidth: 240 }}>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={4}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={!canSave || !assignment.feedbackCommentsEnabled}
          placeholder={assignment.feedbackCommentsEnabled ? 'Written feedback' : 'Feedback comments are off for this assignment'}
          inputProps={{ 'aria-label': `Feedback for ${row.fullName}` }}
        />
      </TableCell>
      <TableCell align="right">
        <Button
          size="sm"
          variant="primary"
          loading={busy}
          disabled={!canSave || invalid || value === null || !changed}
          onClick={async () => {
            setBusy(true);
            await onSave(row, { grade: value, feedback: assignment.feedbackCommentsEnabled ? feedback : undefined });
            setBusy(false);
          }}
        >
          Save to Moodle
        </Button>
        {row.releasedToStudent !== null && row.grade !== null && (
          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>{row.releasedToStudent ? 'Visible to student' : 'Not yet visible to student'}</Typography>
        )}
      </TableCell>
    </TableRow>
  );
}

function AssignmentGrading({ courseId, assignmentId }) {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => facultyMoodleApi.submissions(courseId, assignmentId), [courseId, assignmentId]);
  const save = async (row, body) => {
    try {
      const result = await facultyMoodleApi.saveGrade(courseId, assignmentId, row.moodleUserId, body);
      showToast(result.result?.verified ? `Saved in Moodle and confirmed for ${row.fullName}.` : `Saved in Moodle for ${row.fullName}.`);
    } catch (e) {
      showToast(e.message ?? 'Moodle did not save the grade.', 'error', 7000);
    }
    await refetch();
  };
  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading submissions from Moodle…" minHeight={120}>
      {() => (
        <Stack spacing={1.5}>
          <MoodleUnavailablePart part={data.capabilities.submissions} what="Submissions" />
          <MoodleUnavailablePart part={data.capabilities.storedGrades} what="Stored grades" />
          <MoodleUnavailablePart part={data.capabilities.saveGrade} what="Saving grades" />
          {data.students.length === 0 ? (
            <Alert severity="info">No students are enrolled in this Moodle course.</Alert>
          ) : (
            <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={`Submissions for ${data.assignment.name}`}>
                <TableHead>
                  <TableRow>
                    <TableCell>Student</TableCell>
                    <TableCell>Submission</TableCell>
                    <TableCell>Grade</TableCell>
                    <TableCell>Feedback</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.students.map((row) => (
                    <GradeRow key={row.moodleUserId} row={row} assignment={data.assignment} canSave={data.capabilities.saveGrade.available} onSave={save} />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      )}
    </DataState>
  );
}

function CourseDetail({ courseId }) {
  const { data, loading, error, refetch } = useApiQuery(() => facultyMoodleApi.course(courseId), [courseId]);
  const [assignmentId, setAssignmentId] = useState(null);
  useEffect(() => setAssignmentId(null), [courseId]);
  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading the course from Moodle…">
      {() => {
        const selected = data.assignments.find((a) => a.assignmentId === assignmentId);
        return (
          <Stack spacing={2}>
            <Card sx={{ p: 2.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
                <Box>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
                    <Chip size="small" label={data.course.shortName} />
                    {data.course.roles.map((r) => <Chip key={r} size="small" variant="outlined" label={r === 'editingteacher' ? 'Teacher' : 'Non-editing teacher'} />)}
                    {data.course.localCourse && <Chip size="small" color="primary" variant="outlined" label={`Academic record: ${data.course.localCourse.code}`} />}
                  </Stack>
                  <Typography variant="h6" component="h2">{data.course.fullName}</Typography>
                  <Typography variant="caption">{data.students.length} student(s) enrolled in Moodle</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="flex-start" useFlexGap flexWrap="wrap">
                  <Button size="sm" variant="secondary" icon={AddRoundedIcon} component="a" href={data.course.addAssignmentUrl} target="_blank" rel="noopener noreferrer">Add assignment in Moodle</Button>
                  <Button size="sm" variant="ghost" icon={OpenInNewRoundedIcon} component="a" href={data.course.courseUrl} target="_blank" rel="noopener noreferrer">Open course</Button>
                </Stack>
              </Stack>
              <Typography variant="caption" component="p" sx={{ mt: 1 }}>
                Create assignments in Moodle (sign in with your Moodle account): Moodle&apos;s web services offer no function that creates an assignment with its instructions, due date and submission settings, so EduNexusAI does not pretend to. New assignments appear here automatically (use Refresh).
                Grades you save here are written to Moodle&apos;s gradebook. They are LMS grades; final course grades are submitted separately in CampusCore.
              </Typography>
            </Card>

            <MoodleUnavailablePart part={data.assignmentsAvailable} what="Assignments" />
            {data.assignmentsAvailable.available !== false && (
              data.assignments.length === 0 ? (
                <Alert severity="info" action={<MuiButton size="small" onClick={refetch}>Refresh</MuiButton>}>This Moodle course has no assignments yet.</Alert>
              ) : (
                <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
                  <Table size="small" aria-label="Moodle assignments">
                    <TableHead>
                      <TableRow>
                        <TableCell>Assignment</TableCell>
                        <TableCell>Due</TableCell>
                        <TableCell>Submission</TableCell>
                        <TableCell>Visibility</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.assignments.map((a) => (
                        <TableRow key={a.assignmentId} hover selected={a.assignmentId === assignmentId}>
                          <TableCell>
                            <Typography variant="subtitle2">{a.name}</Typography>
                            <Typography variant="caption">{a.maxGrade ? `Out of ${a.maxGrade}` : 'Scale / no numeric grade'}</Typography>
                          </TableCell>
                          <TableCell>{when(a.dueDate)}</TableCell>
                          <TableCell>{a.submissionTypes.length ? a.submissionTypes.map((t) => (t === 'FILE' ? `File${a.maxFiles ? ` (max ${a.maxFiles})` : ''}` : 'Online text')).join(', ') : 'No online submission'}</TableCell>
                          <TableCell><Chip size="small" variant="outlined" color={a.visibleToStudents ? 'success' : 'default'} label={a.visibleToStudents ? 'Visible' : 'Hidden'} /></TableCell>
                          <TableCell align="right">
                            <MuiButton size="small" onClick={() => setAssignmentId(a.assignmentId)}>Submissions &amp; grading</MuiButton>
                            <MuiButton size="small" href={a.url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRoundedIcon fontSize="small" />}>Moodle</MuiButton>
                            {a.editUrl && <MuiButton size="small" href={a.editUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRoundedIcon fontSize="small" />}>Edit in Moodle</MuiButton>}
                            {a.graderUrl && <MuiButton size="small" href={a.graderUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRoundedIcon fontSize="small" />}>Moodle grader</MuiButton>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )
            )}

            {selected && (
              <Box>
                <Typography variant="h6" component="h3" sx={{ mb: 1 }}>{selected.name}: submissions &amp; grading</Typography>
                <AssignmentGrading courseId={courseId} assignmentId={selected.assignmentId} />
              </Box>
            )}
          </Stack>
        );
      }}
    </DataState>
  );
}

/**
 * Faculty view of Moodle teaching. Courses are the ones where the faculty member's linked
 * Moodle account holds a teaching role, checked live on every request by the API. Grades
 * and feedback are saved in Moodle and read back; nothing is stored or simulated locally.
 */
export const FacultyMoodlePage = () => {
  const [params, setParams] = useSearchParams();
  const { data, loading, error, refetch } = useApiQuery(() => facultyMoodleApi.courses());
  const courses = data?.courses ?? [];
  const courseId = Number(params.get('course')) || courses[0]?.moodleCourseId || null;

  return (
    <Box>
      <PageHeader eyebrow="Teaching" title="Moodle Teaching" description="Your Moodle courses, assignments, student submissions and grading, read from and saved to Moodle." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your Moodle courses…">
        {() => (
          <Stack spacing={2}>
            {data.status === 'NOT_LINKED' && <Alert severity="info">Your Moodle account is not linked to EduNexusAI yet. An administrator can link or provision it.</Alert>}
            {data.status === 'SUSPENDED' && <Alert severity="warning">Your Moodle account is suspended.</Alert>}
            {data.status === 'UNAVAILABLE' && <Alert severity="warning" action={<MuiButton size="small" onClick={refetch}>Try again</MuiButton>}>{data.message}</Alert>}
            {data.status === 'CONNECTED' && courses.length === 0 && <Alert severity="info">You do not hold a teaching role in any Moodle course.</Alert>}
            {courses.length > 0 && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {courses.map((c) => (
                  <Chip
                    key={c.moodleCourseId}
                    label={`${c.shortName} · ${c.fullName}`}
                    color={c.moodleCourseId === courseId ? 'primary' : 'default'}
                    variant={c.moodleCourseId === courseId ? 'filled' : 'outlined'}
                    onClick={() => setParams({ course: String(c.moodleCourseId) })}
                  />
                ))}
              </Stack>
            )}
            {courseId && <CourseDetail courseId={courseId} />}
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default FacultyMoodlePage;
