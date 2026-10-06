import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ContactEmergencyOutlinedIcon from '@mui/icons-material/ContactEmergencyOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { Button } from '../common/Button';
import { WidgetCard } from '../common/WidgetCard';
import { useToast } from '../common/Toast';

/** Form state derived from the record, with no student's details hardcoded. */
const toFormState = (data) => ({
  name: data?.name ?? '',
  relationship: data?.relationship ?? '',
  phone: data?.phone ?? '',
  altPhone: data?.altPhone ?? '',
  email: data?.email ?? '',
  address: data?.address ?? '',
});

export const EmergencyContactSection = ({ contactData, emergencyContact, onSaveContact, onSave, isSaving }) => {
  const data = contactData || emergencyContact;
  const saveHandler = onSaveContact || onSave;
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(() => toFormState(data));

  const { showToast } = useToast();

  // Adopt the server record whenever it arrives or changes, unless mid-edit.
  useEffect(() => {
    if (!isEditing) setFormData(toFormState(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.name, data?.relationship, data?.phone, data?.altPhone, data?.email]);

  const handleCancel = () => {
    setFormData(toFormState(data));
    setIsEditing(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saveHandler) {
      saveHandler(formData);
    }
    setIsEditing(false);
    showToast('Emergency contact information updated successfully!');
  };

  const field = (key, label, type = 'text', required = true) => (
    <TextField
      label={label}
      type={type}
      value={formData[key]}
      disabled={!isEditing}
      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
      required={required}
      InputLabelProps={{ shrink: true }}
    />
  );

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <WidgetCard
        title="Primary Emergency Contact"
        subtitle="Designated contact for critical university medical, safety, or administrative notifications."
        icon={ContactEmergencyOutlinedIcon}
        tone="danger"
        headerAction={
          !isEditing ? (
            <Button type="button" variant="outline" size="sm" icon={EditOutlinedIcon} onClick={() => setIsEditing(true)}>
              Edit Contact
            </Button>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button type="button" variant="secondary" size="sm" icon={CloseRoundedIcon} onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" icon={SaveOutlinedIcon} loading={isSaving}>
                Save Emergency Contact
              </Button>
            </Stack>
          )
        }
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2.25, pt: 2.5, borderTop: 1, borderColor: 'divider' }}>
          {field('name', 'Full Name')}
          {field('relationship', 'Relationship to Student')}
          {field('phone', 'Primary Mobile Phone', 'tel')}
          {field('altPhone', 'Secondary / Work Phone', 'tel', false)}
          {field('email', 'Email Address', 'email')}
          {field('address', 'Residential Address')}
        </Box>
      </WidgetCard>
    </Box>
  );
};
