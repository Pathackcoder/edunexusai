import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import MuiButton from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { moodleAdminApi } from '../../services/api';
import { MoodleEnrolmentFields, MoodleOnboardingResult } from '../../components/admin/MoodleEnrolmentFields';
import { SisSectionMappings } from '../../components/admin/SisSectionMappings';

const GROUP_LABEL = {
  READ_CORE: 'Core reads',
  LINKING: 'Account linking',
  ADMIN_WRITE: 'Provisioning, courses & enrolment',
  LEARNER_DETAIL: 'Assignments & grades',
  OPTIONAL: 'Optional',
  NOT_RECOMMENDED: 'Not recommended',
};
const MAPPING = {
  LINKED: ['success', 'Linked'],
  UNLINKED: ['default', 'Unlinked'],
  CONFLICTED: ['error', 'Conflicted'],
  MISSING_LOCAL: ['warning', 'Missing local course'],
};
const OP_COLOR = { SUCCEEDED: 'success', PARTIAL: 'warning', FAILED: 'error', BLOCKED: 'warning', NEEDS_RECONCILIATION: 'warning', PENDING: 'info' };
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

/** Run an admin action with a toast, surfacing the API's own message and operation state. */
function useAction(onDone) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(null);
  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      const result = await fn();
      showToast(typeof success === 'function' ? success(result) : success);
      await onDone?.();
      return result;
    } catch (error) {
      const op = error.details?.operationStatus ? ` (operation ${error.details.operationStatus.toLowerCase().replace(/_/g, ' ')})` : '';
      showToast(`${error.message}${op}`, 'error', 7000);
      await onDone?.();
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

/* ------------------------------------------------------------------ overview */

function RosterRead() {
  // No page refresh afterwards: the parent's reload would unmount this card and lose the result.
  const { busy, run } = useAction();
  const [result, setResult] = useState(null);
  return (
    <Card sx={{ p: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h6" component="h2">Moodle rosters</Typography>
          <Typography variant="body2" color="text.secondary">Reads every Moodle course and its participants, live. LMS data only: nothing is written to EduNexusAI academic records.</Typography>
        </Box>
        <Button variant="secondary" size="sm" loading={busy === 'rosters'} onClick={async () => setResult(await run('rosters', moodleAdminApi.readRosters, (r) => `Read ${r.enrollmentCount} enrolment(s) across ${r.courseCount} Moodle course(s).`))}>
          Read rosters
        </Button>
      </Stack>
      {result && (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Moodle rosters">
            <TableHead>
              <TableRow>
                <TableCell>Moodle course</TableCell>
                <TableCell align="right">Participants</TableCell>
                <TableCell align="right">Linked to EduNexusAI</TableCell>
                <TableCell align="right">Teachers / students / inactive</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.courses.map((c) => {
                const has = (role) => c.enrollments.filter((e) => e.roles.some((x) => x.shortName === role)).length;
                return (
                  <TableRow key={c.course.externalCourseId}>
                    <TableCell>{c.course.fullName} <Typography variant="caption">· id {c.course.externalCourseId}</Typography></TableCell>
                    <TableCell align="right">{c.participantCount}</TableCell>
                    <TableCell align="right">{c.linkedCount}</TableCell>
                    <TableCell align="right">{has('editingteacher') + has('teacher')} / {has('student')} / {c.enrollments.filter((e) => e.status === 'INACTIVE').length}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

function Overview({ status, onTested }) {
  const { busy, run } = useAction(onTested);
  const groups = useMemo(() => {
    const map = new Map();
    for (const row of status.checklist) map.set(row.group, [...(map.get(row.group) ?? []), row]);
    return [...map.entries()];
  }, [status.checklist]);
  const cfg = status.configuration;

  return (
    <Stack spacing={2}>
      {status.error && <Alert severity="error">{status.error.message}</Alert>}
      {status.warnings.map((w) => <Alert key={w} severity="warning">{w}</Alert>)}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
            <Typography variant="h6" component="h2">Connection</Typography>
            <Button variant="secondary" size="sm" icon={BoltRoundedIcon} loading={busy === 'test'} onClick={() => run('test', moodleAdminApi.test, (r) => `Connected in ${r.responseTimeMs} ms.`)}>
              Test connection
            </Button>
          </Stack>
          <Stack spacing={0.75} sx={{ typography: 'body2' }}>
            <span><b>Site:</b> {status.site?.siteName ?? '—'} {status.site?.release ? `· Moodle ${status.site.release}` : ''}</span>
            <span><b>Token user:</b> {status.site?.tokenUsername ?? '—'}{status.site?.tokenUserIsSiteAdmin ? ' (site administrator)' : ''}</span>
            <span><b>Health:</b> {status.integration?.status ?? '—'} · last attempt {when(status.integration?.health?.lastAttemptAt)} · last success {when(status.integration?.health?.lastSuccessfulSyncAt)}</span>
            {status.integration?.health?.lastErrorMessage && <span><b>Last error:</b> {status.integration.health.lastErrorMessage}</span>}
            <span><b>Linked:</b> {status.counts.linkedStudents} student(s), {status.counts.linkedCourses} course(s)</span>
          </Stack>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>Server configuration</Typography>
          <Stack spacing={0.75} sx={{ typography: 'body2' }}>
            <span><b>MOODLE_BASE_URL:</b> {cfg.baseUrl ?? 'not set'}</span>
            <span><b>MOODLE_TOKEN:</b> {cfg.tokenConfigured ? 'configured (hidden)' : 'not set'}</span>
            <span><b>Writes to Moodle:</b> {cfg.writesEnabled ? 'enabled' : 'disabled'}</span>
            <span><b>Student role id:</b> {cfg.studentRoleId ?? 'not set'} · <b>Default category:</b> {cfg.defaultCategoryId ?? 'not set'}</span>
            <span><b>Permanent course deletion:</b> {cfg.allowCourseDelete ? 'allowed' : 'disabled'}</span>
            {cfg.problems.map((p) => <span key={p} style={{ color: 'inherit' }}>⚠ {p}</span>)}
          </Stack>
          <Typography variant="caption" component="p" sx={{ mt: 1.5 }}>Set in the backend environment. Secrets are never sent to the browser.</Typography>
        </Card>
      </Box>
      <RosterRead />
      <Card sx={{ p: 2.5 }}>
        <Typography variant="h6" component="h2">Web service functions</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          What the token can call right now. Add missing functions in Moodle under Site administration → Server → Web services → External services → your service → Functions.
        </Typography>
        <Stack spacing={2}>
          {groups.map(([group, rows]) => (
            <Box key={group}>
              <Typography variant="overline" component="h3">{GROUP_LABEL[group] ?? group}</Typography>
              <Stack spacing={0.75}>
                {rows.map((row) => (
                  <Stack key={row.name} direction="row" spacing={1} alignItems="flex-start">
                    {row.enabled ? <CheckCircleRoundedIcon color="success" fontSize="small" aria-label="enabled" /> : <RadioButtonUncheckedRoundedIcon color="disabled" fontSize="small" aria-label="not enabled" />}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{row.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.purpose}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------------- courses */

function CourseDialog({ open, onClose, course, localCourses, onSaved }) {
  const editing = Boolean(course);
  const [form, setForm] = useState({});
  const { data: categories, error: categoryError } = useApiQuery(() => moodleAdminApi.categories(), [open], { enabled: open });
  const { busy, run } = useAction(onSaved);
  React.useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? { fullName: course.fullName ?? '', shortName: course.shortName ?? '', idNumber: course.idNumber ?? '', summary: course.summary ?? '' }
        : { fullName: '', shortName: '', idNumber: '', summary: '', categoryId: '', startDate: '', endDate: '', localCourseId: '' },
    );
  }, [open, editing, course]);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const submit = async () => {
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    if (body.categoryId) body.categoryId = Number(body.categoryId);
    const result = await run(
      'save',
      () => (editing ? moodleAdminApi.updateCourse(course.moodleCourseId, body) : moodleAdminApi.createCourse(body)),
      (r) => (editing ? 'Course updated in Moodle.' : r.replayed ? 'This course was already created; nothing new was made.' : `Course created in Moodle (id ${r.result.moodleCourseId}).`),
    );
    if (result) onClose();
  };
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={editing ? `Edit ${course.shortName}` : 'Create Moodle course'}
      footer={
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={busy === 'save'} disabled={!form.fullName || !form.shortName} onClick={submit}>{editing ? 'Save changes' : 'Create course'}</Button>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <TextField label="Full name" required value={form.fullName ?? ''} onChange={set('fullName')} />
        <TextField label="Short name" required helperText="Unique in Moodle." value={form.shortName ?? ''} onChange={set('shortName')} />
        <TextField label="Course ID number" helperText="Optional. Using the EduNexusAI course code (e.g. CS 501) makes matching automatic." value={form.idNumber ?? ''} onChange={set('idNumber')} />
        {!editing && (
          <>
            <TextField select label="Category" value={form.categoryId ?? ''} onChange={set('categoryId')} helperText={categoryError ? categoryError.message : 'Leave empty to use MOODLE_DEFAULT_CATEGORY_ID.'} error={Boolean(categoryError)}>
              <MenuItem value="">Default category</MenuItem>
              {(categories ?? []).map((c) => <MenuItem key={c.categoryId} value={c.categoryId}>{c.name}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Start date" InputLabelProps={{ shrink: true }} value={form.startDate ?? ''} onChange={set('startDate')} fullWidth />
              <TextField type="date" label="End date" InputLabelProps={{ shrink: true }} value={form.endDate ?? ''} onChange={set('endDate')} fullWidth />
            </Stack>
            <TextField select label="Link to EduNexusAI course" value={form.localCourseId ?? ''} onChange={set('localCourseId')}>
              <MenuItem value="">Do not link</MenuItem>
              {localCourses.filter((c) => !c.linked).map((c) => <MenuItem key={c.id} value={c.id}>{c.code} · {c.name}</MenuItem>)}
            </TextField>
          </>
        )}
        <TextField label="Summary" multiline minRows={2} value={form.summary ?? ''} onChange={set('summary')} />
      </Stack>
    </Modal>
  );
}

function EnrolmentDialog({ course, onClose, linkedStudents }) {
  const { data, loading, error, refetch } = useApiQuery(() => moodleAdminApi.enrolments(course.moodleCourseId), [course.moodleCourseId]);
  const { busy, run } = useAction(refetch);
  const [studentId, setStudentId] = useState('');
  const enrolledIds = new Set((data?.participants ?? []).map((p) => p.student?.studentProfileId).filter(Boolean));
  return (
    <Modal isOpen onClose={onClose} title={`Enrolments · ${course.shortName}`} subtitle="Students enrol through the course’s manual enrolment method." maxWidth="720px">
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select size="small" label="Linked student" value={studentId} onChange={(e) => setStudentId(e.target.value)} sx={{ flex: 1 }}>
            {linkedStudents.filter((s) => !enrolledIds.has(s.studentProfileId)).map((s) => <MenuItem key={s.studentProfileId} value={s.studentProfileId}>{s.name} · {s.studentNumber}</MenuItem>)}
          </TextField>
          <Button variant="primary" size="sm" disabled={!studentId} loading={busy === 'enrol'} onClick={() => run('enrol', () => moodleAdminApi.enrol(course.moodleCourseId, studentId), (r) => (r.result?.action === 'ALREADY_ENROLLED' ? 'Already enrolled.' : 'Enrolled in Moodle.')).then(() => setStudentId(''))}>
            Enrol
          </Button>
        </Stack>
        <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.participants?.length} emptyTitle="No participants" emptyMessage="Nobody visible here is enrolled yet." minHeight={100}>
          {() => (
            <Stack spacing={1}>
              {data.note && <Alert severity="info">{data.note}</Alert>}
              {data.participants.map((p) => (
                <Stack key={p.moodleUserId} direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.student?.name ?? p.instructor?.name ?? p.fullName ?? `Moodle user ${p.moodleUserId}`}</Typography>
                    <Typography variant="caption">{p.student ? `${p.student.studentNumber} · ` : p.instructor ? `Instructor ${p.instructor.employeeNumber} · ` : 'Not linked to EduNexusAI · '}Moodle user {p.moodleUserId}{p.roles.length ? ` · ${p.roles.map((r) => r.shortName).join(', ')}` : ''}</Typography>
                  </Box>
                  {p.student && (
                    <Stack direction="row" spacing={1}>
                      <Button variant="outline" size="sm" loading={busy === `s-${p.moodleUserId}`} onClick={() => run(`s-${p.moodleUserId}`, () => moodleAdminApi.endEnrolment(course.moodleCourseId, { studentProfileId: p.student.studentProfileId, mode: 'SUSPEND' }), 'Enrolment suspended. Enrol again to restore it.')}>Suspend</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `r-${p.moodleUserId}`}
                        onClick={() => window.confirm(`Remove ${p.student.name} from ${course.shortName}? Their course activity may no longer be visible. Suspending is reversible.`) && run(`r-${p.moodleUserId}`, () => moodleAdminApi.endEnrolment(course.moodleCourseId, { studentProfileId: p.student.studentProfileId, mode: 'REMOVE', confirm: true }), 'Enrolment removed.')}
                      >
                        Remove
                      </Button>
                    </Stack>
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </DataState>
      </Stack>
    </Modal>
  );
}

function Courses({ status }) {
  const { data, loading, error, refetch } = useApiQuery(() => moodleAdminApi.courses());
  const { data: students } = useApiQuery(() => moodleAdminApi.students());
  const { busy, run } = useAction(refetch);
  const [dialog, setDialog] = useState(null); // { mode: 'create' } | { mode: 'edit', course } | { mode: 'enrol', course }
  const linkedStudents = (students ?? []).filter((s) => s.moodle && s.moodle.status === 'ACTIVE');

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="primary" size="sm" icon={AddRoundedIcon} onClick={() => setDialog({ mode: 'create' })}>Create course</Button>
      </Stack>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.courses?.length} emptyTitle="No Moodle courses" emptyMessage="Courses created in Moodle appear here.">
        {() => (
          <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Moodle courses">
              <TableHead>
                <TableRow>
                  <TableCell>Course</TableCell>
                  <TableCell>ID number</TableCell>
                  <TableCell>Visibility</TableCell>
                  <TableCell sx={{ minWidth: 220 }}>EduNexusAI course</TableCell>
                  <TableCell align="right" sx={{ minWidth: 320 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.courses.map((c) => (
                  <TableRow key={c.moodleCourseId} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{c.fullName}</Typography>
                      <Typography variant="caption">{c.shortName} · id {c.moodleCourseId}</Typography>
                    </TableCell>
                    <TableCell>{c.idNumber ?? '—'}</TableCell>
                    <TableCell><Chip size="small" color={c.visible ? 'success' : 'default'} variant="outlined" label={c.visible ? 'Visible' : 'Hidden'} /></TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        sx={{ mb: 0.75 }}
                        color={MAPPING[c.mappingStatus]?.[0] ?? 'default'}
                        variant="outlined"
                        label={MAPPING[c.mappingStatus]?.[1] ?? c.mappingStatus}
                      />
                      {c.conflict && <Typography variant="caption" color="error.main" component="div" sx={{ mb: 0.5 }}>{c.conflict}</Typography>}
                      {c.localCourse ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" color="primary" label={c.localCourse.code} />
                          <MuiButton size="small" disabled={busy === `u-${c.moodleCourseId}`} onClick={() => run(`u-${c.moodleCourseId}`, () => moodleAdminApi.unlinkCourse(c.moodleCourseId), 'Link removed. Nothing changed in Moodle.')}>Unlink</MuiButton>
                        </Stack>
                      ) : (
                        <TextField
                          select
                          size="small"
                          fullWidth
                          label={c.suggestedLocalCourse ? `Suggested: ${c.suggestedLocalCourse.code}` : 'Link to…'}
                          value=""
                          onChange={(e) => run(`l-${c.moodleCourseId}`, () => moodleAdminApi.linkCourse(c.moodleCourseId, e.target.value), 'Course linked.')}
                        >
                          {data.localCourses.filter((l) => !l.linked).map((l) => <MenuItem key={l.id} value={l.id}>{l.code} · {l.name}</MenuItem>)}
                        </TextField>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" useFlexGap flexWrap="wrap">
                        <MuiButton size="small" onClick={() => setDialog({ mode: 'enrol', course: c })}>Enrolments</MuiButton>
                        <MuiButton size="small" onClick={() => setDialog({ mode: 'edit', course: c })}>Edit</MuiButton>
                        <MuiButton size="small" disabled={busy === `v-${c.moodleCourseId}`} onClick={() => run(`v-${c.moodleCourseId}`, () => (c.visible ? moodleAdminApi.hideCourse(c.moodleCourseId) : moodleAdminApi.showCourse(c.moodleCourseId)), c.visible ? 'Course hidden from students.' : 'Course visible to students.')}>
                          {c.visible ? 'Hide' : 'Show'}
                        </MuiButton>
                        <MuiButton size="small" endIcon={<OpenInNewRoundedIcon fontSize="small" />} href={c.courseUrl} target="_blank" rel="noopener noreferrer">Open</MuiButton>
                        {status.configuration.allowCourseDelete && (
                          <MuiButton
                            size="small"
                            color="error"
                            onClick={() => {
                              const typed = window.prompt(`Permanently delete "${c.fullName}" and all its content from Moodle? This cannot be undone. Type the short name (${c.shortName}) to confirm.`);
                              if (typed) run(`d-${c.moodleCourseId}`, () => moodleAdminApi.deleteCourse(c.moodleCourseId, typed), 'Course permanently deleted from Moodle.');
                            }}
                          >
                            Delete
                          </MuiButton>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
      {data?.missing?.length > 0 && (
        <Alert severity="warning">
          {data.missing.length} mapping(s) point to Moodle courses that no longer exist:{' '}
          {data.missing.map((m) => (
            <Box component="span" key={m.moodleCourseId} sx={{ mr: 1 }}>
              Moodle {m.moodleCourseId} ↔ {m.localCourse?.code ?? 'deleted local course'}{' '}
              <MuiButton size="small" onClick={() => run(`u-${m.moodleCourseId}`, () => moodleAdminApi.unlinkCourse(m.moodleCourseId), 'Stale mapping removed.')}>Unlink</MuiButton>
            </Box>
          ))}
        </Alert>
      )}
      <CourseDialog open={dialog?.mode === 'create' || dialog?.mode === 'edit'} course={dialog?.mode === 'edit' ? dialog.course : null} localCourses={data?.localCourses ?? []} onClose={() => setDialog(null)} onSaved={refetch} />
      {dialog?.mode === 'enrol' && <EnrolmentDialog course={dialog.course} linkedStudents={linkedStudents} onClose={() => setDialog(null)} />}
    </Stack>
  );
}

/* ------------------------------------------------------------------ students */

function Students() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, refetch } = useApiQuery(() => moodleAdminApi.students(query), [query]);
  const { busy, run } = useAction(refetch);
  const [provisioning, setProvisioning] = useState(null);
  const [emailWelcome, setEmailWelcome] = useState(false);
  const [selection, setSelection] = useState({ provision: true, courseIds: [], courseNames: {} });
  const [onboardResult, setOnboardResult] = useState(null);

  return (
    <Stack spacing={2}>
      <TextField
        size="small"
        placeholder="Search name, student number or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && setQuery(search)}
        onBlur={() => setQuery(search)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
        inputProps={{ 'aria-label': 'Search students' }}
        sx={{ maxWidth: 420 }}
      />
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle="No students" emptyMessage="No EduNexusAI students match.">
        {() => (
          <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Students and Moodle accounts">
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Moodle account</TableCell>
                  <TableCell>Last operation</TableCell>
                  <TableCell align="right" sx={{ minWidth: 300 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.studentProfileId} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{s.name}</Typography>
                      <Typography variant="caption">{s.studentNumber} · {s.email}</Typography>
                    </TableCell>
                    <TableCell>
                      {s.moodle ? (
                        <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                          <Chip size="small" color={s.moodle.status === 'ACTIVE' ? 'success' : 'warning'} label={s.moodle.status === 'ACTIVE' ? `Linked · user ${s.moodle.moodleUserId}` : `Suspended · user ${s.moodle.moodleUserId}`} />
                          <Typography variant="caption">{s.moodle.linkMethod?.toLowerCase().replace(/_/g, ' ')}</Typography>
                        </Stack>
                      ) : (
                        <Chip size="small" variant="outlined" label="Not linked" />
                      )}
                    </TableCell>
                    <TableCell>
                      {s.lastOperation ? (
                        <Stack spacing={0.25}>
                          <Chip size="small" variant="outlined" color={OP_COLOR[s.lastOperation.status] ?? 'default'} label={`${s.lastOperation.operation} · ${s.lastOperation.status.toLowerCase().replace(/_/g, ' ')}`} sx={{ alignSelf: 'flex-start' }} />
                          {s.lastOperation.errorMessage && <Typography variant="caption" color="error.main" sx={{ maxWidth: 320 }}>{s.lastOperation.errorMessage}</Typography>}
                        </Stack>
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" useFlexGap flexWrap="wrap">
                        {!s.moodle && (
                          <>
                            <MuiButton size="small" disabled={busy === `l-${s.studentProfileId}`} onClick={() => run(`l-${s.studentProfileId}`, () => moodleAdminApi.linkStudent(s.studentProfileId), (r) => `Linked to Moodle user ${r.moodleUserId} (${r.linkMethod.toLowerCase().replace(/_/g, ' ')}).`)}>Find &amp; link</MuiButton>
                            <MuiButton size="small" variant="outlined" onClick={() => { setEmailWelcome(false); setSelection({ provision: true, courseIds: [], courseNames: {} }); setProvisioning(s); }}>Provision</MuiButton>
                          </>
                        )}
                        {s.moodle && (
                          <>
                            <MuiButton size="small" disabled={busy === `p-${s.studentProfileId}`} onClick={() => run(`p-${s.studentProfileId}`, () => moodleAdminApi.setSuspended(s.studentProfileId, s.moodle.status === 'ACTIVE'), s.moodle.status === 'ACTIVE' ? 'Moodle account suspended. Enrolments are kept.' : 'Moodle account reactivated.')}>
                              {s.moodle.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                            </MuiButton>
                            <MuiButton size="small" color="inherit" disabled={busy === `u-${s.studentProfileId}`} onClick={() => window.confirm(`Unlink ${s.name} from Moodle user ${s.moodle.moodleUserId}? The Moodle account is not changed.`) && run(`u-${s.studentProfileId}`, () => moodleAdminApi.unlinkStudent(s.studentProfileId), 'Link removed. The Moodle account was not changed.')}>Unlink</MuiButton>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
      <Modal
        isOpen={Boolean(provisioning)}
        onClose={() => setProvisioning(null)}
        title="Provision Moodle account"
        subtitle={provisioning ? `${provisioning.name} · ${provisioning.studentNumber}` : ''}
        footer={
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="ghost" size="sm" onClick={() => setProvisioning(null)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy === 'provision'}
              onClick={async () => {
                if (selection.courseIds.length) {
                  const summary = await run('provision', () => moodleAdminApi.onboardStudent(provisioning.studentProfileId, selection.courseIds), (r) => (r.status === 'SUCCEEDED' ? 'Moodle account and enrolments are in place.' : `Moodle onboarding is ${r.status.toLowerCase().replace(/_/g, ' ')}.`));
                  if (summary) setOnboardResult({ name: provisioning.name, summary, courseNames: selection.courseNames });
                } else {
                  await run('provision', () => moodleAdminApi.provisionStudent(provisioning.studentProfileId, emailWelcome), (r) => (r.result?.action === 'LINKED_EXISTING' ? `An existing Moodle account was found and linked (user ${r.result.moodleUserId}).` : r.result?.action === 'ALREADY_LINKED' ? 'Already linked.' : `Moodle account created (user ${r.result?.moodleUserId}).`));
                }
                setProvisioning(null);
              }}
            >
              Provision
            </Button>
          </Stack>
        }
      >
        <Stack spacing={1.5}>
          <Typography variant="body2">
            Moodle is checked first for an account with this student’s ID number or email. If one exists it is linked instead of creating a duplicate. Otherwise a manual Moodle account is created with username <b>{provisioning?.studentNumber?.toLowerCase()}</b>.
          </Typography>
          <MoodleEnrolmentFields open={Boolean(provisioning)} value={selection} onChange={setSelection} showProvisionSwitch={false} />
          {selection.courseIds.length === 0 && (
            <FormControlLabel control={<Checkbox checked={emailWelcome} onChange={(e) => setEmailWelcome(e.target.checked)} />} label="Let Moodle email the student a temporary password" />
          )}
          <Typography variant="caption" color="text.secondary">
            {selection.courseIds.length ? 'No email is sent. Development servers set the demo password (MOODLE_DEMO_PASSWORD) when configured; otherwise the student uses “Forgotten password”.' : emailWelcome ? 'Moodle sends the email; EduNexusAI never sees the password.' : 'No email is sent. The student sets a password with Moodle’s “Forgotten password” link.'}
          </Typography>
        </Stack>
      </Modal>
      <Modal isOpen={Boolean(onboardResult)} onClose={() => setOnboardResult(null)} title="Moodle provisioning" subtitle={onboardResult?.name ?? ''}>
        {onboardResult && <MoodleOnboardingResult summary={onboardResult.summary} courseNames={onboardResult.courseNames} />}
      </Modal>
    </Stack>
  );
}

/* ---------------------------------------------------------------- operations */

function Operations({ onChanged }) {
  const [status, setStatus] = useState('');
  const { data, loading, error, refetch } = useApiQuery(() => moodleAdminApi.operations(status || undefined), [status]);
  const { busy, run } = useAction(async () => {
    await refetch();
    await onChanged?.();
  });
  return (
    <Stack spacing={2}>
      <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ maxWidth: 260 }}>
        <MenuItem value="">All</MenuItem>
        {['FAILED', 'PARTIAL', 'NEEDS_RECONCILIATION', 'BLOCKED', 'PENDING', 'SUCCEEDED'].map((s) => <MenuItem key={s} value={s}>{s.toLowerCase().replace(/_/g, ' ')}</MenuItem>)}
      </TextField>
      <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle="No operations" emptyMessage="Changes made in Moodle from EduNexusAI are recorded here.">
        {() => (
          <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Moodle operations">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Operation</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>Detail</TableCell>
                  <TableCell align="right">Retry</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((op) => (
                  <TableRow key={op.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{when(op.updatedAt)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{op.operation}</Typography>
                      <Typography variant="caption">attempt {op.attempts}{op.externalId ? ` · Moodle id ${op.externalId}` : ''}</Typography>
                    </TableCell>
                    <TableCell><Chip size="small" color={OP_COLOR[op.status] ?? 'default'} label={op.status.toLowerCase().replace(/_/g, ' ')} /></TableCell>
                    <TableCell>
                      <Typography variant="body2">{op.errorMessage ?? op.result?.action?.toLowerCase().replace(/_/g, ' ') ?? '—'}</Typography>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>ref {op.correlationId.slice(0, 8)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      {op.retryable && (
                        <Button variant="outline" size="sm" icon={ReplayRoundedIcon} loading={busy === op.id} onClick={() => run(op.id, () => moodleAdminApi.retryOperation(op.id), 'Operation completed.')}>Retry</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataState>
    </Stack>
  );
}

/**
 * Moodle LMS administration: connection health, the function checklist, course shells,
 * student account links, enrolments and the operation log. Every action is authorised
 * and validated by the API; the Moodle token never reaches this page.
 */
export const AdminMoodlePage = () => {
  const [tab, setTab] = useState('overview');
  const { data: status, loading, error, refetch } = useApiQuery(() => moodleAdminApi.status());

  return (
    <Box>
      <MuiButton component={RouterLink} to="/admin/integrations" startIcon={<ArrowBackRoundedIcon />} size="small" sx={{ mb: 1 }}>
        All integrations
      </MuiButton>
      <PageHeader eyebrow="Integrations" title="Moodle LMS" description="LMS accounts, course sites and enrolments in Moodle. Official student records and class registrations stay in CampusCore SIS." />
      <DataState loading={loading} error={error} onRetry={refetch}>
        {() => (
          <>
            <Tabs value={tab} onChange={(_e, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Tab value="overview" label="Overview" />
              <Tab value="courses" label="Courses" />
              <Tab value="classes" label="CampusCore classes" />
              <Tab value="students" label="Students" />
              <Tab value="operations" label={status.counts.operations.FAILED || status.counts.operations.NEEDS_RECONCILIATION ? `Operations (${(status.counts.operations.FAILED ?? 0) + (status.counts.operations.NEEDS_RECONCILIATION ?? 0)} need attention)` : 'Operations'} />
            </Tabs>
            {tab === 'overview' && <Overview status={status} onTested={refetch} />}
            {tab === 'courses' && <Courses status={status} />}
            {tab === 'classes' && <SisSectionMappings />}
            {tab === 'students' && <Students />}
            {tab === 'operations' && <Operations onChanged={refetch} />}
          </>
        )}
      </DataState>
    </Box>
  );
};

export default AdminMoodlePage;
