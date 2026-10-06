import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import MuiButton from '@mui/material/Button';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import EditLocationAltOutlinedIcon from '@mui/icons-material/EditLocationAltOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { profileApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

/** One petition row with a status-coloured edge. */
const STATUS_TONE = { Approved: 'success', Rejected: 'neutral', 'Needs Information': 'danger', 'In Review': 'info', Pending: 'warning' };
const EDGE = { success: 'success.main', neutral: 'grey.400', danger: 'error.main', info: 'info.main', warning: 'warning.main' };

const RequestRow = ({ id, idLabel, status, children, meta }) => {
  const tone = STATUS_TONE[status] ?? 'warning';
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        px: 2,
        py: 1.5,
        pl: 2.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.subtle',
        '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: EDGE[tone] },
      }}
    >
      <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1}>
        <Typography variant="body2" fontWeight={700}>{idLabel}: {id}</Typography>
        <Badge variant={tone}>{status}</Badge>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.8125rem' }}>{children}</Typography>
      <Typography variant="caption" sx={{ fontSize: '0.6875rem' }}>{meta}</Typography>
    </Box>
  );
};

/**
 * Change-request history.
 *
 * The prototype kept these petitions in localStorage, which meant the registrar had no
 * record of anything a student submitted. They are now rows the registrar can act on.
 */
export const RequestsHistoryPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => profileApi.getRequests());
  const addressRequests = data?.addressRequests ?? [];
  const nameRequests = data?.nameRequests ?? [];

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your requests…"
      minHeight={260}
    >
      {() => (
        <Box>
          <PageHeader
            title="Requests & Change Petitions"
            description="Real-time tracking of institutional modification petitions submitted to the Office of the Registrar."
            actions={<MuiButton component={RouterLink} to="/help/requests" endIcon={<ArrowForwardRoundedIcon />}>All my requests & timelines</MuiButton>}
          />

          <Stack spacing={{ xs: 2.5, md: 3 }}>
            {/* Address petitions */}
            <WidgetCard title={`Address Change Petitions (${addressRequests.length})`} icon={EditLocationAltOutlinedIcon}>
              <Stack spacing={1.25}>
                {addressRequests.map(req => (
                  <RequestRow
                    key={req.id}
                    id={req.id}
                    idLabel="Request ID"
                    status={req.status}
                    meta={`Submitted: ${req.requestDate}${req.reviewerNotes ? ` • ${req.reviewerNotes}` : ''}`}
                  >
                    Requested Address: <Box component="strong" sx={{ color: 'text.primary' }}>{req.newAddress}</Box>
                  </RequestRow>
                ))}
              </Stack>
            </WidgetCard>

            {/* Legal name petitions */}
            <WidgetCard title={`Legal Name Change Petitions (${nameRequests.length})`} icon={DescriptionOutlinedIcon} tone="purple">
              {nameRequests.length > 0 ? (
                <Stack spacing={1.25}>
                  {nameRequests.map(req => (
                    <RequestRow
                      key={req.id}
                      id={req.id}
                      idLabel="Petition ID"
                      status={req.status}
                      meta={`Submitted: ${req.requestDate} • Supporting Document Attached • SLA: 2-3 business days`}
                    >
                      Requested Legal Name: <Box component="strong" sx={{ color: 'text.primary' }}>{req.newName}</Box> (Reason: {req.reason})
                    </RequestRow>
                  ))}
                </Stack>
              ) : (
                <EmptyState compact title="No legal name petitions have been submitted." description="Petitions you file from Personal Information will be tracked here." />
              )}
            </WidgetCard>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default RequestsHistoryPage;
