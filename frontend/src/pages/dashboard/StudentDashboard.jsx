import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
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
import { dashboardApi, academicApi } from '../../services/api';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { MetricLabel, CardFootnote } from '../../components/common/Section';
import { SortableDashboard, useDashboardLayout } from '../../components/dashboard/SortableDashboard';
import { buildAdvancedItems } from '../../components/dashboard/StudentAdvancedWidgets';
import { useI18n } from '../../i18n';
import { SubmitModal } from '../../components/assignments/SubmitModal';
import { AnnouncementModal } from '../../components/announcements/AnnouncementModal';
import { PaymentModal } from '../../components/finance/PaymentModal';
import { useToast } from '../../components/common/Toast';
import { CampusHeroIllustration } from '../../assets/illustrations/CampusHeroIllustration';
import { DataState, ErrorPanel, StaleDataNotice } from '../../components/common/DataState';

const ACCENTS = ['primary.main', 'secondary.main', 'info.main'];

/** Muted inline note used where a panel has nothing to list. */
const InlineEmpty = ({ children }) => (
  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
    {children}
  </Typography>
);

/** Label / value row used by the aid and library breakdowns. */
const BreakdownRow = ({ color = 'primary.main', label, value }) => (
  <Stack direction="row" alignItems="center" spacing={1.25} sx={{ py: 1, '& + &': { borderTop: 1, borderColor: 'divider' } }}>
    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
    <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
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

  const { data, loading, error, refetch, setData } = useApiQuery(() => dashboardApi.get());

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const panels = data?.panels ?? {};
  const panel = (key) => panels[key];
  const has = (key) => Boolean(panels[key]);
  const payload = (key) => panels[key]?.data ?? null;

  const schedule = payload('dashboard.schedule');
  const grades = payload('dashboard.progress');
  const assignments = payload('dashboard.assignments') ?? [];
  const announcements = payload('dashboard.announcements') ?? [];
  const aid = payload('dashboard.financial_aid');
  const library = payload('dashboard.library');
  const calendar = payload('dashboard.calendar') ?? [];

  // Default widget order = the order the entitlement service returns; the user's saved
  // drag-and-drop order (dashboard_layouts) is applied on top.
  const availableKeys = (data?.widgets ?? []).filter((key) => has(key));
  const layout = useDashboardLayout('student', data?.layout, availableKeys);

  const todayClasses = schedule?.courses ?? [];
  const pendingAssignments = assignments.filter((item) => item.status !== 'Completed').slice(0, 3);
  const submittedCount = assignments.filter((item) => item.status === 'Completed').length;
  const completedCredits = grades?.creditsCompleted ?? 0;
  const totalCredits = grades?.creditsRequired ?? 0;
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
    >
      {() => (
        <Stack spacing={{ xs: 2, md: 2.25 }}>
          {/* Welcome banner */}
          <Card
            sx={(theme) => ({
              position: 'relative',
              overflow: 'hidden',
              px: { xs: 2.5, sm: 3.5 },
              py: { xs: 2.5, sm: 2.75 },
              background: `linear-gradient(115deg, ${alpha(theme.palette.primary.main, 0.07)} 0%, ${theme.palette.background.paper} 58%)`,
            })}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={3}>
              <Box sx={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <Chip
                  label={data?.term ?? user?.currentTerm ?? 'Current term'}
                  sx={{ bgcolor: 'primary.main', color: '#fff', mb: 1.25 }}
                />
                <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem', lg: '1.875rem' } }}>
                  Good Morning, {data?.greetingName || user?.firstName} <span aria-hidden="true">!</span>
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, maxWidth: 520 }}>
                  Here’s what matters today — from your next class to the moments that keep campus moving.
                </Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mt: 1.75 }}>
                  <Chip
                    variant="outlined"
                    icon={
                      <Box
                        component="span"
                        sx={(theme) => ({
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: todayClasses.length > 0 ? 'success.main' : 'grey.400',
                          boxShadow: todayClasses.length > 0 ? `0 0 0 3px ${alpha(theme.palette.success.main, 0.18)}` : 'none',
                        })}
                      />
                    }
                    label={todayClasses.length > 0 ? 'On campus today' : 'No classes today'}
                    sx={{ bgcolor: 'background.paper', borderColor: 'divider', '& .MuiChip-icon': { ml: 1.25 } }}
                  />
                  {(user?.degree || data?.tier) && (
                    <Chip
                      variant="outlined"
                      icon={<SchoolOutlinedIcon />}
                      label={`${user?.degree ?? ''}${data?.tier ? ` · ${data.tier.name} experience` : ''}`}
                      sx={{ bgcolor: 'background.paper', borderColor: 'divider', maxWidth: '100%' }}
                    />
                  )}
                  {layout.isCustomised && (
                    <Chip
                      variant="outlined"
                      icon={<RestartAltRoundedIcon />}
                      label={t('Reset layout')}
                      onClick={layout.reset}
                      sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}
                    />
                  )}
                </Stack>
              </Box>
              <Box sx={{ display: { xs: 'none', sm: 'block' }, width: { sm: 260, lg: 300 }, flexShrink: 0, my: { md: -1.5 } }}>
                <CampusHeroIllustration style={{ width: '100%', height: 'auto', display: 'block' }} />
              </Box>
            </Stack>
          </Card>

          <SortableDashboard
            ariaLabel="Dashboard widgets"
            order={layout.order}
            onOrderChange={async (next) => {
              const saved = await layout.persist(next);
              if (!saved) showToast('Layout saved on this device only — the server could not be reached.', 'info');
            }}
            items={[
            { key: 'dashboard.schedule', label: "Today's schedule", span: { md: 6, lg: 4 }, node: (
<WidgetCard
                  title="Today’s schedule"
                  subtitle={`${schedule?.dayName ?? ''}${todayClasses.length ? ` · ${todayClasses.length} ${todayClasses.length === 1 ? 'class' : 'classes'}` : ''}`}
                  icon={CalendarMonthOutlinedIcon}
                  actionLabel="Full schedule"
                  actionTo="/academics/schedule"
                >
                  {panelBody('dashboard.schedule', () => (
                    <>
                      <Stack spacing={0} sx={{ position: 'relative', pb: 1 }}>
                        {todayClasses.length === 0 && <InlineEmpty>No classes are scheduled for today.</InlineEmpty>}
                        {todayClasses.map((course, index) => (
                          <Stack key={course.id || index} direction="row" spacing={1.75} sx={{ position: 'relative', pb: index === todayClasses.length - 1 ? 0 : 2 }}>
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
                                <Typography variant="caption" noWrap>
                                  {course.room} · {course.instructor}
                                </Typography>
                              </Stack>
                            </Box>
                          </Stack>
                        ))}
                      </Stack>
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
            { key: 'dashboard.progress', label: "Academic momentum", span: { md: 6, lg: 4 }, node: (
<WidgetCard
                  title="Academic momentum"
                  subtitle={`${data?.term ?? ''} standing`}
                  icon={SchoolOutlinedIcon}
                  tone="purple"
                  actionLabel="Grades"
                  actionTo="/academics/grades"
                >
                  {panelBody('dashboard.progress', () => (
                    <>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <MetricLabel>Cumulative GPA</MetricLabel>
                          <Typography variant="metric" component="strong" sx={{ display: 'block', color: 'secondary.main', fontSize: '2.125rem', mt: 0.5 }}>
                            {grades?.cumulativeGpa ?? '—'}
                          </Typography>
                        </Box>
                        {grades?.honors && <Badge variant="purple">Dean’s List</Badge>}
                      </Stack>
                      <Box sx={{ mt: 2.25, mb: 2 }}>
                        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                          <Typography variant="caption">Degree progress</Typography>
                          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            {completedCredits} / {totalCredits} credits
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={creditsPercent}
                          color="secondary"
                          sx={(theme) => ({ bgcolor: alpha(theme.palette.secondary.main, 0.14) })}
                        />
                      </Box>
                      <CardFootnote icon={TaskAltRoundedIcon}>{grades?.academicStanding ?? 'Standing unavailable'}</CardFootnote>
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.tuition', label: "Tuition & accounts", span: { md: 6, lg: 4 }, node: (
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
            { key: 'dashboard.assignments', label: "Upcoming assignments", span: { md: 12, lg: 8 }, node: (
<WidgetCard
                  title="Upcoming assignments"
                  subtitle="The next seven days"
                  icon={AssignmentOutlinedIcon}
                  tone="info"
                  actionLabel="All assignments"
                  actionTo="/academics/assignments"
                >
                  {panelBody('dashboard.assignments', () => (
                    <>
                      <Stack spacing={1} sx={{ mb: 2 }}>
                        {pendingAssignments.length === 0 && <InlineEmpty>Nothing due in the next few days.</InlineEmpty>}
                        {pendingAssignments.map((assignment, index) => (
                          <Stack
                            key={assignment.id}
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
                              <Typography variant="subtitle2" component="h3" noWrap>
                                {assignment.title}
                              </Typography>
                              <Typography variant="caption" component="p">
                                Due {assignment.formattedDueDate} · {assignment.dueTime}
                              </Typography>
                            </Box>
                            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-end', sm: 'center' }} spacing={1} sx={{ flexShrink: 0 }}>
                              <Badge variant={assignment.urgency === 'due-soon' ? 'warning' : 'neutral'}>
                                {assignment.urgency === 'due-soon'
                                  ? 'Due soon'
                                  : assignment.status === 'In Progress'
                                    ? 'In progress'
                                    : 'Upcoming'}
                              </Badge>
                              <Button variant="outline" size="sm" onClick={() => setSelectedAssignment(assignment)}>
                                Submit
                              </Button>
                            </Stack>
                          </Stack>
                        ))}
                      </Stack>
                      <CardFootnote icon={TaskAltRoundedIcon}>
                        <strong>{submittedCount} assignment{submittedCount === 1 ? '' : 's'}</strong> submitted this term
                      </CardFootnote>
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.financial_aid', label: "Financial aid", span: { md: 6, lg: 4 }, node: (
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
                      <Box sx={{ mt: 2, mb: 2 }}>
                        {(aid?.awards ?? []).slice(0, 3).map((award, index) => (
                          <BreakdownRow
                            key={award.id}
                            color={['success.main', 'primary.main', 'secondary.main'][index % 3]}
                            label={award.name}
                            value={award.formattedAmount}
                          />
                        ))}
                      </Box>
                      {aid?.disbursements?.length > 0 && (
                        <CardFootnote icon={EventNoteOutlinedIcon}>
                          Next disbursement · {aid.disbursements[aid.disbursements.length - 1].date}
                        </CardFootnote>
                      )}
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.announcements', label: "From your courses", span: { md: 6, lg: 4 }, node: (
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
                      <Stack spacing={1} sx={{ mb: 2 }}>
                        {announcements.length === 0 && <InlineEmpty>No announcements from your courses yet.</InlineEmpty>}
                        {announcements.slice(0, 2).map((announcement) => (
                          <ButtonBase
                            key={announcement.id}
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
                              <Typography variant="subtitle2" component="h3" noWrap>
                                {announcement.title}
                              </Typography>
                              <Typography variant="caption" component="p">
                                Posted {announcement.postedAt}
                              </Typography>
                            </Box>
                            <Badge variant={announcement.isRead ? 'neutral' : 'primary'}>{announcement.isRead ? 'Read' : 'New'}</Badge>
                          </ButtonBase>
                        ))}
                      </Stack>
                      <CardFootnote>Faculty updates for enrolled courses</CardFootnote>
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.notifications', label: "Campus pulse", span: { md: 6, lg: 4 }, node: (
<WidgetCard
                  title="Campus pulse"
                  subtitle="Important notifications"
                  icon={NotificationsActiveOutlinedIcon}
                  tone="danger"
                  actionLabel="Notification center"
                  actionTo="/notifications"
                >
                  <Stack sx={{ mb: 2 }}>
                    {notifications.length === 0 && <InlineEmpty>No notifications right now.</InlineEmpty>}
                    {notifications.slice(0, 2).map((notification) => (
                      <Stack
                        key={notification.id}
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        sx={{ py: 1.25, '& + &': { borderTop: 1, borderColor: 'divider' } }}
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
                          <Typography variant="subtitle2" component="h3" noWrap sx={{ fontWeight: notification.isRead ? 500 : 600 }}>
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
                    ))}
                  </Stack>
                  <CardFootnote>
                    Campus alert system: <strong>active</strong>
                  </CardFootnote>
                </WidgetCard>
            ) },
            { key: 'dashboard.library', label: "Library account", span: { md: 6, lg: 4 }, node: (
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
                      <Box sx={{ mt: 2, mb: 2 }}>
                        {(library?.loans ?? []).slice(0, 2).map((loan) => (
                          <BreakdownRow key={loan.id} color="info.main" label={loan.title} value={loan.dueDate} />
                        ))}
                      </Box>
                      <CardFootnote>
                        Fines outstanding: <strong>{library?.summary?.formattedFines ?? '$0.00'}</strong>
                      </CardFootnote>
                    </>
                  ))}
                </WidgetCard>
            ) },
            { key: 'dashboard.calendar', label: "Academic calendar", span: { md: 6, lg: 4 }, node: (
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
                    const upcoming = calendar.filter((event) => event.date >= today).slice(0, 3);
                    return (
                      <>
                        <Stack spacing={1} sx={{ mb: 2 }}>
                          {upcoming.length === 0 && <InlineEmpty>No upcoming calendar events.</InlineEmpty>}
                          {upcoming.map((event) => (
                            <Stack
                              key={event.id}
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
                                <Typography variant="subtitle2" component="h3" noWrap>
                                  {event.title}
                                </Typography>
                                <Typography variant="caption" component="p" noWrap>
                                  {event.location}
                                </Typography>
                              </Box>
                              {event.isImportant && <Badge variant="purple">Key</Badge>}
                            </Stack>
                          ))}
                        </Stack>
                        <CardFootnote>Registrar-published academic dates</CardFootnote>
                      </>
                    );
                  })}
                </WidgetCard>
            ) },
              ...advancedItems,
            ].filter((item) => has(item.key))}
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
