import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import ButtonBase from '@mui/material/ButtonBase';
import MuiButton from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LocalLibraryOutlinedIcon from '@mui/icons-material/LocalLibraryOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useNotifications } from '../../context/NotificationContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { dashboardApi, academicApi, lmsApi, sisApi } from '../../services/api';
import { SisNotice } from '../../components/sis/SisNotice';
import { pretty, todaysClasses as sisTodaysClasses } from '../../components/sis/sisData';
import { MoodleNotice } from '../../components/lms/MoodleNotice';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { MetricLabel, CardFootnote } from '../../components/common/Section';
import { SortableDashboard, useDashboardLayout } from '../../components/dashboard/SortableDashboard';
import { applyCmsLayout, useCmsDashboardLayout } from '../../components/cms/dashboardLayout';
import { DashboardSkeleton, HeroBanner, heroChipSx } from '../../components/dashboard/HeroBanner';
import { buildAdvancedItems } from '../../components/dashboard/StudentAdvancedWidgets';
import { useI18n } from '../../i18n';
import { SubmitModal } from '../../components/assignments/SubmitModal';
import { AnnouncementModal } from '../../components/announcements/AnnouncementModal';
import { PaymentModal } from '../../components/finance/PaymentModal';
import { useToast } from '../../components/common/Toast';
import { FitList, Spotlight, WidgetEmpty } from '../../components/common/FitList';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { NotificationTicker } from '../../components/dashboard/NotificationTicker';
import { CampusHeroIllustration } from '../../assets/illustrations/CampusHeroIllustration';
import { DataState, ErrorPanel, StaleDataNotice } from '../../components/common/DataState';

const ACCENTS = ['primary.main', 'secondary.main', 'info.main'];

/** Placeholder composition that mirrors the default student layout. */
const STUDENT_SKELETON = [
  { kind: 'list', rows: 1 },
  { kind: 'ring' },
  { kind: 'metric' },
  { kind: 'list', rows: 2, span: { md: 12, lg: 8 }, size: 'large' },
  { kind: 'metric' },
  { kind: 'list', rows: 2 },
  { kind: 'list', rows: 2 },
]

/** Label / value row used by the aid and library breakdowns. */
const BreakdownRow = ({ color = 'primary.main', label, value, divider = false }) => (
  <Stack direction="row" alignItems="center" spacing={1.25} sx={{ py: 1, ...(divider && { borderTop: 1, borderColor: 'divider' }) }}>
    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
    <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {value}
    </Typography>
  </Stack>
);

/**
 * The student dashboard.
 *
 * Data comes from GET /api/v1/dashboard, which returns only the widgets this student's
 * tier entitles them to, each panel loaded independently so one failure does not blank
 * the page. Panel keys, handlers and modals are unchanged; this file only presents them.
 */
export const StudentDashboard = () => {
  const { user } = useAuth();
  const { financeData, makePayment, resetFinanceBalance } = useFinance();
  const { notifications, markAsRead } = useNotifications();
  const { showToast } = useToast();
  const { t } = useI18n();

  // The student context's own dashboard: the same payload a student always got, and the right
  // one for a person who also teaches (GET /dashboard answers with a single persona).
  const { data, loading, error, refetch, setData } = useApiQuery(() => dashboardApi.getStudent());

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const panels = data?.panels ?? {};
  const panel = (key) => panels[key];
  const has = (key) => Boolean(panels[key]);
  const payload = (key) => panels[key]?.data ?? null;

  const schedule = payload('dashboard.schedule');
  const grades = payload('dashboard.progress');
  const moodleWork = useApiQuery(() => lmsApi.myMoodleAssignments());
  const announcements = payload('dashboard.announcements') ?? [];
  const aid = payload('dashboard.financial_aid');
  const library = payload('dashboard.library');
  const calendar = payload('dashboard.calendar') ?? [];

  // Default widget order = the order the entitlement service returns; the user's saved
  // drag-and-drop order (dashboard_layouts) is applied on top.
  // A published CMS layout (Studio → Dashboards → Student) may reorder, retitle or hide the
  // widgets this student already has and add content cards; without one nothing changes.
  const cmsLayout = useCmsDashboardLayout('student');
  const availableKeys = applyCmsLayout((data?.widgets ?? []).filter((key) => has(key)).map((key) => ({ key })), cmsLayout).map((item) => item.key);
  const layout = useDashboardLayout('student', data?.layout, availableKeys);

  // Class times come from CampusCore SIS (the official schedule), never from local records.
  const sisOverview = useApiQuery(() => sisApi.myOverview());
  const sisSchedule = sisOverview.data?.state === 'OK' && sisOverview.data.schedule.state === 'OK' ? sisOverview.data.schedule.data : null;
  const TIMETABLE_CONNECTED = Boolean(sisSchedule);
  const todayClasses = sisTodaysClasses(sisSchedule?.items ?? []);
  // Classes registered for a later term (registration usually happens for the next term).
  const upcomingTerm = (sisOverview.data?.terms ?? []).find((t) => !t.isCurrent && t.registered > 0 && (sisOverview.data?.classTermIds ?? []).includes(t.id)) ?? null;
  // Coursework is Moodle's: the widget reads live Moodle assignments, not local records.
  const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const pendingAssignments = (moodleWork.data?.assignments ?? [])
    .filter((a) => ['NOT_SUBMITTED', 'DRAFT'].includes(a.state) && a.dueDate && new Date(a.dueDate).getTime() < weekAhead)
    .map((a) => ({
      id: a.assignmentId,
      courseCode: a.course?.shortName,
      title: a.name,
      formattedDueDate: new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dueTime: new Date(a.dueDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      urgency: a.overdue ? 'overdue' : 'due-soon',
      url: a.url,
    }));
  const submittedCount = (moodleWork.data?.assignments ?? []).filter((a) => ['SUBMITTED', 'GRADED', 'GRADED_NOT_RELEASED'].includes(a.state)).length;
  // Academic momentum is CampusCore's academic record (dashboard.progress = sis.academicSnapshot).
  const sisAcademic = grades?.state === 'OK' ? grades : null;
  const sisProgram = sisOverview.data?.state === 'OK' && sisOverview.data.profile.state === 'OK' ? sisOverview.data.profile.data.program : null;
  const completedCredits = sisAcademic?.creditsEarned ?? 0;
  const totalCredits = sisAcademic?.requiredCredits ?? 0;
  const creditsPercent = totalCredits
    ? Math.min(100, Math.round((completedCredits / totalCredits) * 100))
    : 0;
  const nextClass = todayClasses[0];

  /** Marking an announcement read is a server write; reflect it locally straight away. */
  const handleAnnouncementRead = async (id) => {
    setData((current) => {
      if (!current?.panels?.['dashboard.announcements']) return current;
      const next = structuredClone(current);
      next.panels['dashboard.announcements'].data = next.panels['dashboard.announcements'].data.map(
        (item) => (item.id === id ? { ...item, isRead: true } : item),
      );
      return next;
    });
    try {
      await academicApi.markAnnouncementRead(id);
      showToast('Announcement marked as read');
    } catch {
      showToast('Could not mark the announcement as read');
      refetch();
    }
  };

  const handleAssignmentSubmit = async (id) => {
    try {
      await academicApi.submitAssignment(id, {});
      showToast('Assignment submitted successfully!');
      refetch();
    } catch (caught) {
      showToast(caught?.message ?? 'Submission failed');
    }
  };

  const handlePaymentSuccess = async (amount, method) => {
    const result = await makePayment(amount, method);
    showToast(`Payment of $${Number(amount).toFixed(2)} processed successfully!`);
    refetch();
    return result;
  };

  /** A panel the backend reported as failed shows its own error, inside its card. */
  const panelBody = (key, render) => {
    const current = panel(key);
    if (current?.status === 'error') {
      return <ErrorPanel error={current.error} onRetry={refetch} compact />;
    }
    return render();
  };
  const advancedItems = buildAdvancedItems({ payload, panelBody });

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your dashboard…"
      minHeight={420}
      skeleton={<DashboardSkeleton widgets={STUDENT_SKELETON} />}
    >
      {() => (
        <Stack spacing={{ xs: 2, md: 2.25 }}>
          {/* Compact notification bar: shown only when there are notifications */}
          <NotificationTicker />
          {/* Welcome banner */}
          <HeroBanner
            eyebrow={sisSchedule?.term?.name ?? 'Current term'}
            title={<>Good Morning, </>}
            highlight={`${data?.greetingName || user?.firstName || ''}`}
            description="Here’s what matters today — from your next class to the moments that keep campus moving."
            chips={
              <>
                <Chip
                  icon={
                    <Box
                      component="span"
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: todayClasses.length > 0 ? '#34D399' : 'rgba(255,255,255,0.4)',
                        boxShadow: todayClasses.length > 0 ? '0 0 0 3px rgba(52, 211, 153, 0.25)' : 'none',
                      }}
                    />
                  }
                  label={!TIMETABLE_CONNECTED ? 'Schedule not linked' : todayClasses.length > 0 ? 'On campus today' : 'No classes today'}
                  sx={{ ...heroChipSx, '& .MuiChip-icon': { ml: 1.25 } }}
                />
                {(sisProgram || data?.tier) && (
                  <Chip
                    icon={<SchoolOutlinedIcon />}
                    label={[sisProgram?.name, data?.tier ? `${data.tier.name} experience` : null].filter(Boolean).join(' · ')}
                    sx={{ ...heroChipSx, maxWidth: '100%' }}
                  />
                )}
                {layout.isCustomised && (
                  <Chip icon={<RestartAltRoundedIcon />} label={t('Reset layout')} onClick={layout.reset} sx={heroChipSx} />
                )}
              </>
            }
            aside={
              <Box sx={{ display: { xs: 'none', sm: 'block' }, width: { sm: 240, lg: 264 }, my: { md: -2 }, filter: 'drop-shadow(0 20px 30px rgba(10, 6, 50, 0.45))' }}>
                <CampusHeroIllustration style={{ width: '100%', height: 'auto', display: 'block' }} />
              </Box>
            }
          />

          <SortableDashboard
            ariaLabel="Dashboard widgets"
            order={layout.order}
            onOrderChange={async (next) => {
              const saved = await layout.persist(next);
              if (!saved) showToast('Layout saved on this device only — the server could not be reached.', 'info');
            }}
            items={applyCmsLayout([
            { key: 'dashboard.schedule', label: "Today's schedule", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  title="Today’s schedule"
                  subtitle={TIMETABLE_CONNECTED ? `${sisSchedule.term.name}${todayClasses.length ? ` · ${todayClasses.length} ${todayClasses.length === 1 ? 'class' : 'classes'} today` : ''} · CampusCore` : 'CampusCore SIS'}
                  icon={CalendarMonthOutlinedIcon}
                  actionLabel="Full schedule"
                  actionTo="/academics/schedule"
                >
                  {panelBody('dashboard.schedule', () => (
                    <>
                      {!TIMETABLE_CONNECTED && !sisOverview.loading && <SisNotice overview={sisOverview.data} section={sisOverview.data?.schedule} what="Your schedule" onRetry={sisOverview.refetch} />}
                      {TIMETABLE_CONNECTED && todayClasses.length === 0 && (
                        <WidgetEmpty icon={CalendarMonthOutlinedIcon} tone="primary" title={sisSchedule.items.length ? 'No classes today' : `No classes in ${sisSchedule.term.name}`}>
                          {sisSchedule.items.length
                            ? 'Your timetable for the rest of the week is on the full schedule.'
                            : upcomingTerm
                              ? `You are registered for ${upcomingTerm.registered} class${upcomingTerm.registered === 1 ? '' : 'es'} in ${upcomingTerm.name}. See the full schedule.`
                              : 'You have no registered classes this term.'}
                        </WidgetEmpty>
                      )}
                      <FitList
                        items={todayClasses}
                        max={4}
                        gap={0}
                        moreTo="/academics/schedule"
                        moreLabel="more today"
                        getKey={(course, index) => course.id || index}
                        sx={{ pb: 1 }}
                        renderSpotlight={(course) => (
                          <Spotlight
                            tone="primary"
                            eyebrow={`${course.code || course.courseCode} · ${schedule?.dayName ?? 'Today'}`}
                            title={course.name || course.courseName}
                            aside={<Badge variant="primary">{course.time}</Badge>}
                            meta={[
                              course.room && { icon: PlaceOutlinedIcon, label: course.room },
                              course.instructor && { icon: PersonOutlineRoundedIcon, label: course.instructor },
                            ]}
                          />
                        )}
                        renderItem={(course, index) => (
                          <Stack direction="row" spacing={1.75} sx={{ position: 'relative', pb: index === todayClasses.length - 1 ? 0 : 2 }}>
                            <Stack alignItems="center" sx={{ pt: 0.5 }}>
                              <Box
                                sx={(theme) => ({
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  bgcolor: ACCENTS[index % ACCENTS.length],
                                  boxShadow: `0 0 0 4px ${theme.palette.background.paper}, 0 0 0 5px ${theme.palette.divider}`,
                                  flexShrink: 0,
                                })}
                              />
                              {index < todayClasses.length - 1 && <Box sx={{ flex: 1, width: 2, bgcolor: 'divider', mt: 1 }} />}
                            </Stack>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                                <Typography variant="overline" sx={{ color: ACCENTS[index % ACCENTS.length], lineHeight: 1.6 }}>
                                  {course.code || course.courseCode}
                                </Typography>
                                <Typography variant="caption" component="time" sx={{ color: 'text.primary', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {course.time}
                                </Typography>
                              </Stack>
                              <Typography variant="subtitle1" component="h3" sx={{ lineHeight: 1.35 }}>
                                {course.name || course.courseName}
                              </Typography>
                              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25, color: 'text.secondary' }}>
                                <PlaceOutlinedIcon sx={{ fontSize: 15 }} />
                                <Typography variant="caption">
                                  {course.room} · {course.instructor}
                                </Typography>
                              </Stack>
                            </Box>
                          </Stack>
                        )}
                      />
                      {nextClass && (
                        <CardFootnote icon={ScheduleRoundedIcon}>
                          Next up:{' '}
                          <strong>
                            {nextClass.code} at {String(nextClass.time ?? '').split('-')[0].trim()}
                          </strong>
                        </CardFootnote>
                      )}
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.progress', label: "Academic momentum", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  variant="featured"
                  title="Academic momentum"
                  subtitle={sisAcademic ? 'CampusCore academic record' : 'CampusCore SIS'}
                  icon={SchoolOutlinedIcon}
                  tone="purple"
                  actionLabel="Grades"
                  actionTo="/academics/grades"
                >
                  {panelBody('dashboard.progress', () => (
                    !sisAcademic ? (
                      <SisNotice overview={grades ?? { state: 'UNAVAILABLE' }} what="Your academic record" onRetry={refetch} />
                    ) : (
                    <>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <MetricLabel>Cumulative GPA</MetricLabel>
                          <Typography variant="metric" component="strong" sx={{ display: 'block', color: 'secondary.main', fontSize: '2.125rem', mt: 0.5 }}>
                            {sisAcademic.cumulativeGpa != null ? Number(sisAcademic.cumulativeGpa).toFixed(2) : '—'}
                          </Typography>
                        </Box>
                      </Stack>
                      <Box sx={{ mt: 'auto', pt: 2, mb: 2 }}>
                        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                          <Typography variant="caption">Degree progress</Typography>
                          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            {totalCredits ? `${completedCredits} / ${totalCredits} credits` : `${completedCredits} credits earned`}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={creditsPercent}
                          color="secondary"
                          sx={(theme) => ({ bgcolor: alpha(theme.palette.secondary.main, 0.14) })}
                        />
                      </Box>
                      <CardFootnote icon={TaskAltRoundedIcon}>{sisAcademic.standing ? pretty(sisAcademic.standing) : 'Standing unavailable'}</CardFootnote>
                    </>
                    )
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.tuition', label: "Tuition & accounts", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  title="Tuition & accounts"
                  subtitle={financeData.term || ''}
                  icon={CreditCardOutlinedIcon}
                  tone="warning"
                  actionLabel="Finance hub"
                  actionTo="/finance/tuition"
                >
                  {panelBody('dashboard.tuition', () => (
                    <>
                      <MetricLabel>Outstanding balance</MetricLabel>
                      <Typography
                        variant="metric"
                        component="strong"
                        sx={{ display: 'block', mt: 0.5, fontSize: { xs: '1.875rem', md: '2rem' }, color: financeData.currentBalance > 0 ? 'text.primary' : 'success.main' }}
                      >
                        {financeData.formattedBalance}
                      </Typography>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 1.25 }}>
                        <Typography variant="body2" color="text.secondary">
                          Due {financeData.dueDate ?? '—'}
                        </Typography>
                        <Badge variant={financeData.currentBalance > 0 ? 'warning' : 'success'}>
                          {financeData.currentBalance > 0 ? 'Payment due' : 'Settled'}
                        </Badge>
                      </Stack>
                      {financeData.transactions?.[0] && (
                        <Typography variant="caption" component="p" sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider', borderStyle: 'dashed', borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
                          Latest payment:{' '}
                          <Box component="strong" sx={{ color: 'text.primary', fontWeight: 600 }}>
                            {financeData.transactions[0].date} · ${Number(financeData.transactions[0].amount).toFixed(2)}
                          </Box>
                        </Typography>
                      )}
                      <Box sx={{ mt: 'auto', pt: 2 }}>
                        {financeData.currentBalance > 0 ? (
                          <Button size="md" fullWidth onClick={() => setIsPaymentModalOpen(true)}>
                            Pay balance
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="md"
                            fullWidth
                            icon={RestartAltRoundedIcon}
                            onClick={async () => {
                              const reset = await resetFinanceBalance();
                              showToast(`Demo balance reset to ${reset.formattedBalance}`);
                            }}
                          >
                            Reset demo balance
                          </Button>
                        )}
                      </Box>
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.assignments', label: "Upcoming assignments", span: { md: 12, lg: 8 }, size: 'large', node: (
<WidgetCard
                  title="Upcoming assignments"
                  subtitle={`Moodle · next seven days · ${submittedCount} submitted`}
                  icon={AssignmentOutlinedIcon}
                  tone="info"
                  actionLabel="All assignments"
                  actionTo="/academics/assignments"
                >
                  {panelBody('dashboard.assignments', () => (
                    <>
                      {moodleWork.data && moodleWork.data.status !== 'CONNECTED' && <MoodleNotice data={moodleWork.data} onRetry={moodleWork.refetch} />}
                      {moodleWork.data?.status === 'CONNECTED' && pendingAssignments.length === 0 && (
                        <WidgetEmpty icon={AssignmentOutlinedIcon} tone="info" title="You're all caught up">
                          Nothing in your Moodle courses is due in the next seven days.
                        </WidgetEmpty>
                      )}
                      <FitList
                        items={pendingAssignments}
                        max={6}
                        columns={{ xs: 1, sm: 2 }}
                        moreTo="/academics/assignments"
                        moreLabel="more due"
                        renderItem={(assignment, index) => (
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1.5}
                            sx={{
                              p: 1.25,
                              pl: 1.5,
                              borderRadius: 2.5,
                              border: 1,
                              borderColor: 'divider',
                              bgcolor: 'background.subtle',
                            }}
                          >
                            <Box sx={{ width: 4, alignSelf: 'stretch', borderRadius: 2, bgcolor: ACCENTS[index % ACCENTS.length], flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="overline" sx={{ color: ACCENTS[index % ACCENTS.length], lineHeight: 1.5 }}>
                                {assignment.courseCode}
                              </Typography>
                              <Typography variant="subtitle2" component="h3">
                                {assignment.title}
                              </Typography>
                              <Typography variant="caption" component="p">
                                Due {assignment.formattedDueDate} · {assignment.dueTime}
                              </Typography>
                            </Box>
                            <Stack alignItems="flex-end" spacing={0.75} sx={{ flexShrink: 0 }}>
                              <Badge variant={assignment.urgency === 'overdue' ? 'danger' : 'warning'}>
                                {assignment.urgency === 'overdue' ? 'Overdue' : 'Due soon'}
                              </Badge>
                              <Button variant="outline" size="sm" component="a" href={assignment.url} target="_blank" rel="noopener noreferrer">
                                Submit in Moodle
                              </Button>
                            </Stack>
                          </Stack>
                        )}
                      />
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.financial_aid', label: "Financial aid", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  title="Financial aid"
                  subtitle={aid?.awardYear ? `Award package ${aid.awardYear}` : 'Award package'}
                  icon={SavingsOutlinedIcon}
                  tone="success"
                  actionLabel="Aid details"
                  actionTo="/finance/financial-aid"
                >
                  {panelBody('dashboard.financial_aid', () => (
                    <>
                      <StaleDataNotice meta={aid?.meta} />
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <MetricLabel>Total awarded</MetricLabel>
                          <Typography variant="metric" component="strong" sx={{ display: 'block', mt: 0.5, color: 'success.main', fontSize: { xs: '1.75rem', md: '1.875rem' } }}>
                            {aid?.formattedTotalAid ?? '—'}
                          </Typography>
                        </Box>
                        {aid?.status && <Badge variant="success">{aid.status}</Badge>}
                      </Stack>
                      {(aid?.awards ?? []).length === 0 && (
                        <WidgetEmpty
                          icon={SavingsOutlinedIcon}
                          tone="success"
                          title="No awards in this package yet"
                          action={<MuiButton size="small" component={RouterLink} to="/finance/financial-aid">Explore financial aid</MuiButton>}
                        />
                      )}
                      <FitList
                        items={aid?.awards ?? []}
                        max={4}
                        gap={0}
                        moreTo="/finance/financial-aid"
                        moreLabel="more awards"
                        sx={{ mt: 1.25, mb: 1.5 }}
                        renderItem={(award, index) => (
                          <BreakdownRow
                            divider={index > 0}
                            color={['success.main', 'primary.main', 'secondary.main'][index % 3]}
                            label={award.name}
                            value={award.formattedAmount}
                          />
                        )}
                      />
                      {aid?.disbursements?.length > 0 && (
                        <CardFootnote icon={EventNoteOutlinedIcon}>
                          Next disbursement · {aid.disbursements[aid.disbursements.length - 1].date}
                        </CardFootnote>
                      )}
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.announcements', label: "From your courses", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  title="From your courses"
                  subtitle="Faculty announcements"
                  icon={CampaignOutlinedIcon}
                  tone="warning"
                  actionLabel="All"
                  actionTo="/academics/announcements"
                >
                  {panelBody('dashboard.announcements', () => (
                    <>
                      {announcements.length === 0 && (
                        <WidgetEmpty icon={CampaignOutlinedIcon} tone="warning" title="No announcements yet">
                          Updates your instructors post to your courses will appear here.
                        </WidgetEmpty>
                      )}
                      <FitList
                        items={announcements}
                        max={4}
                        moreTo="/academics/announcements"
                        moreLabel="more announcements"
                        sx={{ mb: 1.5 }}
                        renderItem={(announcement) => (
                          <ButtonBase
                            onClick={() => setSelectedAnnouncement(announcement)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              width: '100%',
                              textAlign: 'left',
                              p: 1.25,
                              borderRadius: 2.5,
                              border: 1,
                              borderColor: 'divider',
                              transition: 'background-color 160ms ease, border-color 160ms ease',
                              '&:hover': { bgcolor: 'background.subtle', borderColor: 'grey.300' },
                            }}
                          >
                            <Chip label={announcement.courseCode} sx={{ bgcolor: 'warning.lighter', color: 'warning.dark', flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2" component="h3">
                                {announcement.title}
                              </Typography>
                              <Typography variant="caption" component="p">
                                Posted {announcement.postedAt}
                              </Typography>
                            </Box>
                            <Badge variant={announcement.isRead ? 'neutral' : 'primary'}>{announcement.isRead ? 'Read' : 'New'}</Badge>
                          </ButtonBase>
                        )}
                      />
                      <CardFootnote>Faculty updates for enrolled courses</CardFootnote>
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.notifications', label: "Campus pulse", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  title="Campus pulse"
                  subtitle="Important notifications"
                  icon={NotificationsActiveOutlinedIcon}
                  tone="danger"
                  actionLabel="All"
                  actionTo="/notifications"
                >
                  {notifications.length === 0 && (
                    <WidgetEmpty icon={NotificationsActiveOutlinedIcon} tone="danger" title="All quiet">
                      Campus alerts and updates about your account will appear here.
                    </WidgetEmpty>
                  )}
                  <FitList
                    items={notifications}
                    max={4}
                    gap={0}
                    moreTo="/notifications"
                    moreLabel="more notifications"
                    sx={{ mb: 1.5 }}
                    renderItem={(notification, index) => (
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        sx={{ py: 1.25, ...(index > 0 && { borderTop: 1, borderColor: 'divider' }) }}
                      >
                        <Box
                          sx={{
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            flexShrink: 0,
                            bgcolor: notification.isRead ? 'grey.300' : 'primary.main',
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" component="h3" sx={{ fontWeight: notification.isRead ? 500 : 600 }}>
                            {notification.title}
                          </Typography>
                          <Typography variant="caption" component="p">
                            {notification.timeAgo} · {notification.category}
                          </Typography>
                        </Box>
                        {!notification.isRead && (
                          <MuiButton size="small" onClick={() => markAsRead(notification.id)} sx={{ color: 'primary.main', flexShrink: 0 }}>
                            Mark read
                          </MuiButton>
                        )}
                      </Stack>
                    )}
                  />
                  <CardFootnote>
                    Campus alert system: <strong>active</strong>
                  </CardFootnote>
                </WidgetCard>
            ) },
            { key: 'dashboard.library', label: "Library account", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  title="Library account"
                  subtitle={library?.summary?.patronStatus ?? 'Borrowing'}
                  icon={LocalLibraryOutlinedIcon}
                  tone="info"
                  actionLabel="Library"
                  actionTo="/campus/library"
                >
                  {panelBody('dashboard.library', () => (
                    <>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <MetricLabel>Items on loan</MetricLabel>
                          <Typography variant="metric" component="strong" sx={{ display: 'block', mt: 0.5, color: 'info.main', fontSize: '1.875rem' }}>
                            {library?.summary?.booksCheckedOut ?? 0}
                          </Typography>
                        </Box>
                        {library?.summary?.overdue > 0 ? (
                          <Badge variant="warning">{library.summary.overdue} overdue</Badge>
                        ) : (
                          <Badge variant="success">None overdue</Badge>
                        )}
                      </Stack>
                      {(library?.loans ?? []).length === 0 && (
                        <WidgetEmpty
                          icon={LocalLibraryOutlinedIcon}
                          tone="info"
                          title="Nothing on loan"
                          action={<MuiButton size="small" component={RouterLink} to="/campus/library">Browse the catalogue</MuiButton>}
                        />
                      )}
                      <FitList
                        items={library?.loans ?? []}
                        max={4}
                        gap={0}
                        moreTo="/campus/library"
                        moreLabel="more on loan"
                        sx={{ mt: 1.25, mb: 1.5 }}
                        renderItem={(loan, index) => <BreakdownRow divider={index > 0} color="info.main" label={loan.title} value={loan.dueDate} />}
                      />
                      <CardFootnote>
                        Fines outstanding: <strong>{library?.summary?.formattedFines ?? '$0.00'}</strong>
                      </CardFootnote>
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.calendar', label: "Academic calendar", span: { md: 6, lg: 4 }, size: 'standard', node: (
<WidgetCard
                  title="Academic calendar"
                  subtitle="What's coming up"
                  icon={EventNoteOutlinedIcon}
                  tone="purple"
                  actionLabel="Full calendar"
                  actionTo="/academics/calendar"
                >
                  {panelBody('dashboard.calendar', () => {
                    const today = new Date().toISOString().slice(0, 10);
                    const upcoming = calendar.filter((event) => event.date >= today);
                    return (
                      <>
                        {upcoming.length === 0 && (
                          <WidgetEmpty icon={EventNoteOutlinedIcon} tone="purple" title="Nothing coming up">
                            Registrar dates for the rest of the term are on the full calendar.
                          </WidgetEmpty>
                        )}
                        <FitList
                          items={upcoming}
                          max={4}
                          moreTo="/academics/calendar"
                          moreLabel="more dates"
                          sx={{ mb: 1.5 }}
                          renderItem={(event) => (
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={1.5}
                              sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider' }}
                            >
                              <Box
                                sx={{
                                  px: 1,
                                  py: 0.5,
                                  borderRadius: 2,
                                  bgcolor: 'secondary.lighter',
                                  color: 'secondary.dark',
                                  typography: 'caption',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}
                              >
                                {event.date}
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" component="h3">
                                  {event.title}
                                </Typography>
                                <Typography variant="caption" component="p">
                                  {event.location}
                                </Typography>
                              </Box>
                              {event.isImportant && <Badge variant="purple">Key</Badge>}
                            </Stack>
                          )}
                        />
                        <CardFootnote>From the CampusCore academic calendar</CardFootnote>
                      </>
                    );
                  })}
                </WidgetCard>
            ) },
              ...advancedItems,
            ].filter((item) => has(item.key)), cmsLayout)}
          />

          <PaymentModal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            currentBalance={financeData.currentBalance}
            onPaymentSuccess={handlePaymentSuccess}
          />
          <AnnouncementModal
            isOpen={!!selectedAnnouncement}
            onClose={() => setSelectedAnnouncement(null)}
            announcement={selectedAnnouncement}
            onMarkRead={handleAnnouncementRead}
          />
          <SubmitModal
            isOpen={!!selectedAssignment}
            onClose={() => setSelectedAssignment(null)}
            assignment={selectedAssignment}
            onSubmitSuccess={handleAssignmentSubmit}
          />
        </Stack>
      )}
    </DataState>
  );
};

export default StudentDashboard;
