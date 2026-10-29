import React, { useState } from 'react';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { Button } from '../common/Button';
import { authApi } from '../../services/api';

const RULES = 'At least 12 characters with an uppercase letter, a lowercase letter and a number.';

/**
 * Change the signed-in user's EduNexusAI password. This is the portal password only:
 * Moodle has its own password (see the Moodle sign-in details from your administrator).
 */
export function ChangePasswordForm({ onDone, submitLabel = 'Change password' }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const mismatch = form.confirm && form.next !== form.confirm;
  const submit = async (event) => {
    event.preventDefault();
    if (form.next !== form.confirm) return;
    setSaving(true);
    setError(null);
    try {
      await authApi.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      await onDone?.();
    } catch (caught) {
      setError(caught?.fieldErrors?.newPassword ?? caught?.message ?? 'The password could not be changed.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Stack component="form" spacing={1.75} onSubmit={submit}>
      <TextField label="Current password" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
      <TextField label="New password" type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} helperText={RULES} required />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={Boolean(mismatch)} helperText={mismatch ? 'The passwords do not match.' : ' '} required />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="primary" loading={saving} disabled={!form.current || !form.next || mismatch}>{submitLabel}</Button>
    </Stack>
  );
}
