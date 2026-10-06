import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTheme, alpha } from '@mui/material/styles';
import { IconTile } from './IconTile';
import { getTone } from '../../theme/tones';

/**
 * DashboardCard — the standard widget container.
 *
 * Keeps the original WidgetCard props and adds subtle hover lift, optional accent top-line,
 * and refined header styling.
 */
export const WidgetCard = ({
  title,
  subtitle,
  icon,
  tone = 'primary',
  actionLabel,
  actionTo,
  onActionClick,
  badge,
  children,
  className = '',
  bodyClassName = '',
  headerAction,
  disablePadding = false,
  hoverable = true,
  accentBorder = 'none', // 'top' | 'left' | 'none'
  style = {},
  sx,
  bodySx,
}) => {
  const theme = useTheme();
  const toneInfo = getTone(theme, tone);

  const action = headerAction ? (
    headerAction
  ) : actionTo ? (
    <Button
      component={RouterLink}
      to={actionTo}
      size="small"
      endIcon={<ArrowForwardRoundedIcon />}
      sx={{ color: 'primary.main', px: 1.25, '& .MuiButton-endIcon': { ml: 0.5 } }}
    >
      {actionLabel || 'View all'}
    </Button>
  ) : onActionClick ? (
    <Button
      onClick={onActionClick}
      size="small"
      endIcon={<ArrowForwardRoundedIcon />}
      sx={{ color: 'primary.main', px: 1.25, '& .MuiButton-endIcon': { ml: 0.5 } }}
    >
      {actionLabel || 'View all'}
    </Button>
  ) : null;

  return (
    <Card
      component="section"
      className={className}
      style={style}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
        // A faint wash of the card's tone behind the header gives each widget an identity
        // without competing with its content.
        backgroundImage: `linear-gradient(180deg, ${alpha(toneInfo.solid, 0.045)} 0%, ${alpha(toneInfo.solid, 0)} 96px)`,
        ...(accentBorder === 'top' && {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            bgcolor: toneInfo.solid,
            zIndex: 2,
          },
        }),
        ...(accentBorder === 'left' && {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 3.5,
            bgcolor: toneInfo.solid,
            zIndex: 2,
          },
        }),
        ...(hoverable && {
          transition: 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 280ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 280ms ease',
          '& .widget-icon': { transition: 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 280ms ease' },
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: `0 14px 32px -14px ${alpha(toneInfo.solid, 0.35)}, 0 4px 10px -4px ${alpha(theme.palette.common.black, 0.06)}`,
            borderColor: alpha(toneInfo.solid, 0.28),
            '& .widget-icon': { transform: 'scale(1.06) rotate(-3deg)', boxShadow: `0 6px 14px -6px ${alpha(toneInfo.solid, 0.55)}` },
          },
        }),
        ...sx,
      }}
    >
      {(title || action) && (
        <Stack
          direction="row"
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
          columnGap={1.5}
          rowGap={1.25}
          sx={{ px: { xs: 2, sm: 2.25 }, pt: { xs: 1.75, sm: 2 }, pb: 1.5, minWidth: 0 }}
        >
          {icon && (
            <IconTile
              className="widget-icon"
              icon={icon}
              tone={tone}
              size={32}
              sx={{
                background: `linear-gradient(140deg, ${alpha(toneInfo.solid, 0.16)} 0%, ${alpha(toneInfo.solid, 0.06)} 100%)`,
                border: `1px solid ${alpha(toneInfo.solid, 0.14)}`,
              }}
            />
          )}
          <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ lineHeight: 1.3 }}>
                {title}
              </Typography>
              {badge}
            </Stack>
            {subtitle && (
              <Typography variant="caption" component="p" sx={{ display: 'block', mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Stack>
      )}

      <Box
        className={bodyClassName}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          ...(disablePadding ? {} : { px: { xs: 2, sm: 2.25 }, pb: { xs: 2, sm: 2.25 }, pt: title ? 0.25 : { xs: 2, sm: 2.25 } }),
          ...bodySx,
        }}
      >
        {children}
      </Box>
    </Card>
  );
};

export const DashboardCard = WidgetCard;

export default WidgetCard;
