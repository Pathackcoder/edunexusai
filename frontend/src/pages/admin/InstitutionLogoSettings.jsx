import React, { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { InstitutionLogo, logoPlate } from '../../components/brand/Brand';
import { useAppearance } from '../../context/AppearanceContext';
import { useToast } from '../../components/common/Toast';
import { appearanceApi } from '../../services/api';
import { brand } from '../../theme/theme';
import { LOGO_GUIDANCE, LOGO_LIMITS, logoShapeProblem } from '../../../../shared/brandAssets.js';

/**
 * Portal Appearance → Institution logo. One logo for the whole portal (sidebar, sign-in page, header,
 * loading screen, transcripts, collapsed sidebar). A chosen file is previewed first and applied only
 * on "Apply logo"; "Restore default" goes back to the logo bundled with the deployment. The server
 * checks every image again; the checks here only give a quicker answer.
 */

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('The file could not be read.'));
  reader.readAsDataURL(file);
});

const imageSize = (dataUrl) => new Promise((resolve) => {
  const img = document.createElement('img');
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => resolve(null);
  img.src = dataUrl;
});

/** A not-yet-applied file, drawn the way InstitutionLogo draws an uploaded logo. */
function PendingLogo({ pending, height, onDark }) {
  const { pad, radius } = onDark ? logoPlate(height) : { pad: 0, radius: 0 };
  const inner = height - pad * 2;
  const width = Math.round(inner * (pending.width / pending.height));
  const img = <Box component="img" src={pending.dataUrl} alt="" sx={{ display: 'block', width, height: inner, maxWidth: '100%', objectFit: 'contain', objectPosition: 'left center' }} />;
  return onDark ? <Box sx={{ display: 'inline-flex', boxSizing: 'border-box', height, maxWidth: '100%', p: `${pad}px`, borderRadius: `${radius}px`, bgcolor: '#FFFFFF' }}>{img}</Box> : img;
}

/** The logo where it is used: on the navigation sidebar (dark) and on light pages. */
function Placements({ pending }) {
  const frame = { height: 76, px: 2, borderRadius: 2, display: 'flex', alignItems: 'center', overflow: 'hidden', border: 1, borderColor: 'divider', minWidth: 0 };
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
      <Box>
        <Box aria-hidden sx={{ ...frame, background: brand.navy }}>{pending ? <PendingLogo pending={pending} height={40} onDark /> : <InstitutionLogo inverse height={40} alt="" />}</Box>
        <Typography variant="caption" color="text.secondary">Navigation sidebar and sign-in page</Typography>
      </Box>
      <Box>
        <Box aria-hidden sx={{ ...frame, bgcolor: 'background.paper' }}>{pending ? <PendingLogo pending={pending} height={36} /> : <InstitutionLogo height={36} alt="" />}</Box>
        <Typography variant="caption" color="text.secondary">Header, loading screen and transcripts</Typography>
      </Box>
    </Box>
  );
}

export function InstitutionLogoSettings() {
  const appearance = useAppearance();
  const { showToast } = useToast();
  const input = useRef(null);
  const [pending, setPending] = useState(null); // { dataUrl, width, height, name }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const current = appearance?.logo ?? null;

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // choosing the same file again still triggers a change
    if (!file) return;
    setProblem(null);
    setConfirmReset(false);
    if (!LOGO_LIMITS.types[file.type]) return setProblem('Choose a PNG, JPEG or WebP image (SVG is not accepted).');
    if (file.size > LOGO_LIMITS.maxBytes) return setProblem('The logo can be at most 1 MB.');
    try {
      const dataUrl = await readFile(file);
      const size = await imageSize(dataUrl);
      const shape = size ? logoShapeProblem(size.width, size.height) : 'The image could not be opened.';
      if (shape) return setProblem(shape);
      setPending({ dataUrl, ...size, name: file.name });
    } catch (error) {
      setProblem(error.message);
    }
    return undefined;
  };

  const apply = async () => {
    setBusy(true);
    setProblem(null);
    try {
      appearance.apply(await appearanceApi.uploadLogo(pending.dataUrl.slice(pending.dataUrl.indexOf(',') + 1)));
      setPending(null);
      showToast('Institution logo updated for everyone at the institution.');
    } catch (error) {
      setProblem(error.message ?? 'The logo could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setProblem(null);
    try {
      appearance.apply(await appearanceApi.resetLogo());
      showToast('Institution logo restored to the default.');
    } catch (error) {
      setProblem(error.message ?? 'The logo could not be reset.');
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle2">{pending ? 'Preview (not applied yet)' : 'Current logo'}</Typography>
        {pending
          ? <Chip size="small" color="warning" variant="outlined" label={`${pending.name} · ${pending.width} × ${pending.height} px`} />
          : <Chip size="small" variant="outlined" color={current ? 'primary' : 'default'} label={current ? `Custom · ${current.width} × ${current.height} px` : 'Default (bundled with the portal)'} />}
      </Stack>
      <Placements pending={pending} />
      <Typography variant="caption" color="text.secondary">{LOGO_GUIDANCE} On the dark sidebar the logo sits on a light background so it is always legible.</Typography>
      {problem && <Alert severity="error" onClose={() => setProblem(null)}>{problem}</Alert>}
      <input ref={input} id="institution-logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choose} />
      {pending ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="contained" startIcon={<CheckRoundedIcon />} onClick={apply} disabled={busy}>{busy ? 'Applying…' : 'Apply logo'}</Button>
          <Button onClick={() => input.current?.click()} disabled={busy}>Choose another file</Button>
          <Button onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
        </Stack>
      ) : confirmReset ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ mr: 1 }}>Go back to the default logo for everyone?</Typography>
          <Button color="error" variant="outlined" onClick={reset} disabled={busy}>{busy ? 'Restoring…' : 'Restore default'}</Button>
          <Button onClick={() => setConfirmReset(false)} disabled={busy}>Cancel</Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="contained" startIcon={<UploadFileRoundedIcon />} onClick={() => input.current?.click()} disabled={busy}>{current ? 'Replace logo' : 'Upload logo'}</Button>
          {current && <Button startIcon={<RestartAltRoundedIcon />} onClick={() => setConfirmReset(true)} disabled={busy}>Restore default</Button>}
        </Stack>
      )}
    </Stack>
  );
}

export default InstitutionLogoSettings;
