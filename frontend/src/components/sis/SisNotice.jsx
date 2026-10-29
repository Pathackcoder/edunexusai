import React from 'react';
import Alert from '@mui/material/Alert';
import { Button } from '../common/Button';

/**
 * Explicit states for CampusCore-backed views. Returns null when there is data to show.
 * `section` is one { state, data, error } part of the overview (OK / FORBIDDEN / NOT_FOUND
 * / UNAVAILABLE); `overview` is the whole response (OK / UNMAPPED / NOT_A_STUDENT / UNAVAILABLE).
 */
export function SisNotice({ overview, section, what = 'This information', onRetry }) {
  if (overview && overview.state !== 'OK') {
    if (overview.state === 'UNMAPPED') return <Alert severity="info">{overview.message ?? 'Your portal account is not linked to a CampusCore record yet. Contact the registrar.'}</Alert>;
    if (overview.state === 'NOT_A_STUDENT' || overview.state === 'NOT_FACULTY') return <Alert severity="info">Your CampusCore record is not of this type, so there is nothing to show here.</Alert>;
    return (
      <Alert severity="warning" action={onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button> : null}>
        {overview.message ?? 'CampusCore SIS is unavailable right now.'}
      </Alert>
    );
  }
  if (section && section.state !== 'OK') {
    if (section.state === 'FORBIDDEN') return <Alert severity="info">{what} is not shared with the portal by CampusCore (permission not granted).</Alert>;
    if (section.state === 'NOT_FOUND') return <Alert severity="info">{what} was not found in CampusCore.</Alert>;
    return <Alert severity="warning">{what} could not be loaded from CampusCore ({section.error?.message ?? 'unavailable'}).</Alert>;
  }
  return null;
}
