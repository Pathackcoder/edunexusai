import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ContactEmergencyOutlinedIcon from '@mui/icons-material/ContactEmergencyOutlined';
import { Button } from '../common/Button';
import { WidgetCard } from '../common/WidgetCard';

export const ProfileForm = ({ initialData, onSave, isSaving }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ ...initialData });

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEmergencyChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      emergencyContact: {
        ...prev.emergencyContact,
        [field]: value
      }
    }));
  };

  const handleCancel = () => {
    setFormData({ ...initialData });
    setIsEditing(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSave) {
      onSave(formData);
    }
    setIsEditing(false);
  };

  const input = (label, value, onChange, type = 'text') => (
    <TextField label={label} type={type} value={value} disabled={!isEditing} onChange={(e) => onChange(e.target.value)} required InputLabelProps={{ shrink: true }} />
  );

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2.5}>
        {/* Header bar with Edit/Save buttons */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5}>
          <Box>
            <Typography variant="h5" component="h3">Student Information</Typography>
            <Typography variant="body2" color="text.secondary">
              Official student record for {formData.fullName} ({formData.id})
            </Typography>
          </Box>
          {!isEditing ? (
            <Button type="button" variant="outline" icon={EditOutlinedIcon} onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button type="button" variant="secondary" icon={CloseRoundedIcon} onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={SaveOutlinedIcon} loading={isSaving}>
                Save Changes
              </Button>
            </Stack>
          )}
        </Stack>

        {/* Personal Contact Details */}
        <WidgetCard title="Primary Contact Details" icon={PersonOutlineRoundedIcon}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {input('First Name', formData.firstName, (v) => handleChange('firstName', v))}
            {input('Last Name', formData.lastName, (v) => handleChange('lastName', v))}
            {input('University Email', formData.email, (v) => handleChange('email', v), 'email')}
            {input('Phone Number', formData.phone, (v) => handleChange('phone', v), 'tel')}
          </Box>
          <Box sx={{ mt: 2 }}>{input('Street Address', formData.address, (v) => handleChange('address', v))}</Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 1.5, mt: 2 }}>
            {input('City', formData.city, (v) => handleChange('city', v))}
            {input('State', formData.state, (v) => handleChange('state', v))}
            {input('ZIP Code', formData.zipCode, (v) => handleChange('zipCode', v))}
          </Box>
        </WidgetCard>

        {/* Emergency Contact */}
        <WidgetCard title="Emergency Contact Information" icon={ContactEmergencyOutlinedIcon} tone="danger">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            {input('Contact Name', formData.emergencyContact?.name || '', (v) => handleEmergencyChange('name', v))}
            {input('Relationship', formData.emergencyContact?.relationship || '', (v) => handleEmergencyChange('relationship', v))}
            {input('Contact Phone', formData.emergencyContact?.phone || '', (v) => handleEmergencyChange('phone', v), 'tel')}
          </Box>
        </WidgetCard>
      </Stack>
    </Box>
  );
};
