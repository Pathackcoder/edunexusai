import React from 'react';
import Alert from '@mui/material/Alert';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Button } from '../common/Button';

const COPY = {
  NOT_CONFIGURED: ['info', 'Your institution has not connected Moodle to the portal yet.'],
  NOT_LINKED: ['info', 'Your Moodle account has not been linked to the portal yet. Your administrator links it; until then you can still use Moodle directly.'],
  SUSPENDED: ['warning', 'Your Moodle account is currently suspended. Contact your institution’s help desk.'],
};

/**
 * Plain-language state for any Moodle-backed view that has no data to show. Returns null
 * when Moodle is connected, so callers render their content.
 */
export function MoodleNotice({ data, onRetry }) {
  if (!data || data.status === 'CONNECTED') return null;
  if (data.status === 'UNAVAILABLE') {
    return (
      <Alert severity="warning" action={onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button> : null}>
        {data.message ?? 'Moodle is not responding right now.'}
      </Alert>
    );
  }
  const [severity, text] = COPY[data.status] ?? ['info', 'Moodle data is not available.'];
  return <Alert severity={severity} icon={data.status === 'SUSPENDED' ? <LockOutlinedIcon /> : undefined}>{text}</Alert>;
}

/** "This needs a Moodle function your institution has not enabled." */
export function MoodleUnavailablePart({ part, what }) {
  if (!part || part.available !== false) return null;
  return (
    <Alert severity="info">
      {part.reason === 'FUNCTION_NOT_ENABLED'
        ? `${what} is not available yet: the Moodle function ${part.function} is not enabled for this integration.`
        : part.message ?? `${what} could not be loaded from Moodle.`}
    </Alert>
  );
}
