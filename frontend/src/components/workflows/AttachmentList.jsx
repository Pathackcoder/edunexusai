import React from 'react';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { workflowApi } from '../../services/api';
import { useToast } from '../common/Toast';
import { fileSize } from './status';

/** Download chips for files attached to a request or ticket. */
export function AttachmentList({ files = [] }) {
  const { showToast } = useToast();
  if (!files.length) return null;
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {files.map((file) => (
        <Chip
          key={file.id}
          icon={<InsertDriveFileOutlinedIcon />}
          label={`${file.fileName} · ${fileSize(file.sizeBytes)}`}
          onClick={() => workflowApi.downloadAttachment(file).catch((error) => showToast(error.message, 'error'))}
          size="small"
          variant="outlined"
          clickable
        />
      ))}
    </Stack>
  );
}
