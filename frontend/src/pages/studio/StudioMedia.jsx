import React, { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { studioApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 3 * 1024 * 1024;

/** Reads a File into base64 (without the data: prefix) for the JSON upload endpoint. */
export const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export function StudioMedia() {
  const input = useRef(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const { data, loading, error: loadError, refetch } = useApiQuery(() => studioApi.media());

  const upload = async (file) => {
    setError(null);
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return setError({ message: 'Only PNG, JPEG, WebP or GIF images can be uploaded.' });
    if (file.size > MAX_BYTES) return setError({ message: 'Images can be at most 3 MB.' });
    setBusy(true);
    try {
      await studioApi.uploadMedia({ fileName: file.name, mime: file.type, dataBase64: await readAsBase64(file), alternativeText: alt });
      setAlt('');
      await refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ md: 'center' }}>
        <Box>
          <Typography variant="h4" component="h2">Media</Typography>
          <Typography variant="body2" color="text.secondary">Images for pages, banners and cards (PNG, JPEG, WebP or GIF, up to 3 MB). You can also upload straight from an Image block in the page editor.</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField size="small" label="Alt text (describe the image)" value={alt} onChange={(e) => setAlt(e.target.value)} inputProps={{ maxLength: 200 }} />
          <MuiButton variant="contained" startIcon={<UploadRoundedIcon />} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Upload image'}</MuiButton>
          <input ref={input} type="file" accept={ACCEPT.join(',')} hidden onChange={(e) => upload(e.target.files?.[0])} />
        </Stack>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error.message}</Alert>}
      <DataState loading={loading} error={loadError} onRetry={refetch} isEmpty={!data?.length} emptyTitle="No images yet" emptyMessage="Uploaded images appear here.">
        {() => (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {data.map((f) => (
              <Card key={f.id} variant="outlined">
                <CardMedia component="img" image={f.url} alt={f.alternativeText ?? ''} sx={{ height: 140, objectFit: 'cover', bgcolor: 'grey.100' }} />
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" noWrap title={f.name}>{f.name}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div">{f.width && f.height ? `${f.width}×${f.height} · ` : ''}{Math.round(Number(f.size) || 0)} KB</Typography>
                  <Typography variant="caption" color={f.alternativeText ? 'text.secondary' : 'warning.main'} component="div" noWrap>{f.alternativeText || 'No alt text'}</Typography>
                  <Tooltip title={copied === f.url ? 'Copied' : 'Copy the image address for an Image or Banner block'}>
                    <MuiButton size="small" sx={{ px: 0, mt: 0.5 }} onClick={() => copy(f.url)}>{copied === f.url ? 'Copied' : 'Copy address'}</MuiButton>
                  </Tooltip>
                </Box>
              </Card>
            ))}
          </Box>
        )}
      </DataState>
    </Stack>
  );
}
