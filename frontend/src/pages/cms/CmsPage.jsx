import React from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { contentApi } from '../../services/api';
import { CmsPageRenderer } from '../../components/cms/CmsPageRenderer';

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

/**
 * A published Studio page (/pages/:slug). The server returns it only if it is published,
 * belongs to this tenant and is meant for one of the user's audiences; otherwise 404.
 */
export default function CmsPage() {
  const { slug } = useParams();
  const { data, loading, error, refetch } = useApiQuery(() => contentApi.page(slug), [slug]);
  const notFound = error?.status === 404;
  return (
    <Box>
      {notFound ? (
        <Alert severity="info">This page is not available. It may have been unpublished, or it is not meant for your role.</Alert>
      ) : (
        <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading page…" minHeight={300}>
          {() => (
            <>
              {data.layout?.root?.props?.showTitle === false
                ? <Typography component="h1" sx={visuallyHidden}>{data.title}</Typography>
                : <PageHeader title={data.title} description={data.summary || undefined} />}
              {data.layoutError && <Alert severity="warning" sx={{ mb: 2 }}>{data.layoutError}</Alert>}
              <Box sx={{ mx: { xs: -2, md: -3 } }}><CmsPageRenderer layout={data.layout} /></Box>
            </>
          )}
        </DataState>
      )}
    </Box>
  );
}
