import React from 'react';
import Box from '@mui/material/Box';
import { useApiQuery } from '../../hooks/useApiQuery';
import { contentApi } from '../../services/api';
import { FaqListBlock } from './blocks/CmsBlocks';

/**
 * Campus help articles published in Studio, shown beside (never instead of) the Help
 * Centre's existing FAQs. Renders nothing when there are none or the CMS is unavailable.
 */
export function CmsHelpArticles() {
  const { data } = useApiQuery(() => contentApi.faqs({ limit: 50 }));
  if (!Array.isArray(data) || data.length === 0) return null;
  return <Box sx={{ mt: 3 }}><FaqListBlock title="Campus help articles" limit={50} /></Box>;
}
