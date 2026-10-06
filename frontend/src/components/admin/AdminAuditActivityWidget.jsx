import React from 'react';
import Typography from '@mui/material/Typography';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { WidgetCard } from '../common/WidgetCard';
import { ActivityFeed } from '../common/ActivityFeed';
import { DataState } from '../common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminOpsApi } from '../../services/api';

const TONE = (action) =>
  /APPROVED|RESOLVED|PUBLISHED|SENT/.test(action) ? 'success' : /REJECTED|CLOSED|ARCHIVED/.test(action) ? 'neutral' : /INFO|NEEDS/.test(action) ? 'warning' : 'primary';

/** Administrative audit trail, read from the audit_logs table. */
export const AdminAuditActivityWidget = ({ refreshKey = 0 }) => {
  const { data: items = [], loading, error, refetch } = useApiQuery(() => adminOpsApi.audit(12), [refreshKey], { initialData: [] });
  return (
    <WidgetCard title="Recent administrative activity & audit" subtitle="Decisions, publications, broadcasts and configuration changes" icon={HistoryRoundedIcon} tone="neutral">
      <DataState loading={loading} error={error} onRetry={refetch} minHeight={100}>
        {() =>
          (items ?? []).length ? (
            <ActivityFeed items={items.map((item) => ({ ...item, tone: TONE(item.action) }))} />
          ) : (
            <Typography variant="body2" color="text.secondary">No administrative actions recorded yet.</Typography>
          )
        }
      </DataState>
    </WidgetCard>
  );
};

export default AdminAuditActivityWidget;
