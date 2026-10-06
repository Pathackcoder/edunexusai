import React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { EmptyTasksSvg } from '../../assets/illustrations/EmptyTasksSvg';
import { Button } from './Button';

/** Illustrated empty / no-data state. Same props as before. */
export const EmptyState = ({
  illustration: CustomIllustration,
  title = 'No items to show',
  description = "You're all caught up! There are no pending items at the moment.",
  actionLabel,
  onActionClick,
  className = '',
  compact = false,
  sx,
}) => (
  <Stack
    className={className}
    alignItems="center"
    justifyContent="center"
    spacing={1.5}
    sx={{ py: compact ? 3 : 5, px: 2.5, textAlign: 'center', ...sx }}
  >
    <Box sx={{ '& svg': { width: compact ? 84 : 112, height: compact ? 84 : 112 } }}>
      {CustomIllustration ? <CustomIllustration /> : <EmptyTasksSvg />}
    </Box>
    <Box sx={{ maxWidth: 380 }}>
      <Typography variant="h6" component="h3" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
    {actionLabel && onActionClick && (
      <Button size="sm" variant="secondary" onClick={onActionClick} sx={{ mt: 1 }}>
        {actionLabel}
      </Button>
    )}
  </Stack>
);

export default EmptyState;
