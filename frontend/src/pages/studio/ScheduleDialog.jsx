import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import MuiButton from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { studioApi } from '../../services/api';
import { formatInZone, isoToZonedLocal, zoneLabel, zonedLocalToIso } from '../../utils/zonedTime';
import { StateChip, errorLines } from './studioCommon';

/**
 * Publication schedule for one page, news item or help article. Times are entered in the
 * institution's timezone; the server (CMS) runs the jobs, so they happen whether or not anyone
 * has Studio open. A scheduled publish publishes the draft as it is now: editing the draft
 * later pauses ("blocks") it until the schedule is confirmed again.
 */

const STATUS_TEXT = { pending: 'Scheduled', running: 'Running now', blocked: 'Paused: draft changed' };

/** One line for lists and toolbars: "Publishes Oct 20, 9:00 AM EDT · Unpublishes …". */
export function scheduleSummary(schedule, tz) {
  if (!schedule || !tz) return '';
  const short = (iso) => formatInZone(iso, tz, { weekday: undefined, year: undefined });
  return [
    schedule.publish && `${schedule.publish.status === 'blocked' ? 'Publish paused' : 'Publishes'} ${short(schedule.publish.runAt)}`,
    schedule.unpublish && `Unpublishes ${short(schedule.unpublish.runAt)}`,
  ].filter(Boolean).join(' · ');
}

export function ScheduleDialog({ open, onClose, type, item, timezone, dirty = false, onSaved }) {
  const tz = timezone || 'America/New_York';
  const sched = item?.schedule ?? {};
  const published = item?.state === 'published' || item?.state === 'modified';
  const [publishOn, setPublishOn] = useState(false);
  const [unpublishOn, setUnpublishOn] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [unpublishAt, setUnpublishAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    const soon = isoToZonedLocal(new Date(Date.now() + 3600_000 - (Date.now() % 900_000)).toISOString(), tz);
    setPublishOn(Boolean(sched.publish));
    setUnpublishOn(Boolean(sched.unpublish));
    setPublishAt(sched.publish ? isoToZonedLocal(sched.publish.runAt, tz) : soon);
    setUnpublishAt(sched.unpublish ? isoToZonedLocal(sched.unpublish.runAt, tz) : '');
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pubIso = publishOn ? zonedLocalToIso(publishAt, tz) : null;
  const unpubIso = unpublishOn ? zonedLocalToIso(unpublishAt, tz) : null;
  const now = Date.now();
  const problems = [];
  if (publishOn && !pubIso) problems.push('Choose a publish date and time.');
  else if (pubIso && Date.parse(pubIso) < now + 60_000) problems.push('The publish time must be at least a minute from now.');
  if (unpublishOn && !unpubIso) problems.push('Choose an unpublish date and time.');
  else if (unpubIso && Date.parse(unpubIso) < now + 60_000) problems.push('The unpublish time must be at least a minute from now.');
  if (pubIso && unpubIso && Date.parse(unpubIso) <= Date.parse(pubIso)) problems.push('The unpublish time must be after the publish time.');
  if (unpublishOn && !publishOn && !published) problems.push('This item is not published yet: schedule a publish time too, or publish it first.');
  if (publishOn && dirty) problems.push('Save the draft first: a scheduled publish publishes the saved draft.');

  // Only send what changed (undefined = leave the CMS schedule as it is).
  const change = (on, iso, existing) => {
    if (!on) return existing ? null : undefined;
    if (existing && existing.status !== 'blocked' && Date.parse(existing.runAt) === Date.parse(iso)) return undefined;
    return iso;
  };
  const body = { publishAt: change(publishOn, pubIso, sched.publish), unpublishAt: change(unpublishOn, unpubIso, sched.unpublish) };
  const nothing = body.publishAt === undefined && body.unpublishAt === undefined;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const schedule = await studioApi.setSchedule(type, item.id, body);
      onSaved?.(schedule);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const existing = (label, s) => s && (
    <Alert severity={s.status === 'blocked' ? 'warning' : 'info'} icon={<ScheduleRoundedIcon fontSize="inherit" />} sx={{ py: 0.25 }}>
      <b>{label}:</b> {formatInZone(s.runAt, tz)} · {STATUS_TEXT[s.status] ?? s.status}{s.actorName ? ` · set by ${s.actorName}` : ''}
      {s.status === 'blocked' && <div>{s.lastError} Save below to confirm the schedule for the current draft.</div>}
      {s.attempts > 0 && s.lastError && s.status !== 'blocked' && <div>Last attempt failed: {s.lastError}</div>}
    </Alert>
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Schedule publishing</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" sx={{ flex: 1 }} noWrap>{item?.title ?? item?.question}</Typography>
            <StateChip state={item?.state} />
          </Stack>
          {existing('Publish', sched.publish)}
          {existing('Unpublish', sched.unpublish)}
          <Typography variant="caption" color="text.secondary">Times are in the institution’s timezone: <b>{zoneLabel(tz)}</b>. The CMS runs scheduled actions on the server, even when nobody is signed in.</Typography>
          <Box>
            <FormControlLabel control={<Switch checked={publishOn} onChange={(e) => setPublishOn(e.target.checked)} />} label={published ? 'Publish the current draft changes at a set time' : 'Publish at a set time'} />
            {publishOn && <TextField type="datetime-local" size="small" fullWidth value={publishAt} onChange={(e) => setPublishAt(e.target.value)} label="Publish on" InputLabelProps={{ shrink: true }} sx={{ mt: 1 }} inputProps={{ 'aria-label': 'Publish date and time' }} />}
          </Box>
          <Box>
            <FormControlLabel control={<Switch checked={unpublishOn} onChange={(e) => setUnpublishOn(e.target.checked)} />} label="Unpublish automatically at a set time" />
            {unpublishOn && <TextField type="datetime-local" size="small" fullWidth value={unpublishAt} onChange={(e) => setUnpublishAt(e.target.value)} label="Unpublish on" InputLabelProps={{ shrink: true }} sx={{ mt: 1 }} inputProps={{ 'aria-label': 'Unpublish date and time' }} />}
          </Box>
          {publishOn && <Typography variant="caption" color="text.secondary">The publish uses the draft as saved now, with its audience settings. If the draft is edited before then, the schedule pauses until you confirm it again.</Typography>}
          {problems.length > 0 && <Alert severity="warning">{problems.map((p) => <div key={p}>{p}</div>)}</Alert>}
          {error && <Alert severity="error">{error.message}{errorLines(error).map((l) => <div key={l}>{l}</div>)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose} disabled={busy}>Close</MuiButton>
        <MuiButton variant="contained" onClick={save} disabled={busy || problems.length > 0 || nothing}>{busy ? 'Saving…' : 'Save schedule'}</MuiButton>
      </DialogActions>
    </Dialog>
  );
}
