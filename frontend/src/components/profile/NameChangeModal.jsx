import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

const Row = ({ label, children }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Box sx={{ typography: 'body2', fontWeight: 600, textAlign: 'right' }}>{children}</Box>
  </Stack>
);

export const NameChangeModal = ({ isOpen, onClose, currentLegalName = '', onSubmitSuccess }) => {
  const [requestedName, setRequestedName] = useState('');
  const [reason, setReason] = useState('Marriage / Legal Decree');
  const [notes, setNotes] = useState('');
  const [attachedDocument, setAttachedDocument] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);

  const handleSimulateUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedDocument({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`
      });
    } else {
      // Default demo mock attachment
      setAttachedDocument({
        name: "court_order_certified_copy.pdf",
        size: "1.42 MB"
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!attachedDocument) {
      alert('Please attach supporting legal documentation (court order, marriage certificate, or passport).');
      return;
    }

    // Split the requested name for the API, which stores the parts separately.
    const parts = requestedName.trim().split(/\s+/);
    const newRequest = {
      id: `NCR-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      currentLegalName,
      requestedName,
      firstName: parts[0] ?? '',
      middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined,
      lastName: parts.length > 1 ? parts[parts.length - 1] : '',
      reason,
      notes,
      documentName: attachedDocument.name,
      requestDate: new Date().toISOString().split('T')[0],
      status: 'Pending Review'
    };

    setSubmittedData(newRequest);
    if (onSubmitSuccess) {
      onSubmitSuccess(newRequest);
    }
  };

  const handleClose = () => {
    setSubmittedData(null);
    setRequestedName('');
    setNotes('');
    setAttachedDocument(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={submittedData ? "Name Change Request Submitted" : "Legal Name Change Petition"}
      subtitle={submittedData ? "Confidential Registrar Processing" : "Office of the University Registrar • Student Records"}
      maxWidth="540px"
    >
      {submittedData ? (
        <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center', py: 1 }}>
          <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: 'warning.lighter', color: 'warning.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HourglassTopRoundedIcon sx={{ fontSize: 30 }} />
          </Box>

          <Box>
            <Typography variant="h4" component="h4">Name change request submitted.</Typography>
            <Badge variant="warning" dot sx={{ mt: 1 }}>Status: Pending Review</Badge>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
              Your petition (ID: <strong>{submittedData.id}</strong>) and attached documentation have been submitted to the university records committee.
            </Typography>
          </Box>

          <Stack spacing={1} sx={{ width: '100%', bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3, p: 2, textAlign: 'left' }}>
            <Row label="Current Legal Name:">{submittedData.currentLegalName}</Row>
            <Row label="Requested Legal Name:"><Box component="span" sx={{ color: 'primary.main' }}>{submittedData.requestedName}</Box></Row>
            <Row label="Attached Proof:"><Box component="span" sx={{ fontWeight: 500, color: 'text.secondary' }}>{submittedData.documentName}</Box></Row>
          </Stack>

          <Button variant="primary" onClick={handleClose} fullWidth size="lg" sx={{ mt: 0.5 }}>
            Done
          </Button>
        </Stack>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2.25}>
            <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ px: 2, py: 1.25, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', borderRadius: 3 }}>
              <Typography variant="caption">Current Legal Name on File:</Typography>
              <Typography variant="body2" fontWeight={600}>{currentLegalName}</Typography>
            </Stack>

            <TextField
              label="Requested New Legal Name"
              type="text"
              placeholder="First Middle Last"
              value={requestedName}
              onChange={(e) => setRequestedName(e.target.value)}
              required
            />

            <TextField
              select
              label="Legal Reason for Change"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              SelectProps={{ native: true }}
              InputLabelProps={{ shrink: true }}
            >
              <option value="Marriage / Divorce">Marriage / Divorce</option>
              <option value="Court Order / Legal Decree">Court Order / Legal Decree</option>
              <option value="Naturalization / Citizenship">Naturalization / Citizenship</option>
              <option value="Correction of Typographical Error">Correction of Clerical Error</option>
              <option value="Other Legal Reason">Other Legal Reason</option>
            </TextField>

            {/* Supporting document */}
            <Box>
              <Typography variant="subtitle2">Supporting Legal Documentation</Typography>
              <Typography variant="caption" component="p" sx={{ mt: 0.25, mb: 1 }}>
                Upload a certified copy of your court decree, marriage certificate, or government photo ID.
              </Typography>

              {attachedDocument ? (
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={1.25}
                  sx={(theme) => ({ px: 1.75, py: 1.25, bgcolor: 'success.lighter', border: `1px solid ${alpha(theme.palette.success.main, 0.25)}`, borderRadius: 3 })}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                    <AttachFileRoundedIcon sx={{ fontSize: 18, color: 'success.main' }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>Document attached: {attachedDocument.name}</Typography>
                      <Typography variant="caption">{attachedDocument.size} • Verified format</Typography>
                    </Box>
                  </Stack>
                  <IconButton size="small" onClick={() => setAttachedDocument(null)} aria-label="Remove attached document" sx={{ color: 'error.main', '&:hover': { bgcolor: 'error.lighter', color: 'error.main' } }}>
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ) : (
                <Box
                  component="label"
                  sx={(theme) => ({
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    p: 2.5,
                    border: `1.5px dashed ${theme.palette.grey[300]}`,
                    borderRadius: 3,
                    bgcolor: 'background.subtle',
                    cursor: 'pointer',
                    transition: 'border-color 160ms ease, background-color 160ms ease',
                    '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.03) },
                  })}
                >
                  <CloudUploadOutlinedIcon sx={{ fontSize: 30, color: 'grey.400', mb: 0.5 }} />
                  <Typography variant="body2" fontWeight={600} color="primary.main">Click to select supporting document</Typography>
                  <Typography variant="caption">PDF, PNG, or JPG (max 10MB)</Typography>
                  <input type="file" onChange={handleSimulateUpload} style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg" />
                </Box>
              )}
            </Box>

            <TextField
              label="Additional Notes (Optional)"
              multiline
              rows={2}
              placeholder="Any details to expedite verification..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <Stack direction="row" justifyContent="flex-end" spacing={1.25} sx={{ pt: 0.5 }}>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!requestedName || !attachedDocument}>
                Submit Name Change
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Modal>
  );
};
