import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import { studioApi } from '../../services/api';
import { useApiQuery } from '../../hooks/useApiQuery';
import { buildPuckConfig } from '../../components/cms/puckConfig';
import { defaultDashboardLayout } from '../../components/cms/templates';
import { StateChip, errorLines, useUnsavedGuard } from './studioCommon';
import { StudioEditor } from '../../components/cms/editor/StudioEditor';
import { useAuth } from '../../context/AuthContext';
import { rememberTarget } from './studioSession';
import { useStudioMode } from './studioMode';
import { DataState } from '../../components/common/DataState';
import { AdminDashboardModelProvider, AdminDashboardSection, adminSpan, useAdminDashboardModel } from '../../components/admin/adminDashboardSections';

const LIVE_PATH = { student: '/dashboard', faculty: '/faculty', admin: '/admin' };

const PERSONAS = [
  { key: 'student', label: 'Student dashboard', description: 'Shown to every student. Widgets still follow each student’s tier entitlements.' },
  { key: 'faculty', label: 'Faculty dashboard', description: 'Shown to faculty. Widgets still follow the faculty widget settings.' },
  { key: 'admin', label: 'Admin dashboard', description: 'The operations dashboard for administrators.' },
];

function PersonaCard({ persona }) {
  const { data } = useApiQuery(() => studioApi.dashboard(persona.key), [persona.key]);
  return (
    <Card variant="outlined">
      <CardActionArea component={RouterLink} to={`/studio/dashboards/${persona.key}/edit`} sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" spacing={1}>
          <Typography variant="h6" component="h3">{persona.label}</Typography>
          {data && (data.document ? <StateChip state={data.document.state} /> : <Typography variant="caption" color="text.secondary">Built-in layout</Typography>)}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{persona.description}</Typography>
        {data && <Typography variant="caption" color="text.secondary">{data.catalogue.length} widgets available</Typography>}
      </CardActionArea>
    </Card>
  );
}

export function StudioDashboards() {
  const meta = useApiQuery(() => studioApi.meta());
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4" component="h2">Dashboards</Typography>
        <Typography variant="body2" color="text.secondary">Customise the existing dashboards: reorder, retitle, resize or remove widgets, and add content cards. Widgets keep their own data sources and permission checks; each user still only sees widgets they are entitled to, and can still rearrange their own dashboard.</Typography>
      </Box>
      {meta.data && !meta.data.layoutsEnabled && <Alert severity="info">You can design and publish layouts now. They are applied to the live dashboards once CMS_LAYOUTS_ENABLED=true is set on the server (see the CMS implementation notes).</Alert>}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        {PERSONAS.map((p) => <PersonaCard key={p.key} persona={p} />)}
      </Box>
    </Stack>
  );
}

/** Widgets of the catalogue that are not on the canvas are hidden; everything else is kept. */
function withHidden(data, catalogue) {
  const used = new Set((data.content ?? []).filter((b) => b.type === 'DashboardWidget').map((b) => b.props.widgetKey));
  return { ...data, root: { ...(data.root ?? {}), props: { ...(data.root?.props ?? {}), hidden: catalogue.map((w) => w.key).filter((k) => !used.has(k)) } } };
}

/**
 * The live dashboard keeps widgets a layout neither places nor hides (e.g. widgets added
 * after the layout was saved) at their original position; show them on the canvas too, so
 * what the editor shows matches what users see.
 */
function withUnmentioned(layout, catalogue) {
  const used = new Set((layout.content ?? []).filter((b) => b.type === 'DashboardWidget').map((b) => b.props.widgetKey));
  const hidden = new Set(layout.root?.props?.hidden ?? []);
  const missing = catalogue.filter((w) => !used.has(w.key) && !hidden.has(w.key));
  if (!missing.length) return layout;
  return { ...layout, content: [...(layout.content ?? []), ...missing.map((w) => ({ type: 'DashboardWidget', props: { id: `widget-${w.key.replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 64), widgetKey: w.key, title: '', subtitle: '', size: 'default' } }))] };
}

/**
 * /studio/dashboards/:persona/edit. The Faculty and Admin dashboards are edited in place on
 * their live routes (/faculty, /admin); the Student dashboard has no route an administrator
 * can view, so it is edited here.
 */
export function StudioDashboardEditor() {
  const { persona } = useParams();
  const { enter } = useStudioMode();
  const inPlace = persona === 'faculty' || persona === 'admin';
  useEffect(() => { if (inPlace) enter(); }, [inPlace, enter]);
  if (inPlace) return <Navigate to={LIVE_PATH[persona]} replace />;
  return <DashboardEditor persona={persona} />;
}

/**
 * The Admin dashboard's editor canvas shows the real dashboard: the same sections and widgets,
 * fed by the same single dashboard query and the widgets' own APIs, in the same grid. (In the
 * canvas, Puck makes blocks non-interactive so selecting a card never triggers its buttons.)
 */
function AdminDashboardEditor() {
  const model = useAdminDashboardModel();
  const live = useMemo(() => ({ renderWidget: ({ widgetKey, presentation }) => <AdminDashboardSection sectionKey={widgetKey} presentation={presentation} />, span: adminSpan }), []);
  const { loading, error, refetch } = model.query;
  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading the administration dashboard…" minHeight={420} fill>
      {() => (
        <AdminDashboardModelProvider model={model}>
          <DashboardEditorCore persona="admin" live={live} />
        </AdminDashboardModelProvider>
      )}
    </DataState>
  );
}

/** The layout editor for one persona's dashboard. */
export function DashboardEditor({ persona }) {
  if (persona === 'admin') return <AdminDashboardEditor />;
  return <DashboardEditorCore persona={persona} live={null} />;
}

function DashboardEditorCore({ persona, live }) {
  const { user } = useAuth();
  const { setDirty: setStudioDirty } = useStudioMode();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  useUnsavedGuard(dirty);
  useEffect(() => { setStudioDirty(dirty); }, [dirty, setStudioDirty]);
  useEffect(() => () => setStudioDirty(false), [setStudioDirty]);
  const label = PERSONAS.find((p) => p.key === persona)?.label ?? 'Dashboard';

  const load = useCallback(async () => {
    try {
      const res = await studioApi.dashboard(persona);
      setState(res);
      setDirty(false);
      setVersion((v) => v + 1);
      rememberTarget(user?.id, persona === 'student' ? '/studio/dashboards/student/edit' : LIVE_PATH[persona], label);
    } catch (e) {
      setLoadError(e);
    }
  }, [persona, user?.id, label]);
  useEffect(() => { load(); }, [load]);

  const catalogue = state?.catalogue;
  const config = useMemo(() => (catalogue ? buildPuckConfig({ context: 'dashboard', catalogue, live }) : null), [catalogue, live]);
  const initial = useMemo(() => (state ? withUnmentioned(state.document?.layout ?? defaultDashboardLayout(state.catalogue), state.catalogue) : null), [state]);

  const save = async (data, { quiet = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const document = await studioApi.saveDashboard(persona, withHidden(data, state.catalogue));
      setState((s) => ({ ...s, document }));
      setDirty(false);
      if (!quiet) setMessage('Draft saved. Live dashboards are unchanged until you publish.');
      return document;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (data) => {
    if ((dirty || !state.document) && !(await save(data, { quiet: true }))) return;
    setBusy(true);
    try {
      const document = await studioApi.dashboardAction(persona, 'publish');
      setState((s) => ({ ...s, document }));
      setMessage(state.layoutsEnabled ? 'Published. The live dashboard uses this layout from the next page load.' : 'Published. It will apply once CMS_LAYOUTS_ENABLED=true is set on the server.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const action = async (name) => {
    if (name === 'reset' && !window.confirm('Delete this layout and return the dashboard to its built-in layout?')) return;
    if (name === 'discard' && !window.confirm('Discard unpublished changes?')) return;
    setBusy(true);
    try {
      if (name === 'reset') await studioApi.removeDashboard(persona);
      else await studioApi.dashboardAction(persona, name);
      await load();
      setMessage(name === 'reset' ? 'Layout deleted. The dashboard uses its built-in layout.' : name === 'unpublish' ? 'Unpublished. The dashboard uses its built-in layout.' : 'Changes discarded.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Box sx={{ p: 3 }}><Alert severity="error" action={<MuiButton component={RouterLink} to="/studio/dashboards">Back</MuiButton>}>{loadError.message}</Alert></Box>;
  if (!state) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  const doc = state.document;

  const toolbar = {
    title: label,
    subtitle: doc ? 'Studio layout' : 'Built-in layout (not saved yet)',
    status: doc ? <StateChip state={dirty ? undefined : doc.state} /> : null,
    actions: [
      // Opens the normal (non-editing) view in a new tab; an administrator cannot open the
      // Student dashboard, so there is no live view for it here.
      ...(persona === 'student' ? [] : [{ label: 'Open normal view', onClick: () => window.open(LIVE_PATH[persona], '_blank', 'noopener') }]),
      { label: dirty || !doc ? 'Save draft' : 'Saved', onClick: (data) => save(data), disabled: busy || (!dirty && Boolean(doc)) },
    ],
    primary: { label: !doc || doc.state === 'draft' ? 'Publish' : 'Publish changes', onClick: publish, disabled: busy || (!dirty && doc?.state === 'published') },
    menu: [
      { label: 'Unpublish (use the built-in layout)', onClick: () => action('unpublish'), disabled: !doc || doc.state === 'draft' },
      { label: 'Discard unpublished changes', onClick: () => action('discard'), disabled: doc?.state !== 'modified' },
      { label: 'Restore built-in layout (delete this layout)', onClick: () => action('reset'), disabled: !doc, danger: true },
    ],
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <StudioEditor
        key={version}
        config={config}
        data={initial}
        context="dashboard"
        onChange={() => setDirty(true)}
        toolbar={toolbar}
        notice={(
          <>
            {!state.layoutsEnabled && <Alert severity="info" sx={{ borderRadius: 0 }}>Published dashboard layouts are not applied to live dashboards until CMS_LAYOUTS_ENABLED=true is set on the server.</Alert>}
            {error && <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0 }}>{error.message}{errorLines(error).slice(0, 8).map((l) => <div key={l}>{l}</div>)}</Alert>}
          </>
        )}
      />
      <Snackbar open={Boolean(message)} autoHideDuration={5000} onClose={() => setMessage(null)} message={message} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
