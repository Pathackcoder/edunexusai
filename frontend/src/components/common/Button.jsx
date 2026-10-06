import React from 'react';
import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Legacy button API mapped onto MUI Button, so existing call sites keep working:
 *   variant: primary | secondary | outline | ghost | danger
 *   size:    sm | md | lg
 *   loading, disabled, icon, type, onClick
 */
const VARIANTS = {
  primary: { variant: 'contained', color: 'primary' },
  secondary: { variant: 'outlined', color: 'inherit' },
  outline: { variant: 'outlined', color: 'primary' },
  ghost: { variant: 'text', color: 'inherit' },
  danger: { variant: 'contained', color: 'error' },
};

const SIZES = { sm: 'small', md: 'medium', lg: 'large' };

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  type = 'button',
  onClick,
  ...props
}) => {
  const mapped = VARIANTS[variant] ?? VARIANTS.primary;

  return (
    <MuiButton
      type={type}
      className={className}
      variant={mapped.variant}
      color={mapped.color}
      size={SIZES[size] ?? 'medium'}
      disabled={disabled || loading}
      onClick={onClick}
      startIcon={
        loading ? <CircularProgress size={16} color="inherit" thickness={5} /> : Icon ? <Icon fontSize="small" /> : undefined
      }
      {...props}
    >
      {children}
    </MuiButton>
  );
};

export default Button;
