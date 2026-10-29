import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { DetailDrawer } from '../common/DetailDrawer';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { sisAdminApi } from '../../services/api/sisApi';

export const ROLE_LABEL = { STUDENT: 'Student', FACULTY: 'Faculty', STAFF: 'Staff', ALUMNI: 'Alumni', ADMIN: 'Administrator' };
const SOURCE_LABEL = { SIS: 'Verified SIS record', IDP: 'Institutional sign-in', MANUAL: 'Assigned by an administrator', EXISTING: 'Held before tracking' };
const STATUS_BADGE = {
  ACTIVE: { variant: 'success', label: 'Active' },
  UNLINKED: { variant: 'warning', label: 'Record missing' },
  SIS_NOT_LINKED: { variant: 'warning', label: 'SIS link missing' },
};
const REASON = {
  NO_STUDENT_RECORD: 'no student record', NO_FACULTY_RECORD: 'no faculty record', NO_STAFF_RECORD: 'no staff record',
  NO_SIS_LINK: 'record not linked in the SIS', RECORD_MISMATCH: 'institutional ID did not match the record', RECORD_INACTIVE: 'record is not active',
  SIS_UNAVAILABLE: 'SIS unavailable at sign-in',
};
const fmt = (value) => (value ? new Date(value).toLocaleString() : '—');
const errorText = (caught, fallback) => caught?.details?.fieldErrors ? Object.values(caught.details.fieldErrors).join(' ') : caught?.message ?? fallback;

/** Search CampusCore and link one record to this account (record + link + role in one step). */
function LinkRecordDialog({ userId, initialType, onClose, onLinked }) {
  const [type, setType] = useState(initialType ?? 'STUDENT');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error: searchError } = useApiQuery(
    () => (search.trim().length >= 2 ? (type === 'STUDENT' ? sisAdminApi.students({ search, pageSize: 10 }) : sisAdminApi.faculty({ search, pageSize: 10 })) : Promise.resolve({ items: [] })),
    [type, search],
  );
  const items = data?.items ?? [];
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.linkRecord(userId, { recordType: type, sisRecordId: selected, ...(reason.trim() ? { evidenceMismatchReason: reason.trim() } : {}) });
      onLinked();
    } catch (caught) {
      setError(errorText(caught, 'The record could not be linked.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Link a CampusCore record"
      subtitle="Links the person's institutional record to this account and adds the role in one step. CampusCore confirms that a second record belongs to the same person."
      footer={<Stack direction="row" spacing={1} justifyContent="flex-end"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!selected || busy} onClick={submit}>{busy ? 'Linking…' : 'Link record'}</Button></Stack>}
    >
      <Stack spacing={2}>
        <ToggleButtonGroup exclusive size="small" value={type} onChange={(_e, value) => { if (value) { setType(value); setSelected(null); } }} aria-label="Record type">
          <ToggleButton value="STUDENT">Student record</ToggleButton>
          <ToggleButton value="FACULTY">Faculty record</ToggleButton>
        </ToggleButtonGroup>
        <TextField label="Search CampusCore by name, email or institutional ID" value={search} onChange={(e) => setSearch(e.target.value)} size="small" autoFocus />
        {searchError && <Alert severity="error">{searchError.message ?? 'CampusCore could not be searched.'}</Alert>}
        {loading && search.trim().length >= 2 && <Typography variant="body2" color="text.secondary">Searching…</Typography>}
        <Stack spacing={0.75} role="radiogroup" aria-label="Matching records">
          {items.map((item) => {
            const id = item.source?.id;
            const taken = item.portalAccount && item.portalAccount.userId !== userId;
            return (
              <Paper key={id} variant="outlined" sx={{ p: 1.25, borderRadius: 2.5, opacity: taken ? 0.6 : 1 }}>
                <FormControlLabel
                  disabled={Boolean(taken)}
                  control={<Radio checked={selected === id} onChange={() => setSelected(id)} />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{item.displayName ?? `${item.firstName ?? ''} ${item.lastName ?? ''}`} · {item.institutionalId ?? item.studentNumber ?? item.employeeNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.email} · {String(item.status ?? '').toLowerCase()}{taken ? ` · already linked to ${item.portalAccount.user?.email ?? 'another account'}` : ''}</Typography>
                    </Box>
                  }
                />
              </Paper>
            );
          })}
          {!loading && search.trim().length >= 2 && items.length === 0 && <Typography variant="body2" color="text.secondary">No matching record.</Typography>}
        </Stack>
        <TextField
          label="Verification note (only if CampusCore asks for one)"
          helperText="Required when the record's email differs from this account, or CampusCore cannot confirm both records are the same person. Describe how you verified the identity."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          size="small"
          multiline
          minRows={2}
        />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </Stack>
    </Modal>
  );
}

/**
 * One account's access. Community roles (relationships, each backed by its record) and
 * administrative roles are shown apart; every role says where it came from. Student and Faculty are
 * added by linking the institutional record, never by a toggle.
 */
/**
 * Link a university sign-in on the administrator's own verification, for a person the automatic rule
 * cannot match (no student or employee number on the account, e.g. alumni). Needs the person's id at
 * the provider and how it was verified; email is never used. Linking grants no role by itself.
 */
function AdminVerifiedLink({ userId, linkedProviderIds, busy, run }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ providerId: '', subject: '', verificationNote: '' });
  const providers = useApiQuery(() => adminApi.listIdentityProviders(), [], { enabled: open });
  const options = (providers.data ?? []).filter((p) => p.enabled && !linkedProviderIds.includes(p.id));
  if (!open) return <Box sx={{ mt: 1 }}><Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Link a sign-in (administrator verified)…</Button></Box>;
  const ready = form.providerId && form.subject.trim() && form.verificationNote.trim().length >= 10;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 1, borderRadius: 3 }}>
      <Stack spacing={1.25}>
        <Typography variant="body2" fontWeight={600}>Link a sign-in you have verified</Typography>
        <Typography variant="caption" color="text.secondary">For people without a student or employee number on this account (for example alumni). Enter their user id at the provider. Roles still come only from the mapping rules or from you.</Typography>
        <TextField select size="small" label="Sign-in provider" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })} SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}>
          <option value="" disabled>Choose…</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </TextField>
        <TextField size="small" label="User id at the provider (subject)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value.trim() })} inputProps={{ maxLength: 255 }} />
        <TextField size="small" label="How you verified it" multiline minRows={2} value={form.verificationNote} onChange={(e) => setForm({ ...form, verificationNote: e.target.value })} inputProps={{ maxLength: 300 }} helperText="Recorded in the audit log." />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={!ready || busy} onClick={() => run(() => adminApi.linkSignIn(userId, { providerId: form.providerId, subject: form.subject, verificationNote: form.verificationNote.trim() }), 'Sign-in linked.').then((ok) => ok && setOpen(false))}>Link sign-in</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function AccountAccessDrawer({ userId, tiers = [], onClose, onChanged }) {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => adminApi.getAccess(userId), [userId]);
  const [confirm, setConfirm] = useState(null); // { kind: 'remove' | 'admin', role }
  const [adminAck, setAdminAck] = useState(false);
  const [staffNumber, setStaffNumber] = useState('');
  const [linkType, setLinkType] = useState(null);
  const [busy, setBusy] = useState(false);

  const changed = (message) => { showToast(message); refetch(); onChanged?.(); };
  const run = async (fn, success) => {
    setBusy(true);
    try {
      const result = await fn();
      changed(result?.notice ? `${success} ${result.notice}` : success);
      setConfirm(null);
      setAdminAck(false);
      return true;
    } catch (caught) {
      showToast(errorText(caught, 'The change could not be made.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const community = (data?.roles ?? []).filter((r) => r.category === 'COMMUNITY');
  const administrative = (data?.roles ?? []).filter((r) => r.category === 'ADMINISTRATIVE');

  const RoleCard = ({ role }) => {
    const badge = STATUS_BADGE[role.status === 'ACTIVE' && role.sisLink === 'NOT_LINKED' ? 'SIS_NOT_LINKED' : role.status] ?? STATUS_BADGE.ACTIVE;
    return (
      <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 3 }} aria-label={`${ROLE_LABEL[role.key]} role`}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2">{ROLE_LABEL[role.key]}</Typography>
            <Badge variant={badge.variant} dot>{badge.label}</Badge>
          </Stack>
          <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'remove', role: role.key })} sx={{ color: 'error.main' }}>Remove</Button>
        </Stack>
        <Stack spacing={0.4} sx={{ mt: 1 }}>
          {['STUDENT', 'FACULTY', 'STAFF'].includes(role.key) && (
            <Typography variant="caption" color="text.secondary">Record: {role.record ? role.record.number : 'none'}</Typography>
          )}
          {role.sisLink && <Typography variant="caption" color="text.secondary">CampusCore: {role.sisLink === 'LINKED' ? 'linked' : role.sisLink === 'NOT_CONFIGURED' ? 'not connected to this portal' : 'not linked'}</Typography>}
          {(role.key === 'STUDENT' || role.key === 'FACULTY') && <Typography variant="caption" color="text.secondary">Moodle: {role.moodle ? `account ${role.moodle.moodleUserId}${role.moodle.linkMethod === 'SAME_PERSON' ? ' (shared by this person’s roles)' : ''}` : 'not linked'}</Typography>}
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ pt: 0.5 }}>
            {role.sources.map((s, i) => <Badge key={i} variant={s.source === 'IDP' ? 'cyan' : s.source === 'SIS' ? 'primary' : 'neutral'}>{s.source === 'IDP' && s.provider ? `From ${s.provider.displayName}` : SOURCE_LABEL[s.source]}</Badge>)}
          </Stack>
          {role.key === 'STUDENT' && (
            <TextField
              select
              size="small"
              label="Student tier (student widgets only)"
              value={role.tier?.key ?? ''}
              onChange={(e) => run(() => adminApi.updateUser(userId, { tierKey: e.target.value }), 'Student tier changed.')}
              SelectProps={{ native: true }}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2, maxWidth: 260 }}
            >
              {tiers.map((tier) => <option key={tier.key} value={tier.key}>{tier.name}</option>)}
            </TextField>
          )}
        </Stack>
      </Paper>
    );
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      width={560}
      labelId="account-access-title"
      header={
        <Box>
          <Typography id="account-access-title" variant="h6" sx={{ color: '#fff' }}>{data?.user.fullName ?? 'Account access'}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>{data?.user.email}</Typography>
          {data && <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Badge variant={data.user.status === 'ACTIVE' ? 'success' : 'warning'} dot>{data.user.status}</Badge>{data.contexts.filter((c) => c.status === 'ACTIVE').map((c) => <Badge key={c.key} variant="primary">{ROLE_LABEL[c.role]} view</Badge>)}{data.workspaces.includes('admin') && <Badge variant="purple">Administration</Badge>}</Stack>}
        </Box>
      }
    >
      {loading && <Typography variant="body2">Loading…</Typography>}
      {error && <Alert severity="error">{error.message}</Alert>}
      {data && (
        <>
          <Box component="section" aria-labelledby="community-roles">
            <Typography id="community-roles" variant="overline" color="text.secondary">Community roles</Typography>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>The person&apos;s relationships with the institution. Each needs its record; each gives its own view in the portal.</Typography>
            <Stack spacing={1}>
              {community.length ? community.map((role) => <RoleCard key={role.key} role={role} />) : <Typography variant="body2" color="text.secondary">None.</Typography>}
            </Stack>
          </Box>

          <Box component="section" aria-labelledby="admin-roles">
            <Typography id="admin-roles" variant="overline" color="text.secondary">Administrative roles</Typography>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>What the person may manage. Assigned here only, never from a university sign-in.</Typography>
            <Stack spacing={1}>
              {administrative.length ? administrative.map((role) => <RoleCard key={role.key} role={role} />) : <Typography variant="body2" color="text.secondary">None.</Typography>}
            </Stack>
          </Box>

          <Box component="section" aria-labelledby="add-role">
            <Typography id="add-role" variant="overline" color="text.secondary">Add a role</Typography>
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {data.addable.map((option) => (
                <Paper key={option.key} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{ROLE_LABEL[option.key]} <Typography component="span" variant="caption" color="text.secondary">({option.category === 'ADMINISTRATIVE' ? 'administrative' : 'community'})</Typography></Typography>
                      {option.how === 'LINK_SIS_RECORD' && <Typography variant="caption" color="text.secondary">Added by linking the person&apos;s CampusCore {option.key.toLowerCase()} record.</Typography>}
                      {option.how === 'RECORD_REQUIRED' && <Typography variant="caption" color="text.secondary">{option.reason}</Typography>}
                      {option.how === 'CREATE_STAFF_RECORD' && <Typography variant="caption" color="text.secondary">Needs the staff member&apos;s employee number (creates their staff record).</Typography>}
                      {option.key === 'ALUMNI' && <Typography variant="caption" color="text.secondary">Assigned under the institution&apos;s alumni policy.</Typography>}
                    </Box>
                    {option.how === 'LINK_SIS_RECORD' && <Button size="sm" variant="secondary" onClick={() => setLinkType(option.key)}>Link CampusCore record</Button>}
                    {option.how === 'CREATE_STAFF_RECORD' && (
                      <Stack direction="row" spacing={1}>
                        <TextField size="small" label="Employee number" value={staffNumber} onChange={(e) => setStaffNumber(e.target.value)} sx={{ width: 170 }} />
                        <Button size="sm" variant="secondary" disabled={busy || !staffNumber.trim()} onClick={() => run(() => adminApi.addRole(userId, { role: 'STAFF', employeeNumber: staffNumber.trim() }), 'Staff role added.')}>Add</Button>
                      </Stack>
                    )}
                    {option.how === 'ASSIGN' && option.key !== 'ADMIN' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => adminApi.addRole(userId, { role: option.key }), `${ROLE_LABEL[option.key]} role added.`)}>Add</Button>}
                    {option.how === 'ASSIGN' && option.key === 'ADMIN' && <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'admin', role: 'ADMIN' })}>Add…</Button>}
                  </Stack>
                </Paper>
              ))}
              {!data.addable.length && <Typography variant="body2" color="text.secondary">This account holds every role.</Typography>}
            </Stack>
          </Box>

          <Box component="section" aria-labelledby="sign-in-identities">
            <Typography id="sign-in-identities" variant="overline" color="text.secondary">Institutional sign-in</Typography>
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {data.signInIdentities.length === 0 && <Typography variant="body2" color="text.secondary">Not linked to a university sign-in yet. It is linked automatically at the first sign-in when the person&apos;s verified institutional IDs match this account.</Typography>}
              {data.signInIdentities.map((identity) => (
                <Paper key={identity.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight={600}>{identity.provider.displayName}</Typography>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => adminApi.unlinkSignIn(userId, identity.id), 'Sign-in identity unlinked.')} sx={{ color: 'error.main' }}>Unlink</Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="p">Linked {fmt(identity.linkedAt)} ({identity.linkMethod === 'INSTITUTIONAL_ID' ? 'matched on verified institutional IDs' : 'by an administrator'}) · last sign-in {fmt(identity.lastLoginAt)}</Typography>
                  {identity.lastEvaluation && (
                    <Box sx={{ mt: 0.75 }}>
                      <Typography variant="caption" component="p">Granted at last sign-in: {identity.lastEvaluation.granted.map((r) => ROLE_LABEL[r]).join(', ') || 'none'}</Typography>
                      {identity.lastEvaluation.withheld.map((w) => <Typography key={w.role} variant="caption" component="p" color="warning.dark">Not granted: {ROLE_LABEL[w.role]} ({REASON[w.reason] ?? w.reason})</Typography>)}
                      {identity.lastEvaluation.unknown.length > 0 && <Typography variant="caption" component="p" color="text.secondary">Unmapped values (grant nothing): {identity.lastEvaluation.unknown.join(', ')}</Typography>}
                    </Box>
                  )}
                </Paper>
              ))}
            </Stack>
            <AdminVerifiedLink userId={userId} linkedProviderIds={data.signInIdentities.map((i) => i.provider?.id).filter(Boolean)} busy={busy} run={run} />
          </Box>
        </>
      )}

      {confirm?.kind === 'remove' && (
        <Modal
          isOpen
          onClose={() => setConfirm(null)}
          title={`Remove the ${ROLE_LABEL[confirm.role]} role?`}
          subtitle="Only this role is removed. The person's other roles, their records and CampusCore links stay as they are; their access changes on their next request."
          footer={<Stack direction="row" spacing={1} justifyContent="flex-end"><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={() => run(() => adminApi.removeRole(userId, confirm.role), `${ROLE_LABEL[confirm.role]} role removed.`)}>Remove role</Button></Stack>}
        />
      )}
      {confirm?.kind === 'admin' && (
        <Modal
          isOpen
          onClose={() => { setConfirm(null); setAdminAck(false); }}
          title="Give administrator access?"
          subtitle="Administrators manage people, roles, integrations and portal content for the whole institution."
          footer={<Stack direction="row" spacing={1} justifyContent="flex-end"><Button variant="ghost" onClick={() => { setConfirm(null); setAdminAck(false); }}>Cancel</Button><Button variant="primary" disabled={!adminAck || busy} onClick={() => run(() => adminApi.addRole(userId, { role: 'ADMIN', confirm: true }), 'Administrator role added.')}>Give access</Button></Stack>}
        >
          <FormControlLabel control={<Checkbox checked={adminAck} onChange={(e) => setAdminAck(e.target.checked)} />} label="I have confirmed this person needs administrative access." />
        </Modal>
      )}
      {linkType && <LinkRecordDialog userId={userId} initialType={linkType} onClose={() => setLinkType(null)} onLinked={() => { setLinkType(null); changed('Record linked and role added.'); }} />}
    </DetailDrawer>
  );
}

export default AccountAccessDrawer;
