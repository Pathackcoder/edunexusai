import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useApiQuery } from '../../hooks/useApiQuery';
import { studioApi } from '../../services/api';
import { PageEditor } from './StudioPageEditor';
import { DashboardEditor } from './StudioDashboards';
import { useStudioMode } from './studioMode';

/**
 * Studio edit mode on the current portal route (rendered by AppLayout instead of the route's
 * normal view). It resolves the route to its saved layout and opens the same editor used
 * everywhere else; it never creates a page or layout just because Studio was switched on.
 */

/** /pages/:slug → the Studio page with that address (draft or published, this tenant). */
function PageBySlug({ slug }) {
  const { exit } = useStudioMode();
  const { data, loading, error, refetch } = useApiQuery(() => studioApi.list('page'), []);
  if (loading) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  if (error) return <Box sx={{ p: 3 }}><Alert severity="error" action={<MuiButton onClick={refetch}>Retry</MuiButton>}>{error.message}</Alert></Box>;
  const page = data?.find((p) => p.slug === slug);
  if (!page) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info" action={<><MuiButton component={RouterLink} to="/studio/pages">Studio pages</MuiButton><MuiButton onClick={exit}>Exit Studio</MuiButton></>}>
          There is no Studio page at /pages/{slug}. Studio did not create one; add a page from Studio pages if you need it.
        </Alert>
      </Box>
    );
  }
  return <PageEditor key={page.id} id={page.id} />;
}

export default function InPlaceEditor({ target }) {
  if (target.kind === 'page') return <PageBySlug slug={target.slug} />;
  return <DashboardEditor key={target.persona} persona={target.persona} />;
}
