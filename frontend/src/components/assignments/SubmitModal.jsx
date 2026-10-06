import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import ButtonBase from '@mui/material/ButtonBase';
import { alpha } from '@mui/material/styles';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { IconTile } from '../common/IconTile';

export const SubmitModal = ({ isOpen, onClose, assignment, onSubmitSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  if (!assignment) return null;

  const handleSimulatedDrop = () => {
    setSelectedFile({
      name: `${assignment.courseCode.toLowerCase().replace(' ', '_')}_submission_amit_pathak.zip`,
      size: '2.4 MB'
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate short network delay
    await new Promise(r => setTimeout(r, 700));
    setIsSubmitting(false);
    setIsDone(true);

    if (onSubmitSuccess) {
      onSubmitSuccess(assignment.id, {
        file: selectedFile?.name || 'online_direct_submission.pdf',
        comments
      });
    }

    setTimeout(() => {
      setIsDone(false);
      setSelectedFile(null);
      setComments('');
      onClose();
    }, 1200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={assignment.title}
      subtitle={`${assignment.courseCode} — ${assignment.courseName}`}
    >
      {isDone ? (
        <Stack alignItems="center" spacing={1} sx={{ py: 4, textAlign: 'center' }}>
          <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'success.lighter', color: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 36 }} />
          </Box>
          <Typography variant="h4" component="h4">Assignment Submitted!</Typography>
          <Typography variant="body2" color="text.secondary">
            Turned in on {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.
          </Typography>
        </Stack>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2.5}>
            <Box sx={{ p: 2, bgcolor: 'background.subtle', borderRadius: 3, border: 1, borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <EventOutlinedIcon sx={{ fontSize: 16, color: 'grey.500' }} />
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>Due Date & Time</Typography>
                </Stack>
                <Typography variant="body2" fontWeight={700} color="error.main">
                  {assignment.formattedDueDate} at {assignment.dueTime}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {assignment.description}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" component="label" sx={{ display: 'block', mb: 1 }}>
                Upload Submission File
              </Typography>
              <ButtonBase
                onClick={handleSimulatedDrop}
                sx={(theme) => ({
                  width: '100%',
                  display: 'block',
                  border: `1.5px dashed ${selectedFile ? theme.palette.primary.main : theme.palette.grey[300]}`,
                  borderRadius: 3,
                  py: 3,
                  px: 2,
                  textAlign: 'center',
                  bgcolor: selectedFile ? alpha(theme.palette.primary.main, 0.05) : 'background.subtle',
                  transition: 'background-color 160ms ease, border-color 160ms ease',
                  '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
                })}
              >
                {selectedFile ? (
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5}>
                    <IconTile icon={DescriptionOutlinedIcon} tone="primary" size={40} />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="body2" fontWeight={600}>{selectedFile.name}</Typography>
                      <Typography variant="caption">{selectedFile.size} • Ready to submit</Typography>
                    </Box>
                  </Stack>
                ) : (
                  <Stack alignItems="center" spacing={1}>
                    <IconTile icon={CloudUploadOutlinedIcon} tone="primary" size={44} />
                    <Typography variant="body2" fontWeight={600}>Click to select file or drag & drop</Typography>
                    <Typography variant="caption">PDF, ZIP, SQL or DOCX (Max 25 MB)</Typography>
                  </Stack>
                )}
              </ButtonBase>
            </Box>

            <TextField
              label="Submission Comments (Optional)"
              multiline
              rows={3}
              placeholder="Add any notes for your instructor or TA..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />

            <Stack direction="row" justifyContent="flex-end" spacing={1.25} sx={{ pt: 1 }}>
              <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isSubmitting}>
                Submit Assignment
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Modal>
  );
};
