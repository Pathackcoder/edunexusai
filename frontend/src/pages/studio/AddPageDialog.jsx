import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ContactMailOutlinedIcon from '@mui/icons-material/ContactMailOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { studioApi } from '../../services/api';
import { TEMPLATES } from '../../components/cms/templates';
import { CmsPageRenderer } from '../../components/cms/CmsPageRenderer';
import { PageSettingsFields } from './StudioPagesList';
import { errorLines } from './studioCommon';

/**
 * Add page: choose a pre-built template or a blank column layout on the left, see a live
 * preview of it on the right (the same blocks the editor and the portal use), enter the page
 * details and create it as a draft. The new page opens in the visual editor.
 */

const ICONS = { dashboard: SpaceDashboardOutlinedIcon, link: LinkRoundedIcon, about: AccountBalanceOutlinedIcon, services: ChecklistRoundedIcon, team: GroupsOutlinedIcon, contact: ContactMailOutlinedIcon, gallery: CollectionsOutlinedIcon, news: CampaignOutlinedIcon, help: HelpOutlineRoundedIcon, events: EventOutlinedIcon, info: ArticleOutlinedIcon };
const EMPTY_SETTINGS = { title: '', slug: '', summary: '', audiences: { students: true, faculty: true, staff: true }, showInNav: false, navLabel: '', sortOrder: 0 };
const PREVIEW_WIDTH = 1200;

/** A small column diagram for blank layouts. */
const ColumnGlyph = ({ columns }) => (
  <Box aria-hidden sx={{ display: 'flex', gap: '3px', width: 40, height: 30, p: '3px', border: 1.5, borderColor: 'currentColor', borderRadius: 1 }}>
    {columns.map((w, i) => <Box key={i} sx={{ flex: `${w} 1 0`, border: 1.5, borderColor: 'currentColor', borderRadius: 0.5 }} />)}
  </Box>
);

function Tile({ option, selected, onSelect }) {
  const Icon = ICONS[option.icon];
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      aria-label={`${option.label}: ${option.description}`}
      onClick={() => onSelect(option.key)}
      sx={{
        position: 'relative',
        flexDirection: 'column',
        gap: 0.75,
        p: 1.25,
        minHeight: 92,
        borderRadius: 2,
        border: 1.5,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.lighter' : 'background.paper',
        color: selected ? 'primary.main' : 'text.secondary',
        transition: 'border-color 120ms ease, background-color 120ms ease',
        '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      {selected && <CheckCircleRoundedIcon sx={{ position: 'absolute', top: 6, right: 6, fontSize: 16 }} />}
      {Icon ? <Icon sx={{ fontSize: 30 }} /> : <ColumnGlyph columns={option.columns} />}
      <Typography variant="caption" sx={{ fontWeight: 600, color: selected ? 'primary.main' : 'text.primary', textAlign: 'center', lineHeight: 1.25 }}>{option.label}</Typography>
    </ButtonBase>
  );
}

/** Live preview of a layout, rendered at desktop width and scaled to fit (not interactive). */
function LayoutPreview({ layout }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const scale = width ? width / PREVIEW_WIDTH : 0;
  return (
    <Box ref={ref} aria-hidden sx={{ position: 'relative', height: 300, overflow: 'hidden', borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
      {scale > 0 && (
        <Box sx={{ width: PREVIEW_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none', userSelect: 'none', p: 3, '& [data-cms-column]:empty, & [data-cms-column]:not(:has(*))': { minHeight: 160, border: '2px dashed', borderColor: 'divider', borderRadius: 2 } }} inert="">
          <CmsPageRenderer layout={layout} />
        </Box>
      )}
      <Box sx={{ position: 'absolute', inset: 'auto 0 0 0', height: 40, background: (t) => `linear-gradient(transparent, ${t.palette.background.default})` }} />
    </Box>
  );
}

export function AddPageDialog({ open, onClose, initialSection = 'templates' }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('hub');
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSelected(initialSection === 'blank' ? 'blank-1' : 'hub');
    setSettings(EMPTY_SETTINGS);
    setError(null);
    setSaving(false);
    inFlight.current = false;
  }, [open, initialSection]);

  const option = TEMPLATES.find((t) => t.key === selected) ?? TEMPLATES[0];
  // Build once per selection, so the preview and the created page are the same layout.
  const layout = useMemo(() => option.build(), [option]);
  const templates = TEMPLATES.filter((t) => t.kind === 'template');
  const blanks = TEMPLATES.filter((t) => t.kind === 'blank');

  const create = async () => {
    if (inFlight.current) return; // one request per click, even if pressed twice
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await studioApi.create('page', { ...settings, template: option.key, layout });
      onClose();
      navigate(`/studio/pages/${created.id}/edit`);
    } catch (e) {
      setError(e);
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="lg" fullWidth aria-labelledby="add-page-title" PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', height: { md: 'min(820px, calc(100vh - 64px))' } } }}>
      <Stack direction="row" alignItems="center" sx={{ px: 3, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
        <Typography id="add-page-title" variant="h5" component="h2" sx={{ flex: 1 }}>Add page</Typography>
        <IconButton aria-label="Close" onClick={onClose} disabled={saving}><CloseRoundedIcon /></IconButton>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.05fr)' } }}>
        <Box sx={{ overflowY: 'auto', p: 3, borderRight: { md: 1 }, borderColor: 'divider' }} role="radiogroup" aria-label="Template or layout">
          <Typography variant="overline" component="h3" color="text.secondary">Pre-built templates</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 1.25, mt: 1, mb: 3 }}>
            {templates.map((t) => <Tile key={t.key} option={t} selected={selected === t.key} onSelect={setSelected} />)}
          </Box>
          <Typography variant="overline" component="h3" color="text.secondary">Blank page layouts</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 1.25, mt: 1 }}>
            {blanks.map((t) => <Tile key={t.key} option={t} selected={selected === t.key} onSelect={setSelected} />)}
          </Box>
        </Box>
        <Box sx={{ overflowY: 'auto', p: 3, bgcolor: 'background.subtle' }}>
          <Typography variant="overline" component="h3" color="text.secondary">Preview</Typography>
          <Box sx={{ mt: 1 }}><LayoutPreview key={option.key} layout={layout} /></Box>
          <Typography variant="subtitle1" sx={{ mt: 1.5 }}>{option.label}</Typography>
          <Typography variant="body2" color="text.secondary">{option.description} Everything can be changed in the editor.</Typography>
          <Divider sx={{ my: 2.5 }} />
          <Typography variant="overline" component="h3" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Page details</Typography>
          <PageSettingsFields value={settings} onChange={setSettings} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error.message}{errorLines(error).map((l) => <div key={l}>{l}</div>)}</Alert>}
        </Box>
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 3, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <MuiButton onClick={onClose} disabled={saving}>Cancel</MuiButton>
        <MuiButton variant="contained" onClick={create} disabled={saving || !settings.title?.trim() || !settings.slug}>{saving ? 'Creating…' : 'Create page'}</MuiButton>
      </Stack>
    </Dialog>
  );
}
