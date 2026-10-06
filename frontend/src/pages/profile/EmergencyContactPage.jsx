import React, { useState } from 'react';
import Box from '@mui/material/Box';
import { EmergencyContactSection } from '../../components/profile/EmergencyContactSection';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import { profileApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

/** Emergency contact is stored against the student record, not in the browser. */
export const EmergencyContactPage = () => {
  const { user, refreshUser, initialising } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const handleSaveContact = async (updatedContact) => {
    setIsSaving(true);
    setError(null);
    try {
      await profileApi.update({ emergencyContact: updatedContact });
      await refreshUser();
      showToast('Emergency contact details saved successfully!');
    } catch (caught) {
      setError(caught);
      showToast(caught?.message ?? 'The contact could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DataState loading={initialising} error={error} loadingLabel="Loading your contacts…" minHeight={260}>
      {() => (
        <Box>
          <PageHeader
            title="Emergency Contact Information"
            description="Primary and secondary emergency contacts notified by Campus Safety in the event of an urgent medical or security situation."
          />

          <EmergencyContactSection
            contactData={user?.emergencyContact}
            emergencyContact={user?.emergencyContact}
            onSaveContact={handleSaveContact}
            onSave={handleSaveContact}
            isSaving={isSaving}
          />
        </Box>
      )}
    </DataState>
  );
};

export default EmergencyContactPage;
