import React from 'react';
import Box from '@mui/material/Box';

/**
 * 12-column responsive widget grid. Single column on phones, 12 columns from `md`.
 *
 *   <DashboardGrid>
 *     <GridItem span={{ md: 12, lg: 5 }} order={{ xs: 1 }}>…</GridItem>
 *   </DashboardGrid>
 */
export const DashboardGrid = ({ children, sx }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(12, minmax(0, 1fr))' },
      gap: { xs: 2, md: 2 },
      alignItems: 'stretch',
      ...sx,
    }}
  >
    {children}
  </Box>
);

export const GridItem = ({ span = { md: 12 }, order, children, sx }) => {
  const gridColumn = { xs: '1 / -1' };
  Object.entries(span).forEach(([bp, cols]) => {
    gridColumn[bp] = `span ${cols}`;
  });
  return <Box sx={{ gridColumn, order, minWidth: 0, display: 'flex', ...sx }}>{children}</Box>;
};

export default DashboardGrid;
