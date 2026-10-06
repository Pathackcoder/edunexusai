import React from 'react';
import Box from '@mui/material/Box';
import { CommunicationPreferencesSection } from '../../components/profile/CommunicationPreferencesSection';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { profileApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

/**
 * Communication preferences.
 *
 * Previously a localStorage blob, so the institution could not honour the choices. Each
 * channel is now a row keyed by user and category, and categories the institution marks
 * mandatory (emergency alerts) are rejected server-side if a client tries to disable them.
 */
export const CommunicationPreferencesPage = () => {
  const { data, loading, error, refetch, setData } = useApiQuery(() =>
    profileApi.getCommunicationPreferences(),
  );
  const preferences = data ?? [];
  const { showToast } = useToast();

  const handleSavePreferences = async (updated) => {
    setData(updated);
    try {
      const saved = await profileApi.updateCommunicationPreferences(
        updated.map((item) => ({
          categoryKey: item.id,
          email: item.channels.email,
          sms: item.channels.sms,
          push: item.channels.push,
        })),
      );
      setData(saved);
      showToast('Notification channels & communication preferences saved!');
    } catch (caught) {
      showToast(caught?.message ?? 'Preferences could not be saved.');
      refetch();
    }
  };

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your preferences…"
      minHeight={300}
    >
      {() => (
        <Box>
          <PageHeader
            title="Communication Preferences"
            description="Configure delivery channels (Email, SMS text, and Mobile Push) for academic, financial, and campus alerts."
          />

          <CommunicationPreferencesSection
            preferences={preferences}
            onSave={handleSavePreferences}
          />
        </Box>
      )}
    </DataState>
  );
};

export default CommunicationPreferencesPage;
