import React, { useEffect, useState } from 'react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import { WidgetCard } from '../../components/common/WidgetCard';
import { PageHeader } from '../../components/common/PageHeader';
import { Section } from '../../components/common/Section';
import { DataState } from '../../components/common/DataState';
import { MoodleNotice } from '../../components/lms/MoodleNotice';
import { useApiQuery } from '../../hooks/useApiQuery';
import { lmsApi, sisApi } from '../../services/api';
import { TimetableGrid } from '../../components/schedule/TimetableGrid';
import { SisNotice } from '../../components/sis/SisNotice';
import { toTimetableCourses, pretty } from '../../components/sis/sisData';

const when = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Course Schedule. Courses are the student's Moodle enrolments (the same canonical course
 * identity used everywhere else). Moodle does not hold class meeting times or rooms, and
 * the institutional timetable (SIS) is not integrated yet, so no timetable is invented
 * from local records. Deadlines are real Moodle due dates.
 */
const LMS_TEXT = {
  ENROLLED: 'You are enrolled in its Moodle course.',
  TO_ENROL: 'Moodle enrolment pending: the registrar or portal administrator adds you.',
  NEEDS_MOODLE_ACCOUNT: 'Has a Moodle course; your Moodle account is not linked yet.',
  MOODLE_ACCOUNT_SUSPENDED: 'Has a Moodle course; your Moodle account is suspended.',
  WAITLISTED: 'Moodle access follows once you are registered (waitlisted).',
  NO_MOODLE_COURSE: 'This class has no Moodle course.',
  MOODLE_COURSE_MISSING: 'Its Moodle course is no longer available.',
};

/** The LMS side of one registered class: its Moodle course, or an explicit "none". */
function MoodleForClass({ lms, loading }) {
  if (loading || !lms) return null;
  return (
    <Box sx={{ mt: 'auto', pt: 1, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="caption" component="div" color={lms.status === 'ENROLLED' ? 'success.main' : 'text.secondary'}>
        Moodle: {lms.moodleCourse ? `${lms.moodleCourse.shortName} · ` : ''}{LMS_TEXT[lms.status] ?? lms.status}
      </Typography>
      {lms.status === 'ENROLLED' && lms.moodleCourse?.url && (
        <Link href={lms.moodleCourse.url} target="_blank" rel="noopener noreferrer" variant="caption">Open in Moodle</Link>
      )}
    </Box>
  );
}

export const CourseSchedulePage = () => {
  const courses = useApiQuery(() => lmsApi.myMoodleCourses());
  // CampusCore owns the timetable: the student's registered sections and their meeting times.
  // The term defaults to the current one; if the student has no classes there but is registered
  // for another live term (usually the next one), that term is shown instead.
  const [termId, setTermId] = useState(null);
  const sis = useApiQuery(() => sisApi.myOverview(termId ?? undefined), [termId]);
  const schedule = sis.data?.state === 'OK' && sis.data.schedule.state === 'OK' ? sis.data.schedule.data : null;
  const terms = sis.data?.terms ?? [];
  const classTermIds = sis.data?.classTermIds ?? [];
  useEffect(() => {
    if (termId || !schedule || schedule.items.length || !classTermIds.length) return;
    if (!classTermIds.includes(schedule.term.source.id)) setTermId(classTermIds[0]);
  }, [termId, schedule, classTermIds]);
  const termOptions = terms.filter((t) => classTermIds.includes(t.id) || t.isCurrent || t.id === schedule?.term.source.id);
  const shownTerm = terms.find((t) => t.id === schedule?.term.source.id);
  const unscheduled = (schedule?.items ?? []).filter((c) => !(c.meetings ?? []).length);
  const work = useApiQuery(() => lmsApi.myMoodleAssignments());
  // Which Moodle course (if any) delivers each registered class. CampusCore owns the
  // registration; Moodle owns the course site; the mapping says which is which.
  const alignment = useApiQuery(() => lmsApi.mySisClasses());
  const lmsBySection = new Map((alignment.data?.classes ?? []).map((c) => [c.sisSectionId, c]));
  const upcoming = (work.data?.assignments ?? [])
    .filter((a) => a.dueDate && new Date(a.dueDate).getTime() > Date.now() - 24 * 60 * 60 * 1000)
    .slice(0, 10);

  return (
    <Box>
      <PageHeader title="Course Schedule" description="Your official class schedule from CampusCore SIS, with your Moodle course sites and deadlines." />
      <Stack spacing={{ xs: 3, md: 3.5 }}>
        <WidgetCard
          title="Class timetable"
          subtitle={schedule ? `${schedule.term.name}${shownTerm && !shownTerm.isCurrent ? ' (upcoming)' : ''} · CampusCore SIS` : 'CampusCore SIS'}
          icon={CalendarMonthOutlinedIcon}
          headerAction={termOptions.length > 1 ? (
            <TextField select size="small" label="Term" value={schedule?.term.source.id ?? ''} onChange={(e) => setTermId(e.target.value)} sx={{ minWidth: 180 }}>
              {termOptions.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}{t.isCurrent ? ' (current)' : ''}{t.registered ? ` · ${t.registered} class${t.registered === 1 ? '' : 'es'}` : ''}</MenuItem>)}
            </TextField>
          ) : null}
        >
          {sis.loading ? (
            <Typography variant="body2">Loading your schedule from CampusCore…</Typography>
          ) : sis.error ? (
            <Alert severity="error">{sis.error.message}</Alert>
          ) : schedule ? (
            schedule.items.length ? (
              <Stack spacing={1.5}>
                {shownTerm && !shownTerm.isCurrent && <Alert severity="info">Showing your registered classes for {shownTerm.name}{shownTerm.startDate ? `, which starts ${new Date(shownTerm.startDate).toLocaleDateString()}` : ''}.</Alert>}
                <TimetableGrid courses={toTimetableCourses(schedule.items)} showToday={Boolean(shownTerm?.isCurrent)} />
                {unscheduled.length > 0 && <Alert severity="warning">Meeting times are not yet scheduled in CampusCore for: {unscheduled.map((c) => `${c.courseCode}-${c.sectionCode}`).join(', ')}.</Alert>}
              </Stack>
            ) : <Alert severity="info">You have no classes registered for {schedule.term.name}.</Alert>
          ) : (
            <SisNotice overview={sis.data} section={sis.data?.schedule} what="Your schedule" onRetry={sis.refetch} />
          )}
        </WidgetCard>

        {schedule?.items.length > 0 && (
          <Section title="Registered Classes (CampusCore SIS)">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
              {schedule.items.map((c) => (
                <Card key={c.source.id} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    <Chip size="small" label={`${c.courseCode}-${c.sectionCode}`} />
                    <Chip size="small" variant="outlined" color={c.enrollment?.status === 'enrolled' ? 'success' : 'warning'} label={pretty(c.enrollment?.status)} />
                  </Stack>
                  <Typography variant="subtitle1" component="h3">{c.courseTitle}</Typography>
                  <Typography variant="caption">{c.credits} credits · {c.instructors.join(', ') || 'Instructor not listed'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.meetings.length ? c.meetings.map((m) => `${m.day} ${m.start}–${m.end}${m.location ? ` (${m.location})` : ''}`).join(' · ') : 'No scheduled meetings'}
                  </Typography>
                  <MoodleForClass lms={lmsBySection.get(c.source.id)} loading={alignment.loading} />
                </Card>
              ))}
            </Box>
          </Section>
        )}

        <Section title="Your Courses (Moodle enrolment)">
          <DataState loading={courses.loading} error={courses.error} onRetry={courses.refetch} loadingLabel="Loading your Moodle courses…" minHeight={120}>
            {() => (
              <Stack spacing={1.5}>
                <MoodleNotice data={courses.data} onRetry={courses.refetch} />
                {courses.data?.status === 'CONNECTED' && (
                  <>
                    <Typography variant="caption" color="text.secondary">
                      Moodle enrolment, not official SIS registration (the SIS is not integrated yet).
                    </Typography>
                    {courses.data.courses.length === 0 ? (
                      <Alert severity="info">You are not enrolled in any visible Moodle courses yet.</Alert>
                    ) : (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
                        {courses.data.courses.map((c) => (
                          <Card key={c.moodleCourseId} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                              <Chip size="small" label={c.shortName} />
                              {c.localCourse && <Chip size="small" variant="outlined" color="primary" label={`Academic record: ${c.localCourse.code}`} />}
                            </Stack>
                            <Typography variant="subtitle1" component="h3">{c.fullName}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[c.startDate && new Date(c.startDate).toLocaleDateString(), c.endDate && new Date(c.endDate).toLocaleDateString()].filter(Boolean).join(' – ') || 'No course dates in Moodle'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">Meeting times: not provided by Moodle</Typography>
                            <Link href={c.courseUrl} target="_blank" rel="noopener noreferrer" underline="hover" variant="body2">Open in Moodle</Link>
                          </Card>
                        ))}
                      </Box>
                    )}
                  </>
                )}
              </Stack>
            )}
          </DataState>
        </Section>

        <WidgetCard title="Upcoming Moodle deadlines" subtitle="Assignment due dates from Moodle" icon={EventNoteOutlinedIcon} actionLabel="All assignments" actionTo="/academics/assignments">
          {work.loading ? (
            <Typography variant="body2">Loading…</Typography>
          ) : work.error ? (
            <Alert severity="error">{work.error.message}</Alert>
          ) : work.data?.status !== 'CONNECTED' ? (
            <MoodleNotice data={work.data} onRetry={work.refetch} />
          ) : upcoming.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No upcoming deadlines in your Moodle courses.</Typography>
          ) : (
            <Stack spacing={1}>
              {upcoming.map((a) => (
                <Stack key={a.assignmentId} direction="row" justifyContent="space-between" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.name}</Typography>
                    <Typography variant="caption">{a.course?.shortName}</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ flexShrink: 0 }}>{when(a.dueDate)}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
          <Typography variant="caption" component="p" sx={{ mt: 1 }}>
            <Link component={RouterLink} to="/academics/lms">LMS courses</Link> has content and grades for each course.
          </Typography>
        </WidgetCard>
      </Stack>
    </Box>
  );
};

export default CourseSchedulePage;
