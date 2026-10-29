import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Editor, Extension, Node, mergeAttributes } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Link from '@tiptap/extension-link';
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list';
import Blockquote from '@tiptap/extension-blockquote';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import TextAlign from '@tiptap/extension-text-align';
import { history, undo, redo } from '@tiptap/pm/history';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import MuiButton from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import FormatBoldRoundedIcon from '@mui/icons-material/FormatBoldRounded';
import FormatItalicRoundedIcon from '@mui/icons-material/FormatItalicRounded';
import FormatUnderlinedRoundedIcon from '@mui/icons-material/FormatUnderlinedRounded';
import StrikethroughSRoundedIcon from '@mui/icons-material/StrikethroughSRounded';
import FormatListBulletedRoundedIcon from '@mui/icons-material/FormatListBulletedRounded';
import FormatListNumberedRoundedIcon from '@mui/icons-material/FormatListNumberedRounded';
import FormatQuoteRoundedIcon from '@mui/icons-material/FormatQuoteRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import FormatAlignLeftRoundedIcon from '@mui/icons-material/FormatAlignLeftRounded';
import FormatAlignCenterRoundedIcon from '@mui/icons-material/FormatAlignCenterRounded';
import FormatAlignRightRoundedIcon from '@mui/icons-material/FormatAlignRightRounded';
import HorizontalRuleRoundedIcon from '@mui/icons-material/HorizontalRuleRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import FormatClearRoundedIcon from '@mui/icons-material/FormatClearRounded';
import { isSafeImage, isSafeUrl } from '../../../../shared/cmsBlocks.js';
import { studioApi } from '../../services/api';
import { richTextSx } from './Markdown';
import { markupProblems, sanitizeForEditor } from './SafeHtml';

/**
 * Rich-text editor with Visual (WYSIWYG, TipTap) and Source (HTML) modes over one value.
 *
 * - The value is HTML. Visual edits update it on every change; Source edits update it as you
 *   type, so switching modes never loses anything that has not been saved.
 * - Moving from Source to Visual applies the same allowlist the server enforces; if that would
 *   remove anything (scripts, event handlers, unsafe links, unsupported tags) or the markup is
 *   malformed, the editor lists the problems and asks first.
 * - The server sanitizes again on save and before delivery, so Source mode cannot introduce
 *   executable content even if this check were bypassed.
 */

const HistoryKit = Extension.create({
  name: 'historyKit',
  addProseMirrorPlugins() { return [history()]; },
  addCommands() {
    return {
      undo: () => ({ state, dispatch }) => undo(state, dispatch),
      redo: () => ({ state, dispatch }) => redo(state, dispatch),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-z': () => this.editor.commands.undo(), 'Mod-Shift-z': () => this.editor.commands.redo(), 'Mod-y': () => this.editor.commands.redo() };
  },
});

/** Images limited to the CMS media library or https (the server enforces the same rule). */
const SafeImage = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  addAttributes() { return { src: { default: null }, alt: { default: '' }, title: { default: null } }; },
  parseHTML() { return [{ tag: 'img[src]', getAttrs: (el) => (isSafeImage(el.getAttribute('src') ?? '') ? {} : false) }]; },
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes(HTMLAttributes)]; },
  addCommands() { return { setImage: (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }) }; },
});

const extensions = () => [
  Document, Paragraph, Text, Bold, Italic, Underline, Strike, Blockquote, HardBreak, HorizontalRule,
  Heading.configure({ levels: [2, 3, 4] }),
  BulletList, OrderedList, ListItem,
  Link.configure({ openOnClick: false, autolink: false, protocols: ['mailto', 'tel'], isAllowedUri: (url) => isSafeUrl(url), HTMLAttributes: { rel: 'noopener noreferrer', target: null } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  SafeImage,
  HistoryKit,
];

/** Puts block elements on their own lines so Source mode is readable. */
const formatSource = (html) => String(html ?? '').replace(/(<\/(?:p|h[2-4]|li|ul|ol|blockquote|pre)>|<hr\s*\/?>|<img [^>]*>)(?!\n)/g, '$1\n').trim();

function Tool({ title, active, disabled, onClick, children }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" aria-label={title} aria-pressed={active ? 'true' : undefined} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick} sx={{ borderRadius: 1, color: active ? 'primary.main' : 'text.secondary', bgcolor: active ? 'primary.lighter' : 'transparent' }}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function LinkDialog({ open, initial, onClose, onApply }) {
  const [url, setUrl] = useState(initial ?? '');
  const [newTab, setNewTab] = useState(false);
  useEffect(() => { if (open) { setUrl(initial ?? ''); setNewTab(false); } }, [open, initial]);
  const valid = !url || isSafeUrl(url.trim());
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Link</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth size="small" label="Address" placeholder="https://…, mailto:…, tel:… or /path" value={url} onChange={(e) => setUrl(e.target.value)} error={!valid} helperText={valid ? ' ' : 'Use https://, mailto:, tel: or a portal path such as /help.'} sx={{ mt: 1 }} />
        <MuiButton size="small" onClick={() => setNewTab((v) => !v)} sx={{ px: 0 }}>{newTab ? '✓ Opens in a new tab' : 'Open in a new tab'}</MuiButton>
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Cancel</MuiButton>
        <MuiButton variant="contained" disabled={!valid} onClick={() => onApply(url.trim(), newTab)}>{url ? 'Apply' : 'Remove link'}</MuiButton>
      </DialogActions>
    </Dialog>
  );
}

function ImageDialog({ open, onClose, onInsert }) {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [files, setFiles] = useState(null);
  useEffect(() => {
    if (!open) return;
    setSrc(''); setAlt(''); setFiles(null);
    studioApi.media().then(setFiles, () => setFiles([]));
  }, [open]);
  const valid = src && isSafeImage(src);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Insert image</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', mb: 2 }}>
          {(files ?? []).map((f) => (
            <Box key={f.id} component="button" type="button" onClick={() => { setSrc(f.url); setAlt((a) => a || f.alternativeText || ''); }} sx={{ p: 0, border: 2, borderColor: src === f.url ? 'primary.main' : 'divider', borderRadius: 1.5, overflow: 'hidden', cursor: 'pointer', bgcolor: 'background.paper' }}>
              <Box component="img" src={f.url} alt="" sx={{ display: 'block', width: '100%', height: 70, objectFit: 'cover' }} />
            </Box>
          ))}
          {files && files.length === 0 && <Typography variant="body2" color="text.secondary">No images in the media library.</Typography>}
        </Box>
        <TextField fullWidth size="small" label="Image address" placeholder="Choose above or paste an https:// address" value={src} onChange={(e) => setSrc(e.target.value.trim())} error={Boolean(src) && !valid} helperText={src && !valid ? 'Use the media library or an https:// address.' : ' '} />
        <TextField fullWidth size="small" label="Alternative text (describe the image)" value={alt} onChange={(e) => setAlt(e.target.value)} inputProps={{ maxLength: 200 }} />
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Cancel</MuiButton>
        <MuiButton variant="contained" disabled={!valid} onClick={() => onInsert({ src, alt })}>Insert</MuiButton>
      </DialogActions>
    </Dialog>
  );
}

export function RichTextEditor({ value, onChange, minHeight = 200, compact = false, label }) {
  const mountRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [, refresh] = useReducer((n) => n + 1, 0);
  const [mode, setMode] = useState('visual');
  const [source, setSource] = useState('');
  const [pending, setPending] = useState(null); // { html, removed, problems } awaiting confirmation
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  useEffect(() => {
    const editor = new Editor({
      element: mountRef.current,
      extensions: extensions(),
      content: sanitizeForEditor(value ?? '').html,
      editorProps: { attributes: { class: 'cms-rich-editor', 'aria-label': label ?? 'Rich text', role: 'textbox', 'aria-multiline': 'true' } },
      onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getHTML() === '<p></p>' ? '' : e.getHTML()),
      onTransaction: () => refresh(),
    });
    editorRef.current = editor;
    refresh(); // render the toolbar against this instance (StrictMode mounts effects twice)
    return () => {
      editor.destroy();
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = editorRef.current;
  // Handlers always use the live instance, never one captured by an earlier render.
  const toSource = () => {
    setSource(formatSource(editorRef.current?.getHTML() ?? ''));
    setMode('source');
  };
  const applySource = (html) => {
    const live = editorRef.current;
    live.commands.setContent(html, { emitUpdate: true });
    onChangeRef.current?.(live.getHTML() === '<p></p>' ? '' : live.getHTML());
    setPending(null);
    setMode('visual');
  };
  const toVisual = () => {
    const { html, removed } = sanitizeForEditor(source);
    const problems = markupProblems(source);
    if (removed.length || problems.length) setPending({ html, removed, problems });
    else applySource(html);
  };
  const sourceProblems = mode === 'source' ? markupProblems(source) : [];
  const sourceRemovals = mode === 'source' ? sanitizeForEditor(source).removed : [];
  const blockType = editor?.isActive('heading', { level: 2 }) ? 'h2' : editor?.isActive('heading', { level: 3 }) ? 'h3' : editor?.isActive('heading', { level: 4 }) ? 'h4' : 'p';
  const setBlock = (v) => {
    const chain = editorRef.current.chain().focus();
    if (v === 'p') chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(v.slice(1)) }).run();
  };
  const run = (fn) => () => fn(editorRef.current.chain().focus()).run();

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={0.25} sx={{ px: 0.75, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.subtle' }} role="toolbar" aria-label="Text formatting">
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => { if (!v || v === mode) return; if (v === 'source') toSource(); else toVisual(); }} aria-label="Editing mode" sx={{ mr: 0.5, '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: '0.75rem', textTransform: 'none' } }}>
          <ToggleButton value="visual">Visual</ToggleButton>
          <ToggleButton value="source">Source</ToggleButton>
        </ToggleButtonGroup>
        {mode === 'visual' && editor && (
          <>
            <TextField select size="small" value={blockType} onChange={(e) => setBlock(e.target.value)} aria-label="Block type" sx={{ minWidth: compact ? 96 : 120, '& .MuiSelect-select': { py: 0.5, fontSize: '0.8125rem' } }}>
              <MenuItem value="p">Paragraph</MenuItem>
              <MenuItem value="h2">Heading 2</MenuItem>
              <MenuItem value="h3">Heading 3</MenuItem>
              <MenuItem value="h4">Heading 4</MenuItem>
            </TextField>
            <Tool title="Bold (Ctrl/⌘ B)" active={editor.isActive('bold')} onClick={run((c) => c.toggleBold())}><FormatBoldRoundedIcon fontSize="small" /></Tool>
            <Tool title="Italic (Ctrl/⌘ I)" active={editor.isActive('italic')} onClick={run((c) => c.toggleItalic())}><FormatItalicRoundedIcon fontSize="small" /></Tool>
            <Tool title="Underline (Ctrl/⌘ U)" active={editor.isActive('underline')} onClick={run((c) => c.toggleUnderline())}><FormatUnderlinedRoundedIcon fontSize="small" /></Tool>
            <Tool title="Strikethrough" active={editor.isActive('strike')} onClick={run((c) => c.toggleStrike())}><StrikethroughSRoundedIcon fontSize="small" /></Tool>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Tool title="Bulleted list" active={editor.isActive('bulletList')} onClick={run((c) => c.toggleBulletList())}><FormatListBulletedRoundedIcon fontSize="small" /></Tool>
            <Tool title="Numbered list" active={editor.isActive('orderedList')} onClick={run((c) => c.toggleOrderedList())}><FormatListNumberedRoundedIcon fontSize="small" /></Tool>
            <Tool title="Quote" active={editor.isActive('blockquote')} onClick={run((c) => c.toggleBlockquote())}><FormatQuoteRoundedIcon fontSize="small" /></Tool>
            <Tool title="Link" active={editor.isActive('link')} onClick={() => setLinkOpen(true)}><LinkRoundedIcon fontSize="small" /></Tool>
            {editor.isActive('link') && <Tool title="Remove link" onClick={run((c) => c.unsetLink())}><LinkOffRoundedIcon fontSize="small" /></Tool>}
            <Tool title="Image" onClick={() => setImageOpen(true)}><ImageOutlinedIcon fontSize="small" /></Tool>
            <Tool title="Divider line" onClick={run((c) => c.setHorizontalRule())}><HorizontalRuleRoundedIcon fontSize="small" /></Tool>
            {!compact && <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />}
            <Tool title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={run((c) => c.setTextAlign('left'))}><FormatAlignLeftRoundedIcon fontSize="small" /></Tool>
            <Tool title="Centre" active={editor.isActive({ textAlign: 'center' })} onClick={run((c) => c.setTextAlign('center'))}><FormatAlignCenterRoundedIcon fontSize="small" /></Tool>
            <Tool title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={run((c) => c.setTextAlign('right'))}><FormatAlignRightRoundedIcon fontSize="small" /></Tool>
            <Tool title="Clear formatting" onClick={run((c) => c.unsetAllMarks().clearNodes())}><FormatClearRoundedIcon fontSize="small" /></Tool>
            <Tool title="Undo (Ctrl/⌘ Z)" disabled={!editor.can().undo()} onClick={run((c) => c.undo())}><UndoRoundedIcon fontSize="small" /></Tool>
            <Tool title="Redo (Ctrl/⌘ Shift Z)" disabled={!editor.can().redo()} onClick={run((c) => c.redo())}><RedoRoundedIcon fontSize="small" /></Tool>
          </>
        )}
        {mode === 'source' && <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>HTML. Supported: paragraphs, headings, lists, links, images, quotes, bold/italic/underline, alignment.</Typography>}
      </Stack>
      <Box
        ref={mountRef}
        sx={{
          display: mode === 'visual' ? 'block' : 'none',
          px: 1.5,
          py: 1,
          ...richTextSx,
          '& .cms-rich-editor': { minHeight, outline: 'none' },
          '& .cms-rich-editor:focus-visible': { outline: 'none' },
          '& .ProseMirror-selectednode': { outline: '2px solid', outlineColor: 'primary.main' },
        }}
      />
      {mode === 'source' && (
        <Box sx={{ p: 1 }}>
          <TextField
            multiline
            fullWidth
            minRows={compact ? 8 : 12}
            value={source}
            onChange={(e) => { setSource(e.target.value); onChangeRef.current?.(e.target.value); }}
            inputProps={{ 'aria-label': 'HTML source', spellCheck: false, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5 } }}
          />
          {(sourceProblems.length > 0 || sourceRemovals.length > 0) && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {sourceProblems.length > 0 && <div>Markup problems: {sourceProblems.slice(0, 4).join('; ')}{sourceProblems.length > 4 ? '…' : ''}</div>}
              {sourceRemovals.length > 0 && <div>Will be removed for security: {sourceRemovals.join(', ')}</div>}
            </Alert>
          )}
        </Box>
      )}
      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Check the HTML before switching</DialogTitle>
        <DialogContent>
          {pending?.problems.length > 0 && <Alert severity="warning" sx={{ mb: 1.5 }}>The markup is not well formed: {pending.problems.slice(0, 6).join('; ')}. It will be corrected automatically.</Alert>}
          {pending?.removed.length > 0 && <Alert severity="error">These are not allowed and will be removed: {pending.removed.join(', ')}.</Alert>}
          <Typography variant="body2" sx={{ mt: 1.5 }}>Your text is kept. Continue to see the corrected result in Visual mode, or stay in Source to fix it yourself.</Typography>
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => setPending(null)}>Stay in Source</MuiButton>
          <MuiButton variant="contained" onClick={() => applySource(pending.html)}>Continue</MuiButton>
        </DialogActions>
      </Dialog>
      <LinkDialog
        open={linkOpen}
        initial={editor?.getAttributes('link').href}
        onClose={() => setLinkOpen(false)}
        onApply={(url, newTab) => {
          setLinkOpen(false);
          const chain = editorRef.current.chain().focus().extendMarkRange('link');
          if (!url) chain.unsetLink().run();
          else chain.setLink({ href: url, target: newTab ? '_blank' : null }).run();
        }}
      />
      <ImageDialog open={imageOpen} onClose={() => setImageOpen(false)} onInsert={(attrs) => { setImageOpen(false); editorRef.current.chain().focus().setImage(attrs).run(); }} />
    </Box>
  );
}
