import React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { getTone } from '../../theme/tones';

/** Rounded, softly tinted square that holds an icon. Used in card headers and lists. */
export const IconTile = ({ icon: Icon, tone = 'primary', size = 36, iconSize, sx, className, children }) => {
  const theme = useTheme();
  const colors = getTone(theme, tone);
  return (
    <Box
      aria-hidden="true"
      className={className}
      sx={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? '12px' : '10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: colors.fg,
        bgcolor: colors.bg,
        '& svg': { fontSize: iconSize ?? Math.round(size * 0.5) },
        ...sx,
      }}
    >
      {Icon ? <Icon /> : children}
    </Box>
  );
};

export default IconTile;
