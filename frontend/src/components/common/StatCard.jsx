import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useTheme, alpha } from '@mui/material/styles';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import { IconTile } from './IconTile';
import { Badge } from './Badge';
import { getTone, toneGradient } from '../../theme/tones';

/**
 * Compact KPI tile: label, large value, optional badge, trend and supporting line.
 * Upgraded with subtle colorful background accents, icon hover micro-interactions,
 * and smooth upward elevation hover lift (translateY(-3px)).
 */
export const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  badgeText,
  badgeVariant = 'primary',
  tone = 'primary',
  trend,
  trendLabel,
  trendDirection = 'up',
  onClick,
  to,
  className = '',
  sx,
  valueSx,
}) => {
  const theme = useTheme();
  const toneInfo = getTone(theme, tone);
  const gradient = toneGradient(tone);

  const body = (
    <Box sx={{ p: 2, position: 'relative', zIndex: 1 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} sx={{ mb: 0.75 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, fontWeight: 600 }}>
          {title}
        </Typography>
        {icon && (
          <Box className="stat-icon-tile" sx={{ transition: 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            <IconTile
              icon={icon}
              tone={tone}
              size={34}
              sx={{ color: '#fff', background: `linear-gradient(140deg, ${gradient[0]}, ${gradient[1]})`, boxShadow: `0 8px 16px -10px ${alpha(gradient[1], 0.85)}` }}
            />
          </Box>
        )}
      </Stack>
      <Stack direction="row" alignItems="baseline" spacing={1.25} useFlexGap flexWrap="wrap">
        <Typography variant="metric" component="div" sx={{ fontSize: { xs: '1.5rem', md: '1.625rem' }, ...valueSx }}>
          {value}
        </Typography>
        {badgeText && <Badge variant={badgeVariant}>{badgeText}</Badge>}
      </Stack>

      {(trend || subtitle) && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }} useFlexGap flexWrap="wrap">
          {trend && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.25}
              sx={{
                px: 0.75,
                py: 0.2,
                borderRadius: 1.5,
                bgcolor: trendDirection === 'up' ? 'success.lighter' : trendDirection === 'down' ? 'error.lighter' : 'grey.100',
                color: trendDirection === 'up' ? 'success.dark' : trendDirection === 'down' ? 'error.dark' : 'text.secondary',
                typography: 'caption',
                fontWeight: 700,
              }}
            >
              {trendDirection === 'up' && <TrendingUpRoundedIcon sx={{ fontSize: 13 }} />}
              {trendDirection === 'down' && <TrendingDownRoundedIcon sx={{ fontSize: 13 }} />}
              <span>{trend}</span>
            </Stack>
          )}
          {trendLabel && (
            <Typography variant="caption" color="text.secondary">
              {trendLabel}
            </Typography>
          )}
          {subtitle && !trend && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );

  const cardSx = {
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    background: theme.palette.mode === 'dark'
      ? 'rgba(255,255,255,0.06)'
      : `radial-gradient(80% 90% at 100% 0%, ${alpha(gradient[1], 0.11)}, transparent 70%), ${theme.palette.background.paper}`,
    backdropFilter: theme.palette.mode === 'dark' ? 'blur(8px)' : undefined,
    borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : undefined,
    transition: 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 280ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 280ms ease',
    '&:hover': {
      transform: 'translateY(-3px)',
      boxShadow: theme.palette.mode === 'dark' ? '0 18px 30px -18px rgba(0,0,0,0.6)' : `0 16px 30px -18px ${alpha(toneInfo.solid, 0.45)}`,
      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.22)' : alpha(toneInfo.solid, 0.35),
      '& .stat-icon-tile': {
        transform: 'scale(1.08)',
      },
    },
    ...sx,
  };

  return (
    <Card className={className} sx={cardSx}>
      {to ? (
        <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>{body}</CardActionArea>
      ) : onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: '100%' }}>{body}</CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
};

export default StatCard;
