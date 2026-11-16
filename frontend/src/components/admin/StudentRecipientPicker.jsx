import React, { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { adminApi } from '../../services/api';

/** "a@x.edu, S2400017" <-> ['a@x.edu', 'S2400017']: the broadcast's INDIVIDUAL audience value. */
export const splitRecipients = (value) => String(value ?? '').split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);

/**
 * Pick the students a broadcast goes to: search the tenant's students by name, email or ID (admin user
 * list), or type an email or student number and press Enter. The value is a comma-separated string, the
 * same INDIVIDUAL audience value the API resolves against active accounts.
 */
export function StudentRecipientPicker({ value, onChange }) {
  const selected = splitRecipients(value);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await adminApi.listUsers({ role: 'STUDENT', search: input.trim() || undefined, limit: 20 });
        if (active) setOptions((users ?? []).filter((user) => user.status === 'ACTIVE' || !user.status));
      } catch {
        if (active) setOptions([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [input]);

  const byEmail = new Map(options.map((user) => [user.email.toLowerCase(), user]));
  const labelFor = (entry) => byEmail.get(String(entry).toLowerCase())?.fullName ?? entry;

  return (
    <Autocomplete
      multiple
      freeSolo
      filterSelectedOptions
      options={options.map((user) => user.email)}
      value={selected}
      inputValue={input}
      loading={loading}
      onInputChange={(_, next) => setInput(next)}
      onChange={(_, next) => onChange([...new Set(next.map((entry) => String(entry).trim()).filter(Boolean))].join(', '))}
      filterOptions={(list) => list}
      getOptionLabel={(option) => String(option)}
      renderOption={(props, email) => {
        const user = byEmail.get(email.toLowerCase());
        return (
          <Box component="li" {...props} key={email} sx={{ display: 'block !important' }}>
            <Typography variant="body2" fontWeight={600}>{user?.fullName ?? email}</Typography>
            <Typography variant="caption" component="div">{email}{user?.studentNumber ? ` · ${user.studentNumber}` : ''}</Typography>
          </Box>
        );
      }}
      renderTags={(entries, getTagProps) => entries.map((entry, index) => {
        const { key, ...tagProps } = getTagProps({ index });
        return <Chip key={key} size="small" label={labelFor(entry)} title={entry} {...tagProps} />;
      })}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Students"
          placeholder={selected.length ? '' : 'Search by name, email or student ID'}
          helperText="Pick students, or type an email or student ID and press Enter."
        />
      )}
      sx={{ gridColumn: { sm: '1 / -1' } }}
    />
  );
}

export default StudentRecipientPicker;
