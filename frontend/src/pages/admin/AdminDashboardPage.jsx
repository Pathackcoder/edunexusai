import React, { useState } from 'react';
import { Tabs, Tab } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DashboardGrid, GridItem } from '../../components/common/DashboardGrid';
import { AdminCommunicationAnalyticsWidget } from '../../components/admin/AdminCommunicationAnalyticsWidget';
import { AdminEmergencyBroadcastWidget } from '../../components/admin/AdminEmergencyBroadcastWidget';
import { AdminApprovalsWidget } from '../../components/admin/AdminApprovalsWidget';
import { AdminFormsSurveysWidget } from '../../components/admin/AdminFormsSurveysWidget';
import { AdminSupportHelpdeskWidget } from '../../components/admin/AdminSupportHelpdeskWidget';
import { AdminDocumentsWidget } from '../../components/admin/AdminDocumentsWidget';
import { AdminAuditActivityWidget } from '../../components/admin/AdminAuditActivityWidget';
import { AdminInterventionsWidget } from '../../components/admin/AdminInterventionsWidget';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import TimelapseRoundedIcon from '@mui/icons-material/TimelapseRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { WidgetCard } from '../../components/common/WidgetCard';
import { DataState } from '../../components/common/DataState';
import { IntegrationStatusBadge } from '../../components/admin/IntegrationStatusBadge';
import { DashboardSkeleton, HeroBanner } from '../../components/dashboard/HeroBanner';

/** Placeholder composition that mirrors the admin control centre. */
const ADMIN_SKELETON = [
  { kind: 'chart', span: { md: 12, lg: 8 } },
  { kind: 'list', rows: 2 },
  { kind: 'stats', rows: 2, span: { md: 12, lg: 12 } },
  { kind: 'list', rows: 3, span: { md: 12, lg: 12 } },
];

const OPS_TABS = [
  { id: 'approvals', label: 'Requests & approvals', count: 'openRequests' },
  { id: 'support', label: 'Help desk', count: 'openTickets' },
  { id: 'forms', label: 'Forms', count: 'formsToReview' },
  { id: 'resources', label: 'Resources' },
  { id: 'interventions', label: 'Interventions', count: 'openInterventions' },
];

const linkAction = (to, label) => (
  <Button component={RouterLink} to={to} size="small" endIcon={<ArrowForwardRoundedIcon />} sx={{ color: 'primary.main' }}>
    {label}
  </Button>
);

/**
 * Administrator dashboard: the tenant, its population, the tier split and the live
 * health of every configured integration, plus the most recent sync attempts. This is
 * the screen that answers "is the Canvas connector working, and when did it last run?"
 */
export const AdminDashboardPage = () => {
  const { data, loading, error, refetch, refresh } = useApiQuery(() => adminApi.getDashboard());

  // The tab is in the URL so notification links (e.g. /admin?ops=support) land on it.
  const [params, setParams] = useSearchParams();
  const operationsTab = OPS_TABS.some((tab) => tab.id === params.get('ops')) ? params.get('ops') : 'approvals';
  const setOperationsTab = (value) => {
    const next = new URLSearchParams(params);
    next.set('ops', value);
    setParams(next, { replace: true });
  };
  const [auditKey, setAuditKey] = useState(0);
  const onOpsChanged = () => {
    refresh();
    setAuditKey((key) => key + 1);
  };
  const ops = data?.operations ?? {};
  const tenant = data?.tenant;
  const counts = data?.counts ?? {};
  const tiers = data?.tiers ?? [];
  const health = data?.integrationHealth ?? [];
  const logs = data?.recentSyncLogs ?? [];

  const stats = [
    { label: 'Users', value: counts.users, icon: PeopleAltOutlinedIcon, to: '/admin/users', tone: 'primary' },
    { label: 'Students', value: counts.students, icon: SchoolOutlinedIcon, to: '/admin/users?role=STUDENT', tone: 'info' },
    { label: 'Faculty', value: counts.faculty, icon: AdminPanelSettingsOutlinedIcon, to: '/admin/users?role=FACULTY', tone: 'purple' },
    { label: 'Courses', value: counts.courses, icon: MenuBookOutlinedIcon, to: null, tone: 'warning' },
    { label: 'Enrollments', value: counts.enrollments, icon: LayersOutlinedIcon, to: null, tone: 'success' },
  ];

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading the administration dashboard…"
      minHeight={420}
      skeleton={<DashboardSkeleton widgets={ADMIN_SKELETON} />}
    >
      {() => (
        <Box>
          <Stack spacing={{ xs: 2, md: 2.25 }}>
            {/* Control centre: tenant identity and population at a glance */}
            <HeroBanner
              eyebrow="System administration"
              title={<>Operations </>}
              highlight="control center"
              description={
                <>
                  {tenant?.name} · tenant{' '}
                  <Box component="code" sx={{ px: 0.75, py: 0.25, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.1)', fontSize: '0.8125rem', color: '#E0E7FF' }}>
                    {tenant?.slug}
                  </Box>
                </>
              }
            >
              <Box sx={{ mt: 2.25, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5 }}>
                {stats.map((stat) => (
                  <StatCard key={stat.label} title={stat.label} value={stat.value ?? 0} icon={stat.icon} tone={stat.tone} to={stat.to ?? undefined} />
                ))}
              </Box>
            </HeroBanner>

            <DashboardGrid>
              <GridItem span={{ md: 8 }}><AdminCommunicationAnalyticsWidget /></GridItem>
              <GridItem span={{ md: 4 }}><Stack spacing={2} sx={{ width: '100%' }}>
                <AdminEmergencyBroadcastWidget />
                <WidgetCard title="Campus operations" tone="campus" accentBorder="top" actionLabel="Campus overview" actionTo="/campus">
                  <Typography variant="body2" color="text.secondary">Explore existing campus services, safety information, and the shared academic calendar.</Typography>
                  {linkAction('/academics/calendar', 'Open campus calendar')}
                </WidgetCard>
              </Stack></GridItem>
            </DashboardGrid>
            {/* Tiers */}
            <WidgetCard
              variant="featured"
              title="Student Tiers"
              icon={LayersOutlinedIcon}
              tone="purple"
              headerAction={linkAction('/admin/entitlements', 'Configure widget entitlements')}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5 }}>
                {tiers.map((tier) => (
                  <Box key={tier.key} sx={{ px: 2, py: 1.5, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.subtle' }}>
                    <Typography variant="subtitle2">{tier.name}</Typography>
                    <Typography variant="caption">
                      {tier.studentCount} student{tier.studentCount === 1 ? '' : 's'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </WidgetCard>

            {/* Integration health */}
            <WidgetCard
              title="Integration Health"
              icon={HubOutlinedIcon}
              headerAction={linkAction('/admin/integrations', 'Manage integrations')}
              disablePadding
            >
              <TableContainer sx={{ borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
                <Table sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      {['Integration', 'Mode', 'Status', 'Last sync', 'Records', 'Response'].map((heading) => (
                        <TableCell key={heading}>{heading}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {health.map((integration) => (
                      <TableRow key={integration.id} hover>
                        <TableCell>
                          <Link component={RouterLink} to={`/admin/integrations/${integration.id}`} underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {integration.displayName}
                          </Link>
                          <Typography variant="caption" component="div" sx={{ fontSize: '0.6875rem' }}>{integration.provider}</Typography>
                        </TableCell>
                        <TableCell><Badge variant="neutral">{integration.mode}</Badge></TableCell>
                        <TableCell><IntegrationStatusBadge status={integration.status} enabled={integration.enabled} /></TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {integration.lastSuccessfulSyncAt
                            ? new Date(integration.lastSuccessfulSyncAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                            : 'Never'}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{integration.lastRecordCount ?? '—'}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {integration.lastResponseTimeMs != null ? `${integration.lastResponseTimeMs} ms` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </WidgetCard>

            <Box>
              <Typography variant="h5" sx={{ mb: 0.5 }}>Operations workspace</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Everything students and faculty send to Administration. Every decision is saved, recorded in the audit trail and sent back to the requester as a notification.
              </Typography>
              <Tabs value={operationsTab} onChange={(_, value) => setOperationsTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }} aria-label="Operations workspace">
                {OPS_TABS.map((tab) => (
                  <Tab
                    key={tab.id}
                    value={tab.id}
                    label={
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <span>{tab.label}</span>
                        {tab.count && ops[tab.count] > 0 && <Badge variant={tab.id === 'interventions' ? 'danger' : 'warning'}>{ops[tab.count]}</Badge>}
                      </Stack>
                    }
                  />
                ))}
              </Tabs>
              {operationsTab === 'approvals' && <AdminApprovalsWidget onChanged={onOpsChanged} />}
              {operationsTab === 'support' && <AdminSupportHelpdeskWidget onChanged={onOpsChanged} />}
              {operationsTab === 'forms' && <AdminFormsSurveysWidget onChanged={onOpsChanged} />}
              {operationsTab === 'resources' && <AdminDocumentsWidget />}
              {operationsTab === 'interventions' && <AdminInterventionsWidget />}
            </Box>
            <AdminAuditActivityWidget refreshKey={auditKey} />
            {/* Recent sync activity */}
            <WidgetCard title="Recent Integration Activity" icon={HistoryRoundedIcon} tone="neutral">
              <Box sx={{ border: logs.length ? 1 : 0, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
                {logs.length === 0 && (
                  <Typography variant="body2" color="text.secondary">No sync attempts recorded yet.</Typography>
                )}
                {logs.map((log) => {
                  const Icon = log.status === 'SUCCESS' ? CheckCircleRoundedIcon : log.status === 'RUNNING' ? TimelapseRoundedIcon : WarningAmberRoundedIcon;
                  const colour = log.status === 'SUCCESS' ? 'success.main' : log.status === 'RUNNING' ? 'text.secondary' : 'error.main';
                  return (
                    <Stack
                      key={log.id}
                      direction="row"
                      alignItems="center"
                      useFlexGap
                      flexWrap="wrap"
                      columnGap={1.25}
                      rowGap={0.25}
                      sx={{ px: 2, py: 1.25, '& + &': { borderTop: 1, borderColor: 'divider' }, '&:hover': { bgcolor: 'background.subtle' } }}
                    >
                      <Icon sx={{ fontSize: 17, color: colour, flexShrink: 0 }} />
                      <Typography variant="body2" fontWeight={600}>{log.operation}</Typography>
                      <Typography variant="body2" color="text.secondary">{log.integration}</Typography>
                      <Typography variant="caption">
                        {log.recordsProcessed} record{log.recordsProcessed === 1 ? '' : 's'}
                        {log.durationMs != null ? ` · ${log.durationMs} ms` : ''}
                      </Typography>
                      <Typography variant="caption" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
                        {new Date(log.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </Typography>
                    </Stack>
                  );
                })}
              </Box>
            </WidgetCard>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default AdminDashboardPage;
