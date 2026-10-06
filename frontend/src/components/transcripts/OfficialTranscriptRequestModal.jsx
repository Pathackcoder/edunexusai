import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Radio from '@mui/material/Radio';
import Checkbox from '@mui/material/Checkbox';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ChoiceCard } from '../common/ChoiceCard';
import { useAuth } from '../../context/AuthContext';

const STEP_LABELS = ['Delivery', 'Recipient', 'Options', 'Review'];

const SummaryRow = ({ label, children, divider }) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    spacing={2}
    sx={divider ? { borderTop: 1, borderColor: 'divider', pt: 1 } : undefined}
  >
    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
    <Box sx={{ typography: 'body2', fontWeight: 600, textAlign: 'right', minWidth: 0, wordBreak: 'break-word' }}>{children}</Box>
  </Stack>
);

export const OfficialTranscriptRequestModal = ({ isOpen, onClose, onSubmitSuccess, onSubmitOrder }) => {
  // The consent text names the signed-in student rather than a hardcoded name.
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [deliveryType, setDeliveryType] = useState('electronic'); // 'electronic' or 'paper'
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [purpose, setPurpose] = useState('Employment');
  const [copies, setCopies] = useState(1);
  const [processingSpeed, setProcessingSpeed] = useState('standard'); // 'standard' ($0) or 'rush' ($15)
  const [consentChecked, setConsentChecked] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState(null);

  const resetForm = () => {
    setStep(1);
    setDeliveryType('electronic');
    setRecipientName('');
    setRecipientEmail('');
    setRecipientAddress('');
    setPurpose('Employment');
    setCopies(1);
    setProcessingSpeed('standard');
    setConsentChecked(false);
    setSubmittedRequest(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFinalSubmit = (e) => {
    e.preventDefault();

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newRequest = {
      id: `TR-2026-${randomSuffix}`,
      requestDate: new Date().toISOString().split('T')[0],
      deliveryType: deliveryType === 'electronic' ? 'Electronic PDF (Secure Parchment)' : 'Paper Official Copy (Mailed)',
      recipient: recipientName,
      recipientEmail: deliveryType === 'electronic' ? recipientEmail : recipientAddress,
      copies: Number(copies),
      status: 'Processing',
      fee: processingSpeed === 'rush' ? '$15.00' : '$0.00 (Student Waiver)'
    };

    setSubmittedRequest(newRequest);
    setStep(5);
    const callback = onSubmitSuccess || onSubmitOrder;
    if (callback) {
      callback(newRequest);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 5 ? "Transcript Request Confirmed" : "Official Transcript Request"}
      subtitle={step === 5 ? "Certified University Registrar Order" : `Step ${step} of 4 — Official Academic Record Order`}
      maxWidth="560px"
    >
      {step === 5 && submittedRequest ? (
        /* STEP 5: CONFIRMATION */
        <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center', py: 1 }}>
          <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: 'success.lighter', color: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 34 }} />
          </Box>

          <Box>
            <Typography variant="h4" component="h3">Transcript Request Submitted</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Your order has been queued for official digital verification and registrar signature dispatch.
            </Typography>
          </Box>

          <Stack spacing={1.25} sx={{ width: '100%', textAlign: 'left', bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2 }}>
            <SummaryRow label="Order ID:"><Box component="span" sx={{ color: 'primary.main' }}>{submittedRequest.id}</Box></SummaryRow>
            <SummaryRow label="Status:"><Badge variant="warning" dot>Processing</Badge></SummaryRow>
            <SummaryRow label="Delivery Method:">{submittedRequest.deliveryType}</SummaryRow>
            <SummaryRow label="Recipient:">{submittedRequest.recipient}</SummaryRow>
            <SummaryRow label="Processing Fee:"><Box component="span" sx={{ color: 'success.main' }}>{submittedRequest.fee}</Box></SummaryRow>
          </Stack>

          <Button variant="primary" onClick={handleClose} fullWidth size="lg" sx={{ mt: 1 }}>
            Done & Return to Transcripts
          </Button>
        </Stack>
      ) : (
        <Box component="form" onSubmit={step === 4 ? handleFinalSubmit : (e) => { e.preventDefault(); setStep(s => s + 1); }}>
          {/* Step progress */}
          <Stepper activeStep={step - 1} alternativeLabel sx={{ mb: 3, '& .MuiStepLabel-label': { mt: '6px !important', fontSize: '0.75rem', fontWeight: 600 } }}>
            {STEP_LABELS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* STEP 1: DELIVERY METHOD */}
          {step === 1 && (
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Select Transcript Delivery Format</Typography>

              <ChoiceCard selected={deliveryType === 'electronic'} onClick={() => setDeliveryType('electronic')}>
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <Radio
                    name="delivery"
                    checked={deliveryType === 'electronic'}
                    onChange={() => setDeliveryType('electronic')}
                    sx={{ p: 0.25, mt: -0.25 }}
                  />
                  <Box>
                    <Typography variant="body2" fontWeight={700}>Electronic PDF (Certified Parchment Network)</Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 0.25, color: 'text.secondary' }}>
                      Secure, tamper-evident cryptographic PDF delivered directly to recipient email within 1–2 business hours.
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700, mt: 0.75, display: 'block' }}>
                      ✓ Recommended & Instant
                    </Typography>
                  </Box>
                </Stack>
              </ChoiceCard>

              <ChoiceCard selected={deliveryType === 'paper'} onClick={() => setDeliveryType('paper')}>
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <Radio
                    name="delivery"
                    checked={deliveryType === 'paper'}
                    onChange={() => setDeliveryType('paper')}
                    sx={{ p: 0.25, mt: -0.25 }}
                  />
                  <Box>
                    <Typography variant="body2" fontWeight={700}>Mailed Official Hardcopy (USPS / Courier)</Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 0.25, color: 'text.secondary' }}>
                      Printed on official university security paper with raised institutional registrar seal in a sealed envelope.
                    </Typography>
                  </Box>
                </Stack>
              </ChoiceCard>
            </Stack>
          )}

          {/* STEP 2: RECIPIENT INFORMATION */}
          {step === 2 && (
            <Stack spacing={2.25}>
              <TextField
                label="Recipient Name / Institution"
                type="text"
                placeholder="e.g. Stanford University Graduate Admissions"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                required
              />

              {deliveryType === 'electronic' ? (
                <TextField
                  label="Recipient Email Address"
                  type="email"
                  placeholder="admissions@university.edu"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  required
                />
              ) : (
                <TextField
                  label="Recipient Mailing Address"
                  multiline
                  rows={3}
                  placeholder="Street, Suite/Room, City, State, ZIP Code"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  required
                />
              )}

              <TextField
                select
                label="Reason for Request"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                SelectProps={{ native: true }}
              >
                <option value="Employment">Employment Verification</option>
                <option value="Graduate School">Graduate School Application</option>
                <option value="Scholarship">Scholarship / Fellowship Application</option>
                <option value="Licensing">Professional State Licensing</option>
                <option value="Personal">Personal Record</option>
              </TextField>
            </Stack>
          )}

          {/* STEP 3: COPIES & SPEED */}
          {step === 3 && (
            <Stack spacing={2.5}>
              <TextField
                select
                label="Number of Copies"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                SelectProps={{ native: true }}
              >
                <option value="1">1 Copy</option>
                <option value="2">2 Copies</option>
                <option value="3">3 Copies</option>
                <option value="5">5 Copies</option>
              </TextField>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Processing Speed</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <ChoiceCard selected={processingSpeed === 'standard'} onClick={() => setProcessingSpeed('standard')} sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={700}>Standard Processing</Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>1–2 business days</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ color: 'success.main', mt: 0.75 }}>$0.00 (Free)</Typography>
                  </ChoiceCard>
                  <ChoiceCard selected={processingSpeed === 'rush'} onClick={() => setProcessingSpeed('rush')} sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={700}>Priority Rush</Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>Same-day expedited dispatch</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ mt: 0.75 }}>$15.00</Typography>
                  </ChoiceCard>
                </Stack>
              </Box>
            </Stack>
          )}

          {/* STEP 4: REVIEW & CONSENT */}
          {step === 4 && (
            <Stack spacing={2}>
              <Stack spacing={1} sx={{ bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2 }}>
                <SummaryRow label="Student:">{user?.fullName} ({user?.studentNumber})</SummaryRow>
                <SummaryRow label="Delivery Method:">
                  {deliveryType === 'electronic' ? 'Electronic PDF (Secure)' : 'Mailed Paper Hardcopy'}
                </SummaryRow>
                <SummaryRow label="Recipient:">{recipientName || 'Not specified'}</SummaryRow>
                <SummaryRow label="Destination:">{deliveryType === 'electronic' ? recipientEmail : recipientAddress}</SummaryRow>
                <SummaryRow label="Copies:">{copies}</SummaryRow>
                <SummaryRow label="Total Order Fee:" divider>
                  <Box component="span" sx={{ color: processingSpeed === 'rush' ? 'text.primary' : 'success.main' }}>
                    {processingSpeed === 'rush' ? '$15.00' : '$0.00 (Student Waiver)'}
                  </Box>
                </SummaryRow>
              </Stack>

              {/* Consent Checkbox */}
              <Box component="label" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, cursor: 'pointer' }}>
                <Checkbox
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  required
                  sx={{ p: 0.25, mt: -0.25 }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                  I, <Box component="strong" sx={{ color: 'text.primary' }}>{user?.fullName ?? 'the undersigned student'}</Box>, hereby authorize{' '}
                  {user?.institution ?? 'the institution'} to release my official academic transcript
                  to the designated recipient in compliance with FERPA regulations.
                </Typography>
              </Box>
            </Stack>
          )}

          {/* Wizard Navigation Footer */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            {step > 1 ? (
              <Button type="button" variant="secondary" size="sm" icon={ArrowBackRoundedIcon} onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
            )}

            {step < 4 ? (
              <Button type="submit" variant="primary" size="sm" endIcon={<ArrowForwardRoundedIcon />}>
                Next Step
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="sm" disabled={!consentChecked || !recipientName}>
                Submit Official Order
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Modal>
  );
};
