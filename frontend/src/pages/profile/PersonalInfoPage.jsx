import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditLocationAltOutlinedIcon from '@mui/icons-material/EditLocationAltOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import { useAuth } from '../../context/AuthContext';
import { AddressChangeModal } from '../../components/profile/AddressChangeModal';
import { NameChangeModal } from '../../components/profile/NameChangeModal';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { InfoField } from '../../components/common/Section';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { profileApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2.5, pt: 2, borderTop: 1, borderColor: 'divider' };

/**
 * Personal information and registrar petitions.
 *
 * Self-service fields (phone) are PATCHed straight onto the record. Fields of record
 * (legal name, address of record) create a ProfileChangeRequest that a registrar
 * approves — the backend will not let the student overwrite either directly.
 */
export const PersonalInfoPage = () => {
  const { user, refreshUser } = useAuth();
  const profile = user ?? {};
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    phone: user?.phone ?? '',
    email: user?.email ?? ''
  });

  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);

  const { data, loading, error, refetch } = useApiQuery(() => profileApi.getRequests());
  const addressRequests = data?.addressRequests ?? [];
  const nameRequests = data?.nameRequests ?? [];

  const { showToast } = useToast();

  const handleAddressSubmit = async (newReq) => {
    try {
      const created = await profileApi.requestAddressChange({
        addressLine1: newReq.addressLine1,
        city: newReq.city,
        state: newReq.state,
        postalCode: newReq.postalCode,
        reason: newReq.reason,
        effectiveDate: newReq.effectiveDate,
      });
      showToast(`Address change request ${created.id} submitted for registrar review!`);
      refetch();
    } catch (caught) {
      showToast(caught?.message ?? 'The address change could not be submitted.');
    }
  };

  const handleNameSubmit = async (newReq) => {
    try {
      const created = await profileApi.requestNameChange({
        firstName: newReq.firstName,
        middleName: newReq.middleName,
        lastName: newReq.lastName,
        reason: newReq.reason,
        documentRef: newReq.documentName,
      });
      showToast(`Legal name change petition ${created.id} submitted for registrar review!`);
      refetch();
    } catch (caught) {
      showToast(caught?.message ?? 'The name change could not be submitted.');
    }
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    try {
      await profileApi.update({ phone: contactForm.phone });
      await refreshUser();
      setIsEditingContact(false);
      showToast('Contact information updated successfully!');
    } catch (caught) {
      showToast(caught?.message ?? 'Contact information could not be saved.');
    }
  };

  const isPending = (request) => request.status === 'Pending' || request.status === 'In Review';
  const pendingAddress = addressRequests.find(isPending);
  const pendingName = nameRequests.find(isPending);

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your record…"
      minHeight={360}
    >
      {() => (
        <Box>
          <PageHeader
            title="Personal Information & Legal Records"
            description="Verified academic identity, institutional contact records, and official registrar change petitions."
          />

          <Stack spacing={{ xs: 2.5, md: 3 }}>
            {/* Pending review banners */}
            {(pendingAddress || pendingName) && (
              <Stack spacing={1.25}>
                {pendingAddress && (
                  <Alert severity="warning" icon={<HourglassTopRoundedIcon fontSize="inherit" />} action={<Badge variant="warning">Pending Review</Badge>} sx={{ alignItems: 'center', '& .MuiAlert-action': { pt: 0 } }}>
                    <strong>Address Change Request ({pendingAddress.id}):</strong>{' '}
                    Status: Pending Review (Submitted {pendingAddress.requestDate})
                  </Alert>
                )}
                {pendingName && (
                  <Alert severity="warning" icon={<HourglassTopRoundedIcon fontSize="inherit" />} action={<Badge variant="warning">Pending Review</Badge>} sx={{ alignItems: 'center', '& .MuiAlert-action': { pt: 0 } }}>
                    <strong>Legal Name Change Petition ({pendingName.id}):</strong>{' '}
                    Status: Pending Review (Requested: {pendingName.requestedName})
                  </Alert>
                )}
              </Stack>
            )}

            {/* Legal identity */}
            <WidgetCard
              title="Legal Identity & Academic Record"
              subtitle="Official student identity verified under FERPA and university registrar bylaws."
              icon={BadgeOutlinedIcon}
              headerAction={
                <Button size="sm" variant="outline" icon={DescriptionOutlinedIcon} onClick={() => setIsNameModalOpen(true)}>
                  Request Name Change
                </Button>
              }
            >
              <Box sx={fieldGrid}>
                <InfoField label="Current Legal Name">{profile.fullName ?? '—'}</InfoField>
                <InfoField label="University ID">{profile.studentNumber ?? profile.employeeNumber ?? '—'}</InfoField>
                <InfoField label="Degree Program">{profile.degree ?? '—'}</InfoField>
                <InfoField label="Academic Standing" valueSx={{ color: 'success.main' }}>{profile.academicStanding ?? '—'}</InfoField>
              </Box>
            </WidgetCard>

            {/* Contact information */}
            <WidgetCard
              title="Contact Information"
              subtitle="Direct telephone and electronic mail communication channels."
              icon={ContactPhoneOutlinedIcon}
              tone="info"
              headerAction={
                !isEditingContact && (
                  <Button size="sm" variant="outline" icon={EditOutlinedIcon} onClick={() => setIsEditingContact(true)}>
                    Edit Contact Info
                  </Button>
                )
              }
            >
              {isEditingContact ? (
                <Box component="form" onSubmit={handleSaveContact} sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <TextField
                      label="Mobile Phone Number"
                      type="text"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      required
                    />
                    <TextField
                      label="Institutional Email"
                      type="email"
                      value={user?.email ?? ''}
                      disabled
                      InputProps={{ readOnly: true }}
                      helperText="Managed by the institution's identity provider."
                    />
                  </Box>
                  <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
                    <Button size="sm" variant="ghost" type="button" onClick={() => setIsEditingContact(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" type="submit">
                      Save Contact Info
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Box sx={fieldGrid}>
                  <InfoField label="Institutional Email" hint="Managed by University SSO">{user?.email ?? '—'}</InfoField>
                  <InfoField label="Pronouns">{profile.pronouns || 'Not specified'}</InfoField>
                  <InfoField label="Primary Phone">{profile.phone ?? '—'}</InfoField>
                </Box>
              )}
            </WidgetCard>

            {/* Address */}
            <WidgetCard
              title="Physical & Mailing Address"
              subtitle="Used for bursar billing statements, 1098-T tax forms, and official diplomas."
              icon={HomeWorkOutlinedIcon}
              tone="purple"
              headerAction={
                <Button size="sm" variant="outline" icon={EditLocationAltOutlinedIcon} onClick={() => setIsAddressModalOpen(true)}>
                  Request Address Change
                </Button>
              }
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <InfoField label="Current Official Address">
                  42 Campus Way, Apt 3B
                  <Typography variant="body2" color="text.secondary">Boston, MA 02115, United States</Typography>
                </InfoField>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'success.main' }}>
                  <VerifiedRoundedIcon sx={{ fontSize: 18 }} />
                  <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>Verified Residential Address</Typography>
                </Stack>
              </Stack>
            </WidgetCard>
          </Stack>

          {/* Modals */}
          {/* The modals invoke `onSubmitSuccess`; the prototype passed `onSubmitRequest`,
              so neither petition was ever submitted. Both names are wired now. */}
          <AddressChangeModal
            isOpen={isAddressModalOpen}
            onClose={() => setIsAddressModalOpen(false)}
            currentAddress={[profile.address, profile.city, profile.state, profile.zipCode]
              .filter(Boolean)
              .join(', ')}
            onSubmitSuccess={handleAddressSubmit}
            onSubmitRequest={handleAddressSubmit}
          />

          <NameChangeModal
            isOpen={isNameModalOpen}
            onClose={() => setIsNameModalOpen(false)}
            currentLegalName={profile.fullName ?? ''}
            onSubmitSuccess={handleNameSubmit}
            onSubmitRequest={handleNameSubmit}
          />
        </Box>
      )}
    </DataState>
  );
};

export default PersonalInfoPage;
