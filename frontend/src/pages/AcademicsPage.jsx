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
import { academicApi } from '../services/api';
import { DataState } from '../components/common/DataState';
import { useAuth } from '../context/AuthContext';

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
export const AcademicsPage = () => {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApiQuery(() =>
    Promise.all([
      academicApi.getSchedule(),
      academicApi.getAssignments(),
      academicApi.getGrades(),
      academicApi.getAnnouncements(),
      academicApi.getCalendar(),
    ]).then(([schedule, assignments, grades, announcements, calendar]) => ({
      schedule,
      assignments,
      grades,
      announcements,
      calendar,
    })),
  );

  const coursesData = data?.schedule?.allCourses ?? [];
  const assignmentsData = data?.assignments ?? [];
  const gradesSummaryData = data?.grades ?? EMPTY_GRADES;
  const initialAnnouncementsData = data?.announcements ?? [];
  const academicCalendarEvents = data?.calendar ?? [];

  const todayClasses = data?.schedule?.courses ?? [];
  const pendingAssignments = assignmentsData.filter((a) => a.status !== 'Completed').slice(0, 2);
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
                value={user?.currentTerm ?? '—'}
                valueSx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                subtitle={user?.degree ?? user?.department ?? ''}
                icon={SchoolOutlinedIcon}
              />
              <StatCard
                title="Cumulative GPA"
                value={<Box component="span" sx={{ color: 'success.main' }}>{gradesSummaryData.cumulativeGpa}</Box>}
                subtitle="Academic Standing: Good"
                icon={InsightsOutlinedIcon}
                tone="success"
              />
              <StatCard
                title="Enrolled Credits"
                value="16 Credits"
                valueSx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                subtitle="4 Active Lecture Courses"
                icon={LibraryBooksOutlinedIcon}
                tone="purple"
              />
              <StatCard
                title="Degree Progress"
                value={<Box component="span" sx={{ color: 'primary.main' }}>102 / 120</Box>}
                subtitle="85% Degree Requirement Met"
                icon={FlagOutlinedIcon}
                tone="info"
              />
            </Box>

            {/* Six academic cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 2, md: 2.5 } }}>
              {/* 1. Today's Classes */}
              <WidgetCard
                title="Today's Classes"
                subtitle="Monday schedule"
                icon={CalendarMonthOutlinedIcon}
                actionLabel="Timetable"
                actionTo="/academics/schedule"
              >
                <Stack spacing={1}>
                  {todayClasses.map(cls => (
                    <ItemRow key={cls.id}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{cls.code}</Typography>
                        <Typography variant="body2" fontWeight={600} noWrap>{cls.name}</Typography>
                        <Typography variant="caption" component="p" noWrap>{cls.room} • {cls.instructor}</Typography>
                      </Box>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0, color: 'text.secondary' }}>
                        <ScheduleRoundedIcon sx={{ fontSize: 15, color: 'grey.400' }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{cls.time}</Typography>
                      </Stack>
                    </ItemRow>
                  ))}
                </Stack>
              </WidgetCard>

              {/* 2. Upcoming Assignments */}
              <WidgetCard
                title="Upcoming Assignments"
                subtitle="Due within 7 days"
                icon={AssignmentOutlinedIcon}
                tone="info"
                actionLabel="View all"
                actionTo="/academics/assignments"
              >
                <Stack spacing={1}>
                  {pendingAssignments.map(asg => (
                    <ItemRow key={asg.id}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{asg.courseCode}</Typography>
                        <Typography variant="body2" fontWeight={600} noWrap>{asg.title}</Typography>
                        <Typography variant="caption" component="p">Due: {asg.dueDate} ({asg.points} pts)</Typography>
                      </Box>
                      <Badge variant={asg.urgency === 'due-soon' ? 'warning' : 'neutral'}>
                        {asg.urgency === 'due-soon' ? 'Due Soon' : asg.status}
                      </Badge>
                    </ItemRow>
                  ))}
                </Stack>
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

              {/* 6. Canvas LMS Quick Access */}
              <WidgetCard
                title="Canvas Learning Management"
                subtitle="Course modules & discussions"
                icon={LayersOutlinedIcon}
                tone="danger"
                actionLabel="Open"
                actionTo="/academics/lms"
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={1.5}
                  sx={{ p: 1.75, borderRadius: 2.5, bgcolor: 'error.lighter', border: 1, borderColor: 'rgba(208, 58, 58, 0.18)' }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ color: 'error.dark' }}>Canvas LMS Active Session</Typography>
                    <Typography variant="caption" sx={{ color: 'error.dark', opacity: 0.85 }}>
                      Single Sign-On Connected • 4 Enrolled Courses
                    </Typography>
                  </Box>
                  <Button
                    component={RouterLink}
                    to="/academics/lms"
                    variant="contained"
                    color="error"
                    size="small"
                    endIcon={<OpenInNewRoundedIcon />}
                    sx={{ flexShrink: 0 }}
                  >
                    Launch LMS
                  </Button>
                </Stack>
              </WidgetCard>
            </Box>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default AcademicsPage;
