import React from 'react';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { getTone } from '../../theme/tones';

/**
 * Status label. Same props as before (variant, dot, className); rendered as a soft MUI
 * Chip so every status in the product shares one shape and colour logic.
 */
export const Badge = ({
  children,
  variant = 'neutral', // primary, success, warning, danger, purple, neutral, cyan
  dot = false,
  className = '',
  style,
  sx,
  ...props
}) => {
  const theme = useTheme();
  const tone = getTone(theme, variant);

  return (
    <Chip
      className={className}
      style={style}
      label={children}
      icon={
        dot ? (
          <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor', flexShrink: 0 }} />
        ) : undefined
      }
      sx={{
        color: tone.fg,
        bgcolor: tone.bg,
        border: `1px solid ${tone.border}`,
        maxWidth: '100%',
        '& .MuiChip-icon': { color: tone.fg, ml: '8px', mr: '-2px' },
        ...sx,
      }}
      {...props}
    />
  );
};

export default Badge;
