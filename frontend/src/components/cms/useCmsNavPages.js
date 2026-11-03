import { useEffect, useState } from 'react';
import { contentApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/**
 * Published Studio pages to list in the sidebar (server-filtered by tenant and audience).
 * Any CMS problem simply means no extra navigation; the rest of the sidebar is unaffected.
 */
export function useCmsNavPages() {
  const { user } = useAuth();
  const [pages, setPages] = useState([]);
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    contentApi.pages().then((rows) => { if (active) setPages(Array.isArray(rows) ? rows : []); }, () => { if (active) setPages([]); });
    return () => { active = false; };
  }, [user?.id]);
  return pages;
}
