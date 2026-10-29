import React, { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CastForEducationOutlinedIcon from '@mui/icons-material/CastForEducationOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '../../context/AuthContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { sisApi } from '../../services/api/sisApi';
import { lmsApi, facultyMoodleApi } from '../../services/api/lmsApi';
import { workflowApi } from '../../services/api/workflowApi';
import { DashboardGrid, GridItem } from '../../components/common/DashboardGrid';
import { WidgetCard } from '../../components/common/WidgetCard';
import { ErrorPanel } from '../../components/common/DataState';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { AnnouncementsFeedBlock } from '../../components/cms/blocks/CmsBlocks';
import { UnlinkedNotices } from './UnlinkedNotices';
import { CONTEXT_TAG, DAY_CODES, isoDate, weekTimetable, nextCommitment, studyingSnapshot, teachingSnapshot, todayCommitments, upcomingItems, weeklyMeetings } from './overviewData';

/**
 * The Overview of a multi-role account. Everything on it is read from the person's own data, per
 * context, through the same endpoints the role views use (the student record for Studying, the
 * faculty record for Teaching, the Moodle view of each role). Items keep their context label, so a
 * class someone teaches and a class they take sit side by side without being merged; no context
 * reads the other's data. Each panel loads, fails and is empty on its own.
 */

const VIEW_META = {
  student: { icon: SchoolOutlinedIcon, tone: 'primary', actions: [['Class schedule', '/academics/schedule'], ['Grades', '/academics/grades'], ['Assignments', '/academics/assignments'], ['Moodle courses', '/academics/lms']] },
  faculty: { icon: CastForEducationOutlinedIcon, tone: 'secondary', actions: [['Teaching schedule', '/faculty/schedule'], ['My courses', '/faculty/courses'], ['Moodle teaching', '/faculty/moodle'], ['Announcements', '/faculty/announcements']] },
  staff: { icon: BadgeOutlinedIcon, tone: 'info', text: 'Staff news, resources and your requests.', actions: [['Campus news', '/campus/news'], ['Resources', '/help/resources'], ['Help & support', '/help']] },
  alumni: { icon: EmojiEventsOutlinedIcon, tone: 'warning', text: 'Alumni news, events, mentoring and giving.', actions: [['Campus news', '/campus/news'], ['Resources', '/help/resources'], ['Academic calendar', '/academics/calendar']] },
  admin: { icon: AdminPanelSettingsOutlinedIcon, tone: 'neutral', text: 'Manage people, integrations and the portal.', actions: [['Users & roles', '/admin/users'], ['Sign-in & role mapping', '/admin/sign-in'], ['Moodle integration', '/admin/integrations/moodle']] },
};

const formatDate = (iso, options = { weekday: 'short', month: 'short', day: 'numeric' }) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, options);
};

const ContextChip = ({ context }) => (context ? <Chip size="small" label={CONTEXT_TAG[context] ?? context} color={context === 'faculty' ? 'secondary' : 'primary'} variant="outlined" sx={{ height: 22, fontWeight: 600 }} /> : null);

const Rows = ({ rows = 3 }) => (
  <Stack spacing={1} role="status" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} variant="rounded" height={44} />)}
  </Stack>
);

const Metric = ({ label, value, hint }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
    <Typography variant="subtitle1" component="div" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{value ?? '—'}</Typography>
    {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
  </Box>
);

/** A record that could not be read is said plainly; it never turns into zeros. */
function SourceNotice({ snapshot, what }) {
  if (!snapshot || snapshot.state === 'OK') return null;
  const text = {
    UNAVAILABLE: `${what} is temporarily unavailable from CampusCore.`,
    UNMAPPED: `Your ${what.toLowerCase()} is not linked yet.`,
    NOT_A_STUDENT: 'No student record is linked to this account.',
  }[snapshot.state] ?? snapshot.message ?? `${what} could not be read.`;
  return <Alert severity="info" variant="outlined" sx={{ py: 0 }}>{text}</Alert>;
}

function TodayCard({ meetings, loading, errors }) {
  const now = new Date();
  const today = todayCommitments(meetings, now);
  const next = today.length ? null : nextCommitment(meetings, now);
  const week = weekTimetable(meetings);
  const todayCode = DAY_CODES[now.getDay()];
  return (
    <WidgetCard title="Today" subtitle={now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} icon={TodayOutlinedIcon} hoverable={false} sx={{ height: '100%' }}>
      {loading ? <Rows rows={2} /> : (
        <Stack spacing={1}>
          {today.map((m) => (
            <Stack key={`${m.context}-${m.code}-${m.start}`} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2.5 }}>
              <Typography variant="subtitle2" sx={{ minWidth: 92, fontVariantNumeric: 'tabular-nums' }}>{m.start}{m.end ? `–${m.end}` : ''}</Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>{m.code}{m.title ? ` · ${m.title}` : ''}</Typography>
                {m.location && <Typography variant="caption" color="text.secondary">{m.location}</Typography>}
              </Box>
              <ContextChip context={m.context} />
            </Stack>
          ))}
          {!today.length && (
            <Typography variant="body2" color="text.secondary">
              No classes to attend or teach today.
              {next && <> Next: <strong>{next.dayName} {next.start}</strong>, {next.code} ({CONTEXT_TAG[next.context]}).</>}
            </Typography>
          )}
          {week.length > 0 && (
            <>
              <Typography variant="overline" color="text.secondary" sx={{ pt: 1 }}>Your week</Typography>
              <Stack spacing={0.75} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {week.map((m) => (
                  <Stack key={`${m.context}-${m.code}-${m.day}-${m.start}`} component="li" direction="row" spacing={1.25} alignItems="center">
                    <Typography variant="caption" sx={{ minWidth: 76, fontWeight: 700, color: m.day === todayCode ? 'primary.main' : 'text.secondary' }}>{m.dayName.slice(0, 3)} {m.start}</Typography>
                    <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{m.code}{m.location ? ` · ${m.location}` : ''}</Typography>
                    <ContextChip context={m.context} />
                  </Stack>
                ))}
              </Stack>
            </>
          )}
          {!loading && meetings.length === 0 && !errors.length && <Typography variant="caption" color="text.secondary">No weekly class meetings are recorded for this term.</Typography>}
          {errors.map((e) => <Alert key={e} severity="warning" variant="outlined" sx={{ py: 0 }}>{e}</Alert>)}
        </Stack>
      )}
    </WidgetCard>
  );
}

function ComingUpCard({ items, loading, error, onRetry }) {
  return (
    <WidgetCard title="Coming up" subtitle="Deadlines and dates for you" icon={EventNoteOutlinedIcon} actionLabel="Calendar" actionTo="/academics/calendar" hoverable={false} sx={{ height: '100%' }}>
      {loading ? <Rows rows={4} /> : error ? <ErrorPanel compact error={error} onRetry={onRetry} /> : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No upcoming deadlines or dates.</Typography>
      ) : (
        <Stack spacing={1} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {items.map((item) => (
            <Stack key={item.id} component="li" direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.1, border: 1, borderColor: item.important ? 'warning.light' : 'divider', borderRadius: 2.5 }}>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 2, bgcolor: 'primary.lighter', color: 'primary.dark', typography: 'caption', fontWeight: 700, whiteSpace: 'nowrap', minWidth: 84, textAlign: 'center' }}>{formatDate(item.date)}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap title={item.title}>{item.title}</Typography>
                <Typography variant="caption" color="text.secondary">{item.source}{item.kind && item.kind !== 'ASSIGNMENT' ? ` · ${String(item.kind).toLowerCase()}` : ''}</Typography>
              </Box>
              <ContextChip context={item.context} />
            </Stack>
          ))}
        </Stack>
      )}
    </WidgetCard>
  );
}

function ContextCard({ view, onOpen, children, loading }) {
  const meta = VIEW_META[view.key] ?? {};
  return (
    <WidgetCard title={view.label} icon={meta.icon} tone={meta.tone} hoverable={false} sx={{ height: '100%' }}
      headerAction={<Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => onOpen(view.key)}>Open</Button>}>
      <Stack spacing={1.5} sx={{ height: '100%' }}>
        {loading ? <Rows rows={2} /> : children ?? <Typography variant="body2" color="text.secondary">{meta.text}</Typography>}
        <Box sx={{ flex: 1 }} />
        <Divider />
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75} aria-label={`${view.label} quick actions`}>
          {(meta.actions ?? []).map(([label, to]) => <Chip key={to} label={label} component={RouterLink} to={to} clickable size="small" variant="outlined" />)}
        </Stack>
      </Stack>
    </WidgetCard>
  );
}

function StudyingBody({ snapshot }) {
  if (!snapshot) return null;
  if (snapshot.state !== 'OK') return <SourceNotice snapshot={snapshot} what="Student record" />;
  return (
    <>
      <Typography variant="body2" color="text.secondary">{snapshot.program ?? 'Program not recorded'}{snapshot.studentNumber ? ` · ${snapshot.studentNumber}` : ''}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1.5 }}>
        <Metric label="Cumulative GPA" value={snapshot.gpa ?? null} hint={snapshot.gpa == null ? 'No graded terms yet' : null} />
        <Metric label="Credits in progress" value={snapshot.creditsInProgress} />
        <Metric label="Credits earned" value={snapshot.creditsEarned} />
        <Metric label="Moodle courses" value={snapshot.moodleCourses} hint={snapshot.moodleCourses == null ? 'Moodle not connected' : null} />
      </Box>
      {snapshot.registrations.length > 0 && (
        <Typography variant="caption" color="text.secondary">Registered: {snapshot.registrations.map((r) => `${r.code}${r.term ? ` (${r.term})` : ''}`).join(', ')}</Typography>
      )}
    </>
  );
}

function TeachingBody({ snapshot }) {
  if (!snapshot) return null;
  if (snapshot.state !== 'OK') return <SourceNotice snapshot={snapshot} what="Faculty record" />;
  return (
    <>
      <Typography variant="body2" color="text.secondary">{snapshot.termName ?? 'Current term'}{snapshot.employeeNumber ? ` · ${snapshot.employeeNumber}` : ''}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1.5 }}>
        <Metric label="Sections" value={snapshot.sections.length} />
        <Metric label="Students enrolled" value={snapshot.enrolled} hint={snapshot.capacity ? `of ${snapshot.capacity} seats` : null} />
        <Metric label="Moodle courses" value={snapshot.moodleCourses ? snapshot.moodleCourses.length : null} hint={snapshot.moodleCourses == null ? 'Moodle not connected' : null} />
      </Box>
      {snapshot.sections.length > 0 && <Typography variant="caption" color="text.secondary">Teaching: {snapshot.sections.map((s) => `${s.code}${s.title ? ` ${s.title}` : ''}`).join(', ')}</Typography>}
    </>
  );
}

function ResourcesCard() {
  const { data, loading, error, refetch } = useApiQuery(() => workflowApi.listResources(), []);
  const items = (data?.resources ?? []).slice(0, 4);
  return (
    <WidgetCard title="Resources" subtitle="For all of your roles" icon={MenuBookOutlinedIcon} actionLabel="All resources" actionTo="/help/resources" hoverable={false} sx={{ height: '100%' }}>
      {loading ? <Rows rows={3} /> : error ? <ErrorPanel compact error={error} onRetry={refetch} /> : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No resources published for you yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {items.map((r) => (
            <Box key={r.id} component={RouterLink} to="/help/resources" sx={{ p: 1.1, border: 1, borderColor: 'divider', borderRadius: 2.5, textDecoration: 'none', color: 'inherit', '&:hover': { borderColor: 'primary.main' } }}>
              <Typography variant="subtitle2" noWrap>{r.title}</Typography>
              <Typography variant="caption" color="text.secondary">{r.category}{r.audience && r.audience !== 'ALL' ? ` · ${String(r.audience).toLowerCase()}` : ''}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </WidgetCard>
  );
}

export function OverviewDashboard({ views, onOpen }) {
  const { user, contexts } = useAuth();
  const name = user?.preferredName || user?.firstName || '';
  const has = (key) => contexts.some((c) => c.key === key);
  const isStudent = has('student');
  const isFaculty = has('faculty');
  const today = isoDate();

  // Each context reads only its own endpoints; a context the account does not have is never requested.
  const student = useApiQuery(() => sisApi.myOverview(), [], { enabled: isStudent });
  const studentMoodle = useApiQuery(() => lmsApi.myMoodleAssignments(), [], { enabled: isStudent });
  const teaching = useApiQuery(() => sisApi.facultyTeaching(), [], { enabled: isFaculty });
  const teachingMoodle = useApiQuery(() => facultyMoodleApi.courses(), [], { enabled: isFaculty });
  const calendar = useApiQuery(() => sisApi.calendar({ from: today }), [today]);

  const meetings = useMemo(() => weeklyMeetings({ studentOverview: student.data, teaching: teaching.data }), [student.data, teaching.data]);
  const upcoming = useMemo(() => upcomingItems({ calendar: calendar.data, studentAssignments: studentMoodle.data?.assignments ?? [], today, limit: 6 }), [calendar.data, studentMoodle.data, today]);
  const studying = useMemo(() => studyingSnapshot(student.data, studentMoodle.data), [student.data, studentMoodle.data]);
  const teachingSnap = useMemo(() => teachingSnapshot(teaching.data, teachingMoodle.data), [teaching.data, teachingMoodle.data]);

  const scheduleErrors = [
    student.error && 'Your class schedule could not be loaded.',
    teaching.error && 'Your teaching schedule could not be loaded.',
  ].filter(Boolean);
  const roleViews = views.filter((view) => view.key !== 'overview');
  const contextViews = roleViews.filter((v) => v.kind !== 'workspace');
  const workspaceViews = roleViews.filter((v) => v.kind === 'workspace');

  return (
    <Stack spacing={{ xs: 2, sm: 2.25 }}>
      <HeroBanner
        dense
        eyebrow="Overview"
        title={`Welcome back${name ? `, ${name}` : ''}`}
        description={`Your day across ${contextViews.map((v) => v.label.toLowerCase()).join(' and ') || 'your roles'} at ${user?.institution ?? 'the university'}. Open a view for its full tools and records.`}
      />

      <UnlinkedNotices />

      <DashboardGrid>
        <GridItem span={{ md: 5 }}>
          <TodayCard meetings={meetings} loading={(isStudent && student.loading) || (isFaculty && teaching.loading)} errors={scheduleErrors} />
        </GridItem>
        <GridItem span={{ md: 7 }}>
          <ComingUpCard items={upcoming} loading={calendar.loading || (isStudent && studentMoodle.loading)} error={calendar.error} onRetry={calendar.refetch} />
        </GridItem>
      </DashboardGrid>

      <Box component="section" aria-label="Your roles">
        <DashboardGrid>
          {contextViews.map((view) => (
            <GridItem key={view.key} span={{ md: contextViews.length === 1 ? 12 : 6 }}>
              {view.key === 'student' ? (
                <ContextCard view={view} onOpen={onOpen} loading={student.loading}>
                  {student.error ? <ErrorPanel compact error={student.error} onRetry={student.refetch} /> : <StudyingBody snapshot={studying} />}
                </ContextCard>
              ) : view.key === 'faculty' ? (
                <ContextCard view={view} onOpen={onOpen} loading={teaching.loading}>
                  {teaching.error ? <ErrorPanel compact error={teaching.error} onRetry={teaching.refetch} /> : <TeachingBody snapshot={teachingSnap} />}
                </ContextCard>
              ) : (
                <ContextCard view={view} onOpen={onOpen} />
              )}
            </GridItem>
          ))}
          {workspaceViews.map((view) => (
            <GridItem key={view.key} span={{ md: 12 }}>
              <ContextCard view={view} onOpen={onOpen} />
            </GridItem>
          ))}
        </DashboardGrid>
      </Box>

      <DashboardGrid>
        <GridItem span={{ md: 7 }}>
          <Box sx={{ width: '100%' }}><AnnouncementsFeedBlock title="Campus news" subtitle="For all of your roles" limit={4} linkLabel="All news" linkUrl="/campus/news" /></Box>
        </GridItem>
        <GridItem span={{ md: 5 }}>
          <ResourcesCard />
        </GridItem>
      </DashboardGrid>
    </Stack>
  );
}

export default OverviewDashboard;
