import React from 'react';
import { RosterWidget, TeachingScheduleWidget, FollowUpsWidget, FacultyAdvisingWidget, FacultyRequestsWidget } from '../../components/faculty/FacultyWorkspaceWidgets';
import { AdminDocumentsWidget } from '../../components/admin/AdminDocumentsWidget';
import { SortableDashboard, useDashboardLayout } from '../../components/dashboard/SortableDashboard';
import { useToast } from '../../components/common/Toast';
import { useI18n } from '../../i18n';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { DataState } from '../../components/common/DataState';
import { DashboardSkeleton, HeroBanner, heroChipSx } from '../../components/dashboard/HeroBanner';
import Chip from '@mui/material/Chip';

/** Placeholder composition that mirrors the default faculty layout. */
const FACULTY_SKELETON = [
  { kind: 'list', rows: 1 },
  { kind: 'list', rows: 2 },
  { kind: 'list', rows: 2 },
  { kind: 'list', rows: 1 },
  { kind: 'list', rows: 1 },
  { kind: 'list', rows: 3, span: { md: 12, lg: 8 } },
  { kind: 'list', rows: 2 },
];

const InlineEmpty = ({ children }) => (
  <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
    {children}
  </Typography>
);

const rowSx = {
  p: 1.5,
  borderRadius: 2.5,
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.subtle',
};

/**
 * Faculty dashboard.
 *
 * An experience layer over the LMS and SIS, not a replacement for either: the courses a
 * faculty member teaches, how many students are in each, and a route to reach them.
 * Grading and coursework authoring stay in the LMS.
 */
export const FacultyDashboardPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => facultyApi.getDashboard());

  const enabled = (key) => (data?.entitlements ?? []).includes(`faculty.${key}`);
  const courses = data?.courses ?? [];
  const totals = data?.totals ?? { courses: 0, students: 0 };
  const announcements = data?.announcements ?? [];
  const upcoming = data?.upcomingAssignments ?? [];

  const stats = [
    { label: 'Courses taught', value: totals.courses, hint: 'Current term', icon: MenuBookOutlinedIcon, tone: 'primary' },
    { label: 'Students enrolled', value: totals.students, hint: 'Across all sections', icon: GroupsOutlinedIcon, tone: 'purple' },
    { label: 'Announcements posted', value: announcements.length, hint: 'Most recent first', icon: CampaignOutlinedIcon, tone: 'warning' },
    { label: 'Coursework upcoming', value: upcoming.length, hint: 'Due next', icon: EventNoteOutlinedIcon, tone: 'success' },
  ];


  const widgetItems = [
    { key: 'faculty.courses', label: 'My courses', span: { md: 6, lg: 4 }, node: (<WidgetCard
                  variant="featured"
                  title="My courses"
                  subtitle="Select a course to open its roster"
                  icon={MenuBookOutlinedIcon}
                  actionLabel="All courses"
                  actionTo="/faculty/courses"
                >
                  <Stack spacing={1}>
                    {courses.length === 0 && (
                      <InlineEmpty>You are not listed as instructor of record for any course this term.</InlineEmpty>
                    )}
                    {courses.map((course) => (
                      <ButtonBase
                        key={course.id}
                        component={RouterLink}
                        to={`/faculty/courses/${course.id}`}
                        sx={{
                          ...rowSx,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1.5,
                          textAlign: 'left',
                          transition: 'border-color 160ms ease, background-color 160ms ease',
                          '&:hover': { borderColor: 'primary.light', bgcolor: 'background.paper', '& .row-arrow': { transform: 'translateX(2px)' } },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="subtitle2">{course.code}</Typography>
                            <Badge variant="neutral">{course.enrolledCount} enrolled</Badge>
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{course.name}</Typography>
                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5, color: 'text.secondary' }}>
                            <PlaceOutlinedIcon sx={{ fontSize: 14 }} />
                            <Typography variant="caption">{course.room} · {course.time}</Typography>
                          </Stack>
                        </Box>
                        <ArrowForwardRoundedIcon className="row-arrow" sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0, transition: 'transform 160ms ease' }} />
                      </ButtonBase>
                    ))}
                  </Stack>
                </WidgetCard>) },
    { key: 'faculty.announcements', label: 'Recent announcements', span: { md: 6, lg: 4 }, node: (<WidgetCard
                  title="Recent announcements"
                  subtitle="Posted to your sections"
                  icon={CampaignOutlinedIcon}
                  tone="warning"
                  actionLabel="Manage"
                  actionTo="/faculty/announcements"
                >
                  <Stack spacing={1}>
                    {announcements.length === 0 && <InlineEmpty>No announcements posted yet.</InlineEmpty>}
                    {announcements.map((announcement) => (
                      <Box key={announcement.id} sx={rowSx}>
                        <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={0.75}>
                          <Typography variant="subtitle2">{announcement.courseCode ?? 'Institution'}</Typography>
                          {(announcement.tags ?? []).slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="neutral">{tag}</Badge>
                          ))}
                        </Stack>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {announcement.title}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </WidgetCard>) },
    { key: 'faculty.coursework', label: 'Upcoming coursework', span: { md: 6, lg: 4 }, node: (<WidgetCard
                  title="Upcoming coursework"
                  subtitle="Due dates across your sections"
                  icon={AssignmentOutlinedIcon}
                  tone="success"
                >
                  <Stack spacing={1}>
                    {upcoming.length === 0 && <InlineEmpty>Nothing due in your sections.</InlineEmpty>}
                    {upcoming.map((assignment) => (
                      <Stack key={assignment.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1.25} sx={rowSx}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2">{assignment.courseCode}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>{assignment.title}</Typography>
                        </Box>
                        <Box
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 2,
                            bgcolor: 'success.lighter',
                            color: 'success.dark',
                            typography: 'caption',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {new Date(assignment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                </WidgetCard>) },
    { key: 'faculty.roster', label: 'My students & groups', span: { md: 6, lg: 4 }, node: <RosterWidget courses={courses} /> },
    { key: 'faculty.schedule', label: 'Teaching schedule', span: { md: 6, lg: 4 }, node: <TeachingScheduleWidget courses={courses} /> },
    { key: 'faculty.tasks', label: 'Tasks & follow-ups', span: { md: 12, lg: 8 }, node: <FollowUpsWidget courses={courses} /> },
    { key: 'faculty.advising', label: 'Advising appointments', span: { md: 6, lg: 4 }, node: <FacultyAdvisingWidget /> },
    { key: 'faculty.resources', label: 'Teaching resources', span: { md: 12, lg: 8 }, node: <AdminDocumentsWidget faculty /> },
    { key: 'faculty.requests', label: 'My requests', span: { md: 6, lg: 4 }, node: <FacultyRequestsWidget /> },
  ];
  const items = widgetItems.filter((item) => enabled(item.key.replace('faculty.', '')));
  const layout = useDashboardLayout('faculty', data?.layout, items.map((item) => item.key));

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your teaching dashboard…"
      minHeight={400}
      skeleton={<DashboardSkeleton widgets={FACULTY_SKELETON} />}
    >
      {() => (
        <Stack spacing={{ xs: 2, md: 2.25 }}>
          <HeroBanner
            eyebrow="Teaching workspace"
            title={<>Welcome back, </>}
            highlight={user?.firstName ?? ''}
            description={`${user?.title ? `${user.title} · ` : ''}${user?.department ?? ''}`}
            chips={
              layout.isCustomised ? (
                <Chip icon={<RestartAltRoundedIcon />} label={t('Reset layout')} onClick={layout.reset} sx={heroChipSx} />
              ) : null
            }
          >
            {/* Teaching overview (faculty.summary entitlement) */}
            {enabled('summary') && (
              <Box aria-label="Teaching summary" sx={{ mt: 2.25, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
                {stats.map((stat) => (
                  <StatCard key={stat.label} title={stat.label} value={stat.value} subtitle={stat.hint} icon={stat.icon} tone={stat.tone} />
                ))}
              </Box>
            )}
          </HeroBanner>

          <SortableDashboard
            ariaLabel="Teaching dashboard widgets"
            items={items}
            order={layout.order}
            onOrderChange={async (next) => {
              const saved = await layout.persist(next);
              if (!saved) showToast('Layout saved on this device only — the server could not be reached.', 'info');
            }}
          />
        </Stack>
      )}
    </DataState>
  );
};

export default FacultyDashboardPage;
