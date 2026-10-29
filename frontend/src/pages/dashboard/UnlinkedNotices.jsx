import React from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useAuth } from '../../context/AuthContext';

const TEXT = {
  student: 'Your account has the Student role, but no verified student record is linked to it yet. Student information appears here once the registrar links your record.',
  faculty: 'Your account has the Faculty role, but no verified faculty record is linked to it yet. Teaching information appears here once your record is linked.',
  staff: 'Your account has the Staff role, but no staff record is linked to it yet.',
};

/** Roles held without their verified record: explained, never shown as (empty) data. */
export function UnlinkedNotices({ sx }) {
  const { unlinkedContexts } = useAuth();
  if (!unlinkedContexts.length) return null;
  return (
    <Stack spacing={1} sx={sx}>
      {unlinkedContexts.map((context) => (
        <Alert key={context.key} severity="info" role="status">
          {TEXT[context.key] ?? `Your ${String(context.role).toLowerCase()} record is not linked yet.`}
        </Alert>
      ))}
    </Stack>
  );
}

export default UnlinkedNotices;
