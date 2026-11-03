import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import { studioApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { buildPuckConfig } from '../../components/cms/puckConfig';
import { StudioEditor } from '../../components/cms/editor/StudioEditor';
import { PageSettingsFields } from './StudioPagesList';
import { StateChip, errorLines, useUnsavedGuard } from './studioCommon';
import { forgetTarget, rememberTarget } from './studioSession';
import { ScheduleDialog, scheduleSummary } from './ScheduleDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useStudioMode } from './studioMode';

const settingsOf = (p) => ({ title: p.title, slug: p.slug, summary: p.summary, audiences: p.audiences, showInNav: p.showInNav, navLabel: p.navLabel, sortOrder: p.sortOrder });

/**
 * /studio/pages/:id/edit (older links, the pages list): turn on edit mode and continue on the
 * page's real address, where AppLayout shows this editor in place of the live page.
 */
export function StudioPageEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enter } = useStudioMode();
  const [error, setError] = useState(null);
  useEffect(() => {
    let active = true;
    studioApi.get('page', id).then((p) => {
      if (!active) return;
      enter();
      navigate(`/pages/${p.slug}`, { replace: true });
    }, (e) => { if (active) setError(e); });
    return () => { active = false; };
  }, [id, enter, navigate]);
  if (error) return <Box sx={{ p: 3 }}><Alert severity="info" action={<MuiButton component={RouterLink} to="/studio/pages">Studio pages</MuiButton>}>{error.status === 404 ? 'This page no longer exists. It may have been deleted.' : error.message}</Alert></Box>;
  return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
}

/** The page editor for one Studio page (by id), shown in place on /pages/:slug. */
export function PageEditor({ id }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setDirty: setStudioDirty } = useStudioMode();
  const [page, setPage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const meta = useApiQuery(() => studioApi.meta());
  const timezone = meta.data?.timezone;
  const config = useMemo(() => buildPuckConfig({ context: 'page' }), []);
  useUnsavedGuard(dirty);
  useEffect(() => { setStudioDirty(dirty); }, [dirty, setStudioDirty]);
  useEffect(() => () => setStudioDirty(false), [setStudioDirty]);

  const load = useCallback(async () => {
    try {
      const p = await studioApi.get('page', id);
      setPage(p);
      setSettings(settingsOf(p));
      setDirty(false);
      setVersion((v) => v + 1);
      rememberTarget(user?.id, `/pages/${p.slug}`, p.title);
    } catch (e) {
      setLoadError(e);
    }
  }, [id, user?.id]);
  useEffect(() => { load(); }, [load]);

  const save = async (data, { quiet = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await studioApi.update('page', id, { ...settings, template: page.template, layout: data });
      setPage(saved);
      setDirty(false);
      if (!quiet) setMessage('Draft saved. Students and faculty will not see it until you publish.');
      return saved;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (data) => {
    if (dirty && !(await save(data, { quiet: true }))) return;
    setBusy(true);
    try {
      setPage(await studioApi.action('page', id, 'publish'));
      setMessage(`Published. It is live at /pages/${settings.slug} for the chosen audiences.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const preview = async (data) => {
    if (dirty && !(await save(data, { quiet: true }))) return;
    window.open(`/studio/preview/pages/${id}`, '_blank', 'noopener');
  };

  const action = async (name) => {
    if (name === 'delete') {
      if (!window.confirm('Delete this page permanently? Published copies are removed from the portal too.')) return;
      try {
        await studioApi.remove('page', id);
        forgetTarget(user?.id, `/pages/${settings.slug}`);
        setStudioDirty(false);
        navigate('/studio/pages');
      } catch (e) {
        setError(e);
      }
      return;
    }
    if (name === 'discard' && !window.confirm('Discard all unpublished changes and return to the published version?')) return;
    setBusy(true);
    try {
      await studioApi.action('page', id, name);
      await load();
      setMessage(name === 'unpublish' ? 'Unpublished. The page is no longer visible in the portal.' : 'Unpublished changes discarded.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity={loadError.status === 404 ? 'info' : 'error'} action={<MuiButton component={RouterLink} to="/studio/start">Choose another page</MuiButton>}>
          {loadError.status === 404 ? 'This page no longer exists. It may have been deleted.' : loadError.message}
        </Alert>
      </Box>
    );
  }
  if (!page) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;

  const toolbar = {
    title: settings.title,
    subtitle: [`/pages/${settings.slug}`, scheduleSummary(page.schedule, timezone)].filter(Boolean).join(' · '),
    status: <StateChip state={dirty ? undefined : page.state} />,
    actions: [
      { label: 'Page settings', onClick: () => setSettingsOpen(true) },
      { label: 'Preview', onClick: preview, disabled: busy },
      { label: dirty ? 'Save draft' : 'Saved', onClick: (data) => save(data), disabled: busy || !dirty },
    ],
    primary: { label: page.state === 'draft' ? 'Publish' : page.state === 'scheduled' ? 'Publish now' : 'Publish changes', onClick: publish, disabled: busy || (!dirty && page.state === 'published') },
    menu: [
      { label: 'Schedule publishing…', onClick: () => setScheduleOpen(true) },
      { label: 'View live page', onClick: () => window.open(`/pages/${settings.slug}`, '_blank', 'noopener'), disabled: page.state === 'draft' || page.state === 'scheduled' },
      { label: 'Unpublish', onClick: () => action('unpublish'), disabled: page.state === 'draft' || page.state === 'scheduled' },
      { label: 'Discard unpublished changes', onClick: () => action('discard'), disabled: page.state !== 'modified' },
      { label: 'Delete page', onClick: () => action('delete'), danger: true },
    ],
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <StudioEditor
        key={version}
        config={config}
        data={page.layout}
        context="page"
        onChange={() => setDirty(true)}
        toolbar={toolbar}
        notice={error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0 }}>
            {error.message}
            {errorLines(error).slice(0, 8).map((l) => <div key={l}>{l}</div>)}
          </Alert>
        )}
      />
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Page settings</DialogTitle>
        <DialogContent dividers><PageSettingsFields value={settings} onChange={(v) => { setSettings(v); setDirty(true); }} slugLocked /></DialogContent>
        <DialogActions><MuiButton onClick={() => setSettingsOpen(false)}>Done</MuiButton></DialogActions>
      </Dialog>
      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        type="page"
        item={{ ...page, title: settings.title }}
        timezone={timezone}
        dirty={dirty}
        onSaved={(schedule) => {
          setPage((p) => ({ ...p, schedule, state: p.state === 'draft' && schedule.publish && schedule.publish.status !== 'blocked' ? 'scheduled' : p.state === 'scheduled' && !schedule.publish ? 'draft' : p.state }));
          setMessage('Schedule saved. The CMS will publish or unpublish at the set time.');
        }}
      />
      <Snackbar open={Boolean(message)} autoHideDuration={5000} onClose={() => setMessage(null)} message={message} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
