import React, { useState } from 'react';
import Box from '@mui/material/Box';
import { PronounsPrivacySection } from '../../components/profile/PronounsPrivacySection';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import { profileApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

/** Pronouns and directory visibility are self-service fields: PATCH, not a petition. */
export const PrivacyPreferencesPage = () => {
  const { user, refreshUser, initialising } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const handleSavePreferences = async (data) => {
    setIsSaving(true);
    setError(null);
    try {
      await profileApi.update({
        pronouns: data.pronouns,
        pronounsVisibility: data.pronounsVisibility,
        directoryVisible: data.directoryVisible,
        preferredName: data.preferredName,
      });
      await refreshUser();
      showToast('Pronouns and privacy preferences saved successfully!');
    } catch (caught) {
      setError(caught);
      showToast(caught?.message ?? 'Preferences could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DataState loading={initialising} error={error} loadingLabel="Loading your profile…" minHeight={260}>
      {() => (
        <Box>
          <PageHeader
            title="Pronouns & Directory Privacy"
            description="Manage how your identity is addressed by faculty, academic advisors, and displayed in the university directory."
          />

          <PronounsPrivacySection
            profile={user}
            onSave={handleSavePreferences}
            isSaving={isSaving}
          />
        </Box>
      )}
    </DataState>
  );
};

export default PrivacyPreferencesPage;
