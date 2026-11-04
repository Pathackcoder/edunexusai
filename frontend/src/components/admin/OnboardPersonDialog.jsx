import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import MuiButton from '@mui/material/Button';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi, sisAdminApi } from '../../services/api';
import { MoodleEnrolmentFields } from './MoodleEnrolmentFields';

/**
 * Add a person: one workflow across the three systems.
 *
 *   1. Find   CampusCore record, EduNexusAI login and Moodle account for the person (read-only).
 *   2. Set up what is missing: the CampusCore record (only where CampusCore allows creating it),
 *             the EduNexusAI login (new, with a temporary password, or link the existing one),
 *             and the Moodle account and courses, with an explicit first-password choice.
 *   3. Result each system's outcome, what failed, and what to do next. A one-time Moodle
 *             password is shown here once and kept only in this dialog's memory.
 */

const STATUS_COLOR = { DONE: 'success', ALREADY: 'info', SKIPPED: 'default', BLOCKED: 'warning', FAILED: 'error' };
const STATUS_LABEL = { DONE: 'Done', ALREADY: 'Already in place', SKIPPED: 'Skipped', BLOCKED: 'Blocked', FAILED: 'Failed' };
export const CREDENTIALS = [
  ['EMAIL', 'Moodle emails a password', 'Moodle generates a password and emails it to the institutional address; it must be changed at first Moodle login. Needs a mailbox that receives mail.'],
  ['ONE_TIME', 'Show a one-time password to hand over', 'Shown once after onboarding, never stored. Moodle requires a new password at first login. Use when email cannot reach the person.'],
  ['NONE', 'No password now', 'The person uses "Forgotten password" on Moodle later (needs working email), or you issue a one-time password from Users & Roles → Systems.'],
];

const strongPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return `${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}aA7`;
};

function StepRow({ label, value }) {
  if (!value) return null;
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ py: 0.75 }}>
      <Chip size="small" color={STATUS_COLOR[value.status] ?? 'default'} label={STATUS_LABEL[value.status] ?? value.status} sx={{ minWidth: 112 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">{value.message}</Typography>
      </Box>
    </Stack>
  );
}

export function OnboardingResult({ result, courseNames = {} }) {
  const { steps } = result;
  return (
    <Stack spacing={1.5}>
      <Alert severity={result.outcome === 'COMPLETED' ? 'success' : result.outcome === 'PARTIAL' ? 'warning' : 'error'}>
        {result.outcome === 'COMPLETED' ? 'Onboarding completed in every requested system.' : result.outcome === 'PARTIAL' ? 'Onboarding partly completed. What was created is kept; see the actions below.' : 'Nothing was created. See why below.'}
      </Alert>
      <Box>
        <StepRow label="CampusCore record" value={steps.sisRecord} />
        <StepRow label="EduNexusAI login" value={steps.login} />
        <StepRow label="Moodle account" value={steps.moodleAccount} />
        {steps.moodleEnrolments.map((e, i) => <StepRow key={`${e.moodleCourseId ?? e.sisSectionId ?? 'x'}-${i}`} label={e.source === 'CAMPUSCORE' ? 'Moodle course from CampusCore registration' : `Moodle course: ${courseNames[e.moodleCourseId] ?? e.moodleCourseId}`} value={e} />)}
      </Box>
      {result.oneTimeCredential && (
        <Alert severity="warning" icon={false}>
          <Typography variant="subtitle2">Moodle sign-in, shown only now</Typography>
          <Typography variant="body2">Site: {result.oneTimeCredential.loginUrl}</Typography>
          <Typography variant="body2">Username: <b>{result.oneTimeCredential.username}</b></Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>One-time password: <b>{result.oneTimeCredential.password}</b></Typography>
          <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>Hand this over privately. It is not stored anywhere and cannot be shown again; Moodle asks for a new password at first login. This is separate from the EduNexusAI password.</Typography>
        </Alert>
      )}
      {steps.moodleAccount?.username && !result.oneTimeCredential && (
        <Alert severity="info">Moodle username: <b>{steps.moodleAccount.username}</b>{steps.moodleAccount.loginUrl ? ` at ${steps.moodleAccount.loginUrl}` : ''}. {steps.moodleAccount.passwordDelivery === 'EXISTING_MOODLE_PASSWORD' ? 'They keep their existing Moodle password.' : ''}</Alert>
      )}
      {result.requiredActions.length > 0 && (
        <Box>
          <Typography variant="subtitle2">Next steps</Typography>
          {result.requiredActions.map((a) => <Typography key={a} variant="body2" component="li">{a}</Typography>)}
        </Box>
      )}
    </Stack>
  );
}

export function OnboardPersonDialog({ open, onClose, onDone, tiers = [] }) {
  const [role, setRole] = useState('STUDENT');
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState(null);
  const [record, setRecord] = useState(null); // chosen CampusCore record
  const [createRecord, setCreateRecord] = useState(null); // new CampusCore student fields
  const [idempotencyKey, setIdempotencyKey] = useState(null);
  const [loginMode, setLoginMode] = useState('NEW');
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [tierKey, setTierKey] = useState('STANDARD');
  const [admin, setAdmin] = useState({ firstName: '', lastName: '', email: '' });
  const [moodle, setMoodle] = useState({ provision: true, courseIds: [], courseNames: {} });
  const [fromSis, setFromSis] = useState(true);
  const [moodleUsable, setMoodleUsable] = useState(false);
  const [credentials, setCredentials] = useState('EMAIL');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const ref = useApiQuery(() => sisAdminApi.reference(), [open, createRecord !== null], { enabled: open && createRecord !== null });

  useEffect(() => {
    if (!open) return;
    setRole('STUDENT'); setQuery(''); setLookup(null); setError(null); setRecord(null); setCreateRecord(null);
    setIdempotencyKey(crypto.randomUUID()); setLoginMode('NEW'); setVerified(false); setPassword(strongPassword());
    setTierKey('STANDARD'); setAdmin({ firstName: '', lastName: '', email: '' }); setMoodle({ provision: true, courseIds: [], courseNames: {} });
    setCredentials('EMAIL'); setResult(null);
  }, [open]);

  const isSisRole = role !== 'ADMIN';
  const find = async (sisRecordId) => {
    setLooking(true); setError(null); setRecord(null); setCreateRecord(null);
    try {
      const q = query.trim();
      const body = sisRecordId ? { role, sisRecordId } : q.includes('@') ? { role, email: q } : { role, institutionalId: q };
      const data = await adminApi.lookupPerson(body);
      setLookup(data);
      const records = data.sis?.records ?? [];
      if (records.length === 1) setRecord(records[0]);
      const existing = data.portal?.existingUser;
      setLoginMode(data.recommendation?.action === 'LINK_EXISTING_LOGIN' && existing ? 'LINK_EXISTING' : 'NEW');
      if (data.recommendation?.action === 'CREATE_IN_SIS') setCreateRecord({ firstName: '', lastName: '', email: q.includes('@') ? q : '', programId: '', admitTermId: '', status: 'ADMITTED' });
    } catch (caught) {
      setError(caught?.message ?? 'Lookup failed.');
    } finally {
      setLooking(false);
    }
  };

  const action = lookup?.recommendation?.action;
  const existingUser = lookup?.portal?.existingUser;
  const canSubmit = !result && (role === 'ADMIN'
    ? admin.firstName && admin.lastName && admin.email && password.length >= 12
    : (record?.provisionable || (createRecord && createRecord.firstName && createRecord.lastName && createRecord.email && createRecord.programId) || action === 'ALREADY_ONBOARDED')
      && (loginMode === 'NEW' ? password.length >= 12 || action === 'ALREADY_ONBOARDED' : verified));

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      const withMoodle = isSisRole && moodle.provision && moodleUsable;
      const body = role === 'ADMIN'
        ? { role, account: { ...admin, password } }
        : {
            role,
            sis: createRecord ? { mode: 'CREATE', idempotencyKey, record: Object.fromEntries(Object.entries(createRecord).filter(([, v]) => v !== '')) } : { mode: 'EXISTING', sisRecordId: record?.sisId ?? lookup?.sis?.records?.[0]?.sisId },
            login: loginMode === 'LINK_EXISTING' ? { mode: 'LINK_EXISTING', userId: existingUser.id } : { mode: 'NEW', password },
            ...(role === 'STUDENT' ? { tierKey } : {}),
            moodle: { enabled: withMoodle, fromSis, courseIds: withMoodle ? moodle.courseIds : [], credentials },
          };
      const data = await adminApi.onboardPerson(body);
      setResult(data);
      onDone?.();
    } catch (caught) {
      setError(caught?.fieldErrors ? Object.values(caught.fieldErrors).join(' ') : caught?.message ?? 'Onboarding failed.');
    } finally {
      setSaving(false);
    }
  };

  const close = () => { setResult(null); onClose(); }; // the one-time password leaves memory with the dialog

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title="Add a person"
      subtitle="Finds the person in CampusCore, EduNexusAI and Moodle first, and links what exists instead of duplicating it."
      maxWidth="760px"
      footer={
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="sm" variant="ghost" onClick={close}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && <Button size="sm" variant="primary" disabled={!canSubmit} loading={saving} onClick={submit}>{action === 'ALREADY_ONBOARDED' ? 'Complete missing steps' : 'Onboard'}</Button>}
        </Stack>
      }
    >
      {result ? (
        <OnboardingResult result={result} courseNames={moodle.courseNames} />
      ) : (
        <Stack spacing={2}>
          <TextField select size="small" label="Role" value={role} onChange={(e) => { setRole(e.target.value); setLookup(null); setRecord(null); setCreateRecord(null); }} sx={{ maxWidth: 240 }}>
            <MenuItem value="STUDENT">Student</MenuItem>
            <MenuItem value="FACULTY">Faculty</MenuItem>
            <MenuItem value="ADMIN">Administrator (portal only)</MenuItem>
          </TextField>

          {role === 'ADMIN' ? (
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField size="small" label="First name" value={admin.firstName} onChange={(e) => setAdmin({ ...admin, firstName: e.target.value })} fullWidth />
                <TextField size="small" label="Last name" value={admin.lastName} onChange={(e) => setAdmin({ ...admin, lastName: e.target.value })} fullWidth />
              </Stack>
              <TextField size="small" label="Email" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
            </Stack>
          ) : (
            <>
              <Stack direction="row" spacing={1}>
                <TextField size="small" fullWidth label={`Institutional email or ${role === 'STUDENT' ? 'student' : 'employee'} number`} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) find(); }} />
                <Button size="sm" variant="secondary" loading={looking} disabled={!query.trim()} onClick={() => find()}>Find</Button>
              </Stack>

              {lookup && (
                <Stack spacing={1.25}>
                  <Alert severity={['BLOCKED', 'AMBIGUOUS', 'RETRY_LATER'].includes(action) ? 'warning' : 'info'}>{lookup.recommendation?.message}</Alert>

                  <Typography variant="subtitle2">CampusCore</Typography>
                  {(lookup.sis?.records ?? []).length > 1 && (lookup.sis.records.map((r) => (
                    <MuiButton key={r.sisId} size="small" variant={record?.sisId === r.sisId ? 'contained' : 'outlined'} onClick={() => find(r.sisId)} sx={{ justifyContent: 'flex-start' }}>
                      {r.firstName} {r.lastName} · {r.institutionalId} · {r.email}
                    </MuiButton>
                  )))}
                  {record && (
                    <Typography variant="body2">
                      <b>{record.firstName} {record.lastName}</b> · {record.institutionalId} · {record.email} · {String(record.status).toLowerCase().replace(/_/g, ' ')}{record.program ? ` · ${record.program}` : ''}{record.department ? ` · ${record.department}` : ''}
                      {record.linkedTo ? ` · linked to ${record.linkedTo.email ?? 'another account'}` : ' · no portal login linked'}
                    </Typography>
                  )}
                  {createRecord && (
                    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ mb: 1 }}>Create the student in CampusCore (CampusCore assigns the student number):</Typography>
                      <Stack spacing={1.25}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                          <TextField size="small" label="First name" value={createRecord.firstName} onChange={(e) => setCreateRecord({ ...createRecord, firstName: e.target.value })} fullWidth />
                          <TextField size="small" label="Last name" value={createRecord.lastName} onChange={(e) => setCreateRecord({ ...createRecord, lastName: e.target.value })} fullWidth />
                        </Stack>
                        <TextField size="small" label="Institutional email" value={createRecord.email} onChange={(e) => setCreateRecord({ ...createRecord, email: e.target.value })} />
                        <TextField select size="small" label="Program" value={createRecord.programId} onChange={(e) => setCreateRecord({ ...createRecord, programId: e.target.value })}>
                          {(ref.data?.programs ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.code} · {p.name}</MenuItem>)}
                        </TextField>
                        <TextField select size="small" label="Admit term" value={createRecord.admitTermId} onChange={(e) => setCreateRecord({ ...createRecord, admitTermId: e.target.value })}>
                          <MenuItem value="">Not specified</MenuItem>
                          {(ref.data?.terms ?? []).map((t) => <MenuItem key={t.source.id} value={t.source.id}>{t.name}</MenuItem>)}
                        </TextField>
                      </Stack>
                    </Box>
                  )}

                  {(record?.provisionable || createRecord || action === 'ALREADY_ONBOARDED') && (
                    <>
                      <Divider />
                      <Typography variant="subtitle2">EduNexusAI login</Typography>
                      {action === 'ALREADY_ONBOARDED' ? (
                        <Typography variant="body2">Already linked to {lookup.portal.linkedUser?.email}. Only missing Moodle steps run.</Typography>
                      ) : (
                        <>
                          {existingUser && (
                            <RadioGroup value={loginMode} onChange={(e) => setLoginMode(e.target.value)}>
                              <FormControlLabel value="LINK_EXISTING" control={<Radio size="small" />} label={`Link the existing login ${existingUser.email} (no second login)`} />
                              <FormControlLabel value="NEW" control={<Radio size="small" />} label="Create a new login" disabled />
                            </RadioGroup>
                          )}
                          {loginMode === 'LINK_EXISTING' ? (
                            <FormControlLabel control={<Checkbox checked={verified} onChange={(e) => setVerified(e.target.checked)} />} label="I have verified this login belongs to the same person as the CampusCore record." />
                          ) : (
                            <Stack direction="row" spacing={1} alignItems="flex-start">
                              <TextField size="small" fullWidth label="Temporary EduNexusAI password" value={password} onChange={(e) => setPassword(e.target.value)} helperText={`Login email: ${record?.email ?? createRecord?.email ?? ''}. At least 12 characters with upper case, lower case and a number; they must change it at first sign-in. Share it privately; it is stored only as a hash.`} />
                              <MuiButton size="small" onClick={() => setPassword(strongPassword())} sx={{ mt: 0.5 }}>Generate</MuiButton>
                            </Stack>
                          )}
                        </>
                      )}
                      {role === 'STUDENT' && action !== 'ALREADY_ONBOARDED' && loginMode === 'NEW' && (
                        <TextField select size="small" label="Student tier" value={tierKey} onChange={(e) => setTierKey(e.target.value)} sx={{ maxWidth: 240 }}>
                          {tiers.map((t) => <MenuItem key={t.key} value={t.key}>{t.name}</MenuItem>)}
                        </TextField>
                      )}

                      <Divider />
                      <Typography variant="subtitle2">Moodle LMS</Typography>
                      {lookup.moodle?.state === 'FOUND' && <Alert severity="info">Moodle account <b>{lookup.moodle.account.username}</b> already exists ({lookup.moodle.linkedTo ? 'already linked' : `matched by ${lookup.moodle.account.matchedBy === 'IDNUMBER_MATCH' ? 'ID number' : 'email'}`}). It is linked, not duplicated, and keeps its own password.</Alert>}
                      {lookup.moodle?.state === 'NOT_FOUND' && <Typography variant="body2" color="text.secondary">No Moodle account yet. One will be created with username <b>{lookup.moodle.proposed.username}</b> and ID number {lookup.moodle.proposed.idnumber}.</Typography>}
                      {lookup.moodle?.state === 'CONFLICT' && <Alert severity="warning">{lookup.moodle.message} Untick Moodle and resolve it in Moodle first.</Alert>}
                      {['NOT_CONFIGURED', 'UNAVAILABLE', 'FUNCTION_NOT_ENABLED'].includes(lookup.moodle?.state) && <Alert severity="warning">Moodle: {lookup.moodle.message}</Alert>}
                      <FormControlLabel control={<Switch checked={moodle.provision} onChange={(e) => setMoodle({ ...moodle, provision: e.target.checked, courseIds: e.target.checked ? moodle.courseIds : [] })} />} label="Create or link the Moodle account" />
                      {moodle.provision && (
                        <>
                          {lookup.moodle?.state !== 'FOUND' && (
                            <RadioGroup value={credentials} onChange={(e) => setCredentials(e.target.value)}>
                              {CREDENTIALS.map(([value, label, help]) => (
                                <FormControlLabel key={value} value={value} control={<Radio size="small" />} label={<Box><Typography variant="body2">{label}</Typography><Typography variant="caption" color="text.secondary">{help}</Typography></Box>} sx={{ alignItems: 'flex-start', mb: 0.5 }} />
                              ))}
                            </RadioGroup>
                          )}
                          <FormControlLabel control={<Checkbox checked={fromSis} onChange={(e) => setFromSis(e.target.checked)} />} label={<Box><Typography variant="body2">Enrol in the Moodle courses of their CampusCore {role === 'FACULTY' ? 'teaching sections' : 'registrations'}</Typography><Typography variant="caption" color="text.secondary">Uses Moodle LMS → CampusCore classes mappings. Classes without a Moodle course are listed in the result, not invented. A student with no registrations yet gets no courses; sync later from Systems.</Typography></Box>} sx={{ alignItems: 'flex-start' }} />
                          <Typography variant="subtitle2" sx={{ mt: 1 }}>Additional Moodle courses (optional)</Typography>
                          <Typography variant="caption" color="text.secondary">Only for Moodle courses that are not CampusCore classes, such as orientation or a library course.</Typography>
                          <MoodleEnrolmentFields open={open} value={moodle} onChange={setMoodle} onAvailability={setMoodleUsable} showProvisionSwitch={false} audience={role === 'FACULTY' ? 'faculty' : 'student'} />
                        </>
                      )}
                    </>
                  )}
                </Stack>
              )}
            </>
          )}

          {role === 'ADMIN' && (
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField size="small" fullWidth label="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} helperText="Must be changed at first sign-in. Administrators have no CampusCore or Moodle account from EduNexusAI." />
              <MuiButton size="small" onClick={() => setPassword(strongPassword())} sx={{ mt: 0.5 }}>Generate</MuiButton>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      )}
    </Modal>
  );
}
