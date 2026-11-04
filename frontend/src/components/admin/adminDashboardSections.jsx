import React, { createContext, useContext, useState } from 'react';
import { Tabs, Tab } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
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
import { DashboardGrid, GridItem } from '../common/DashboardGrid';
import { AdminCommunicationAnalyticsWidget } from './AdminCommunicationAnalyticsWidget';
import { AdminEmergencyBroadcastWidget } from './AdminEmergencyBroadcastWidget';
import { AdminApprovalsWidget } from './AdminApprovalsWidget';
import { AdminFormsSurveysWidget } from './AdminFormsSurveysWidget';
import { AdminSupportHelpdeskWidget } from './AdminSupportHelpdeskWidget';
import { AdminDocumentsWidget } from './AdminDocumentsWidget';
import { AdminAuditActivityWidget } from './AdminAuditActivityWidget';
import { AdminInterventionsWidget } from './AdminInterventionsWidget';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { Badge } from '../common/Badge';
import { WidgetCard } from '../common/WidgetCard';
import { WidgetSlotContext } from '../common/widgetSlot';
import { HeroBanner, HeroStats } from '../dashboard/HeroBanner';

/**
 * The Admin dashboard's sections, shared by the live dashboard (AdminDashboardPage) and the
 * Studio editor canvas, so both render the same real components with the same data.
 *
 * The JSX of each section is the dashboard's original markup, moved here unchanged. All data
 * still comes from where it did: one GET /admin/dashboard for the tenant, counts, tiers,
 * integration health and sync log (useAdminDashboardModel), and the widgets' own authorised
 * calls (broadcasts, requests, audit, …). A Studio layout only changes presentation: order,
 * visibility, width and the section's title/subtitle; it never carries data.
 *
 * Section keys match ADMIN_SECTIONS in shared/cmsBlocks.js.
 */

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

/** Width of a section in the 12-column dashboard grid (from a Studio layout's card size). */
export const ADMIN_SPAN = { compact: 4, standard: 6, large: 12 };
export const adminSpan = (size) => ADMIN_SPAN[size] ?? 12;

/** The dashboard's data and interaction state, created once per dashboard. */
export function useAdminDashboardModel() {
  const query = useApiQuery(() => adminApi.getDashboard());
  const { data, refresh } = query;
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
  return { query, data, operationsTab, setOperationsTab, auditKey, onOpsChanged };
}

const AdminDashboardModelContext = createContext(null);
export const AdminDashboardModelProvider = ({ model, children }) => <AdminDashboardModelContext.Provider value={model}>{children}</AdminDashboardModelContext.Provider>;
export const useAdminDashboardModelContext = () => useContext(AdminDashboardModelContext);

/** Applies a Studio title/subtitle override to the outermost card inside (and only there). */
const Presented = ({ presentation, children }) => (
  <WidgetSlotContext.Provider value={{ size: null, fixed: false, presentation: presentation ?? null }}>{children}</WidgetSlotContext.Provider>
);

/**
 * One section of the Admin dashboard. `presentation` ({ title, subtitle } or null) is an
 * optional Studio override, applied to that section's own heading only.
 */
export function AdminDashboardSection({ sectionKey, presentation = null }) {
  const model = useAdminDashboardModelContext();
  if (!model) return null;
  const { data, operationsTab, setOperationsTab, auditKey, onOpsChanged } = model;
  const p = presentation ?? {};
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

  switch (sectionKey) {
    case 'admin.hero':
      return (
        <Presented>
          {/* Control centre: tenant identity and population at a glance */}
          <HeroBanner
            dense
            eyebrow={p.subtitle || 'System administration'}
            title={p.title ? p.title : <>Operations </>}
            highlight={p.title ? undefined : 'control center'}
            description={
              <>
                {tenant?.name} · tenant{' '}
                <Box component="code" sx={{ px: 0.75, py: 0.25, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.1)', fontSize: '0.8125rem', color: '#E0E7FF' }}>
                  {tenant?.slug}
                </Box>
              </>
            }
          >
            <HeroStats stats={stats} label="Population" />
          </HeroBanner>
        </Presented>
      );
    case 'admin.communications':
      return (
        <Presented>
          <DashboardGrid>
            <GridItem span={{ md: 8 }}><Presented presentation={presentation}><AdminCommunicationAnalyticsWidget /></Presented></GridItem>
            {/* The cell stretches to the analytics panel's height; both cards share the extra
                height (each keeps its content height plus an equal share), so the column ends
                level with the panel instead of leaving a gap under Campus operations. */}
            <GridItem span={{ md: 4 }}><Stack spacing={1.75} sx={{ width: '100%', '& > *': { flex: { md: '1 1 auto' }, display: 'flex', flexDirection: 'column' }, '& > * > *': { flex: { md: '1 1 auto' } } }}>
              <Box><AdminEmergencyBroadcastWidget /></Box>
              <Box>
                <WidgetCard title="Campus operations" tone="campus" accentBorder="top" actionLabel="Campus overview" actionTo="/campus">
                  <Typography variant="body2" color="text.secondary">Explore existing campus services, safety information, and the shared academic calendar.</Typography>
                  {linkAction('/academics/calendar', 'Open campus calendar')}
                </WidgetCard>
              </Box>
            </Stack></GridItem>
          </DashboardGrid>
        </Presented>
      );
    case 'admin.tiers':
      return (
        <Presented presentation={presentation}>
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
        </Presented>
      );
    case 'admin.integrations':
      return (
        <Presented presentation={presentation}>
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
        </Presented>
      );
    case 'admin.operations':
      return (
        <Presented>
          <Box>
            <Typography variant="h5" sx={{ mb: 0.5 }}>{p.title || 'Operations workspace'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {p.subtitle || 'Everything students and faculty send to Administration. Every decision is saved, recorded in the audit trail and sent back to the requester as a notification.'}
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
        </Presented>
      );
    case 'admin.audit':
      return (
        <Presented presentation={presentation}>
          <AdminAuditActivityWidget refreshKey={auditKey} />
        </Presented>
      );
    case 'admin.sync':
      return (
        <Presented presentation={presentation}>
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
        </Presented>
      );
    default:
      return null;
  }
}
