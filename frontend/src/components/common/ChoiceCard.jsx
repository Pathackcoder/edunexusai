import React from 'react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';

/**
 * Bordered, selectable card for radio-style choices (delivery method, processing
 * speed…). The caller supplies the control and content; this only draws the state.
 */
export const ChoiceCard = ({ selected, onClick, children, sx }) => (
  <Box
    onClick={onClick}
    sx={(theme) => ({
      p: 1.75,
      borderRadius: 3,
      border: `1.5px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
      bgcolor: selected ? alpha(theme.palette.primary.main, 0.045) : 'background.paper',
      boxShadow: selected ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
      cursor: 'pointer',
      transition: 'border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
      '&:hover': { borderColor: selected ? 'primary.main' : 'grey.300' },
      ...sx,
    })}
  >
    {children}
  </Box>
);

export default ChoiceCard;
