import React, { useState } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import MuiButton from '@mui/material/Button';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { DataState } from '../common/DataState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { moodleAdminApi } from '../../services/api';

const STATE = { MAPPED: ['success', 'Moodle course'], NO_MOODLE_COURSE: ['default', 'No Moodle course'], MOODLE_COURSE_MISSING: ['warning', 'Moodle course missing'] };
const ROSTER = { ENROLLED: ['success', 'In Moodle'], TO_ENROL: ['info', 'To enrol'], NO_PORTAL_ACCOUNT: ['default', 'No portal login'], NEEDS_MOODLE_ACCOUNT: ['warning', 'No Moodle account'], MOODLE_ACCOUNT_SUSPENDED: ['warning', 'Moodle suspended'], MOODLE_COURSE_MISSING: ['error', 'Course missing'] };

/** A mapped section's CampusCore roster against its Moodle course; enrols only linked students. */
function RosterDialog({ section, onClose }) {
  const { showToast } = useToast();
  const plan = useApiQuery(() => moodleAdminApi.sisSectionPlan(section.sisSectionId), [section.sisSectionId]);
  const [applying, setApplying] = useState(false);
  const apply = async () => {
    setApplying(true);
    try {
      const res = await moodleAdminApi.applySisSectionPlan(section.sisSectionId);
      const done = res.results.filter((r) => r.status === 'DONE').length;
      const failed = res.results.filter((r) => !['DONE', 'ALREADY'].includes(r.status));
      showToast(failed.length ? `${done} enrolled; ${failed.length} need attention (see Operations).` : `${done} student(s) enrolled in Moodle.`, failed.length ? 'error' : undefined);
      plan.setData(res.plan);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setApplying(false);
    }
  };
  const toEnrol = (plan.data?.students ?? []).filter((s) => s.status === 'TO_ENROL').length;
  return (
    <Modal isOpen onClose={onClose} title={`${section.courseCode}-${section.sectionCode} (${section.termCode})`} subtitle={`CampusCore roster → Moodle ${section.moodleCourse?.shortName ?? ''}`} maxWidth="680px"
      footer={<Stack direction="row" spacing={1} justifyContent="flex-end"><Button size="sm" variant="ghost" onClick={onClose}>Close</Button><Button size="sm" variant="primary" disabled={!toEnrol} loading={applying} onClick={apply}>Enrol {toEnrol} in Moodle</Button></Stack>}>
      <DataState loading={plan.loading} error={plan.error} onRetry={plan.refetch} isEmpty={!plan.data?.students?.length} emptyTitle="No registered students" emptyMessage="CampusCore lists nobody registered in this section." minHeight={100}>
        {() => (
          <Stack spacing={1}>
            <Typography variant="caption">Students registered in CampusCore. Only those with a linked portal login and Moodle account can be enrolled; others are listed so you can onboard them. Nobody is removed from Moodle here.</Typography>
            {plan.data.students.map((s) => (
              <Stack key={s.sisStudentId} direction="row" justifyContent="space-between" spacing={1} sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2">{s.name} · {s.institutionalId}</Typography>
                <Chip size="small" color={ROSTER[s.status]?.[0] ?? 'default'} label={ROSTER[s.status]?.[1] ?? s.status} />
              </Stack>
            ))}
          </Stack>
        )}
      </DataState>
    </Modal>
  );
}

/**
 * CampusCore classes ↔ Moodle courses. CampusCore owns sections and registrations; Moodle owns
 * course sites; this tab records only which Moodle course delivers which section.
 */
export function SisSectionMappings() {
  const { showToast } = useToast();
  const [termId, setTermId] = useState('');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const { data, loading, error, refetch } = useApiQuery(() => moodleAdminApi.sisSections({ termId: termId || undefined, search: search || undefined }), [termId, search]);
  const [busy, setBusy] = useState(null);
  const [roster, setRoster] = useState(null);
  const link = async (row, moodleCourseId) => {
    setBusy(row.sisSectionId);
    try {
      await moodleAdminApi.linkSisSection(row.sisSectionId, Number(moodleCourseId));
      showToast(`${row.courseCode}-${row.sectionCode} mapped.`);
      await refetch();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const unlink = async (row) => {
    if (!window.confirm(`Remove the Moodle mapping of ${row.courseCode}-${row.sectionCode}? Moodle enrolments are not changed.`)) return;
    setBusy(row.sisSectionId);
    try {
      await moodleAdminApi.unlinkSisSection(row.sisSectionId);
      await refetch();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Registrations come from CampusCore (the student or registrar registers in sections). Map each section that uses Moodle to its Moodle course; students registered in it can then be enrolled in that course from here, from Users &amp; Roles → Systems, or during onboarding. Sections without a Moodle course are fine: those classes simply have no LMS site.
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField select size="small" label="Term" value={termId || data?.term?.source?.id || ''} onChange={(e) => setTermId(e.target.value)} sx={{ minWidth: 200 }}>
          {(data?.terms ?? []).map((t) => <MenuItem key={t.source.id} value={t.source.id}>{t.name}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Search course" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setSearch(input.trim()); }} sx={{ maxWidth: 320 }} />
      </Stack>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.items?.length} emptyTitle="No sections" emptyMessage="CampusCore has no sections matching this term and search.">
        {() => (
          <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="CampusCore sections and Moodle courses">
              <TableHead>
                <TableRow>
                  <TableCell>CampusCore section</TableCell>
                  <TableCell>Registered</TableCell>
                  <TableCell>Moodle course</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.sisSectionId} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{row.courseCode}-{row.sectionCode} · {row.courseTitle}</Typography>
                      <Typography variant="caption">{row.termCode} · {row.instructors?.join(', ') || 'No instructor'}</Typography>
                    </TableCell>
                    <TableCell>{row.enrolled ?? '—'}</TableCell>
                    <TableCell sx={{ minWidth: 260 }}>
                      <Stack spacing={0.5}>
                        <Chip size="small" sx={{ alignSelf: 'flex-start' }} color={STATE[row.mappingState][0]} label={row.moodleCourse ? `${row.moodleCourse.shortName} (${row.moodleCourse.moodleCourseId})` : row.mappingState === 'MOODLE_COURSE_MISSING' ? `Moodle course ${row.missingMoodleCourseId} missing` : STATE[row.mappingState][1]} />
                        <TextField select size="small" label={row.moodleCourse ? 'Change to' : 'Map to'} value="" disabled={busy === row.sisSectionId} onChange={(e) => link(row, e.target.value)}>
                          {data.moodleCourses.map((c) => <MenuItem key={c.moodleCourseId} value={c.moodleCourseId}>{c.shortName} · {c.fullName}</MenuItem>)}
                        </TextField>
                        {row.suggestion && <MuiButton size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => link(row, row.suggestion.moodleCourseId)}>Use suggested {row.suggestion.shortName}</MuiButton>}
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {row.moodleCourse && <MuiButton size="small" onClick={() => setRoster(row)}>Roster</MuiButton>}
                      {row.mappingState !== 'NO_MOODLE_COURSE' && <MuiButton size="small" color="inherit" disabled={busy === row.sisSectionId} onClick={() => unlink(row)}>Unmap</MuiButton>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
      {data?.pagination?.totalPages > 1 && <Typography variant="caption">Showing the first {data.items.length} of {data.pagination.total} sections; use search to narrow.</Typography>}
      {roster && <RosterDialog section={roster} onClose={() => { setRoster(null); refetch(); }} />}
    </Stack>
  );
}
