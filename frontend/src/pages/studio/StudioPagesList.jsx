import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Switch from '@mui/material/Switch';
import MuiButton from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { studioApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';
import { slugify } from '../../components/cms/templates';
import { AddPageDialog } from './AddPageDialog';
import { StateChip, audienceText, AUDIENCE_OPTIONS, PUBLIC_AUDIENCE_OPTION } from './studioCommon';
import { ScheduleDialog, scheduleSummary } from './ScheduleDialog';

/** Page settings (not layout): title, address, summary, audience and navigation. */
export function PageSettingsFields({ value, onChange, slugLocked }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  const audience = value.audiences ?? { students: true, faculty: true, staff: true };
  return (
    <Stack spacing={2}>
      <TextField label="Title" required value={value.title ?? ''} onChange={(e) => onChange({ ...value, title: e.target.value, ...(slugLocked ? {} : { slug: slugify(e.target.value) }) })} inputProps={{ maxLength: 160 }} />
      <TextField label="Address" required value={value.slug ?? ''} onChange={(e) => set('slug')(slugify(e.target.value))} helperText={`Published at /pages/${value.slug || '…'} (lowercase letters, numbers and hyphens)`} />
      <TextField label="Summary" multiline minRows={2} value={value.summary ?? ''} onChange={(e) => set('summary')(e.target.value)} inputProps={{ maxLength: 500 }} />
      <Box>
        <Typography variant="subtitle2">Who can see it</Typography>
        <FormGroup row>
          {[...AUDIENCE_OPTIONS, PUBLIC_AUDIENCE_OPTION].map(([k, label]) => (
            <FormControlLabel key={k} control={<Checkbox checked={Boolean(audience[k])} onChange={(e) => set('audiences')({ ...audience, [k]: e.target.checked })} />} label={label} />
          ))}
        </FormGroup>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <FormControlLabel control={<Switch checked={Boolean(value.showInNav)} onChange={(e) => set('showInNav')(e.target.checked)} />} label="Show in the portal sidebar (Campus pages)" />
        <TextField size="small" label="Menu label" value={value.navLabel ?? ''} onChange={(e) => set('navLabel')(e.target.value)} disabled={!value.showInNav} inputProps={{ maxLength: 40 }} />
        <TextField size="small" type="number" label="Order" value={value.sortOrder ?? 0} onChange={(e) => set('sortOrder')(Math.max(0, Math.min(999, Number(e.target.value) || 0)))} sx={{ width: 100 }} />
      </Stack>
    </Stack>
  );
}

export function StudioPagesList() {
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState(null);
  const { data, loading, error, refetch } = useApiQuery(() => studioApi.list('page', { status: status || undefined }), [status]);
  const meta = useApiQuery(() => studioApi.meta());
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
        <Box>
          <Typography variant="h4" component="h2">Pages</Typography>
          <Typography variant="body2" color="text.secondary">Portal pages built with the visual editor. Published pages appear at /pages/&lt;address&gt; for the chosen audiences.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="draft">Drafts</MenuItem>
            <MenuItem value="scheduled">Scheduled</MenuItem>
            <MenuItem value="published">Published</MenuItem>
            <MenuItem value="modified">With unpublished changes</MenuItem>
          </TextField>
          <MuiButton variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setAdding(true)}>Add page</MuiButton>
        </Stack>
      </Stack>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle="No pages yet" emptyMessage="Add a page to start from a template or a blank layout.">
        {() => (
          <TableContainer component={Card}>
            <Table size="small" aria-label="Pages">
              <TableHead><TableRow><TableCell>Page</TableCell><TableCell>Status</TableCell><TableCell>Audience</TableCell><TableCell>Last edited</TableCell><TableCell align="right" /></TableRow></TableHead>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell><Typography variant="subtitle2">{p.title}</Typography><Typography variant="caption" color="text.secondary">/pages/{p.slug}{p.showInNav ? ' · in sidebar' : ''}</Typography></TableCell>
                    <TableCell>
                      <StateChip state={p.state} />
                      {p.schedule && (p.schedule.publish || p.schedule.unpublish) && <Typography variant="caption" component="div" color={p.schedule.publish?.status === 'blocked' ? 'warning.main' : 'text.secondary'} sx={{ mt: 0.5 }}>{scheduleSummary(p.schedule, meta.data?.timezone)}</Typography>}
                    </TableCell>
                    <TableCell>{audienceText(p.audiences)}</TableCell>
                    <TableCell><Typography variant="caption">{new Date(p.updatedAt).toLocaleString()}{p.updatedByName ? ` · ${p.updatedByName}` : ''}</Typography></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <MuiButton size="small" onClick={() => setScheduling(p)}>Schedule</MuiButton>
                      <MuiButton size="small" component={RouterLink} to={`/studio/preview/pages/${p.id}`}>Preview</MuiButton>
                      <MuiButton size="small" variant="outlined" component={RouterLink} to={`/studio/pages/${p.id}/edit`}>Edit</MuiButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
      <AddPageDialog open={adding} onClose={() => setAdding(false)} />
      <ScheduleDialog open={Boolean(scheduling)} onClose={() => setScheduling(null)} type="page" item={scheduling} timezone={meta.data?.timezone} onSaved={() => refetch()} />
    </Stack>
  );
}
