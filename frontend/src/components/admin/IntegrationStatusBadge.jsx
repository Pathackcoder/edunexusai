import React from 'react';
import { Badge } from '../common/Badge';

/**
 * Integration status, labelled the way an administrator reads it.
 *
 * NOT_CONNECTED is deliberately distinct from ERROR: a provider that was never wired up
 * (Banner, Ethos) is not broken, and the UI must not imply a failed live connection where
 * no connection was ever configured.
 */
const PRESENTATION = {
  CONNECTED: { label: 'Connected', variant: 'success' },
  NOT_CONNECTED: { label: 'Not connected', variant: 'neutral' },
  NOT_CONFIGURED: { label: 'Not configured', variant: 'neutral' },
  DEGRADED: { label: 'Degraded', variant: 'warning' },
  ERROR: { label: 'Error', variant: 'danger' },
};

export const IntegrationStatusBadge = ({ status, enabled = true }) => {
  if (!enabled) return <Badge variant="neutral" dot>Disabled</Badge>;
  const presentation = PRESENTATION[status] ?? { label: status ?? 'Unknown', variant: 'neutral' };
  return <Badge variant={presentation.variant} dot>{presentation.label}</Badge>;
};

export default IntegrationStatusBadge;
