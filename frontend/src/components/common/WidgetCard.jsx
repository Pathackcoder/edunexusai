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
import { getTone, toneGradient } from '../../theme/tones';
import { brand } from '../../theme/theme';
import { OnDark } from './DarkSurface';

/**
 * DashboardCard — the standard widget container.
 *
 * Keeps the original WidgetCard props. Each card carries its category colour (tone) as a
 * gradient icon tile, a soft corner glow with dot texture and a gradient top hairline;
 * `variant="featured"` renders it as a navy EdunexusAI dark surface for hero widgets.
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
  variant = 'default', // 'default' | 'featured' (navy dark surface)
  style = {},
  sx,
  bodySx,
}) => {
  if (variant === 'featured') {
    return (
      <OnDark>
        <WidgetCardInner {...{ title, subtitle, icon, tone, actionLabel, actionTo, onActionClick, badge, children, className, bodyClassName, headerAction, disablePadding, hoverable, accentBorder, style, sx, bodySx }} featured />
      </OnDark>
    );
  }
  return <WidgetCardInner {...{ title, subtitle, icon, tone, actionLabel, actionTo, onActionClick, badge, children, className, bodyClassName, headerAction, disablePadding, hoverable, accentBorder, style, sx, bodySx }} />;
};

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const WidgetCardInner = ({
  title,
  subtitle,
  icon,
  tone,
  actionLabel,
  actionTo,
  onActionClick,
  badge,
  children,
  className,
  bodyClassName,
  headerAction,
  disablePadding,
  hoverable,
  accentBorder,
  style,
  sx,
  bodySx,
  featured = false,
}) => {
  const theme = useTheme();
  const toneInfo = getTone(theme, tone);
  const [from, to] = toneGradient(tone);

  const actionSx = {
    color: featured ? '#C7D2FE' : 'primary.main',
    px: 1.25,
    borderRadius: '999px',
    '& .MuiButton-endIcon': { ml: 0.5, transition: `transform 240ms ${EASE}` },
    '&:hover': { bgcolor: featured ? 'rgba(255,255,255,0.08)' : alpha(theme.palette.primary.main, 0.07), '& .MuiButton-endIcon': { transform: 'translateX(3px)' } },
  };
  const action = headerAction ? (
    headerAction
  ) : actionTo ? (
    <Button component={RouterLink} to={actionTo} size="small" endIcon={<ArrowForwardRoundedIcon />} sx={actionSx}>
      {actionLabel || 'View all'}
    </Button>
  ) : onActionClick ? (
    <Button onClick={onActionClick} size="small" endIcon={<ArrowForwardRoundedIcon />} sx={actionSx}>
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
        isolation: 'isolate',
        ...(featured
          ? {
              background: brand.navy,
              borderColor: 'rgba(255,255,255,0.08)',
              boxShadow: '0 18px 40px -22px rgba(20, 24, 80, 0.75)',
              color: 'text.primary',
            }
          : {
              backgroundColor: 'background.paper',
            }),
        // Category atmosphere: a soft tone glow and dot texture in the header corner.
        '& > .widget-wash': {
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          background: featured
            ? `radial-gradient(70% 60% at 100% 0%, ${alpha(to, 0.35)}, transparent 70%), radial-gradient(60% 60% at 0% 100%, ${alpha(from, 0.35)}, transparent 70%)`
            : `radial-gradient(55% 90px at 100% 0%, ${alpha(to, 0.12)}, transparent 75%), linear-gradient(180deg, ${alpha(from, 0.035)} 0%, transparent 110px)`,
          opacity: 0.85,
          transition: `opacity 320ms ${EASE}`,
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 0,
            right: 0,
            width: 180,
            height: 110,
            backgroundImage: featured ? brand.grid : `radial-gradient(${alpha(from, 0.22)} 1px, transparent 1px)`,
            backgroundSize: featured ? '28px 28px' : '14px 14px',
            maskImage: 'radial-gradient(ellipse at 100% 0%, #000 0%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 100% 0%, #000 0%, transparent 70%)',
            opacity: featured ? 1 : 0.7,
          },
        },
        // A gradient hairline across the top carries the category colour.
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 18,
          right: 18,
          height: 2,
          borderRadius: '0 0 2px 2px',
          background: `linear-gradient(90deg, transparent, ${from}, ${to}, transparent)`,
          opacity: featured ? 0.9 : 0.35,
          transition: `opacity 320ms ${EASE}, left 320ms ${EASE}, right 320ms ${EASE}`,
          zIndex: 2,
        },
        ...(accentBorder === 'top' && {
          '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${from}, ${to})`, zIndex: 2 },
        }),
        ...(accentBorder === 'left' && {
          '&::before': { content: '""', position: 'absolute', top: 0, left: 0, bottom: 0, width: 3.5, background: `linear-gradient(180deg, ${from}, ${to})`, zIndex: 2 },
        }),
        ...(hoverable && {
          transition: `transform 300ms ${EASE}, box-shadow 300ms ${EASE}, border-color 300ms ease`,
          '& .widget-icon': { transition: `transform 300ms ${EASE}, box-shadow 300ms ease` },
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: featured
              ? `0 26px 50px -24px rgba(20, 24, 80, 0.9), 0 0 0 1px ${alpha(to, 0.25)}`
              : `0 18px 36px -18px ${alpha(toneInfo.solid, 0.38)}, 0 4px 10px -6px rgba(30, 27, 92, 0.08)`,
            borderColor: featured ? 'rgba(255,255,255,0.16)' : alpha(toneInfo.solid, 0.3),
            '& > .widget-wash': { opacity: 1 },
            '&::after': { opacity: featured ? 1 : 0.8, left: 0, right: 0 },
            '& .widget-icon': { transform: 'translateY(-1px) scale(1.06) rotate(-4deg)', boxShadow: `0 10px 18px -8px ${alpha(to, 0.75)}` },
          },
        }),
        ...sx,
      }}
    >
      <Box aria-hidden className="widget-wash" />
      {(title || action) && (
        <Stack
          direction="row"
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
          columnGap={1.5}
          rowGap={1.25}
          sx={{ px: { xs: 2, sm: 2.25 }, pt: { xs: 1.5, sm: 1.75 }, pb: 1.25, minWidth: 0 }}
        >
          {icon && (
            <IconTile
              className="widget-icon"
              icon={icon}
              tone={tone}
              size={34}
              sx={{
                color: '#FFFFFF',
                background: `linear-gradient(140deg, ${from} 0%, ${to} 100%)`,
                boxShadow: `0 8px 16px -10px ${alpha(to, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            />
          )}
          <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ lineHeight: 1.3, fontWeight: 600, letterSpacing: '-0.005em' }}>
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
          ...(disablePadding ? {} : { px: { xs: 2, sm: 2.25 }, pb: { xs: 1.75, sm: 2 }, pt: title ? 0.25 : { xs: 2, sm: 2.25 } }),
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
