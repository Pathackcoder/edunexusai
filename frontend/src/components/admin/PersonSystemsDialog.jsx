import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import MuiButton from '@mui/material/Button';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { DataState } from '../common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi, moodleAdminApi } from '../../services/api';

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

export function PersonSystemsDialog({ userId, onClose }) {
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.personSystems(userId), [userId], { enabled: Boolean(userId) });
  const [credential, setCredential] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState(null);
  if (!userId) return null;
  const issue = async () => {
    if (!window.confirm('Replace this person’s Moodle password with a new one-time password? Their current Moodle password stops working.')) return;
    setIssuing(true); setIssueError(null);
    try {
      const res = await moodleAdminApi.issueOneTimePassword(data.profile.entityType, data.profile.id);
      setCredential(res.oneTimeCredential);
    } catch (caught) {
      setIssueError(caught?.message ?? 'Moodle refused the change.');
    } finally {
      setIssuing(false);
    }
  };
  const close = () => { setCredential(null); onClose(); };
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
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="subtitle2" sx={{ minWidth: 120 }}>Moodle</Typography>
              {data.moodle.state === 'NOT_LINKED' ? <Chip size="small" label="No Moodle account linked" /> : (
                <>
                  <Chip size="small" color={data.moodle.state === 'LINKED' ? 'success' : 'warning'} label={data.moodle.state === 'LINKED' ? 'Linked' : 'Suspended'} />
                  <Typography variant="body2">{data.moodle.account ? `${data.moodle.account.username} · ID number ${data.moodle.account.idnumber ?? '—'}` : `Moodle user ${data.moodle.moodleUserId}`}</Typography>
                </>
              )}
            </Stack>
            {data.moodle.liveError && <Alert severity="warning">Moodle could not be read: {data.moodle.liveError}</Alert>}
            {data.warnings.map((w) => <Alert key={w} severity="warning">{w}</Alert>)}
            {data.moodle.state === 'LINKED' && data.profile && (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">Moodle has its own password. If the person cannot sign in to Moodle and email cannot reach them, issue a one-time password (Moodle requires a new one at first login).</Typography>
                <Button size="sm" variant="secondary" loading={issuing} onClick={issue} sx={{ alignSelf: 'flex-start' }}>Issue one-time Moodle password</Button>
              </Stack>
            )}
            {issueError && <Alert severity="error">{issueError}</Alert>}
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
