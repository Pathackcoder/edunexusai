import React, { useRef, useState } from 'react';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import { fileSize } from './status';

const MAX = 1024 * 1024;

const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Supporting-document picker. Files are read in the browser and sent as base64 with the
 * request (max 3 files, 1 MB each — the API enforces the same limits).
 * value: [{ fileName, mimeType, dataBase64, sizeBytes }]
 */
export function FileAttachInput({ value = [], onChange, label = 'Attach supporting documents', max = 3 }) {
  const input = useRef(null);
  const [error, setError] = useState('');

  const add = async (event) => {
    setError('');
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const next = [...value];
    for (const file of files) {
      if (next.length >= max) {
        setError(`You can attach up to ${max} files.`);
        break;
      }
      if (file.size > MAX) {
        setError(`${file.name} is larger than 1 MB.`);
        continue;
      }
      next.push({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, dataBase64: await readAsBase64(file) });
    }
    onChange(next);
  };

  return (
    <Stack spacing={1}>
      <input ref={input} type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx" onChange={add} />
      <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
        <Button size="small" variant="outlined" startIcon={<AttachFileRoundedIcon />} onClick={() => input.current?.click()} disabled={value.length >= max}>
          {label}
        </Button>
        <Typography variant="caption" color="text.secondary">PDF, image, text or Word · up to {max} files, 1 MB each</Typography>
      </Stack>
      {value.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          {value.map((file, index) => (
            <Chip key={`${file.fileName}-${index}`} label={`${file.fileName} · ${fileSize(file.sizeBytes)}`} onDelete={() => onChange(value.filter((_, i) => i !== index))} size="small" />
          ))}
        </Stack>
      )}
      {error && <Typography variant="caption" color="error.main">{error}</Typography>}
    </Stack>
  );
}

export default FileAttachInput;
