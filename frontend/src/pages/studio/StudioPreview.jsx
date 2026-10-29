import React from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import { useApiQuery } from '../../hooks/useApiQuery';
import { studioApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';
import { CmsPageRenderer } from '../../components/cms/CmsPageRenderer';
import { StateChip, audienceText } from './studioCommon';

/** Admin-only preview of the latest saved draft of a page (never served to students or faculty). */
export function StudioPreview() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useApiQuery(() => studioApi.get('page', id), [id]);
  return (
    <Box>
      <Box sx={{ bgcolor: 'warning.light', borderRadius: 2, px: { xs: 2, md: 3 }, py: 1, mb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
          <Typography variant="subtitle2" sx={{ flex: 1 }}>Draft preview{data ? ` · ${audienceText(data.audiences)} · /pages/${data.slug}` : ''}</Typography>
          {data && <StateChip state={data.state} />}
          <MuiButton size="small" variant="contained" color="inherit" component={RouterLink} to={`/studio/pages/${id}/edit`}>Back to editor</MuiButton>
        </Stack>
      </Box>
      <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
        <DataState loading={loading} error={error} onRetry={refetch}>
          {() => (
            <>
              <Typography variant="h3" component="h1" sx={{ mb: 1 }}>{data.title}</Typography>
              {data.summary && <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>{data.summary}</Typography>}
              <CmsPageRenderer layout={data.layout} />
            </>
          )}
        </DataState>
      </Box>
    </Box>
  );
}
