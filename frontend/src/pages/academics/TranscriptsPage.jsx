import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { UnofficialTranscriptView } from '../../components/transcripts/UnofficialTranscriptView';
import { OfficialTranscriptRequestModal } from '../../components/transcripts/OfficialTranscriptRequestModal';
import { TranscriptRequestHistory } from '../../components/transcripts/TranscriptRequestHistory';
import { Button } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { academicApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { DataState } from '../../components/common/DataState';

export const TranscriptsPage = () => {
  const [isOfficialModalOpen, setIsOfficialModalOpen] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();

  // Request history is a database table. The prototype kept it in localStorage, which
  // meant the registrar had no record of anything a student ordered.
  const { data, loading, error, refetch } = useApiQuery(() => academicApi.getTranscriptRequests());
  const transcriptRequests = data ?? [];

  const handleOfficialTranscriptSubmit = async (newRequest) => {
    try {
      const created = await academicApi.createTranscriptRequest({
        deliveryType: newRequest.deliveryType,
        recipient: newRequest.recipient,
        recipientEmail: newRequest.recipientEmail?.includes('@') ? newRequest.recipientEmail : undefined,
        recipientAddress: newRequest.recipientEmail?.includes('@') ? undefined : newRequest.recipientEmail,
        copies: newRequest.copies,
      });
      showToast(`Official Transcript Order ${created.id} submitted!`);
      refetch();
    } catch (caught) {
      showToast(caught?.message ?? 'The transcript request could not be submitted.');
    }
  };

  return (
    <Box>
      <PageHeader
        title="Transcripts & Academic Records"
        description={`Certified official electronic/paper transcripts and term-by-term unofficial academic history for ${user?.fullName ?? 'your record'}.`}
        actions={
          <Button variant="primary" size="sm" icon={SendRoundedIcon} onClick={() => setIsOfficialModalOpen(true)}>
            Request Official Transcript
          </Button>
        }
      />

      <Stack spacing={{ xs: 3, md: 3.5 }}>
        {/* Unofficial Transcript (term-by-term academic sheet) */}
        <UnofficialTranscriptView />

        {/* Order History Section */}
        <DataState
          loading={loading}
          error={error}
          onRetry={refetch}
          loadingLabel="Loading your request history…"
          minHeight={120}
        >
          {() => <TranscriptRequestHistory requests={transcriptRequests} />}
        </DataState>
      </Stack>

      {/* 5-Step Official Transcript Request Modal */}
      <OfficialTranscriptRequestModal
        isOpen={isOfficialModalOpen}
        onClose={() => setIsOfficialModalOpen(false)}
        onSubmitSuccess={handleOfficialTranscriptSubmit}
        onSubmitOrder={handleOfficialTranscriptSubmit}
      />
    </Box>
  );
};

export default TranscriptsPage;
