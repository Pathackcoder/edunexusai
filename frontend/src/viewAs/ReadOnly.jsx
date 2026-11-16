import React from 'react';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import { useIsViewAs } from '../context/AuthContext';

/**
 * Read-only View-As in the UI. The server refuses every action in a View-As tab, and so does the API client; these
 * make it visible: action controls are disabled with an explanation instead of failing when pressed. Pages and
 * information stay visible; only what would change something is switched off.
 */
export const READ_ONLY_HINT = 'Disabled: this is a read-only View-As session';

/** True in a View-As tab. */
export const useReadOnly = () => useIsViewAs();

/** Wrap one action control (any element that takes `disabled`): in View-As it is disabled and says why. */
export function ReadOnlyGate({ children, hint = READ_ONLY_HINT }) {
  const readOnly = useReadOnly();
  if (!readOnly) return children;
  return (
    <Tooltip title={hint}>
      <span style={{ display: 'inline-flex' }}>{React.cloneElement(children, { disabled: true, 'aria-disabled': true })}</span>
    </Tooltip>
  );
}

/** A one-line notice for a form or panel whose actions are switched off in View-As. Renders nothing otherwise. */
export function ReadOnlyNotice({ children = 'Read-only View-As: you can see this form as the person does, but it cannot be submitted.', sx }) {
  const readOnly = useReadOnly();
  if (!readOnly) return null;
  return <Alert severity="warning" variant="outlined" sx={{ mb: 2, ...sx }}>{children}</Alert>;
}
