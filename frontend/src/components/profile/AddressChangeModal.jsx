import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export const AddressChangeModal = ({ isOpen, onClose, currentAddress, onSubmitSuccess }) => {
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('Relocation to new apartment');
  const [submittedData, setSubmittedData] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const newRequest = {
      id: `ADR-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      requestDate: new Date().toISOString().split('T')[0],
      oldAddress: currentAddress,
      newAddress: `${street}, ${city}, ${state} ${zipCode}`,
      // Structured fields for the API; the concatenated form above is for display.
      addressLine1: street,
      city,
      state,
      postalCode: zipCode,
      effectiveDate,
      reason,
      status: 'Pending Review'
    };

    setSubmittedData(newRequest);
    if (onSubmitSuccess) {
      onSubmitSuccess(newRequest);
    }
  };

  const handleClose = () => {
    setSubmittedData(null);
    setStreet('');
    setCity('');
    setState('');
    setZipCode('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={submittedData ? "Address Change Submitted" : "Request Official Address Change"}
      subtitle={submittedData ? "Registrar Review in Progress" : "University Student Records Division"}
      maxWidth="520px"
    >
      {submittedData ? (
        <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center', py: 1 }}>
          <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: 'warning.lighter', color: 'warning.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HourglassTopRoundedIcon sx={{ fontSize: 30 }} />
          </Box>

          <Box>
            <Typography variant="h4" component="h4">Address change request submitted.</Typography>
            <Badge variant="warning" dot sx={{ mt: 1 }}>Status: Pending Review</Badge>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
              Your address change request (ID: <strong>{submittedData.id}</strong>) has been queued for registrar address database validation. Processing takes 1–2 business days.
            </Typography>
          </Box>

          <Stack spacing={1} sx={{ width: '100%', bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2, textAlign: 'left' }}>
            <Typography variant="body2" color="text.secondary">
              Requested Address: <Box component="strong" sx={{ color: 'text.primary' }}>{submittedData.newAddress}</Box>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Effective Date: <Box component="strong" sx={{ color: 'text.primary' }}>{submittedData.effectiveDate}</Box>
            </Typography>
          </Stack>

          <Button variant="primary" onClick={handleClose} fullWidth size="lg" sx={{ mt: 0.5 }}>
            Done
          </Button>
        </Stack>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2.25}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3 }}>
              <Typography variant="caption" component="div">Current Address on File:</Typography>
              <Typography variant="body2" fontWeight={600}>{currentAddress}</Typography>
            </Box>

            <TextField
              label="New Street Address"
              type="text"
              placeholder="e.g. 85 Commonwealth Ave, Apt 4A"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              required
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 1.5 }}>
              <TextField label="City" type="text" placeholder="Boston" value={city} onChange={(e) => setCity(e.target.value)} required />
              <TextField label="State" type="text" placeholder="MA" value={state} onChange={(e) => setState(e.target.value)} required />
              <TextField label="ZIP Code" type="text" placeholder="02215" value={zipCode} onChange={(e) => setZipCode(e.target.value)} required />
            </Box>

            <TextField
              label="Effective Date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              required
              InputLabelProps={{ shrink: true }}
            />

            <Stack direction="row" justifyContent="flex-end" spacing={1.25} sx={{ pt: 0.5 }}>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Submit Address Change
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Modal>
  );
};
