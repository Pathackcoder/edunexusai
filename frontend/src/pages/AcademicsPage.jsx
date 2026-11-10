import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { Badge } from '../components/common/Badge';
import { WidgetCard } from '../components/common/WidgetCard';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { useApiQuery } from '../hooks/useApiQuery';
import { academicApi, lmsApi, sisApi } from '../services/api';
import { SisNotice } from '../components/sis/SisNotice';
import { todaysClasses as sisTodaysClasses, toCalendarEvents, pretty } from '../components/sis/sisData';
import { MoodleNotice } from '../components/lms/MoodleNotice';
import { DataState } from '../components/common/DataState';

const EMPTY_GRADES = { currentCourses: [], pastTerms: [] };

/** Compact bordered row used inside the overview cards. */
const ItemRow = ({ children, sx }) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="space-between"
    spacing={1.5}
    sx={{ px: 1.5, py: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle', ...sx }}
  >
    {children}
  </Stack>
);

/**
 * Academic overview. Five domains in one screen, so it issues the five reads in
 * parallel and shows one loading state over the lot.
 */
const MOODLE_STATUS_TEXT = {
  NOT_CONFIGURED: 'Moodle is not connected for your institution yet.',
  NOT_LINKED: 'Your Moodle account is not linked to the portal yet.',
  SUSPENDED: 'Your Moodle account is suspended.',
  UNAVAILABLE: 'Moodle is not responding right now.',
};

/** Moodle quick access: the count and state come from Moodle via the API, or say so plainly. */
function MoodleQuickAccess() {
  const { data, loading, error } = useApiQuery(() => lmsApi.myMoodleCourses());
  const count = data?.courses?.length ?? 0;
  const text = loading
    ? 'Checking Moodle…'
    : error
      ? 'Moodle status could not be loaded.'
      : MOODLE_STATUS_TEXT[data?.status] ?? (count ? `${count} Moodle course${count === 1 ? '' : 's'}` : 'No Moodle courses yet');
  return (
    <WidgetCard title="Moodle LMS" subtitle="Course sites, activities and LMS grades" icon={LayersOutlinedIcon} tone="warning" actionLabel="Open" actionTo="/academics/lms">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ p: 1.75, borderRadius: 2.5, bgcolor: 'warning.lighter', border: 1, borderColor: 'divider' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700}>{text}</Typography>
          <Typography variant="caption">Live from Moodle · you may need to sign in to Moodle</Typography>
        </Box>
        <Button component={RouterLink} to="/academics/lms" variant="contained" size="small" endIcon={<OpenInNewRoundedIcon />} sx={{ flexShrink: 0 }}>
          LMS courses
        </Button>
      </Stack>
    </WidgetCard>
  );
}

export const AcademicsPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() =>
    Promise.all([
      academicApi.getAnnouncements(),
      sisApi.calendar().catch(() => []),
    ]).then(([announcements, calendar]) => ({ announcements, calendar: toCalendarEvents(calendar) })),
  );
  // Official academic data: CampusCore SIS, resolved from the signed-in user's verified link.
  const sis = useApiQuery(() => sisApi.myOverview());
  const academic = sis.data?.state === 'OK' && sis.data.academic.state === 'OK' ? sis.data.academic.data : null;
  const sisSchedule = sis.data?.state === 'OK' && sis.data.schedule.state === 'OK' ? sis.data.schedule.data : null;
  const sisProfile = sis.data?.state === 'OK' && sis.data.profile.state === 'OK' ? sis.data.profile.data : null;
  const todayClasses = sisTodaysClasses(sisSchedule?.items ?? [], new Date(), sis.data?.timezone ?? undefined);
  // Courses and coursework are Moodle's: read live, never from local records.
  const moodleCourses = useApiQuery(() => lmsApi.myMoodleCourses());
  const moodleWork = useApiQuery(() => lmsApi.myMoodleAssignments());
  const moodleCourseCount = moodleCourses.data?.status === 'CONNECTED' ? moodleCourses.data.courses.length : null;
  const initialAnnouncementsData = data?.announcements ?? [];
  const academicCalendarEvents = data?.calendar ?? [];

  const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const pendingAssignments = (moodleWork.data?.assignments ?? [])
    .filter((a) => ['NOT_SUBMITTED', 'DRAFT'].includes(a.state) && a.dueDate && new Date(a.dueDate).getTime() < weekAhead)
    .slice(0, 3);

  const latestAnnouncement = initialAnnouncementsData[0];
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = academicCalendarEvents.filter((e) => e.date >= today).slice(0, 2);

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your academic overview…"
      minHeight={400}
    >
      {() => (
        <Box>
          <PageHeader
            title="Academic Overview"
            description="Current semester summary, immediate coursework priorities, and quick access to academic services."
          />

          <Stack spacing={{ xs: 3, md: 3.5 }}>
            {/* Overview KPI Strip */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, sm: 2 } }}>
              <StatCard
                title="Current Semester"
                value={sisSchedule?.term?.name ?? '—'}
                valueSx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                subtitle={sisProfile?.program?.name ?? (sis.data?.state === 'UNMAPPED' ? 'Not linked to CampusCore' : sis.loading ? '' : 'CampusCore')}
                icon={SchoolOutlinedIcon}
              />
              <StatCard
                title="Cumulative GPA"
                value={<Box component="span" sx={{ color: 'success.main' }}>{academic?.gpa != null ? academic.gpa.toFixed(2) : '—'}</Box>}
                subtitle={academic ? `CampusCore · ${pretty(academic.standing)}` : sis.data?.state === 'UNMAPPED' ? 'Not linked to CampusCore' : 'CampusCore unavailable'}
                icon={InsightsOutlinedIcon}
                tone="success"
              />
              <StatCard
                title="Moodle Courses"
                value={moodleCourseCount ?? '—'}
                valueSx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                subtitle={moodleCourseCount === null ? 'Moodle not available' : 'Live Moodle enrolment'}
                icon={LibraryBooksOutlinedIcon}
                tone="purple"
              />
              <StatCard
                title="Credits Earned"
                value={<Box component="span" sx={{ color: 'primary.main' }}>{academic ? academic.creditsEarned : '—'}</Box>}
                subtitle={academic ? `${academic.creditsInProgress} in progress · CampusCore` : 'From CampusCore SIS'}
                icon={FlagOutlinedIcon}
                tone="info"
              />
            </Box>

            {/* Six academic cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 2, md: 2.5 } }}>
              {/* 1. Classes: no verified timetable source yet */}
              <WidgetCard
                title="Today's Classes"
                subtitle={sisSchedule ? `${sisSchedule.term.name} · CampusCore` : 'CampusCore SIS'}
                icon={CalendarMonthOutlinedIcon}
                actionLabel="Schedule"
                actionTo="/academics/schedule"
              >
                {sis.loading ? (
                  <Typography variant="caption">Loading from CampusCore…</Typography>
                ) : !sisSchedule ? (
                  <SisNotice overview={sis.data} section={sis.data?.schedule} what="Your schedule" onRetry={sis.refetch} />
                ) : todayClasses.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No classes today.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {todayClasses.map((cls) => (
                      <ItemRow key={cls.id}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{cls.code}</Typography>
                          <Typography variant="body2" fontWeight={600} noWrap>{cls.name}</Typography>
                          <Typography variant="caption" component="p" noWrap>{[cls.room, cls.instructor].filter(Boolean).join(' • ')}</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{cls.time}</Typography>
                      </ItemRow>
                    ))}
                  </Stack>
                )}
              </WidgetCard>

              {/* 2. Upcoming Moodle assignments */}
              <WidgetCard
                title="Upcoming Assignments"
                subtitle="Moodle · due within 7 days"
                icon={AssignmentOutlinedIcon}
                tone="info"
                actionLabel="View all"
                actionTo="/academics/assignments"
              >
                {moodleWork.loading ? (
                  <Typography variant="caption">Loading from Moodle…</Typography>
                ) : moodleWork.data?.status !== 'CONNECTED' ? (
                  <MoodleNotice data={moodleWork.data} onRetry={moodleWork.refetch} />
                ) : pendingAssignments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Nothing due in the next 7 days.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {pendingAssignments.map((asg) => (
                      <ItemRow key={asg.assignmentId}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{asg.course?.shortName}</Typography>
                          <Typography variant="body2" fontWeight={600} noWrap>{asg.name}</Typography>
                          <Typography variant="caption" component="p">Due {new Date(asg.dueDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Typography>
                        </Box>
                        <Badge variant={asg.overdue ? 'danger' : 'warning'}>{asg.overdue ? 'Overdue' : 'Due soon'}</Badge>
                      </ItemRow>
                    ))}
                  </Stack>
                )}
              </WidgetCard>

              {/* 3. Latest Academic Announcement */}
              <WidgetCard
                title="Latest Academic Notice"
                subtitle="From faculty & instructors"
                icon={CampaignOutlinedIcon}
                tone="warning"
                actionLabel="All"
                actionTo="/academics/announcements"
              >
                {latestAnnouncement ? (
                  <Box sx={{ p: 1.75, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{latestAnnouncement.courseCode}</Typography>
                      <Typography variant="caption">{latestAnnouncement.date}</Typography>
                    </Stack>
                    <Typography variant="subtitle2" component="h4" sx={{ mt: 0.5 }}>{latestAnnouncement.title}</Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 0.5, color: 'text.secondary' }}>
                      {latestAnnouncement.summary}
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="caption">No announcements available.</Typography>
                )}
              </WidgetCard>

              {/* 4. Upcoming Academic Event */}
              <WidgetCard
                title="Academic Calendar Milestones"
                subtitle="Key institutional dates"
                icon={EventNoteOutlinedIcon}
                tone="purple"
                actionLabel="Calendar"
                actionTo="/academics/calendar"
              >
                <Stack spacing={1}>
                  {upcomingEvents.map(ev => (
                    <ItemRow key={ev.id}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{ev.title}</Typography>
                        <Typography variant="caption">{ev.date}</Typography>
                      </Box>
                      <Badge variant={ev.category === 'holiday' ? 'success' : 'warning'}>{ev.category}</Badge>
                    </ItemRow>
                  ))}
                </Stack>
              </WidgetCard>

              {/* 5. Transcript Quick Access */}
              <WidgetCard
                title="Transcript & Academic Record"
                subtitle="Official & unofficial records"
                icon={DescriptionOutlinedIcon}
                tone="success"
                actionLabel="Transcripts"
                actionTo="/academics/transcripts"
              >
                <Typography variant="body2" color="text.secondary">
                  Need an official transcript for graduate applications or employer verification? Fast electronic PDF delivery available within 24 hours.
                </Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mt: 2 }}>
                  <Button component={RouterLink} to="/academics/transcripts" variant="contained" size="small">
                    Request Official Transcript
                  </Button>
                  <Button component={RouterLink} to="/academics/transcripts" variant="outlined" color="inherit" size="small">
                    View Unofficial Record
                  </Button>
                </Stack>
              </WidgetCard>

              {/* 6. Moodle LMS quick access (live Moodle status, never local course counts) */}
              <MoodleQuickAccess />
            </Box>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default AcademicsPage;
