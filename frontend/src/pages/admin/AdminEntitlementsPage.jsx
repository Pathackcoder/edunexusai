import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import { alpha } from '@mui/material/styles';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminApi } from '../../services/api';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/common/Toast';
import { DataState } from '../../components/common/DataState';

/**
 * Widget entitlements.
 *
 * This grid is the single place that decides what a student's dashboard contains. Nothing
 * in the React tree asks "which student is this?" — the dashboard endpoint reads these
 * rows for the student's tier and returns only the permitted widgets.
 */
export const AdminEntitlementsPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch, setData } = useApiQuery(() => adminApi.getEntitlements());
  const [pending, setPending] = useState({});
  const [saving, setSaving] = useState(false);

  const [persona, setPersona] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const audiences = [...(data?.tiers ?? []), { id: 'FACULTY', name: 'Faculty' }];
  const selected = persona || data?.tiers?.[0]?.id;
  const tiers = audiences.filter((tier) => tier.id === selected);
  const widgets = selected === 'FACULTY' ? data?.faculty?.widgets ?? [] : data?.widgets ?? [];
  const matrix = [...(data?.matrix ?? []), { tierId: 'FACULTY', entitlements: data?.faculty?.entitlements ?? [] }];

  const cellKey = (tierId, widgetKey) => `${tierId}::${widgetKey}`;

  const isEnabled = (tierId, widgetKey) => {
    const key = cellKey(tierId, widgetKey);
    if (key in pending) return pending[key];
    const row = matrix.find((entry) => entry.tierId === tierId);
    return row?.entitlements.find((e) => e.widgetKey === widgetKey)?.enabled ?? false;
  };

  const toggle = (tierId, widgetKey) => {
    const key = cellKey(tierId, widgetKey);
    const current = isEnabled(tierId, widgetKey);
    setPending((prev) => {
      const next = { ...prev };
      // Toggling back to the stored value removes it from the pending set.
      const row = matrix.find((entry) => entry.tierId === tierId);
      const stored = row?.entitlements.find((e) => e.widgetKey === widgetKey)?.enabled ?? false;
      if (stored === !current) delete next[key];
      else next[key] = !current;
      return next;
    });
  };

  const changeCount = Object.keys(pending).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(pending).map(([key, enabled]) => {
        const [tierId, widgetKey] = key.split('::');
        return { tierId, widgetKey, enabled };
      });
      const result = await adminApi.updateEntitlements(updates);
      setData(result);
      setPending({});
      showToast(`${updates.length} entitlement change${updates.length === 1 ? '' : 's'} applied.`);
    } catch (caught) {
      showToast(caught?.message ?? 'The entitlements could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading entitlements…" minHeight={360}>
      {() => (
        <Box>
          <PageHeader
            title="Widget Entitlements"
            description="Choose a persona, then manage its dashboard widgets. Saved changes apply on the next dashboard load."
            actions={
              <Button variant="primary" size="sm" icon={SaveOutlinedIcon} loading={saving} disabled={changeCount === 0} onClick={handleSave}>
                {changeCount === 0 ? 'No changes' : `Save ${changeCount} change${changeCount === 1 ? '' : 's'}`}
              </Button>
            }
          />

          <Stack spacing={2.5}>
            <Alert severity="info" icon={<InfoOutlinedIcon fontSize="inherit" />} sx={{ alignItems: 'center', '& .MuiAlert-message': { pt: 0.75 } }}>
              <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={0.75}>
                <span>Managing dashboard visibility:</span>
                {tiers.map((tier) => (
                  <Badge key={tier.id} variant="neutral" sx={{ bgcolor: 'background.paper' }}>{tier.name}</Badge>
                ))}
              </Stack>
            </Alert>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Persona" value={selected ?? ''} onChange={(e) => setPersona(e.target.value)}>
                {audiences.map((tier) => <MenuItem key={tier.id} value={tier.id}>{tier.name}</MenuItem>)}
              </TextField>
              <TextField label="Search widgets" value={search} onChange={(e) => setSearch(e.target.value)} />
              <TextField select label="Widget state" value={status} onChange={(e) => setStatus(e.target.value)}>
                <MenuItem value="all">All widgets</MenuItem><MenuItem value="on">Enabled</MenuItem><MenuItem value="off">Disabled</MenuItem>
              </TextField>
            </Stack>
            <Card>
              <TableContainer sx={{ borderRadius: 0 }}>
                <Table sx={{ minWidth: 640 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Widget</TableCell>
                      {tiers.map((tier) => (
                        <TableCell key={tier.id} align="center" sx={{ minWidth: 130 }}>{tier.name}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {widgets.filter((widget) => `${widget.label} ${widget.category}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || isEnabled(selected, widget.key) === (status === 'on'))).map((widget) => (
                      <TableRow key={widget.id} hover>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1.5}>
                            <WidgetsOutlinedIcon sx={{ fontSize: 18, color: 'grey.400', flexShrink: 0 }} />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600}>{widget.label}</Typography>
                              <Box component="code" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>{widget.key}</Box>
                            </Box>
                            <Badge variant="neutral">{widget.category}</Badge>
                          </Stack>
                        </TableCell>
                        {tiers.map((tier) => {
                          const enabled = isEnabled(tier.id, widget.key);
                          const dirty = cellKey(tier.id, widget.key) in pending;
                          return (
                            <TableCell key={tier.id} align="center">
                              <Box
                                component="label"
                                sx={(theme) => ({
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 0.25,
                                  pr: 1.25,
                                  pl: 0.25,
                                  borderRadius: 999,
                                  cursor: 'pointer',
                                  border: `1px solid ${dirty ? theme.palette.primary.main : 'transparent'}`,
                                  bgcolor: dirty ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                                  transition: 'background-color 160ms ease, border-color 160ms ease',
                                })}
                              >
                                <Switch
                                  size="small"
                                  checked={enabled}
                                  disabled={saving}
                                  onChange={() => toggle(tier.id, widget.key)}
                                  inputProps={{ 'aria-label': `${widget.label} for ${tier.name}` }}
                                  color="success"
                                />
                                <Typography variant="caption" sx={{ fontWeight: 600, color: enabled ? 'success.main' : 'text.secondary', minWidth: 20, textAlign: 'left' }}>
                                  {enabled ? 'On' : 'Off'}
                                </Typography>
                              </Box>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default AdminEntitlementsPage;
