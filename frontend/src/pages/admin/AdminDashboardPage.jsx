import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { applyCmsLayout, useCmsDashboardLayout } from '../../components/cms/dashboardLayout';
import { DataState } from '../../components/common/DataState';
import { DashboardSkeleton } from '../../components/dashboard/HeroBanner';
import { ADMIN_SECTIONS } from '../../../../shared/cmsBlocks.js';
import { AdminDashboardModelProvider, AdminDashboardSection, adminSpan, useAdminDashboardModel } from '../../components/admin/adminDashboardSections';

/** Placeholder composition that mirrors the admin control centre. */
const ADMIN_SKELETON = [
  { kind: 'chart', span: { md: 12, lg: 8 } },
  { kind: 'list', rows: 2 },
  { kind: 'stats', rows: 2, span: { md: 12, lg: 12 } },
  { kind: 'list', rows: 3, span: { md: 12, lg: 12 } },
];

const SECTION_ITEMS = ADMIN_SECTIONS.map((s) => ({ key: s.key }));

/**
 * The sections of the Admin dashboard, in order. Without a published Studio layout this is the
 * original vertical stack; with one, sections are placed in a 12-column grid at their Studio
 * widths (full width unless resized), in the layout's order, with its titles and content cards.
 * Shared by the live page and the Studio canvas via AdminDashboardSection.
 */
export function AdminDashboardSections({ cmsLayout }) {
  const items = applyCmsLayout(SECTION_ITEMS, cmsLayout);
  const render = (item) => (item.node ?? <AdminDashboardSection sectionKey={item.key} presentation={item.presentation ?? null} />);
  if (!cmsLayout) {
    return <Stack spacing={{ xs: 2, md: 2.25 }}>{items.map((item) => <React.Fragment key={item.key}>{render(item)}</React.Fragment>)}</Stack>;
  }
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(12, minmax(0, 1fr))' }, gap: { xs: 2, md: 2.25 } }}>
      {items.map((item) => (
        <Box key={item.key} sx={{ gridColumn: { xs: '1 / -1', md: `span ${adminSpan(item.size)}` }, minWidth: 0 }}>{render(item)}</Box>
      ))}
    </Box>
  );
}

/**
 * Administrator dashboard: the tenant, its population, the tier split and the live
 * health of every configured integration, plus the most recent sync attempts. This is
 * the screen that answers "is the Canvas connector working, and when did it last run?"
 */
export const AdminDashboardPage = () => {
  const cmsLayout = useCmsDashboardLayout('admin');
  const model = useAdminDashboardModel();
  const { loading, error, refetch } = model.query;

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
          {/* A published Studio layout (Studio → Admin dashboard) may reorder, hide, resize or
              retitle these sections and add content cards; without one they render exactly as before. */}
          <AdminDashboardModelProvider model={model}>
            <AdminDashboardSections cmsLayout={cmsLayout} />
          </AdminDashboardModelProvider>
        </Box>
      )}
    </DataState>
  );
};

export { ADMIN_SKELETON };
export default AdminDashboardPage;
