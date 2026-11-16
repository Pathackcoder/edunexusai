import React, { useState } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { DataState } from '../common/DataState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { viewAsApi } from '../../services/api';
import { VIEW_AS_REASONS, VIEW_AS_START_PATH, composeReason, deliverToTab } from '../../viewAs/handoff';

/**
 * Impersonate (View-As) from Users & Roles. The server confirms the account can be viewed and as which persona; a
 * person with both a student and a faculty record chooses one. A short reason is required and kept in the audit trail.
 *
 * "Open in new tab" opens the tab synchronously from the click (so pop-up blockers allow it), then creates the session
 * and hands its secret to that tab (handoff.js). The secret is never stored in this tab, and this tab stays the
 * administrator's own portal.
 */
export function ImpersonateDialog({ userId, onClose }) {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => viewAsApi.eligibility(userId), [userId]);
  const [persona, setPersona] = useState('');
  const [reasonKey, setReasonKey] = useState('TROUBLESHOOTING');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const personas = data?.personas ?? [];
  const chosen = persona || (personas.length === 1 ? personas[0].key : '');
  const reason = composeReason(reasonKey, details);
  const ready = data?.eligible && chosen && reason.length >= 5 && !busy;

  const open = async () => {
    setFailure(null);
    const tab = window.open(VIEW_AS_START_PATH, '_blank');
    if (!tab) {
      setFailure('Your browser blocked the new tab. Allow pop-ups for this site, then try again.');
      return;
    }
    setBusy(true);
    try {
      const { token, session } = await viewAsApi.start({ userId, persona: chosen, reason });
      await deliverToTab({ tab, token, origin: window.location.origin, win: window });
      showToast(`View-As opened for ${session.subject.fullName} (${session.personaLabel}) in a new tab.`);
      onClose();
    } catch (caught) {
      try {
        tab.close();
      } catch {
        /* already closed */
      }
      setFailure(caught?.message ?? 'View-As could not be started.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Impersonate (read-only View-As)"
      subtitle={data?.user ? `${data.user.fullName} · ${data.user.email}` : ''}
      maxWidth="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={VisibilityOutlinedIcon} onClick={open} disabled={!ready} loading={busy}>Open in new tab</Button>
        </>
      }
    >
      <DataState loading={loading} error={error} onRetry={refetch} minHeight={140}>
        {() => (
          <Stack spacing={2.25}>
            {!data.eligible ? (
              <Alert severity="info">{data.problems.map((problem) => problem.message).join(' ')}</Alert>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  A new tab shows the portal exactly as {data.user.fullName} sees it. You stay signed in as yourself, everything
                  is read-only, and the session ends after {data.policy.idleMinutes} minutes of inactivity or {data.policy.absoluteMinutes} minutes
                  at most. Starting, ending and anything blocked are recorded under your name.
                </Typography>
                {personas.length > 1 && (
                  <Stack spacing={0.5}>
                    <FormLabel id="view-as-persona">This person has more than one portal. Which one?</FormLabel>
                    <RadioGroup row aria-labelledby="view-as-persona" value={chosen} onChange={(event) => setPersona(event.target.value)}>
                      {personas.map((option) => <FormControlLabel key={option.key} value={option.key} control={<Radio />} label={option.label} />)}
                    </RadioGroup>
                  </Stack>
                )}
                {personas.length === 1 && (
                  <Typography variant="body2"><strong>Portal:</strong> {personas[0].label}</Typography>
                )}
                <TextField select label="Reason" value={reasonKey} onChange={(event) => setReasonKey(event.target.value)} fullWidth>
                  {VIEW_AS_REASONS.map((option) => <MenuItem key={option.key} value={option.key}>{option.label}</MenuItem>)}
                </TextField>
                <TextField
                  label={reasonKey === 'OTHER' ? 'Describe the reason' : 'Details (optional)'}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  required={reasonKey === 'OTHER'}
                  helperText={reasonKey === 'OTHER' && details.trim().length < 5 ? 'At least 5 characters.' : 'For example a ticket number. Kept in the audit trail.'}
                  inputProps={{ maxLength: 400 }}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </>
            )}
            {failure && <Alert severity="error">{failure}</Alert>}
          </Stack>
        )}
      </DataState>
    </Modal>
  );
}

export default ImpersonateDialog;
