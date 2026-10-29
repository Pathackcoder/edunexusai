import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Puck, createUsePuck, useGetPuck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import MuiButton from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import SmartphoneRoundedIcon from '@mui/icons-material/SmartphoneRounded';
import TabletMacRoundedIcon from '@mui/icons-material/TabletMacRounded';
import DesktopWindowsRoundedIcon from '@mui/icons-material/DesktopWindowsRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { ADMIN_SECTIONS, BLOCKS } from '../../../../../shared/cmsBlocks.js';
import { IframeStyles } from '../../../pages/studio/studioCommon';
import { CmsActionBar, makeCmsOverlay } from './CmsOverlay';

/**
 * The Studio visual editor, laid out inside the portal shell: a toolbar, an optional block
 * library / layers panel, the live canvas (real block components in an iframe, so phone and
 * tablet previews use real breakpoints) and the properties panel. It uses Puck's state and
 * history, so undo/redo, selection, drag-and-drop and the resize handles all edit the same
 * layout data that is saved, validated by the server and rendered on the live page.
 */

const usePuck = createUsePuck();
// Logical canvas widths. Desktop matches the live portal's content width (≈1200 px), so
// layouts use their real desktop breakpoints even when the canvas has less room.
const VIEWPORT_WIDTH = { phone: 390, tablet: 820, desktop: 1200 };
const ROOT_ZONE = 'root:default-zone';

function useInsert() {
  const getPuck = useGetPuck();
  return (componentType) => {
    const { dispatch, appState, getItemBySelector } = getPuck();
    const sel = appState.ui.itemSelector;
    const selected = sel?.zone ? getItemBySelector(sel) : null;
    const zone = selected ? sel.zone : ROOT_ZONE;
    const index = selected ? sel.index + 1 : appState.data.content?.length ?? 0;
    dispatch({ type: 'insert', componentType, destinationIndex: index, destinationZone: zone });
    dispatch({ type: 'setUi', ui: { itemSelector: { zone, index } }, recordHistory: false });
  };
}

/** Block library entry: drag it onto the canvas, or press + (keyboard friendly) to insert it after the selection. */
function DrawerItem({ children, name }) {
  const insert = useInsert();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const stop = (e) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  }, []);
  return (
    <Box sx={{ position: 'relative', '& > *': { pr: 5 } }}>
      {children}
      <Tooltip title={`Insert ${BLOCKS[name]?.label ?? name} after the selected block`}>
        <IconButton ref={ref} size="small" aria-label={`Insert ${BLOCKS[name]?.label ?? name}`} onClick={() => insert(name)} sx={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', bgcolor: 'background.paper', border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'primary.lighter' } }}>
          <AddRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function PropertiesHeader() {
  const selected = usePuck((s) => s.selectedItem);
  const getPuck = useGetPuck();
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, zIndex: 1 }}>
      <TuneRoundedIcon fontSize="small" color="primary" />
      <Typography variant="subtitle2" sx={{ flex: 1 }}>{selected ? (selected.type === 'DashboardWidget' && ADMIN_SECTIONS.find((x) => x.key === selected.props.widgetKey)?.label) || BLOCKS[selected.type]?.label || selected.type : 'Page settings'}</Typography>
      {selected && <MuiButton size="small" onClick={() => getPuck().dispatch({ type: 'setUi', ui: { itemSelector: null }, recordHistory: false })}>Page</MuiButton>}
    </Stack>
  );
}

function Toolbar({ title, subtitle, status, panel, setPanel, viewport, setViewport, actions, primary, menu }) {
  const getPuck = useGetPuck();
  const hasPast = usePuck((s) => s.history.hasPast);
  const hasFuture = usePuck((s) => s.history.hasFuture);
  const [anchor, setAnchor] = useState(null);
  const current = () => getPuck().appState.data;
  return (
    <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }} role="toolbar" aria-label="Editor toolbar">
      <Box sx={{ minWidth: 0, mr: 1 }}>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700, lineHeight: 1.2, maxWidth: 280 }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ maxWidth: 280 }}>{subtitle}</Typography>}
      </Box>
      {status}
      <Divider orientation="vertical" flexItem />
      <Tooltip title="Undo (Ctrl/⌘ Z)"><span><IconButton size="small" aria-label="Undo" disabled={!hasPast} onClick={() => getPuck().history.back()}><UndoRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Redo (Ctrl/⌘ Shift Z)"><span><IconButton size="small" aria-label="Redo" disabled={!hasFuture} onClick={() => getPuck().history.forward()}><RedoRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
      <Divider orientation="vertical" flexItem />
      <MuiButton size="small" variant={panel === 'add' ? 'contained' : 'text'} startIcon={<AddBoxOutlinedIcon />} onClick={() => setPanel(panel === 'add' ? null : 'add')} aria-pressed={panel === 'add'}>Add</MuiButton>
      <MuiButton size="small" variant={panel === 'layers' ? 'contained' : 'text'} startIcon={<LayersOutlinedIcon />} onClick={() => setPanel(panel === 'layers' ? null : 'layers')} aria-pressed={panel === 'layers'}>Layers</MuiButton>
      <ToggleButtonGroup size="small" exclusive value={viewport} onChange={(_, v) => v && setViewport(v)} aria-label="Preview width">
        <ToggleButton value="phone" aria-label="Phone preview (390 px)"><SmartphoneRoundedIcon fontSize="small" /></ToggleButton>
        <ToggleButton value="tablet" aria-label="Tablet preview (820 px)"><TabletMacRoundedIcon fontSize="small" /></ToggleButton>
        <ToggleButton value="desktop" aria-label="Desktop preview (1200 px, scaled to fit)"><DesktopWindowsRoundedIcon fontSize="small" /></ToggleButton>
      </ToggleButtonGroup>
      <Box sx={{ flex: 1 }} />
      {actions.map((a) => (
        <MuiButton key={a.label} size="small" variant="outlined" disabled={a.disabled} onClick={() => a.onClick(current())} {...(a.href ? { component: 'a', href: a.href, target: '_blank', rel: 'noopener' } : {})}>{a.label}</MuiButton>
      ))}
      {primary && <MuiButton size="small" variant="contained" disabled={primary.disabled} onClick={() => primary.onClick(current())}>{primary.label}</MuiButton>}
      {menu.length > 0 && (
        <>
          <IconButton size="small" aria-label="More actions" onClick={(e) => setAnchor(e.currentTarget)}><MoreVertRoundedIcon /></IconButton>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            {menu.map((m) => <MenuItem key={m.label} disabled={m.disabled} sx={m.danger ? { color: 'error.main' } : undefined} onClick={() => { setAnchor(null); m.onClick(current()); }}>{m.label}</MenuItem>)}
          </Menu>
        </>
      )}
    </Stack>
  );
}

/**
 * Fits a canvas of a fixed logical width into the available space: it is rendered at that
 * width (so CSS breakpoints match the live page) and scaled down with a transform when the
 * space is narrower, the same approach Puck's built-in canvas uses for its zoom.
 */
function ScaledCanvas({ width, children }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = box.w ? Math.min(1, box.w / width) : 1;
  return (
    <Box ref={ref} sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
      {box.w > 0 && (
        <Box sx={{ width: width * scale, height: box.h, flexShrink: 0 }} data-canvas-scale={scale.toFixed(3)}>
          <Box sx={{ width, height: box.h / scale, transform: `scale(${scale})`, transformOrigin: 'top left', bgcolor: 'background.default', boxShadow: 3, borderRadius: 2, overflow: 'hidden', '& #puck-preview, & #preview-frame': { height: '100%' } }}>
            {children}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function EditorLayout({ toolbar, notice }) {
  const [panel, setPanel] = useState(null);
  const [viewport, setViewport] = useState('desktop');
  const width = VIEWPORT_WIDTH[viewport];
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'background.paper' }}>
      <Toolbar {...toolbar} panel={panel} setPanel={setPanel} viewport={viewport} setViewport={setViewport} />
      {notice}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {panel && (
          <Box component="aside" aria-label={panel === 'add' ? 'Block library' : 'Layers'} sx={{ width: 260, flexShrink: 0, borderRight: 1, borderColor: 'divider', overflowY: 'auto', overscrollBehavior: 'contain', bgcolor: 'background.paper' }}>
            <Typography variant="overline" sx={{ display: 'block', px: 2, pt: 1.5 }}>{panel === 'add' ? 'Drag onto the page, or press +' : 'Layers'}</Typography>
            {panel === 'add' ? <Puck.Components /> : <Box sx={{ px: 1 }}><Puck.Outline /></Box>}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', bgcolor: 'grey.100', display: 'flex', p: { xs: 1, md: 2 } }}>
          {/* The canvas is an iframe filling this box; the page inside it scrolls on its own. */}
          <ScaledCanvas width={width}>
            <Puck.Preview />
          </ScaledCanvas>
        </Box>
        <Box component="aside" aria-label="Properties" sx={{ width: { xs: 260, lg: 320 }, flexShrink: 0, borderLeft: 1, borderColor: 'divider', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', bgcolor: 'background.paper' }}>
          <PropertiesHeader />
          <Puck.Fields />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * props: config, data, onChange, context ('page' | 'dashboard'), toolbar
 * ({ title, subtitle, status, actions[], primary, menu[] }) and an optional notice element.
 */
export function StudioEditor({ config, data, onChange, context, toolbar, notice }) {
  const overrides = useMemo(() => ({
    iframe: IframeStyles,
    componentOverlay: makeCmsOverlay(context),
    actionBar: CmsActionBar,
    drawerItem: DrawerItem,
  }), [context]);
  return (
    // Puck renders its own root (.Puck, height auto) around our layout; bounding it to this box
    // keeps the editor inside the viewport, so each panel below scrolls on its own.
    <Box sx={{ flex: 1, height: '100%', minHeight: 0, '& > .Puck': { height: '100%', minHeight: 0, overflow: 'hidden' } }}>
      <Puck config={config} data={data} onChange={onChange} iframe={{ enabled: true, waitForStyles: true }} overrides={overrides} height="100%">
        <EditorLayout toolbar={toolbar} notice={notice} />
      </Puck>
    </Box>
  );
}
