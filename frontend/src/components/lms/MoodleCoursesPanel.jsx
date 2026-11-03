import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { DataState } from '../common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { lmsApi } from '../../services/api';

const fmt = (iso, withTime = false) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) }) : null;

const SUBMISSION_LABEL = { submitted: 'Submitted', draft: 'Draft saved', new: 'Not submitted', nosubmission: 'Not submitted', reopened: 'Reopened' };

/** External link to Moodle. Opening it may ask the student to sign in to Moodle. */
const MoodleLink = ({ href, children = 'Open in Moodle', size = 'sm', variant = 'secondary' }) => (
  <Button variant={variant} size={size} icon={OpenInNewRoundedIcon} component="a" href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </Button>
);

const Unavailable = ({ part }) =>
  part?.reason === 'FUNCTION_NOT_ENABLED' ? (
    <Typography variant="body2" color="text.secondary">Not available yet: your institution has not enabled this in Moodle.</Typography>
  ) : (
    <Typography variant="body2" color="text.secondary">{part?.message ?? 'This information could not be loaded from Moodle.'}</Typography>
  );

function CourseDetail({ courseId }) {
  const { data, loading, error, refetch } = useApiQuery(() => lmsApi.myMoodleCourse(courseId), [courseId]);
  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading from Moodle…">
      {() => (
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>Assignments</Typography>
            {data.assignments.available ? (
              data.assignments.items.length ? (
                <Stack divider={<Divider flexItem />} spacing={1}>
                  {data.assignments.items.map((a) => (
                    <Stack key={a.assignmentId} direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Link href={a.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontWeight: 600 }}>{a.name}</Link>
                        <Typography variant="caption" component="div">{a.dueDate ? `Due ${fmt(a.dueDate, true)}` : 'No due date'}{a.maxGrade ? ` · out of ${a.maxGrade}` : ''}</Typography>
                      </Box>
                      {a.submission ? (
                        <Chip size="small" variant="outlined" color={a.submission.submissionStatus === 'submitted' ? 'success' : 'default'} label={SUBMISSION_LABEL[a.submission.submissionStatus] ?? a.submission.submissionStatus} />
                      ) : data.assignments.submissionsAvailable ? null : (
                        <Typography variant="caption" color="text.secondary">Submission status not available</Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No assignments in this course.</Typography>
              )
            ) : (
              <Unavailable part={data.assignments} />
            )}
          </Box>

          <Box>
            <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>Grades and feedback</Typography>
            {data.grades.available ? (
              data.grades.items.length || data.grades.courseTotal ? (
                <Stack spacing={1}>
                  {data.grades.items.map((g, index) => (
                    <Box key={`${g.name}-${index}`}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{g.name}</Typography>
                        <Typography variant="body2">{g.grade ?? '—'}{g.percentage ? ` (${g.percentage})` : ''}</Typography>
                      </Stack>
                      {g.feedback && <Typography variant="caption" component="p" color="text.secondary">Feedback: {g.feedback}</Typography>}
                    </Box>
                  ))}
                  {data.grades.courseTotal && (
                    <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="subtitle2">Course total</Typography>
                      <Typography variant="subtitle2">{data.grades.courseTotal.grade ?? '—'}{data.grades.courseTotal.percentage ? ` (${data.grades.courseTotal.percentage})` : ''}</Typography>
                    </Stack>
                  )}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No released grades yet.</Typography>
              )
            ) : (
              <Unavailable part={data.grades} />
            )}
          </Box>

          <Box>
            <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>Course content</Typography>
            {data.sections.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No content is visible yet.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {data.sections.map((section) => (
                  <Box key={section.sectionId}>
                    <Typography variant="subtitle2">{section.name}</Typography>
                    {section.activities.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">Nothing in this section yet.</Typography>
                    ) : (
                      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                        {section.activities.map((activity) => (
                          <Box component="li" key={activity.cmid} sx={{ typography: 'body2', py: 0.25 }}>
                            {activity.url ? (
                              <Link href={activity.url} target="_blank" rel="noopener noreferrer" underline="hover">{activity.name}</Link>
                            ) : (
                              activity.name
                            )}
                            <Typography variant="caption" color="text.secondary" component="span"> · {activity.typeLabel}</Typography>
                            {activity.restricted && (
                              <Typography variant="caption" color="text.secondary" component="span"> · may have access conditions in Moodle</Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
          <Box>
            <MoodleLink href={data.course.courseUrl} variant="primary">Open course in Moodle</MoodleLink>
          </Box>
        </Stack>
      )}
    </DataState>
  );
}

/**
 * The student's Moodle courses. Everything comes from the API, which resolves the
 * student's own Moodle account on the server; each state (not linked, suspended,
 * Moodle down) is stated plainly instead of showing placeholder courses.
 */
export const MoodleCoursesPanel = () => {
  const { data, loading, error, refetch } = useApiQuery(() => lmsApi.myMoodleCourses());
  const [openCourse, setOpenCourse] = useState(null);

  return (
    <Card sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: 'warning.lighter', color: 'warning.dark', display: 'grid', placeItems: 'center' }}>
          <SchoolOutlinedIcon />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2">Moodle courses</Typography>
          <Typography variant="caption">Course pages open in Moodle in a new tab. You may need to sign in to Moodle.</Typography>
        </Box>
      </Stack>

      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Checking Moodle…" minHeight={120}>
        {() => {
          if (data.status === 'NOT_CONFIGURED') {
            return <Alert severity="info">Your institution has not connected Moodle to the portal yet, so there are no LMS courses to show.</Alert>;
          }
          if (data.status === 'NOT_LINKED') {
            return (
              <Alert severity="info" action={<MoodleLink href={data.site.loginUrl} size="sm">Moodle sign-in</MoodleLink>}>
                Your Moodle account has not been linked to the portal yet. Your institution’s administrator links it; until then you can still use Moodle directly.
              </Alert>
            );
          }
          if (data.status === 'SUSPENDED') {
            return <Alert severity="warning" icon={<LockOutlinedIcon />}>Your Moodle account is currently suspended. Contact your institution’s help desk.</Alert>;
          }
          if (data.status === 'UNAVAILABLE') {
            return (
              <Alert severity="warning" action={<Button variant="ghost" size="sm" onClick={refetch}>Try again</Button>}>
                {data.message}
              </Alert>
            );
          }
          if (!data.courses.length) {
            return <Alert severity="info" icon={<SchoolOutlinedIcon />}>Moodle reports no visible courses for your account yet. Courses appear here as soon as you are enrolled in Moodle.</Alert>;
          }
          return (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
              {data.courses.map((course) => (
                <Card key={course.moodleCourseId} variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
                      <Chip size="small" label={course.shortName} />
                      {course.idNumber && course.idNumber !== course.shortName && <Chip size="small" variant="outlined" label={course.idNumber} />}
                      {course.localCourse && <Chip size="small" color="primary" variant="outlined" label={`Academic record: ${course.localCourse.code}`} />}
                    </Stack>
                    <Typography variant="subtitle1" component="h3" sx={{ lineHeight: 1.3 }}>{course.fullName}</Typography>
                    {(course.startDate || course.endDate) && (
                      <Typography variant="caption">{[fmt(course.startDate), fmt(course.endDate)].filter(Boolean).join(' – ')}</Typography>
                    )}
                  </Box>
                  {course.summary && <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{course.summary}</Typography>}
                  {course.progress !== null && (
                    <Box>
                      <Typography variant="caption">Moodle progress {course.progress}%</Typography>
                      <LinearProgress variant="determinate" value={course.progress} sx={{ height: 6, borderRadius: 3 }} />
                    </Box>
                  )}
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 'auto' }}>
                    <Button variant="outline" size="sm" icon={ListAltRoundedIcon} onClick={() => setOpenCourse(course)}>Activities &amp; grades</Button>
                    <MoodleLink href={course.courseUrl} />
                  </Stack>
                </Card>
              ))}
            </Box>
          );
        }}
      </DataState>

      <Modal isOpen={Boolean(openCourse)} onClose={() => setOpenCourse(null)} title={openCourse?.fullName ?? ''} subtitle="From Moodle" maxWidth="720px">
        {openCourse && <CourseDetail courseId={openCourse.moodleCourseId} />}
      </Modal>
    </Card>
  );
};

export default MoodleCoursesPanel;
