import React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PowerOffOutlinedIcon from '@mui/icons-material/PowerOffOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import { EmptyState } from './EmptyState';
import { getTone } from '../../theme/tones';
import { ContentSkeleton, FadeIn } from './Skeletons';

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

/**
 * One wrapper for the four states every data-driven screen has: loading, error, empty
 * and ready.
 *
 *   <DataState loading={loading} error={error} isEmpty={isEmpty} onRetry={refetch}>
 *     {() => <TheRealContent />}
 *   </DataState>
 */
export const DataState = ({
  loading,
  error,
  isEmpty = false,
  onRetry,
  loadingLabel = 'Loading…',
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'There is no data to show for this view.',
  minHeight = 180,
  skeleton,
  children,
}) => {
  // Skeletons instead of spinners: the layout holds still while data arrives.
  if (loading) {
    return (
      <Box role="status" aria-live="polite" aria-busy="true" sx={{ position: 'relative' }}>
        <Box component="span" sx={visuallyHidden}>{loadingLabel}</Box>
        {skeleton ?? <ContentSkeleton minHeight={minHeight} />}
      </Box>
    );
  }

  if (error) return <ErrorPanel error={error} onRetry={onRetry} minHeight={minHeight} />;

  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyMessage} />;
  }

  // Content fades in where its skeleton was.
  return <FadeIn>{typeof children === 'function' ? children() : children}</FadeIn>;
};

/** Error presentation that distinguishes a permission problem and an upstream outage. */
export const ErrorPanel = ({ error, onRetry, minHeight = 160, compact = false }) => {
  const theme = useTheme();
  const isForbidden = error?.isForbidden;
  const isIntegration = error?.isIntegrationError;
  const Icon = isForbidden ? LockOutlinedIcon : isIntegration ? PowerOffOutlinedIcon : ErrorOutlineRoundedIcon;
  const tone = getTone(theme, isIntegration ? 'warning' : isForbidden ? 'neutral' : 'danger');

  const heading = isForbidden
    ? 'You do not have access to this'
    : isIntegration
      ? 'An external system is unavailable'
      : 'We could not load this';

  return (
    <Stack
      role="alert"
      alignItems="center"
      justifyContent="center"
      spacing={1}
      sx={{
        textAlign: 'center',
        minHeight: compact ? undefined : minHeight,
        p: compact ? 1.5 : 3.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.subtle',
      }}
    >
      <Box
        sx={{
          width: compact ? 32 : 44,
          height: compact ? 32 : 44,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: tone.bg,
          color: tone.fg,
          '& svg': { fontSize: compact ? 18 : 22 },
        }}
      >
        <Icon />
      </Box>
      <Typography variant={compact ? 'subtitle2' : 'h6'} component="strong">
        {heading}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '46ch' }}>
        {error?.message ?? 'An unexpected error occurred.'}
      </Typography>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outlined"
          color="primary"
          size="small"
          startIcon={<RefreshRoundedIcon />}
          sx={{ mt: 0.75, borderRadius: 999 }}
        >
          Try again
        </Button>
      )}
    </Stack>
  );
};

/**
 * Notice shown when a panel is serving a cached copy because the upstream provider could
 * not be reached. Keeps the demo honest instead of passing stale data off as live.
 */
export const StaleDataNotice = ({ meta }) => {
  if (!meta?.degraded) return null;
  return (
    <Alert
      role="status"
      severity="warning"
      icon={<CloudSyncOutlinedIcon fontSize="inherit" />}
      sx={{ mb: 1.5, py: 0, '& .MuiAlert-icon': { pt: '9px' } }}
    >
      {meta.message ?? 'Showing the last synced copy of this data.'}
    </Alert>
  );
};

export default DataState;
