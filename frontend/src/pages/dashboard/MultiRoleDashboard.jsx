import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardViews, resolveView, viewStorageKey } from '../../context/roleContexts';
import { StudentDashboard } from './StudentDashboard';
import { OverviewDashboard } from './OverviewDashboard';
import { CommunityContextDashboard } from './CommunityContextDashboard';
import { FacultyDashboardPage } from '../faculty/FacultyDashboardPage';
import { AdminDashboardPage } from '../admin/AdminDashboardPage';

const readStored = (key) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const writeStored = (key, value) => {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable: the URL still carries the view */ }
};

/**
 * `/dashboard` for a person with more than one role (e.g. Teaching and Studying). One account,
 * one session: switching views only changes `?view=` and never signs anyone in again. Each view
 * is that role's own dashboard, loading that role's own record (student data from the student
 * record, teaching data from the faculty record); the Overview shows what they share, once.
 * The view in the URL wins, then the last one used; a view the account does not have is never
 * opened, whatever the URL says.
 */
export function MultiRoleDashboard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const views = dashboardViews(user);
  const storageKey = viewStorageKey(user?.id ?? 'anonymous');
  const active = resolveView(user, { requested: params.get('view'), remembered: readStored(storageKey) });

  useEffect(() => {
    if (active) writeStored(storageKey, active);
  }, [active, storageKey]);

  const open = (key) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('view', key);
      return next;
    });
    window.scrollTo?.({ top: 0 });
  };

  return (
    <Stack spacing={{ xs: 1.5, sm: 2 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={active} onChange={(_event, key) => open(key)} variant="scrollable" allowScrollButtonsMobile aria-label="Your roles">
          {views.map((view) => (
            <Tab key={view.key} value={view.key} label={view.label} id={`view-tab-${view.key}`} aria-controls={`view-panel-${view.key}`} sx={view.kind === 'workspace' ? { ml: { sm: 'auto' } } : undefined} />
          ))}
        </Tabs>
      </Box>
      <Box role="tabpanel" id={`view-panel-${active}`} aria-labelledby={`view-tab-${active}`}>
        {active === 'overview' && <OverviewDashboard views={views} onOpen={open} />}
        {active === 'student' && <StudentDashboard />}
        {active === 'faculty' && <FacultyDashboardPage />}
        {active === 'admin' && <AdminDashboardPage />}
        {(active === 'staff' || active === 'alumni') && <CommunityContextDashboard contextKey={active} />}
      </Box>
    </Stack>
  );
}

export default MultiRoleDashboard;
