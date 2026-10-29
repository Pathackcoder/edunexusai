import React, { Suspense, lazy, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MuiButton from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import { BLOCKS, ROOT_FIELDS, isSafeImage } from '../../../../shared/cmsBlocks.js';
import { studioApi } from '../../services/api';
import { BLOCK_COMPONENTS, BoxFrame } from './blocks/CmsBlocks';
// Loaded only inside the editor, so portal page viewers do not download the rich-text editor.
const RichTextEditor = lazy(() => import('./RichTextEditor').then((m) => ({ default: m.RichTextEditor })));
import { parseVideoUrl, videoEmbedUrl } from '../../../../shared/video.js';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import { CmsDashboardBlock } from './dashboardLayout';

/**
 * Puck configuration generated from shared/cmsBlocks.js, so the editor offers exactly the
 * blocks and properties the server accepts. `context` is 'page' or 'dashboard'; dashboard
 * configs add the persona's widget catalogue.
 */

const CATEGORY_TITLES = { layout: 'Layout', content: 'Content', live: 'Live content', widgets: 'Dashboard widgets' };
const SIZE_LABEL = { compact: 'Compact card', standard: 'Standard card', large: 'Wide card', default: 'Original size' };
const toOptions = (values) => values.map((v) => ({ label: String(v).replace(/-/g, ' '), value: v }));
const readable = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(new Error('The file could not be read.'));
  reader.readAsDataURL(file);
});

/** Image field: an https:// address, or an image from the CMS media library (with upload). */
function MediaField({ value, onChange, readOnly }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const load = async () => {
    setError(null);
    try {
      setFiles(await studioApi.media());
    } catch (e) {
      setError(e.message);
      setFiles([]);
    }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('Images can be at most 3 MB.');
      const uploaded = await studioApi.uploadMedia({ fileName: file.name, mime: file.type, dataBase64: await readable(file) });
      onChange(uploaded.url);
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={1}>
      {value && isSafeImage(value) && <Box component="img" src={value} alt="" sx={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 1.5, border: 1, borderColor: 'divider' }} />}
      <TextField size="small" placeholder="https://… or choose from library" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={readOnly} error={Boolean(value) && !isSafeImage(value)} helperText={value && !isSafeImage(value) ? 'Use an https:// address or the media library.' : ' '} />
      <Stack direction="row" spacing={1}>
        <MuiButton size="small" variant="outlined" disabled={readOnly} onClick={() => { setOpen(true); load(); }}>Media library</MuiButton>
        {value && <MuiButton size="small" disabled={readOnly} onClick={() => onChange('')}>Clear</MuiButton>}
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Media library</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <MuiButton component="label" variant="contained" size="small" disabled={busy} sx={{ mb: 2 }}>
            {busy ? 'Uploading…' : 'Upload image (PNG, JPEG, WebP, GIF; max 3 MB)'}
            <input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => upload(e.target.files?.[0])} />
          </MuiButton>
          {files === null ? <CircularProgress size={22} /> : files.length === 0 ? <Typography variant="body2" color="text.secondary">No images yet.</Typography> : (
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {files.map((f) => (
                <Box key={f.id} component="button" type="button" onClick={() => { onChange(f.url); setOpen(false); }} sx={{ p: 0, border: 2, borderColor: value === f.url ? 'primary.main' : 'divider', borderRadius: 2, overflow: 'hidden', cursor: 'pointer', bgcolor: 'background.paper' }}>
                  <Box component="img" src={f.url} alt={f.alternativeText ?? ''} sx={{ display: 'block', width: '100%', height: 100, objectFit: 'cover' }} />
                  <Typography variant="caption" noWrap sx={{ display: 'block', px: 0.75, py: 0.5 }}>{f.name}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions><MuiButton onClick={() => setOpen(false)}>Close</MuiButton></DialogActions>
      </Dialog>
    </Stack>
  );
}

/** Video address with live validation and a small preview of the generated (safe) embed. */
function VideoField({ value, onChange, readOnly }) {
  const video = parseVideoUrl(value);
  const src = videoEmbedUrl(video);
  return (
    <Stack spacing={1}>
      <TextField size="small" placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/…" value={value ?? ''} onChange={(e) => onChange(e.target.value.trim())} disabled={readOnly} error={Boolean(value) && !video} helperText={value ? (video ? `${video.provider === 'youtube' ? 'YouTube' : 'Vimeo'} video ${video.id} — embedded from ${video.provider === 'youtube' ? 'youtube-nocookie.com' : 'player.vimeo.com'}` : 'Not a supported YouTube or Vimeo video address.') : 'Paste the address of a YouTube or Vimeo video. No HTML needed.'} inputProps={{ 'aria-label': 'Video address' }} />
      {src && <Box component="iframe" src={src} title="Video preview" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" sx={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 1.5, bgcolor: 'grey.900' }} />}
    </Stack>
  );
}

/** Choose one of the tenant's Studio forms (managed under Studio → Forms). */
function FormRefField({ value, onChange, readOnly }) {
  const [forms, setForms] = useState(null);
  React.useEffect(() => { studioApi.list('form').then(setForms, () => setForms([])); }, []);
  const current = forms?.find((f) => f.id === value);
  return (
    <Stack spacing={0.75}>
      <TextField select size="small" value={forms ? value ?? '' : ''} onChange={(e) => onChange(e.target.value)} disabled={readOnly || !forms} SelectProps={{ displayEmpty: true }} inputProps={{ 'aria-label': 'Form' }}>
        <MenuItem value="">{forms ? 'Choose a form…' : 'Loading forms…'}</MenuItem>
        {(forms ?? []).map((f) => <MenuItem key={f.id} value={f.id}>{f.name}{f.state === 'draft' ? ' (not published)' : f.state === 'modified' ? ' (unpublished changes)' : ''}</MenuItem>)}
      </TextField>
      {current && current.state === 'draft' && <Typography variant="caption" color="warning.main">Publish this form so portal users can see it.</Typography>}
      <Link href="/studio/forms" target="_blank" rel="noopener" variant="caption">Create or edit forms</Link>
    </Stack>
  );
}

function puckField(name, spec, { catalogue }) {
  const label = spec.label ?? name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  switch (spec.kind) {
    case 'text':
    case 'url':
      return { type: 'text', label: spec.kind === 'url' ? `${label} (https://, mailto:, tel: or /path)` : label };
    case 'markdown':
      return { type: 'textarea', label: `${label} (Markdown)` };
    case 'select':
      return { type: 'select', label, options: toOptions(spec.options) };
    case 'number':
      return { type: 'number', label, min: spec.min, max: spec.max };
    case 'boolean':
      return { type: 'radio', label, options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] };
    case 'image':
      return { type: 'custom', label, render: ({ value, onChange, readOnly }) => <Box><Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography><MediaField value={value} onChange={onChange} readOnly={readOnly} /></Box> };
    case 'list':
      return {
        type: 'array',
        label,
        max: spec.max,
        getItemSummary: (item) => item?.label || item?.value || 'Item',
        defaultItemProps: Object.fromEntries(Object.entries(spec.of).map(([k, s]) => [k, s.default ?? ''])),
        arrayFields: Object.fromEntries(Object.entries(spec.of).map(([k, s]) => [k, puckField(k, s, { catalogue })])),
      };
    case 'slot':
      return { type: 'slot' };
    case 'html':
      return { type: 'custom', label: 'Text', render: ({ value, onChange, id }) => <Box><Typography variant="caption" sx={{ fontWeight: 600 }}>Text</Typography><Suspense fallback={<CircularProgress size={18} />}><RichTextEditor key={id} value={value} onChange={onChange} compact minHeight={160} label="Text" /></Suspense></Box> };
    case 'video':
      return { type: 'custom', label, render: ({ value, onChange, readOnly }) => <Box><Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography><VideoField value={value} onChange={onChange} readOnly={readOnly} /></Box> };
    case 'formRef':
      return { type: 'custom', label, render: ({ value, onChange, readOnly }) => <Box><Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography><FormRefField value={value} onChange={onChange} readOnly={readOnly} /></Box> };
    case 'widget':
      return { type: 'select', label: 'Widget', options: catalogue.map((w) => ({ label: w.label, value: w.key })) };
    default:
      return null;
  }
}

/** How a dashboard card is shown on the canvas: the real block, framed at its grid size. */
const DASH_WIDTH = { compact: '34%', standard: '50%', large: '100%' };
function DashboardFrame({ size, label, children }) {
  return (
    <Box sx={{ position: 'relative', border: 1, borderColor: 'divider', borderRadius: 3, p: 1.5, bgcolor: 'background.paper', width: { xs: '100%', md: DASH_WIDTH[size] ?? '100%' }, minWidth: { md: 260 } }}>
      <Chip size="small" label={`${label} · ${SIZE_LABEL[size] ?? size}`} sx={{ position: 'absolute', top: -11, right: 12, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }} />
      {children}
    </Box>
  );
}

/** Canvas stand-in for a real dashboard widget: its data is per user, so it is not loaded here. */
function WidgetPlaceholder({ widgetKey, title, subtitle, size, catalogue }) {
  const entry = catalogue.find((w) => w.key === widgetKey);
  return (
    <DashboardFrame size={size === 'default' ? 'standard' : size} label="Widget">
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <WidgetsOutlinedIcon color="primary" />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="h3">{title || entry?.label || widgetKey || 'Choose a widget'}</Typography>
          {(subtitle || entry?.description) && <Typography variant="caption" color="text.secondary" component="p">{subtitle || entry?.description}</Typography>}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Live widget. Each signed-in user sees their own data from its usual source (CampusCore, Moodle or the portal), and only if they are entitled to it.
          </Typography>
          {!entry && widgetKey && <Alert severity="warning" sx={{ mt: 1 }}>This widget is not in this dashboard&apos;s catalogue.</Alert>}
        </Box>
      </Stack>
    </DashboardFrame>
  );
}

/**
 * `live` (dashboards only) makes the canvas render the dashboard's real components in its real
 * grid instead of stand-ins: { renderWidget({ widgetKey, presentation }), span(size) }. It is
 * used for the Admin dashboard, whose viewer in Studio is the administrator it is built for.
 * Each block is tagged with data-span, and the root grid places it, so the canvas has the same
 * 12-column layout as the live page.
 */
// Blocks that read signed-in data. On the public site they never call an API: they say what is there.
export const SIGNED_IN_BLOCKS = ['AnnouncementsFeed', 'FaqList', 'EventsList', 'Form'];

export function buildPuckConfig({ context = 'page', catalogue = [], live = null, publicView = false } = {}) {
  const components = {};
  const categories = {};
  for (const [type, def] of Object.entries(BLOCKS)) {
    if (!def.contexts.includes(context)) continue;
    const fields = {};
    const defaultProps = {};
    for (const [name, spec] of Object.entries(def.fields)) {
      if (context === 'page' && name === 'size') continue;
      if (context === 'dashboard' && (spec.kind === 'slot' || spec.pageOnly)) continue;
      const field = puckField(name, spec, { catalogue });
      if (!field) continue;
      fields[name] = field;
      if (spec.kind === 'slot') defaultProps[name] = [];
      else if (spec.kind === 'widget') defaultProps[name] = catalogue[0]?.key ?? '';
      else if (spec.default !== undefined) defaultProps[name] = spec.default;
    }
    const Block = BLOCK_COMPONENTS[type];
    let render;
    if (live && type === 'DashboardWidget') {
      render = ({ widgetKey, title, subtitle, size }) => (
        <Box data-span={live.span(size)} data-cms-block={type}>
          {live.renderWidget({ widgetKey, presentation: title || subtitle ? { title: title || null, subtitle: subtitle || null } : null })}
        </Box>
      );
    } else if (live && context === 'dashboard') {
      render = ({ puck: _puck, editMode: _editMode, ...props }) => <Box data-span={live.span(props.size)} data-cms-block={type}><CmsDashboardBlock type={type} props={props} /></Box>;
    } else if (type === 'DashboardWidget') render = (props) => <WidgetPlaceholder {...props} catalogue={catalogue} />;
    else if (context === 'dashboard') render = (props) => <DashboardFrame size={props.size} label={def.label}><Block {...props} /></DashboardFrame>;
    else if (publicView && SIGNED_IN_BLOCKS.includes(type)) render = ({ boxWidth, boxAlign, spaceAbove, spaceBelow }) => <BoxFrame boxWidth={boxWidth} boxAlign={boxAlign} spaceAbove={spaceAbove} spaceBelow={spaceBelow} data-cms-block={type}><Alert severity="info" variant="outlined">Sign in to see this section ({def.label.toLowerCase()}).</Alert></BoxFrame>;
    else render = ({ boxWidth, boxAlign, spaceAbove, spaceBelow, ...props }) => <BoxFrame boxWidth={boxWidth} boxAlign={boxAlign} spaceAbove={spaceAbove} spaceBelow={spaceBelow} data-cms-block={type}><Block {...props} /></BoxFrame>;
    const component = { label: def.label, fields, defaultProps, render };
    if (type === 'RichText') {
      // New text blocks use the rich editor; existing blocks keep their stored format.
      component.defaultProps = { ...defaultProps, format: 'html', html: '<p>Write something…</p>' };
      component.resolveFields = (data, { fields: all }) => Object.fromEntries(Object.entries(all).filter(([name]) => (data.props.format === 'html' ? name !== 'markdown' : name !== 'html')));
      component.resolveData = async (data, { changed }) => {
        if (!changed.format || data.props.format !== 'html' || data.props.html || !data.props.markdown) return data;
        const { markdownToHtml } = await import('./markdownToHtml');
        return { ...data, props: { ...data.props, html: markdownToHtml(data.props.markdown) } };
      };
    }
    components[type] = component;
    (categories[def.group] ??= { title: CATEGORY_TITLES[def.group], components: [] }).components.push(type);
  }

  const root = context === 'page'
    ? {
        fields: { width: puckField('width', ROOT_FIELDS.page.width, { catalogue }), showTitle: puckField('showTitle', ROOT_FIELDS.page.showTitle, { catalogue }) },
        defaultProps: { width: 'normal', showTitle: true },
        render: ({ children, width = 'normal' }) => (
          <Box sx={{ mx: 'auto', width: '100%', maxWidth: { narrow: 820, normal: 1200, wide: 1600 }[width] ?? 1200, px: { xs: 2, md: 3 }, py: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>{children}</Box>
        ),
      }
    : live
      ? {
          fields: {},
          // Same spacing and 12-column grid as the live dashboard; each block's span comes from data-span.
          render: ({ children }) => (
            <Box
              sx={(theme) => ({
                px: { xs: 2, sm: 2.5, lg: 3 },
                py: 2,
                '& [data-puck-dropzone]': { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(12, minmax(0, 1fr))' }, gap: { xs: 2, md: 2.25 }, alignContent: 'start' },
                '& [data-puck-dropzone] > [data-puck-component]': { gridColumn: '1 / -1', minWidth: 0 },
                [theme.breakpoints.up('md')]: Object.fromEntries(Array.from({ length: 12 }, (_, i) => i + 1).map((n) => [`& [data-puck-dropzone] > [data-puck-component]:has(> [data-span="${n}"])`, { gridColumn: `span ${n}` }])),
              })}
            >
              {children}
            </Box>
          ),
        }
      : {
        fields: {},
        render: ({ children }) => <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</Box>,
      };
  return { root, components, categories };
}
