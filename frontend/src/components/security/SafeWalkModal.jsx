import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

const Row = ({ label, children }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Box sx={{ typography: 'body2', fontWeight: 600, textAlign: 'right' }}>{children}</Box>
  </Stack>
);

export const SafeWalkModal = ({ isOpen, onClose, safeWalkInfo = {} }) => {
  const [pickup, setPickup] = useState('Central Library (West Entrance)');
  const [destination, setDestination] = useState('Campus Apartments, Bldg 3');
  const [phone, setPhone] = useState('(555) 234-5678');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  const handleClose = () => {
    setIsSubmitted(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isSubmitted ? "SafeWalk Escort Dispatched" : "Request SafeWalk Campus Escort"}
      subtitle={isSubmitted ? "Officer En Route" : "24/7 Free Campus Safety Service"}
      maxWidth="480px"
    >
      {isSubmitted ? (
        <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center', py: 1 }}>
          <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: 'success.lighter', color: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 34 }} />
          </Box>

          <Box>
            <Typography variant="h4" component="h4">Escort Officer Dispatched</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Campus Safety Officer <strong>Officer K. Miller (Badge #408)</strong> is en route to your location.
            </Typography>
          </Box>

          <Stack spacing={1.25} sx={{ width: '100%', bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2, textAlign: 'left' }}>
            <Row label="Estimated Arrival:"><Box component="span" sx={{ color: 'primary.main' }}>5 – 7 Minutes</Box></Row>
            <Row label="Pickup Point:">{pickup}</Row>
            <Row label="Destination:">{destination}</Row>
            <Row label="Contact Mobile:">{phone}</Row>
          </Stack>

          <Button variant="primary" onClick={handleClose} fullWidth size="lg" sx={{ mt: 0.5 }}>
            Dismiss
          </Button>
        </Stack>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2.25}>
            <Alert severity="info" icon={<NightlightOutlinedIcon fontSize="inherit" />}>
              <AlertTitle>SafeWalk Evening Hours: {safeWalkInfo.hours}</AlertTitle>
              A uniformed campus security officer will walk with you to your dorm, vehicle, or campus building.
            </Alert>

            <TextField label="Current Pickup Location" type="text" value={pickup} onChange={(e) => setPickup(e.target.value)} required />
            <TextField label="Destination Building / Parking" type="text" value={destination} onChange={(e) => setDestination(e.target.value)} required />
            <TextField label="Contact Phone Number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />

            <Stack direction="row" justifyContent="flex-end" spacing={1.25} sx={{ pt: 0.5 }}>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={VerifiedUserOutlinedIcon}>
                Request Officer Escort
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Modal>
  );
};
