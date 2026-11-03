import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import { alpha } from '@mui/material/styles';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { FilterChips } from '../../components/common/FilterChips';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi } from '../../services/api';

const keyOf = (studentProfileId, assignmentId) => `${studentProfileId}:${assignmentId}`;
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
const pct = (value) => (value == null ? '—' : `${value}%`);

/** Client-side check for immediate feedback; the API validates again and is authoritative. */
function parseScore(raw, maxPoints) {
  const text = String(raw).trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, message: 'Enter a number with up to two decimals.' };
  const value = Number(text);
  if (value > maxPoints) return { ok: false, message: `Maximum is ${maxPoints}.` };
  return { ok: true, value };
}

function StatusChips({ student, threshold }) {
  const { result } = student;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
      {result.risk === 'AT_RISK' && <Chip size="small" color="error" label={`At risk (<${threshold}%)`} />}
      {result.risk === 'OK' && <Chip size="small" color="success" variant="outlined" label="On track" />}
      {result.risk === 'INSUFFICIENT_DATA' && (
        <Tooltip title="Fewer than two graded assignments: not enough information to judge.">
          <Chip size="small" variant="outlined" label="Not enough graded work" />
        </Tooltip>
      )}
      {result.missing > 0 && <Chip size="small" color="warning" variant="outlined" label={`${result.missing} missing`} />}
      {student.draftCount > 0 && <Chip size="small" color="info" variant="outlined" label={`${student.draftCount} unpublished`} />}
    </Stack>
  );
}

function SettingsDialog({ open, onClose, book, onSave }) {
  const [method, setMethod] = useState('POINTS');
  const [policy, setPolicy] = useState('EXCLUDE');
  const [threshold, setThreshold] = useState('70');
  const [weights, setWeights] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || !book) return;
    setMethod(book.course.gradingMethod);
    setPolicy(book.course.missingWorkPolicy);
    setThreshold(String(book.course.atRiskThreshold));
    setWeights(Object.fromEntries(book.assignments.map((a) => [a.id, a.weight == null ? '' : String(a.weight)])));
  }, [open, book]);
  if (!book) return null;
  const total = Object.values(weights).reduce((sum, w) => sum + (Number(w) || 0), 0);
  const thresholdValue = Number(threshold);
  const invalid = !Number.isInteger(thresholdValue) || thresholdValue < 0 || thresholdValue > 100 || Object.values(weights).some((w) => w !== '' && !(Number(w) >= 0 && Number(w) <= 100));
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Grading settings · {book.course.code}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Box>
            <FormLabel>Grading method</FormLabel>
            <RadioGroup value={method} onChange={(e) => setMethod(e.target.value)}>
              <FormControlLabel value="POINTS" control={<Radio />} label="Points: earned points ÷ possible points" />
              <FormControlLabel value="WEIGHTED" control={<Radio />} label="Weighted: each assignment counts by its weight" />
            </RadioGroup>
          </Box>
          <Box>
            <FormLabel>Missing work</FormLabel>
            <RadioGroup value={policy} onChange={(e) => setPolicy(e.target.value)}>
              <FormControlLabel value="EXCLUDE" control={<Radio />} label="Leave ungraded work out of the total" />
              <FormControlLabel value="ZERO" control={<Radio />} label="Count ungraded work as zero once it is past due" />
            </RadioGroup>
          </Box>
          <TextField label="At-risk threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} helperText="Students below this percentage (with at least two graded assignments) are flagged." sx={{ maxWidth: 260 }} />
          {method === 'WEIGHTED' && (
            <Box>
              <FormLabel>Assignment weights (% of course grade)</FormLabel>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {book.assignments.map((a) => (
                  <Stack key={a.id} direction="row" spacing={1.5} alignItems="center">
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{a.title}</Typography>
                    <TextField size="small" value={weights[a.id] ?? ''} onChange={(e) => setWeights({ ...weights, [a.id]: e.target.value })} inputProps={{ inputMode: 'decimal', 'aria-label': `Weight for ${a.title}` }} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} sx={{ width: 120 }} />
                  </Stack>
                ))}
              </Stack>
              <Typography variant="caption" color={Math.abs(total - 100) < 0.01 ? 'success.main' : 'warning.main'} component="p" sx={{ mt: 1 }}>
                Weights total {Math.round(total * 100) / 100}%{Math.abs(total - 100) < 0.01 ? '' : '. Percentages renormalise over graded work, but a 100% total is recommended.'}
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Cancel</MuiButton>
        <MuiButton
          variant="contained"
          disabled={invalid || saving}
          onClick={async () => {
            setSaving(true);
            await onSave({
              gradingMethod: method,
              missingWorkPolicy: policy,
              atRiskThreshold: thresholdValue,
              weights: Object.entries(weights).map(([assignmentId, w]) => ({ assignmentId, weight: w === '' ? null : Number(w) })),
            });
            setSaving(false);
          }}
        >
          Save settings
        </MuiButton>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Faculty gradebook: enter scores as drafts, review, then publish to students. Totals,
 * averages and at-risk flags come from the API (one calculation source of truth).
 */
export const FacultyGradebookPage = () => {
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const { data: courses, loading: coursesLoading, error: coursesError, refetch: refetchCourses } = useApiQuery(() => facultyApi.getGradebookCourses());
  const courseId = params.get('course') ?? courses?.[0]?.id ?? null;

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [edits, setEdits] = useState({}); // key -> raw text
  const [serverErrors, setServerErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [publishTarget, setPublishTarget] = useState(null); // { assignmentId?, label }
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      setBook(await facultyApi.getGradebook(id));
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setEdits({});
    setServerErrors([]);
    load(courseId);
  }, [courseId, load]);

  const unsavedCount = Object.keys(edits).length;
  // Warn before leaving with unsaved scores.
  useEffect(() => {
    if (!unsavedCount) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedCount]);

  const assignmentsById = useMemo(() => new Map((book?.assignments ?? []).map((a) => [a.id, a])), [book]);
  const invalidEdits = useMemo(
    () => Object.entries(edits).filter(([key, raw]) => !parseScore(raw, assignmentsById.get(key.split(':')[1])?.maxPoints ?? 0).ok).map(([key]) => key),
    [edits, assignmentsById],
  );

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (book?.students ?? []).filter((s) => {
      if (q && !`${s.name} ${s.studentNumber} ${s.email}`.toLowerCase().includes(q)) return false;
      if (filter === 'MISSING') return book.assignments.some((a) => s.cells[a.id].value == null);
      if (filter === 'AT_RISK') return s.result.risk === 'AT_RISK';
      if (filter === 'UNPUBLISHED') return s.draftCount > 0;
      return true;
    });
  }, [book, search, filter]);

  const setCell = (student, assignment, raw) => {
    const key = keyOf(student.studentProfileId, assignment.id);
    const saved = student.cells[assignment.id].value;
    setEdits((current) => {
      const next = { ...current };
      if (String(raw).trim() === (saved == null ? '' : String(saved))) delete next[key];
      else next[key] = raw;
      return next;
    });
  };

  const save = async () => {
    if (invalidEdits.length) {
      showToast('Fix the highlighted scores before saving.', 'error');
      return;
    }
    const scores = Object.entries(edits).map(([key, raw]) => {
      const [studentProfileId, assignmentId] = key.split(':');
      return { studentProfileId, assignmentId, score: parseScore(raw, assignmentsById.get(assignmentId).maxPoints).value };
    });
    setSaving(true);
    setServerErrors([]);
    try {
      setBook(await facultyApi.saveScores(courseId, scores));
      setEdits({});
      showToast(`${scores.length} score${scores.length === 1 ? '' : 's'} saved as drafts. Students see them once you publish.`);
    } catch (error) {
      setServerErrors(error.details?.errors?.map((e) => e.message) ?? (Array.isArray(error.details) ? error.details.map((d) => d.message) : [error.message]));
      showToast(error.message ?? 'Scores could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    try {
      const result = await facultyApi.publishGrades(courseId, publishTarget?.assignmentId ? { assignmentId: publishTarget.assignmentId } : {});
      setBook(result.gradebook);
      showToast(result.published ? `Published ${result.published} grade${result.published === 1 ? '' : 's'} to ${result.students} student${result.students === 1 ? '' : 's'}.` : 'There were no draft grades to publish.');
    } catch (error) {
      showToast(error.message ?? 'Grades could not be published.', 'error');
    } finally {
      setPublishTarget(null);
    }
  };

  const saveSettings = async (body) => {
    try {
      setBook(await facultyApi.saveGradingSettings(courseId, body));
      setSettingsOpen(false);
      showToast('Grading settings saved. Totals have been recalculated.');
    } catch (error) {
      showToast(error.message ?? 'Settings could not be saved.', 'error');
    }
  };

  const draftsFor = (assignmentId) => book?.assignmentStats.find((s) => s.assignmentId === assignmentId)?.draftCount ?? 0;
  const threshold = book?.course.atRiskThreshold ?? 70;

  return (
    <Box>
      <PageHeader
        eyebrow="Teaching"
        title="Local gradebook (demo)"
        description="EduNexusAI demo coursework for the local demo sections. Scores here are not Moodle grades and not official CampusCore grades."
        actions={
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <MuiButton startIcon={<TuneRoundedIcon />} onClick={() => setSettingsOpen(true)} disabled={!book}>Grading settings</MuiButton>
            <MuiButton startIcon={<UndoRoundedIcon />} onClick={() => setEdits({})} disabled={!unsavedCount || saving}>Discard</MuiButton>
            <MuiButton variant="outlined" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={!unsavedCount || saving}>
              {saving ? 'Saving…' : `Save drafts${unsavedCount ? ` (${unsavedCount})` : ''}`}
            </MuiButton>
            <MuiButton variant="contained" startIcon={<PublishRoundedIcon />} onClick={() => setPublishTarget({ label: 'all draft grades in this course' })} disabled={!book?.summary.pendingDrafts || unsavedCount > 0}>
              Publish{book?.summary.pendingDrafts ? ` (${book.summary.pendingDrafts})` : ''}
            </MuiButton>
          </Stack>
        }
      />
      <Alert severity="warning" sx={{ mb: 2 }}>
        <b>Where grades belong.</b> Assignment and coursework grades are Moodle&apos;s: grade them in Teaching → Moodle Teaching, and students see them in Moodle and on their Assignments and Grades pages.
        Final course grades are CampusCore&apos;s: submit them in the CampusCore faculty portal, where the registrar approves and publishes them.
        This page edits local demo records only; &ldquo;Publish&rdquo; here does not reach Moodle, CampusCore or any student page.
      </Alert>

      <DataState loading={coursesLoading} error={coursesError} onRetry={refetchCourses} isEmpty={!coursesLoading && !(courses ?? []).length} emptyTitle="No courses to grade" emptyMessage="You are not instructor of record for any course this term.">
        {() => (
          <Stack spacing={2}>
            <Card sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" alignItems={{ md: 'center' }}>
                <TextField
                  select
                  size="small"
                  label="Course"
                  value={courseId ?? ''}
                  onChange={(e) => {
                    if (unsavedCount && !window.confirm('Discard unsaved scores and switch course?')) return;
                    setParams({ course: e.target.value });
                  }}
                  sx={{ minWidth: 280 }}
                >
                  {(courses ?? []).map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.code} · {c.name} ({c.enrolledCount} students)</MenuItem>
                  ))}
                </TextField>
                <TextField size="small" placeholder="Search name, ID or email" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: { md: 240 } }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} inputProps={{ 'aria-label': 'Search students' }} />
                <FilterChips
                  sx={{ flexShrink: 0 }}
                  ariaLabel="Filter students"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: 'ALL', label: 'All' },
                    { id: 'MISSING', label: 'Missing grades' },
                    { id: 'AT_RISK', label: 'At risk' },
                    { id: 'UNPUBLISHED', label: 'Unpublished' },
                  ]}
                />
              </Stack>
              <Typography variant="caption" component="p" sx={{ mt: 1 }}>
                Each course is one section; switch sections with the course selector.
              </Typography>
            </Card>

            {loadError && <Alert severity="error">{loadError.message}</Alert>}
            {serverErrors.length > 0 && (
              <Alert severity="error" onClose={() => setServerErrors([])}>
                Nothing was saved. {serverErrors.slice(0, 4).join(' ')}
              </Alert>
            )}

            {book && (
              <>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <Chip label={book.course.gradingMethod === 'WEIGHTED' ? `Weighted (weights total ${book.course.weightTotal}%)` : 'Points-based'} />
                  <Chip label={book.course.missingWorkPolicy === 'ZERO' ? 'Missing work counts as 0 when past due' : 'Missing work excluded from totals'} />
                  <Chip label={`Class average ${pct(book.summary.classAverage)} (published ${pct(book.summary.publishedClassAverage)})`} />
                  <Chip color={book.summary.atRisk ? 'error' : 'default'} variant="outlined" label={`${book.summary.atRisk} at risk (<${threshold}%)`} />
                  <Chip color={book.summary.missingGrades ? 'warning' : 'default'} variant="outlined" label={`${book.summary.missingGrades} missing grade${book.summary.missingGrades === 1 ? '' : 's'}`} />
                  <Chip color={book.summary.pendingDrafts ? 'info' : 'default'} variant="outlined" label={`${book.summary.pendingDrafts} unpublished draft${book.summary.pendingDrafts === 1 ? '' : 's'}`} />
                </Stack>
                <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ typography: 'caption', color: 'text.secondary' }}>
                  <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 14, height: 14, flexShrink: 0, borderRadius: 0.5, borderWidth: '1.5px !important', bgcolor: 'primary.lighter', border: 1, borderColor: 'primary.main' }} /> Unsaved edit</Stack>
                  <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 14, height: 14, flexShrink: 0, borderRadius: 0.5, borderWidth: '1.5px !important', bgcolor: 'info.lighter', border: 1, borderColor: 'info.main' }} /> Saved draft, not visible to the student</Stack>
                  <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 14, height: 14, flexShrink: 0, borderRadius: 0.5, borderWidth: '1.5px !important', border: 1, borderColor: 'text.disabled' }} /> Published</Stack>
                  <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 14, height: 14, flexShrink: 0, borderRadius: 0.5, borderWidth: '1.5px !important', border: '1px dashed', borderColor: 'warning.main' }} /> No grade yet</Stack>
                </Stack>

                <TableContainer component={Card} sx={{ overflowX: 'auto', maxHeight: '70vh' }}>
                  <Table stickyHeader size="small" aria-label={`${book.course.code} gradebook`}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ position: 'sticky', left: 0, zIndex: 3, minWidth: 210, bgcolor: 'background.paper' }}>Student</TableCell>
                        {book.assignments.map((a) => {
                          const stats = book.assignmentStats.find((s) => s.assignmentId === a.id);
                          return (
                            <TableCell key={a.id} align="center" sx={{ minWidth: 150, verticalAlign: 'top' }}>
                              <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>{a.title}</Typography>
                              <Typography variant="caption" component="div">
                                / {a.maxPoints} pts · due {fmtDate(a.dueDate)}
                                {book.course.gradingMethod === 'WEIGHTED' && ` · ${a.weight ?? 0}%`}
                              </Typography>
                              <Typography variant="caption" component="div">Avg {pct(stats?.average)}</Typography>
                              {draftsFor(a.id) > 0 && (
                                <MuiButton size="small" onClick={() => setPublishTarget({ assignmentId: a.id, label: `draft grades for “${a.title}”` })} disabled={unsavedCount > 0} sx={{ mt: 0.25 }}>
                                  Publish {draftsFor(a.id)}
                                </MuiButton>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell align="right" sx={{ minWidth: 110 }}>Total</TableCell>
                        <TableCell align="right" sx={{ minWidth: 120 }}>Course %</TableCell>
                        <TableCell align="right" sx={{ minWidth: 120 }}>Students see</TableCell>
                        <TableCell sx={{ minWidth: 230 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleStudents.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={book.assignments.length + 5}>
                            <Typography color="text.secondary" sx={{ py: 2 }}>No students match these filters.</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                      {visibleStudents.map((s) => (
                        <TableRow key={s.studentProfileId} hover>
                          <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper' }}>
                            <Typography variant="subtitle2">{s.name}</Typography>
                            <Typography variant="caption">{s.studentNumber}</Typography>
                          </TableCell>
                          {book.assignments.map((a) => {
                            const cell = s.cells[a.id];
                            const key = keyOf(s.studentProfileId, a.id);
                            const edited = key in edits;
                            const raw = edited ? edits[key] : cell.value == null ? '' : String(cell.value);
                            const check = edited ? parseScore(raw, a.maxPoints) : { ok: true };
                            const state = edited ? 'unsaved' : cell.hasDraft ? 'draft' : cell.value == null ? 'empty' : 'published';
                            const tip = !check.ok ? check.message : state === 'draft' ? `Draft${cell.published != null ? ` (published: ${cell.published})` : ''}: not visible to the student until published` : state === 'unsaved' ? 'Unsaved change' : state === 'empty' ? (cell.submitted ? 'Submitted, not yet graded' : 'No grade yet') : 'Published';
                            return (
                              <TableCell key={a.id} align="center">
                                <Tooltip title={tip}>
                                  <TextField
                                    size="small"
                                    value={raw}
                                    error={!check.ok}
                                    onChange={(e) => setCell(s, a, e.target.value)}
                                    placeholder="—"
                                    inputProps={{ inputMode: 'decimal', 'aria-label': `${s.name}, ${a.title}, out of ${a.maxPoints}`, style: { textAlign: 'center' } }}
                                    sx={(theme) => ({
                                      width: 84,
                                      '& .MuiOutlinedInput-root': {
                                        bgcolor: state === 'unsaved' ? theme.palette.primary.lighter : state === 'draft' ? theme.palette.info.lighter : 'background.paper',
                                      },
                                      '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: !check.ok ? theme.palette.error.main : state === 'unsaved' ? theme.palette.primary.main : state === 'draft' ? theme.palette.info.main : state === 'empty' ? alpha(theme.palette.warning.main, 0.7) : undefined,
                                        borderStyle: state === 'empty' ? 'dashed' : 'solid',
                                      },
                                    })}
                                  />
                                </Tooltip>
                              </TableCell>
                            );
                          })}
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{s.result.counted ? `${s.result.earned} / ${s.result.possible}` : '—'}</TableCell>
                          <TableCell align="right">
                            <Typography variant="subtitle2" component="span">{pct(s.result.percentage)}</Typography>
                            {s.result.letter && <Typography variant="caption" component="span"> {s.result.letter}</Typography>}
                          </TableCell>
                          <TableCell align="right">{pct(s.publishedResult.percentage)}</TableCell>
                          <TableCell><StatusChips student={s} threshold={threshold} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {unsavedCount > 0 && <Alert severity="info">You have {unsavedCount} unsaved change{unsavedCount === 1 ? '' : 's'}. Totals update when you save.</Alert>}
              </>
            )}
            {loading && !book && <Typography color="text.secondary">Loading the gradebook…</Typography>}
          </Stack>
        )}
      </DataState>

      <Dialog open={Boolean(publishTarget)} onClose={() => setPublishTarget(null)}>
        <DialogTitle>Publish grades?</DialogTitle>
        <DialogContent>
          <Typography>
            This publishes {publishTarget?.label}. The affected students will be able to see these scores and will be notified.
          </Typography>
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => setPublishTarget(null)}>Cancel</MuiButton>
          <MuiButton variant="contained" startIcon={<PublishRoundedIcon />} onClick={publish}>Publish</MuiButton>
        </DialogActions>
      </Dialog>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} book={book} onSave={saveSettings} />
    </Box>
  );
};

export default FacultyGradebookPage;
