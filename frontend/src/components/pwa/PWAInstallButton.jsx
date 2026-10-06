import React from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { usePWA } from '../../context/PWAContext';

/**
 * Install prompt trigger. Behaviour is unchanged (hidden once installed unless
 * `showWhenInstalled`; click calls promptInstall). `iconOnly` renders a compact icon
 * button for the collapsed sidebar rail.
 */
export const PWAInstallButton = ({
  variant = 'outline',
  size = 'sm',
  className = '',
  style = {},
  showWhenInstalled = false,
  label = 'Install App',
  iconOnly = false,
  sx,
}) => {
  const { isInstalled, promptInstall } = usePWA();

  if (isInstalled) {
    if (!showWhenInstalled) return null;
    return (
      <Chip
        className={className}
        style={style}
        icon={<CheckCircleRoundedIcon />}
        label="Installed"
        title="Application is currently installed as a PWA"
        sx={{ color: 'success.dark', bgcolor: 'success.lighter', '& .MuiChip-icon': { color: 'success.main' }, ...sx }}
      />
    );
  }

  if (iconOnly) {
    return (
      <Tooltip title={label} placement="right">
        <IconButton onClick={promptInstall} aria-label="Install EdunexusAI Portal App" className={className} style={style} sx={sx}>
          <FileDownloadOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Button
      onClick={promptInstall}
      className={className}
      style={style}
      variant={variant === 'primary' ? 'contained' : 'outlined'}
      color={variant === 'primary' ? 'primary' : 'inherit'}
      size={size === 'lg' ? 'large' : size === 'md' ? 'medium' : 'small'}
      startIcon={<FileDownloadOutlinedIcon />}
      title="Install EdunexusAI as a Progressive Web App (PWA)"
      aria-label="Install EdunexusAI Portal App"
      sx={sx}
    >
      {label}
    </Button>
  );
};

export default PWAInstallButton;
