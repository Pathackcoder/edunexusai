import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * Studio edit mode. Turning Studio on does not navigate: the page the administrator is
 * viewing becomes the editing canvas (see AppLayout), so the URL, query string and history
 * stay those of the real portal page. The mode is kept in sessionStorage for this tab only,
 * so a refresh keeps editing and a new tab opens in the normal view. Only administrators can
 * be in edit mode; for everyone else it is always off.
 */

const MODE_KEY = 'edunexus.studio.editing';
const read = () => {
  try {
    return window.sessionStorage.getItem(MODE_KEY) === '1';
  } catch {
    return false;
  }
};
const write = (on) => {
  try {
    if (on) window.sessionStorage.setItem(MODE_KEY, '1');
    else window.sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* convenience only */
  }
};

/**
 * Which editor a portal route maps to, or null when the route is not a page-builder layout.
 *   /pages/:slug          → that Studio page
 *   /dashboard, /admin    → the Admin dashboard (what an administrator sees on those routes)
 *   /faculty              → the Faculty dashboard
 * The Student dashboard has no route an administrator can view, so it keeps its dedicated
 * editor route (/studio/dashboards/student/edit).
 */
export function editableTarget(pathname) {
  const page = /^\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(pathname);
  if (page) return { kind: 'page', slug: page[1], path: `/pages/${page[1]}` };
  if (/^\/(?:dashboard|admin)\/?$/.test(pathname)) return { kind: 'dashboard', persona: 'admin', path: pathname.replace(/\/$/, '') };
  if (/^\/faculty\/?$/.test(pathname)) return { kind: 'dashboard', persona: 'faculty', path: '/faculty' };
  return null;
}

const StudioModeContext = createContext({ editing: false, enter: () => {}, exit: () => true, setDirty: () => {} });

export function StudioModeProvider({ children }) {
  const { isAdmin } = useAuth();
  const [on, setOn] = useState(read);
  const dirtyRef = useRef(false);
  const [dirty, setDirtyState] = useState(false);
  const editing = Boolean(isAdmin && on);

  const setDirty = useCallback((value) => {
    dirtyRef.current = Boolean(value);
    setDirtyState(Boolean(value));
  }, []);
  const enter = useCallback(() => { write(true); setOn(true); }, []);
  /** Leave edit mode; asks first when there are unsaved changes. Returns false if cancelled. */
  const exit = useCallback(() => {
    if (dirtyRef.current && !window.confirm('Leave Studio? Your unsaved changes will be lost.')) return false;
    setDirty(false);
    write(false);
    setOn(false);
    return true;
  }, [setDirty]);

  // While an in-place editor has unsaved changes, confirm before a portal link navigates away
  // (the editor would unmount and the changes would be lost).
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link || link.target === '_blank' || event.defaultPrevented) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm('You have unsaved changes on this page. Leave without saving?')) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        setDirty(false);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, setDirty]);

  const value = useMemo(() => ({ editing, enter, exit, setDirty }), [editing, enter, exit, setDirty]);
  return <StudioModeContext.Provider value={value}>{children}</StudioModeContext.Provider>;
}

export const useStudioMode = () => useContext(StudioModeContext);
