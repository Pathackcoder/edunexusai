import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import MuiButton from '@mui/material/Button';
import Box from '@mui/material/Box';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { DataState } from '../common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi, moodleAdminApi } from '../../services/api';
import { CREDENTIALS } from './OnboardPersonDialog';

/**
 * One person across EduNexusAI, CampusCore and Moodle, read live, with consistency warnings
 * (e.g. a Moodle ID number that does not match the CampusCore record). Issuing a one-time
 * Moodle password shows it here once; it is never stored.
 */
const PLAN_TEXT = { ENROLLED: ['success', 'In Moodle'], TEACHING: ['success', 'Teaching in Moodle'], TO_ENROL: ['info', 'To enrol'], NO_MOODLE_COURSE: ['default', 'No Moodle course'], WAITLISTED: ['default', 'Waitlisted'], NEEDS_MOODLE_ACCOUNT: ['warning', 'No Moodle account'], MOODLE_ACCOUNT_SUSPENDED: ['warning', 'Moodle suspended'], MOODLE_COURSE_MISSING: ['error', 'Moodle course missing'], OTHER_ROLE: ['warning', 'Other Moodle role'] };

/** Moodle enrolments derived from the person's CampusCore registrations or teaching sections. */
function SisMoodlePlan({ userId }) {
  const plan = useApiQuery(() => moodleAdminApi.personSisPlan(userId), [userId]);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState(null);
  const p = plan.data?.plan;
  if (plan.loading) return <Typography variant="body2">Comparing CampusCore classes with Moodle…</Typography>;
  if (plan.error) return <Alert severity="warning">{plan.error.message}</Alert>;
  if (!p || plan.data.kind === 'NONE') return null;
  const apply = async () => {
    setApplying(true); setMessage(null);
    try {
      const res = await moodleAdminApi.applyPersonSisPlan(userId);
      plan.setData({ ...plan.data, plan: res.plan });
      const failed = res.results.filter((r) => !['DONE', 'ALREADY'].includes(r.status));
      setMessage(failed.length ? { severity: 'error', text: failed.map((f) => f.message).join(' ') } : { severity: 'success', text: `${res.results.length} Moodle enrolment(s) completed.` });
    } catch (e) {
      setMessage({ severity: 'error', text: e.message });
    } finally {
      setApplying(false);
    }
  };
  const pending = (p.classes ?? []).filter((c) => c.status === 'TO_ENROL').length;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Moodle courses from CampusCore {plan.data.kind === 'FACULTY' ? 'teaching sections' : 'registrations'}</Typography>
      {p.state !== 'OK' && <Alert severity="info">{p.state === 'UNMAPPED' ? 'Not linked to CampusCore, so there are no registrations to follow.' : p.state}</Alert>}
      {p.state === 'OK' && (p.classes.length === 0 ? <Typography variant="body2" color="text.secondary">No current or upcoming CampusCore {plan.data.kind === 'FACULTY' ? 'teaching sections' : 'registrations'}.</Typography> : p.classes.map((c) => (
        <Stack key={c.sisSectionId} direction="row" justifyContent="space-between" spacing={1}>
          <Typography variant="body2">{c.courseCode}-{c.sectionCode} ({c.termCode}){c.moodleCourse ? ` → ${c.moodleCourse.shortName}` : ''}</Typography>
          <Chip size="small" color={PLAN_TEXT[c.status]?.[0] ?? 'default'} label={PLAN_TEXT[c.status]?.[1] ?? c.status} />
        </Stack>
      )))}
      {(p.review ?? []).map((r) => <Alert key={r.moodleCourse.moodleCourseId} severity="warning">Moodle {r.moodleCourse.shortName ?? r.moodleCourse.moodleCourseId}: {r.reason}</Alert>)}
      {pending > 0 && <Button size="sm" variant="secondary" loading={applying} onClick={apply} sx={{ alignSelf: 'flex-start' }}>Enrol in {pending} Moodle course(s)</Button>}
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
    </Stack>
  );
}

const MOODLE_STATE = { LINKED: ['success', 'Linked'], SUSPENDED: ['warning', 'Suspended in Moodle'], NOT_LINKED: ['default', 'Not linked'], PROVISIONING_FAILED: ['error', 'Provisioning failed'] };
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

/**
 * One profile's Moodle account, with the actions that resolve it. Every action goes through the existing Moodle
 * services (link with identity checks, provisioning with the onboarding password options); nothing here edits a
 * Moodle account directly, and a link is never replaced without unlinking it first.
 *   Linked                account, ID number, email, courses; refresh, unlink, one-time password
 *   Exists, not linked    the matching account (institutional ID / email) → Link
 *   Does not exist        Create (password options as in Add a person)
 *   Conflict / wrong one  explicit Moodle user id, checked against the institutional ID and email before linking
 */
function MoodleAccountPanel({ profile, multiple, onCredential }) {
  const { data, loading, error, refetch } = useApiQuery(() => moodleAdminApi.profileMoodle(profile.entityType, profile.id), [profile.entityType, profile.id]);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [credentials, setCredentials] = useState('NONE');
  const [manualId, setManualId] = useState('');
  const run = async (key, fn, success) => {
    setBusy(key); setMessage(null);
    try {
      const res = await fn();
      if (res?.oneTimeCredential) onCredential(res.oneTimeCredential);
      setMessage({ severity: 'success', text: typeof success === 'function' ? success(res) : success });
      await refetch();
    } catch (caught) {
      setMessage({ severity: 'error', text: caught?.message ?? 'Moodle refused the change.' });
    } finally {
      setBusy(null);
    }
  };
  const link = (moodleUserId) => run('link', () => moodleAdminApi.linkProfile(profile.entityType, profile.id, moodleUserId), (res) => `Linked to Moodle user ${res.moodleUserId} (${res.linkMethod.replace(/_/g, ' ').toLowerCase()}).`);
  const unlink = () => {
    if (!window.confirm('Remove the link to this Moodle account? The Moodle account, its courses and history stay as they are; only EduNexusAI stops using it.')) return;
    run('unlink', () => moodleAdminApi.unlinkProfile(profile.entityType, profile.id), 'Unlinked. Link the correct Moodle account below.');
  };
  const create = () => run('create', () => moodleAdminApi.provisionProfile(profile.entityType, profile.id, credentials), (res) => {
    const r = res.result ?? {};
    if (r.action === 'CREATED') return `Moodle account ${r.username} (user ${r.moodleUserId}) created.`;
    if (r.action === 'LINKED_EXISTING' || r.action === 'LINKED_SAME_PERSON' || r.action === 'ALREADY_LINKED') return `An existing Moodle account (user ${r.moodleUserId}) was linked; no new account was created.`;
    return 'Done.';
  });
  const issue = () => {
    if (!window.confirm('Replace this person’s Moodle password with a new one-time password? Their current Moodle password stops working.')) return;
    run('otp', () => moodleAdminApi.issueOneTimePassword(profile.entityType, profile.id), 'One-time password issued (shown below once).');
  };
  const label = profile.entityType === 'FACULTY' ? 'Teaching profile' : 'Student profile';
  return (
    <Stack spacing={1} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography variant="subtitle2" sx={{ minWidth: 120 }}>Moodle{multiple ? ` · ${label}` : ''}</Typography>
        {data && <Chip size="small" color={MOODLE_STATE[data.state]?.[0] ?? 'default'} label={MOODLE_STATE[data.state]?.[1] ?? data.state} />}
        <MuiButton size="small" onClick={refetch} disabled={loading || Boolean(busy)}>Refresh</MuiButton>
      </Stack>
      <DataState loading={loading} error={error} onRetry={refetch} minHeight={60}>
        {() => (
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary">Matched on institutional ID <b>{data.matchedOn.institutionalId}</b> and email {data.matchedOn.email}</Typography>
            {['LINKED', 'SUSPENDED'].includes(data.state) && (
              <>
                {data.account ? (
                  <Typography variant="body2">
                    Moodle user <b>{data.moodleUserId}</b> · username <b>{data.account.username}</b> · ID number {data.account.idNumber ?? '—'} · {data.account.email ?? 'no email'}
                  </Typography>
                ) : <Typography variant="body2">Moodle user {data.moodleUserId}</Typography>}
                {data.accountMissing && <Alert severity="error">Moodle user {data.moodleUserId} no longer exists in Moodle. Unlink it, then link or create the correct account.</Alert>}
                {data.account?.idNumber && data.account.idNumber !== data.matchedOn.institutionalId && <Alert severity="warning">The Moodle ID number {data.account.idNumber} differs from {data.matchedOn.institutionalId}: this may be someone else’s account. Unlink it and link the correct one.</Alert>}
                {data.liveError && <Alert severity="warning">Moodle could not be read: {data.liveError}</Alert>}
                <Typography variant="caption" color="text.secondary">Linked {fmt(data.linkedAt)} ({String(data.linkMethod ?? '').replace(/_/g, ' ').toLowerCase()}) · last verified {fmt(data.lastVerifiedAt)}{data.checkedAt ? ` · read from Moodle ${fmt(data.checkedAt)}` : ''}</Typography>
                {data.courses && (data.courses.length
                  ? <Stack spacing={0.25}>{data.courses.map((c) => <Typography key={c.moodleCourseId} variant="body2">• <a href={c.url} target="_blank" rel="noreferrer">{c.shortName}</a> {c.fullName}</Typography>)}</Stack>
                  : <Typography variant="body2" color="text.secondary">Not enrolled in any Moodle course.</Typography>)}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Button size="sm" variant="secondary" loading={busy === 'otp'} disabled={Boolean(busy)} onClick={issue}>Issue one-time Moodle password</Button>
                  <Button size="sm" variant="secondary" loading={busy === 'unlink'} disabled={Boolean(busy)} onClick={unlink}>Unlink (wrong account)</Button>
                </Stack>
              </>
            )}
            {['NOT_LINKED', 'PROVISIONING_FAILED'].includes(data.state) && (
              <>
                {data.state === 'PROVISIONING_FAILED' && <Alert severity="error">The last Moodle account attempt ({fmt(data.lastOperation?.updatedAt)}) did not complete: {data.lastOperation?.errorMessage ?? data.lastOperation?.status}</Alert>}
                {data.candidate?.state === 'FOUND' && (data.candidate.linkedTo
                  ? <Alert severity="warning">Moodle account {data.candidate.account.moodleUserId} ({data.candidate.account.username}) matches, but it is already linked to another profile. One Moodle account belongs to one person.</Alert>
                  : (
                    <Stack spacing={0.75}>
                      <Alert severity="info">A Moodle account exists but is not linked: user <b>{data.candidate.account.moodleUserId}</b> · {data.candidate.account.username} · ID number {data.candidate.account.idnumber ?? '—'} · {data.candidate.account.email} (matched by {String(data.candidate.account.matchedBy).replace(/_/g, ' ').toLowerCase()}).</Alert>
                      <Button size="sm" loading={busy === 'link'} disabled={Boolean(busy)} onClick={() => link(data.candidate.account.moodleUserId)} sx={{ alignSelf: 'flex-start' }}>Link existing Moodle account</Button>
                    </Stack>
                  ))}
                {data.candidate?.state === 'NOT_FOUND' && (
                  <Stack spacing={0.75}>
                    <Typography variant="body2">No Moodle account exists for this person. Create one with username <b>{data.candidate.proposed?.username}</b> and ID number <b>{data.candidate.proposed?.idnumber}</b>:</Typography>
                    <RadioGroup value={credentials} onChange={(e) => setCredentials(e.target.value)}>
                      {CREDENTIALS.map(([value, text, help]) => (
                        <FormControlLabel key={value} value={value} control={<Radio size="small" />} label={<Box><Typography variant="body2">{text}</Typography><Typography variant="caption" color="text.secondary">{help}</Typography></Box>} sx={{ alignItems: 'flex-start', mb: 0.5 }} />
                      ))}
                    </RadioGroup>
                    {!data.candidate.writesEnabled && <Alert severity="info">Changes to Moodle are switched off on this server (MOODLE_WRITES_ENABLED), so no Moodle account can be created right now.</Alert>}
                    <Button size="sm" loading={busy === 'create'} disabled={Boolean(busy) || !data.candidate.writesEnabled} onClick={create} sx={{ alignSelf: 'flex-start' }}>Create Moodle account</Button>
                  </Stack>
                )}
                {['CONFLICT', 'UNAVAILABLE', 'FUNCTION_NOT_ENABLED', 'NOT_CONFIGURED'].includes(data.candidate?.state) && <Alert severity="warning">{data.candidate.message}</Alert>}
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <TextField size="small" label="Moodle user id" value={manualId} onChange={(e) => setManualId(e.target.value.replace(/\D/g, ''))} sx={{ width: 160 }} />
                  <Button size="sm" variant="secondary" loading={busy === 'link'} disabled={Boolean(busy) || !manualId} onClick={() => link(Number(manualId))}>Link this Moodle account</Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">A Moodle user id is linked only if its ID number or email matches this person and no one else uses it.</Typography>
              </>
            )}
          </Stack>
        )}
      </DataState>
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
    </Stack>
  );
}

export function PersonSystemsDialog({ userId, onClose }) {
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.personSystems(userId), [userId], { enabled: Boolean(userId) });
  const [credential, setCredential] = useState(null);
  if (!userId) return null;
  const close = () => { setCredential(null); onClose(); };
  const profiles = data?.profiles ?? (data?.profile ? [data.profile] : []);
  return (
    <Modal isOpen onClose={close} title="Systems" subtitle={data?.user ? `${data.user.fullName} · ${data.user.email}` : ''} maxWidth="640px">
      <DataState loading={loading} error={error} onRetry={refetch} minHeight={120}>
        {() => (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" sx={{ minWidth: 120 }}>EduNexusAI login</Typography>
              <Chip size="small" color={data.login.status === 'ACTIVE' ? 'success' : 'default'} label={data.login.status} />
              {data.login.passwordChangeRequired && <Chip size="small" variant="outlined" label="Temporary password not yet changed" />}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="subtitle2" sx={{ minWidth: 120 }}>CampusCore</Typography>
              {data.campuscore.state === 'LINKED' && <><Chip size="small" color="success" label="Linked" /><Typography variant="body2">{data.campuscore.displayName} · {data.campuscore.institutionalId} · {String(data.campuscore.recordStatus ?? '').toLowerCase()}</Typography></>}
              {data.campuscore.state === 'UNMAPPED' && <><Chip size="small" label="Not linked" /><MuiButton size="small" component={RouterLink} to="/admin/integrations/campuscore">Identity links</MuiButton></>}
              {data.campuscore.state === 'NOT_APPLICABLE' && <Typography variant="body2" color="text.secondary">Not applicable for this role</Typography>}
              {['UNAVAILABLE', 'ERROR', 'NOT_CONFIGURED'].includes(data.campuscore.state) && <Chip size="small" color="warning" label={data.campuscore.message ?? data.campuscore.state} />}
            </Stack>
            {data.warnings.map((w) => <Alert key={w} severity="warning">{w}</Alert>)}
            {profiles.map((p) => <MoodleAccountPanel key={`${p.entityType}:${p.id}`} profile={p} multiple={profiles.length > 1} onCredential={setCredential} />)}
            {!profiles.length && <Typography variant="body2" color="text.secondary">No student or teaching profile, so no Moodle account applies.</Typography>}
            {data.profile && <SisMoodlePlan userId={userId} />}
            {credential && (
              <Alert severity="warning" icon={false}>
                <Typography variant="subtitle2">Moodle sign-in, shown only now</Typography>
                <Typography variant="body2">Site: {credential.loginUrl}</Typography>
                <Typography variant="body2">Username: <b>{credential.username}</b></Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>One-time password: <b>{credential.password}</b></Typography>
                <Typography variant="caption" component="p">Not stored anywhere. Moodle asks for a new password at first login.</Typography>
              </Alert>
            )}
          </Stack>
        )}
      </DataState>
    </Modal>
  );
}
