import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Link from '@mui/material/Link';
import CircularProgress from '@mui/material/CircularProgress';
import { useApiQuery } from '../../hooks/useApiQuery';
import { moodleAdminApi } from '../../services/api';

/**
 * Moodle account + course selection for a student. Course options come live from Moodle
 * through the API (never from local course records); the server re-validates every id.
 *
 *   value = { provision: boolean, courseIds: number[] }
 */
export function MoodleEnrolmentFields({ open, value, onChange, onAvailability, showProvisionSwitch = true, audience = 'student' }) {
  const { data: status, loading: statusLoading, error: statusError } = useApiQuery(() => moodleAdminApi.status(), [open], { enabled: open });
  const usable = Boolean(status?.site) && status?.configuration?.writesEnabled;
  const { data: listing, loading: coursesLoading, error: coursesError } = useApiQuery(() => moodleAdminApi.courses(), [open, usable], { enabled: open && usable });
  const courses = listing?.courses ?? [];
  // Tell the parent whether Moodle can be written to, so it only sends a Moodle request then.
  React.useEffect(() => {
    onAvailability?.(Boolean(usable));
  }, [usable, onAvailability]);
  const toggleCourse = (course) => {
    const id = course.moodleCourseId;
    onChange({
      ...value,
      courseIds: value.courseIds.includes(id) ? value.courseIds.filter((x) => x !== id) : [...value.courseIds, id],
      courseNames: { ...(value.courseNames ?? {}), [id]: course.fullName },
    });
  };

  if (statusLoading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <CircularProgress size={16} />
        <Typography variant="body2">Checking Moodle…</Typography>
      </Stack>
    );
  }
  if (statusError || !status?.site) {
    return <Alert severity="warning">Moodle is not available ({statusError?.message ?? status?.error?.message ?? 'not configured'}). Create the student now and provision their Moodle account later from Moodle LMS → Students.</Alert>;
  }
  if (!status.configuration.writesEnabled) {
    return <Alert severity="info">Changes to Moodle are switched off on this server (MOODLE_WRITES_ENABLED), so no Moodle account can be created right now.</Alert>;
  }

  return (
    <Stack spacing={1.25}>
      {showProvisionSwitch && (
        <FormControlLabel
          control={<Switch checked={value.provision} onChange={(e) => onChange({ ...value, provision: e.target.checked, courseIds: e.target.checked ? value.courseIds : [] })} />}
          label="Create (or link) a Moodle account"
        />
      )}
      {value.provision && (
        <Box>
          <Typography variant="subtitle2">Moodle courses</Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.75 }}>
            Live from Moodle. {audience === 'faculty' ? 'The faculty member is enrolled with the Teacher role.' : 'The student is enrolled with the Student role.'} An existing Moodle account with the same ID number or email is linked instead of creating a duplicate.
          </Typography>
          {coursesLoading && <Typography variant="body2">Loading Moodle courses…</Typography>}
          {coursesError && <Alert severity="error">{coursesError.message}</Alert>}
          {!coursesLoading && !coursesError && courses.length === 0 && <Alert severity="info">Moodle has no courses yet. The account can still be created.</Alert>}
          <Stack sx={{ maxHeight: 220, overflowY: 'auto', border: courses.length ? 1 : 0, borderColor: 'divider', borderRadius: 2, px: 1 }}>
            {courses.map((c) => (
              <FormControlLabel
                key={c.moodleCourseId}
                control={<Checkbox size="small" checked={value.courseIds.includes(c.moodleCourseId)} onChange={() => toggleCourse(c)} />}
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="body2">{c.fullName}</Typography>
                    <Chip size="small" label={c.shortName} />
                    {!c.visible && <Chip size="small" variant="outlined" label="Hidden" />}
                  </Stack>
                }
              />
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

const OUTCOME = {
  ENROLLED: ['success', 'Enrolled'],
  ALREADY_ENROLLED: ['success', 'Already enrolled'],
  ENROLLED_WITH_WARNING: ['warning', 'Enrolled (Moodle warning)'],
  BLOCKED: ['warning', 'Blocked'],
  FAILED: ['error', 'Failed'],
  NEEDS_RECONCILIATION: ['warning', 'Needs reconciliation'],
  NOT_ATTEMPTED: ['default', 'Not attempted'],
};

/** Per-step outcome of a Moodle onboarding, as returned by the API. */
export function MoodleOnboardingResult({ summary, courseNames = {} }) {
  if (!summary) return null;
  const ok = summary.status === 'SUCCEEDED';
  return (
    <Stack spacing={1.5}>
      <Alert severity={ok ? 'success' : summary.status === 'PARTIAL' ? 'warning' : 'error'}>
        {ok ? 'Moodle account and enrolments are in place.' : summary.message ?? `Moodle onboarding is ${summary.status.toLowerCase()}.`}
      </Alert>
      <Typography variant="body2">
        <b>Moodle account:</b>{' '}
        {summary.account ? `${summary.account.action?.toLowerCase().replace(/_/g, ' ')} (Moodle user ${summary.account.moodleUserId})` : 'not created yet'}
      </Typography>
      {summary.enrolments?.length > 0 && (
        <Stack spacing={0.5}>
          {summary.enrolments.map((e) => {
            const [color, label] = OUTCOME[e.status] ?? ['default', e.status];
            return (
              <Stack key={e.moodleCourseId} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography variant="body2">{courseNames[e.moodleCourseId] ?? `Moodle course ${e.moodleCourseId}`}</Typography>
                <Chip size="small" color={color} variant="outlined" label={label} />
              </Stack>
            );
          })}
        </Stack>
      )}
      {!ok && summary.retryable && (
        <Typography variant="caption">
          The EduNexusAI record is saved. Retry the missing steps from{' '}
          <Link component={RouterLink} to="/admin/integrations/moodle">Moodle LMS → Operations</Link>; completed steps are not repeated.
        </Typography>
      )}
    </Stack>
  );
}
