import React, { useEffect } from 'react';
import { Link as RouterLink, Navigate, Route, Routes } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useAuth } from '../../context/AuthContext';
import { lastTarget } from './studioSession';
import { useStudioMode } from './studioMode';
import { useApiQuery } from '../../hooks/useApiQuery';
import { studioApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';
import { StudioPagesList } from './StudioPagesList';
import { StudioPageEditor } from './StudioPageEditor';
import { StudioDashboards, StudioDashboardEditor } from './StudioDashboards';
import { StudioContentList } from './StudioContentList';
import { StudioMedia } from './StudioMedia';
import { StudioFormEditor, StudioForms } from './StudioForms';
import { StudioPreview } from './StudioPreview';

/**
 * EduNexusAI Studio: content and layout editing for administrators, inside the portal
 * shell (AppLayout adds the Studio rail). Everything goes through the EduNexusAI API
 * (/studio/*), which checks the ADMIN role and the session tenant; the CMS token never
 * reaches the browser. /studio resumes the last editing target (see studioSession.js).
 */

/** CMS status banner for Studio's list pages (the editors show their own errors). */
function StudioStatus() {
  const meta = useApiQuery(() => studioApi.meta());
  if (!meta.data || meta.data.available) return null;
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      The CMS is not reachable{meta.data.error?.message ? `: ${meta.data.error.message}` : ''}{meta.data.problems?.length ? ` (${meta.data.problems.join(' ')})` : ''}. Content cannot be edited until it is back; the portal itself keeps working.
    </Alert>
  );
}

/** /studio: resume the last page or dashboard being edited, or show the start page. */
function StudioEntry() {
  const { user } = useAuth();
  const { enter } = useStudioMode();
  const target = lastTarget(user?.id);
  useEffect(() => { if (target) enter(); }, [target, enter]);
  return <Navigate to={target?.path ?? '/studio/start'} replace />;
}

/** First visit (or the last target was removed): pick a page or dashboard, or create a page. */
function StudioStart() {
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" component="h1">Welcome to Studio</Typography>
        <Typography variant="body2" color="text.secondary">Choose a page or dashboard to edit, or add a new page. Next time, Studio opens straight into whatever you edited last.</Typography>
      </Box>
      <StudioStatus />
      <StudioPagesList />
      <StudioDashboards />
    </Stack>
  );
}

function StudioSettings() {
  const meta = useApiQuery(() => studioApi.meta());
  const d = meta.data;
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4" component="h1">Studio settings</Typography>
        <Typography variant="body2" color="text.secondary">Connection to the Feddrick CMS and how published layouts reach the portal. These are server settings; they are shown here read-only.</Typography>
      </Box>
      <DataState loading={meta.loading} error={meta.error} onRetry={meta.refetch}>
        {() => (
          <Card sx={{ p: 2.5 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center"><Typography sx={{ minWidth: 220 }}>CMS connection</Typography><Chip size="small" color={d.available ? 'success' : 'error'} label={d.available ? 'Connected' : 'Unavailable'} /></Stack>
              <Stack direction="row" spacing={1} alignItems="center"><Typography sx={{ minWidth: 220 }}>Published dashboard layouts</Typography><Chip size="small" color={d.layoutsEnabled ? 'success' : 'default'} label={d.layoutsEnabled ? 'Applied to live dashboards' : 'Not applied (CMS_LAYOUTS_ENABLED is off)'} /></Stack>
              <Typography variant="body2" color="text.secondary">
                Pages, news and help articles go live as soon as they are published. Dashboard layouts are applied only when the server setting CMS_LAYOUTS_ENABLED is on; with it off, or with no published layout, every dashboard uses its built-in layout.
              </Typography>
              {d.adminUrl && <Box><MuiButton variant="outlined" size="small" endIcon={<OpenInNewRoundedIcon fontSize="small" />} href={d.adminUrl} target="_blank" rel="noopener noreferrer">Open the Strapi admin</MuiButton></Box>}
            </Stack>
          </Card>
        )}
      </DataState>
    </Stack>
  );
}

const COUNT_TYPES = [
  { type: 'page', label: 'Pages', to: '/studio/pages' },
  { type: 'announcement', label: 'News items', to: '/studio/news' },
  { type: 'faq', label: 'Help articles', to: '/studio/faqs' },
];

function TypeCounts({ type, label, to }) {
  const { data, error } = useApiQuery(() => studioApi.list(type));
  const rows = data ?? [];
  const count = (state) => rows.filter((r) => r.state === state).length;
  return (
    <Card sx={{ p: 2.5 }}>
      <Typography variant="overline">{label}</Typography>
      {error ? <Typography variant="body2" color="error">Unavailable</Typography> : (
        <>
          <Typography variant="h3" component="p">{data ? rows.length : '…'}</Typography>
          <Typography variant="caption" color="text.secondary">{count('published')} published · {count('modified')} with changes · {count('draft')} drafts</Typography>
        </>
      )}
      <Box><MuiButton size="small" component={RouterLink} to={to} sx={{ mt: 1, px: 0 }}>Manage</MuiButton></Box>
    </Card>
  );
}

const ACTION_TEXT = { create: 'created', update: 'edited', delete: 'deleted', publish: 'published', unpublish: 'unpublished', discard: 'discarded changes to', upload: 'uploaded' };

function StudioOverview() {
  const meta = useApiQuery(() => studioApi.meta());
  const audit = useApiQuery(() => studioApi.audit());
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">Activity</Typography>
        <Typography variant="body2" color="text.secondary">Build portal pages, customise the Student, Faculty and Admin dashboards, and publish campus news and help articles. Students and faculty only ever see published content meant for them.</Typography>
      </Box>
      {meta.data && !meta.data.layoutsEnabled && (
        <Alert severity="info">Published dashboard layouts are not applied to live dashboards yet (CMS_LAYOUTS_ENABLED is off). Pages, news and help articles are delivered as soon as they are published.</Alert>
      )}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        {COUNT_TYPES.map((t) => <TypeCounts key={t.type} {...t} />)}
      </Box>
      <Card sx={{ p: 2.5 }}>
        <Typography variant="h6" component="h3" sx={{ mb: 1 }}>Recent changes</Typography>
        <DataState loading={audit.loading} error={audit.error} onRetry={audit.refetch} isEmpty={!audit.data?.length} emptyTitle="No changes yet" emptyMessage="Changes made in Studio appear here." minHeight={80}>
          {() => (
            <Stack spacing={0.75}>
              {audit.data.slice(0, 15).map((a) => (
                <Typography key={a.id} variant="body2"><b>{a.actorName ?? 'Someone'}</b> {ACTION_TEXT[a.action] ?? a.action} {a.contentType} {a.summary ? `“${a.summary}”` : ''} · <Typography component="span" variant="caption" color="text.secondary">{new Date(a.at).toLocaleString()}</Typography></Typography>
              ))}
            </Stack>
          )}
        </DataState>
      </Card>
    </Stack>
  );
}

export default function StudioApp() {
  const listPage = (el) => <><StudioStatus />{el}</>;
  return (
    <Routes>
      <Route index element={<StudioEntry />} />
      <Route path="start" element={<StudioStart />} />
      <Route path="pages/:id/edit" element={<StudioPageEditor />} />
      <Route path="dashboards/:persona/edit" element={<StudioDashboardEditor />} />
      <Route path="preview/pages/:id" element={<StudioPreview />} />
      <Route path="overview" element={listPage(<StudioOverview />)} />
      <Route path="pages" element={listPage(<StudioPagesList />)} />
      <Route path="dashboards" element={listPage(<StudioDashboards />)} />
      <Route path="news" element={listPage(<StudioContentList type="announcement" />)} />
      <Route path="faqs" element={listPage(<StudioContentList type="faq" />)} />
      <Route path="media" element={listPage(<StudioMedia />)} />
      <Route path="forms" element={listPage(<StudioForms />)} />
      <Route path="forms/:id" element={listPage(<StudioFormEditor />)} />
      <Route path="settings" element={<StudioSettings />} />
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
  );
}
