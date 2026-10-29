import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import MuiButton from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { HONEYPOT, validateSubmission } from '../../../../shared/forms.js';

/**
 * Renders a Studio form and submits it. The same validation the server applies runs here for
 * immediate feedback; the server is authoritative (it re-validates against the published
 * definition, then emails the configured recipient).
 *
 * mode: 'live' (portal: submits), 'test' (Studio: validation only via onTest), 'canvas'
 * (editor canvas: inert preview).
 */
const emptyValue = (f) => (f.type === 'checkboxes' ? [] : f.type === 'checkbox' ? false : '');

export function CmsForm({ form, mode = 'live', onSubmit, onTest, showTitle = true, showDescription = true }) {
  const fields = useMemo(() => (Array.isArray(form?.fields) ? form.fields : []), [form]);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)])));
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // { severity, message }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };
  const payload = () => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)));

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'canvas') return;
    setStatus(null);
    const checked = validateSubmission(fields, payload());
    if (!checked.ok) {
      setErrors(checked.errors);
      setStatus({ severity: 'error', message: 'Please check the highlighted fields.' });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'test') {
        const result = await onTest(payload());
        setErrors(result.errors ?? {});
        setStatus(result.valid
          ? { severity: result.recipientConfigured && result.mail?.configured ? 'success' : 'info', message: `Valid. Nothing was sent (validation-only test).${!result.recipientConfigured ? ' No notification recipient is set yet.' : ''}${!result.mail?.configured ? ' Email is not configured on the server, so live submissions are currently refused.' : ''}` }
          : { severity: 'error', message: 'The server rejected these values.' });
      } else {
        const result = await onSubmit({ values: payload(), [HONEYPOT]: honeypot });
        setDone(true);
        setStatus({ severity: 'success', message: result?.message || 'Thank you. Your submission has been sent.' });
      }
    } catch (error) {
      setErrors(error?.details?.fieldErrors ?? {});
      setStatus({ severity: error?.status === 503 ? 'warning' : 'error', message: error?.message ?? 'The form could not be submitted.' });
    } finally {
      setBusy(false);
    }
  };

  if (!form) return null;
  if (done) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 4, textAlign: 'center' }} role="status">
        <CheckCircleRoundedIcon color="success" sx={{ fontSize: 40 }} />
        <Typography variant="h6" component="p">{status?.message}</Typography>
        <MuiButton size="small" onClick={() => { setDone(false); setStatus(null); setValues(Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)]))); }}>Submit another response</MuiButton>
      </Stack>
    );
  }

  const fieldControl = (f) => {
    const err = errors[f.name];
    const help = err || f.helpText || ' ';
    const common = { fullWidth: true, size: 'small', label: f.label, required: f.required, placeholder: f.placeholder || undefined, error: Boolean(err), helperText: help, value: values[f.name] ?? '', onChange: (e) => set(f.name, e.target.value), name: f.name, disabled: mode === 'canvas' };
    switch (f.type) {
      case 'textarea':
        return <TextField {...common} multiline minRows={4} inputProps={{ maxLength: f.maxLength }} />;
      case 'email':
        return <TextField {...common} type="email" inputProps={{ maxLength: f.maxLength, autoComplete: 'email' }} />;
      case 'phone':
        return <TextField {...common} type="tel" inputProps={{ maxLength: f.maxLength, autoComplete: 'tel' }} />;
      case 'number':
        return <TextField {...common} type="number" inputProps={{ min: f.min, max: f.max }} />;
      case 'date':
        return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} />;
      case 'select':
        return (
          <TextField {...common} select SelectProps={{ displayEmpty: Boolean(f.placeholder) }} InputLabelProps={f.placeholder ? { shrink: true } : undefined}>
            {f.placeholder && <MenuItem value="" disabled>{f.placeholder}</MenuItem>}
            {!f.placeholder && <MenuItem value="">—</MenuItem>}
            {f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        );
      case 'radio':
        return (
          <FormControl error={Boolean(err)} required={f.required} disabled={mode === 'canvas'}>
            <FormLabel>{f.label}</FormLabel>
            <RadioGroup value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} name={f.name}>
              {f.options.map((o) => <FormControlLabel key={o.value} value={o.value} control={<Radio size="small" />} label={o.label} />)}
            </RadioGroup>
            <FormHelperText>{help}</FormHelperText>
          </FormControl>
        );
      case 'checkboxes':
        return (
          <FormControl error={Boolean(err)} required={f.required} component="fieldset" disabled={mode === 'canvas'}>
            <FormLabel component="legend">{f.label}</FormLabel>
            <FormGroup>
              {f.options.map((o) => {
                const list = values[f.name] ?? [];
                return <FormControlLabel key={o.value} control={<Checkbox size="small" checked={list.includes(o.value)} onChange={(e) => set(f.name, e.target.checked ? [...list, o.value] : list.filter((v) => v !== o.value))} />} label={o.label} />;
              })}
            </FormGroup>
            <FormHelperText>{help}</FormHelperText>
          </FormControl>
        );
      case 'checkbox':
        return (
          <FormControl error={Boolean(err)} required={f.required} disabled={mode === 'canvas'}>
            <FormControlLabel control={<Checkbox size="small" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} />} label={`${f.label}${f.required ? ' *' : ''}`} />
            <FormHelperText>{help}</FormHelperText>
          </FormControl>
        );
      default:
        return <TextField {...common} inputProps={{ maxLength: f.maxLength }} />;
    }
  };

  return (
    <Box component="form" noValidate onSubmit={submit} aria-label={form.name}>
      {showTitle && <Typography variant="h5" component="h2" sx={{ mb: 0.5 }}>{form.name}</Typography>}
      {showDescription && form.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{form.description}</Typography>}
      <Stack spacing={1}>
        {fields.map((f) => <Box key={f.id ?? f.name}>{fieldControl(f)}</Box>)}
      </Stack>
      {/* Hidden from people (and assistive technology); bots that fill it are discarded server-side. */}
      <Box aria-hidden sx={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor={`hp-${form.id ?? 'form'}`}>Leave this empty</label>
        <input id={`hp-${form.id ?? 'form'}`} type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </Box>
      {status && <Alert severity={status.severity} sx={{ mt: 1.5 }} role={status.severity === 'error' ? 'alert' : 'status'}>{status.message}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <MuiButton type="submit" variant="contained" disabled={busy || mode === 'canvas'}>{busy ? 'Sending…' : mode === 'test' ? `Test: ${form.submitLabel || 'Submit'} (no email)` : form.submitLabel || 'Submit'}</MuiButton>
      </Stack>
    </Box>
  );
}
