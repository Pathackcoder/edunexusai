import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { AidAwardCard } from '../components/financialAid/AidAwardCard';
import { DisbursementTimeline } from '../components/financialAid/DisbursementTimeline';
import { WidgetCard } from '../components/common/WidgetCard';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { PageHeader } from '../components/common/PageHeader';
import { Section } from '../components/common/Section';
import { StatCard } from '../components/common/StatCard';
import { useApiQuery } from '../hooks/useApiQuery';
import { financialAidApi } from '../services/api';
import { DataState, StaleDataNotice } from '../components/common/DataState';
import { useAuth } from '../context/AuthContext';

const EMPTY_AID = { awards: [], disbursements: [], requirements: [], summary: {} };

/**
 * Financial aid is owned by the aid office system, so this page is served by a
 * read-through call: the backend asks the provider on each request. If the provider is
 * unreachable the backend returns its cached copy and flags it, and StaleDataNotice says
 * so on screen rather than presenting old figures as current.
 */
export const FinancialAidPage = () => {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApiQuery(() => financialAidApi.get());
  const financialAidData = data ?? EMPTY_AID;

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your award package…"
      minHeight={360}
    >
      {() => (
        <Box>
          <StaleDataNotice meta={financialAidData.meta} />

          <PageHeader
            title="Financial Aid & Scholarships"
            description={`Official award package, state & federal grants, and disbursement tracking for ${user?.fullName ?? 'your record'}.`}
            actions={
              <Button
                variant="secondary"
                size="sm"
                icon={FileDownloadOutlinedIcon}
                onClick={() => alert('Downloading official 2026-2027 Financial Aid Award Letter PDF...')}
              >
                Award Letter PDF
              </Button>
            }
          />

          <Stack spacing={{ xs: 3, md: 3.5 }}>
            {/* Summary KPI Strip */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
              <StatCard
                title="Financial Aid Status"
                value={
                  <Stack direction="row" alignItems="center" spacing={1} component="span">
                    <span>{financialAidData.status}</span>
                    <Badge variant="success" dot>Active</Badge>
                  </Stack>
                }
                subtitle={`Last updated: ${financialAidData.lastUpdated ?? ''}`}
                icon={VerifiedOutlinedIcon}
                tone="success"
                valueSx={{ fontSize: { xs: '1.375rem', md: '1.5rem' } }}
              />
              <StatCard
                title="Total Award Package"
                value={
                  <Box component="span" sx={{ color: 'primary.main' }}>
                    {financialAidData.formattedTotalAid}{' '}
                    <Typography component="span" variant="body2" color="text.secondary">USD</Typography>
                  </Box>
                }
                subtitle={`Award Year: ${financialAidData.awardYear ?? ''}`}
                icon={SavingsOutlinedIcon}
                tone="primary"
              />
              <StatCard
                title="Application Status"
                value={<Box component="span" sx={{ color: 'success.main' }}>{financialAidData.applicationStatus}</Box>}
                subtitle="No pending action items required"
                valueSx={{ fontSize: { xs: '1.375rem', md: '1.5rem' } }}
                icon={TaskAltRoundedIcon}
                tone="success"
              />
            </Box>

            {/* Award Items List */}
            <Section
              title="Itemized Aid & Scholarships"
              action={<Typography variant="caption">3 active funding awards</Typography>}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2 }}>
                {financialAidData.awards.map(award => (
                  <AidAwardCard key={award.id} award={award} />
                ))}
              </Box>
            </Section>

            {/* Disbursement Schedule & Action Items */}
            <WidgetCard
              title="Disbursements & Compliance Verification"
              subtitle="Tracking releases to university billing statement"
              icon={FactCheckOutlinedIcon}
              tone="info"
            >
              <DisbursementTimeline
                disbursements={financialAidData.disbursements}
                requirements={financialAidData.requirements}
              />
            </WidgetCard>
          </Stack>
        </Box>
      )}
    </DataState>
  );
};
