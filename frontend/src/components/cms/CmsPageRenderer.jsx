import React, { useMemo } from 'react';
import { Render } from '@puckeditor/core';
import { buildPuckConfig } from './puckConfig';

/** Renders a published (or previewed) page layout with the same blocks as the Studio canvas. */
export function CmsPageRenderer({ layout, publicView = false }) {
  const config = useMemo(() => buildPuckConfig({ context: 'page', publicView }), [publicView]);
  if (!layout) return null;
  return <Render config={config} data={layout} />;
}
