import React, { useEffect, useMemo } from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import Chip from '@mui/material/Chip';

/**
 * Puck renders the canvas in an iframe (so tablet and phone previews use real breakpoints).
 * MUI styles are injected by Emotion into the document they are created for, so the canvas
 * gets its own Emotion cache targeting the iframe's <head>.
 */
export function IframeStyles({ document: doc, children }) {
  const cache = useMemo(() => (doc ? createCache({ key: 'studio-canvas', container: doc.head, prepend: true }) : null), [doc]);
  if (!cache) return children;
  return (
    <CacheProvider value={cache}>
      <CssBaseline />
      {children}
    </CacheProvider>
  );
}

export const VIEWPORTS = [
  { width: 390, height: 'auto', label: 'Phone', icon: 'Smartphone' },
  { width: 820, height: 'auto', label: 'Tablet', icon: 'Tablet' },
  { width: '100%', height: 'auto', label: 'Desktop', icon: 'Monitor' },
];

const STATE = {
  draft: { label: 'Draft (not published)', color: 'default' },
  scheduled: { label: 'Scheduled', color: 'info' },
  published: { label: 'Published', color: 'success' },
  modified: { label: 'Published · unpublished changes', color: 'warning' },
};
export const StateChip = ({ state, size = 'small' }) => <Chip size={size} color={STATE[state]?.color ?? 'default'} label={STATE[state]?.label ?? 'Not saved'} variant={state === 'draft' ? 'outlined' : 'filled'} />;

/** Ask before leaving the page with unsaved edits. */
export function useUnsavedGuard(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

/** Server validation detail -> readable lines. */
export function errorLines(error) {
  const d = error?.details ?? {};
  const lines = [];
  for (const [field, message] of Object.entries(d.fieldErrors ?? {})) lines.push(`${field}: ${message}`);
  for (const e of d.layoutErrors ?? []) lines.push(`${e.path}: ${e.message}`);
  return lines;
}

export const AUDIENCE_LABEL = { students: 'Students', faculty: 'Faculty', staff: 'Staff / admins', alumni: 'Alumni', public: 'Public (no sign-in)' };

/** Audience checkboxes: signed-in communities, plus "Public" where the content type allows it (not forms). */
export const AUDIENCE_OPTIONS = [['students', 'Students'], ['faculty', 'Faculty'], ['staff', 'Staff / admins'], ['alumni', 'Alumni']];
export const PUBLIC_AUDIENCE_OPTION = ['public', 'Public (no sign-in)'];
export const audienceText = (a) => Object.entries(a ?? {}).filter(([, on]) => on).map(([k]) => AUDIENCE_LABEL[k]).join(', ') || 'Nobody';
