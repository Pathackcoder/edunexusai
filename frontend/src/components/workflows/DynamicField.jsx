import React from 'react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Rating from '@mui/material/Rating';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

/**
 * Renders one field definition ({ key, label, type, required, options }) — used by the
 * request catalogue and by administrator-built forms, so both speak one schema.
 */
export function DynamicField({ field, value, onChange, error }) {
  const common = { label: field.label, required: field.required, error: Boolean(error), helperText: error || undefined, fullWidth: true };
  switch (field.type) {
    case 'textarea':
      return <TextField {...common} multiline minRows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <TextField {...common} select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>{option}</MenuItem>
          ))}
        </TextField>
      );
    case 'date':
      return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'rating':
      return (
        <Stack spacing={0.5}>
          <Typography variant="body2" fontWeight={600}>
            {field.label}
            {field.required ? ' *' : ''}
          </Typography>
          <Rating value={Number(value) || 0} onChange={(_, next) => onChange(next ?? 0)} size="large" />
          {error && <Typography variant="caption" color="error.main">{error}</Typography>}
        </Stack>
      );
    case 'checkbox':
      return (
        <FormControlLabel control={<Checkbox checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />} label={field.label} />
      );
    default:
      return <TextField {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Read-only rendering of an answer for review screens. */
export const formatAnswer = (field, value) => {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'rating') return `${value} / 5`;
  return String(value);
};
